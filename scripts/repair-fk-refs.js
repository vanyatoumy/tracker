// One-off repair: the v2 migration (migrate-v2-stages.js) renamed
// `prospects` -> `prospects_old` mid-migration. SQLite automatically
// rewrites OTHER tables' foreign key clauses and trigger bodies to follow a
// RENAME TABLE, so `stage_history`, `interactions`, and the
// trg_update_stage_timestamp trigger all got silently rewritten to
// reference `prospects_old`. That table was then dropped, leaving those
// three objects with a dangling reference to a table that no longer
// exists — breaking any INSERT into stage_history (i.e. creating a
// prospect, or any stage transition) with "no such table: prospects_old".
//
// This script rebuilds stage_history and interactions with a correct FK
// pointing at `prospects`, and recreates the trigger correctly. It only
// touches schema — no rows are dropped or altered.
//
// Safe to run multiple times: it checks whether the bad reference is still
// present before doing anything.

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'tracker.db');

if (!fs.existsSync(DB_PATH)) {
    console.log(`Aucune base de donnees trouvee a ${DB_PATH} — rien a reparer.`);
    process.exit(0);
}

function main() {
    const db = new DatabaseSync(DB_PATH);

    const rows = db.prepare(`SELECT name, sql FROM sqlite_master WHERE sql LIKE '%prospects_old%'`).all();
    if (rows.length === 0) {
        console.log('✅ Aucune reference cassee vers "prospects_old" — rien a faire.');
        db.close();
        process.exit(0);
    }

    console.log(`⚠️  ${rows.length} objet(s) referencent encore "prospects_old" :`, rows.map(r => r.name));

    const backupPath = `${DB_PATH}.backup-fkrepair-${Date.now()}`;
    fs.copyFileSync(DB_PATH, backupPath);
    console.log(`📦 Sauvegarde creee : ${backupPath}`);

    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec('PRAGMA legacy_alter_table = ON;'); // don't let SQLite auto-rewrite refs again during our own renames
    db.exec('BEGIN TRANSACTION;');

    try {
        // Trigger references stage_history + prospects — drop it now, recreate correctly at the end.
        db.exec(`DROP TRIGGER IF EXISTS trg_update_stage_timestamp;`);

        // ---- Rebuild stage_history with a correct FK ----
        db.exec(`ALTER TABLE stage_history RENAME TO stage_history_old;`);
        db.exec(`
            CREATE TABLE stage_history (
                id              TEXT PRIMARY KEY,
                prospect_id     TEXT NOT NULL,
                from_stage      TEXT,
                to_stage        TEXT NOT NULL,
                changed_at      TEXT NOT NULL,
                note            TEXT,
                FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE
            );
        `);
        db.exec(`INSERT INTO stage_history SELECT * FROM stage_history_old;`);
        db.exec(`DROP TABLE stage_history_old;`);
        db.exec(`CREATE INDEX idx_stage_history_prospect ON stage_history(prospect_id);`);
        db.exec(`CREATE INDEX idx_stage_history_to_stage ON stage_history(to_stage);`);

        // ---- Rebuild interactions with a correct FK ----
        db.exec(`ALTER TABLE interactions RENAME TO interactions_old;`);
        db.exec(`
            CREATE TABLE interactions (
                id              TEXT PRIMARY KEY,
                prospect_id     TEXT NOT NULL,
                type            TEXT NOT NULL CHECK (type IN ('appel', 'message', 'rencontre', 'note')),
                content         TEXT NOT NULL,
                created_at      TEXT NOT NULL,
                FOREIGN KEY (prospect_id) REFERENCES prospects(id) ON DELETE CASCADE
            );
        `);
        db.exec(`INSERT INTO interactions SELECT * FROM interactions_old;`);
        db.exec(`DROP TABLE interactions_old;`);
        db.exec(`CREATE INDEX idx_interactions_prospect ON interactions(prospect_id);`);

        // ---- Recreate the trigger, correctly this time ----
        db.exec(`
            CREATE TRIGGER trg_update_stage_timestamp
            AFTER INSERT ON stage_history
            BEGIN
                UPDATE prospects
                SET stage = NEW.to_stage,
                    stage_updated_at = NEW.changed_at,
                    updated_at = NEW.changed_at
                WHERE id = NEW.prospect_id;
            END;
        `);

        db.exec('COMMIT;');
        db.exec('PRAGMA legacy_alter_table = OFF;');
        db.exec('PRAGMA foreign_keys = ON;');

        const stillBroken = db.prepare(`SELECT name FROM sqlite_master WHERE sql LIKE '%prospects_old%'`).all();
        if (stillBroken.length > 0) {
            throw new Error(`Reparation incomplete, objets encore casses: ${stillBroken.map(r => r.name).join(', ')}`);
        }

        console.log('✅ Reparation terminee : stage_history, interactions et le trigger pointent maintenant correctement vers "prospects".');
    } catch (err) {
        db.exec('ROLLBACK;');
        console.error('\n❌ Erreur pendant la reparation, tout a ete annule (rollback).');
        console.error(err.message);
        console.error(`\nTa base originale est intacte. Une sauvegarde existe aussi a : ${backupPath}`);
        process.exit(1);
    }

    db.close();
}

main();
