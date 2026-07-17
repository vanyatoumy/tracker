// Migration: old schema (5 stages, single 'client_partenaire' stage + outcome_type)
//         -> new schema (7 stages, split 'client' / 'partenaire', + facebook_profile_url)
//
// Safe to run multiple times — it checks whether migration already happened and
// exits immediately if so. Makes a timestamped backup of the database file before
// touching anything.
//
// Usage:
//   node scripts/migrate-v2-stages.js
// or, if your database lives somewhere custom:
//   DB_PATH=/data/tracker.db node scripts/migrate-v2-stages.js

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'tracker.db');

if (!fs.existsSync(DB_PATH)) {
    console.log(`Aucune base de donnees trouvee a ${DB_PATH} — rien a migrer.`);
    process.exit(0);
}

function columnExists(db, table, column) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    return cols.some(c => c.name === column);
}

function main() {
    const db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA foreign_keys = OFF;'); // temporarily, while we swap tables around
    // Without this, SQLite auto-rewrites OTHER tables' FK clauses and trigger
    // bodies to follow the RENAME below (stage_history/interactions/the stage
    // trigger all reference `prospects`) — pointing them at `prospects_old`,
    // which then gets dropped, leaving dangling references. Disabling this
    // auto-rewrite keeps their text saying `prospects`, which is valid again
    // as soon as the new `prospects` table is created a few lines down.
    db.exec('PRAGMA legacy_alter_table = ON;');

    // Already migrated? (facebook_profile_url only exists on the new schema)
    if (columnExists(db, 'prospects', 'facebook_profile_url')) {
        console.log('✅ La base est deja a jour (nouveau schema detecte) — rien a faire.');
        db.close();
        process.exit(0);
    }

    // --- Backup first. This is irreversible schema surgery on real data. ---
    const backupPath = `${DB_PATH}.backup-${Date.now()}`;
    fs.copyFileSync(DB_PATH, backupPath);
    console.log(`📦 Sauvegarde creee : ${backupPath}`);

    console.log('🔄 Migration en cours...\n');

    db.exec('BEGIN TRANSACTION;');

    try {
        // ---- 1. Read every existing prospect, decide its new stage ----
        const oldProspects = db.prepare(`SELECT * FROM prospects`).all();
        const stageMap = new Map(); // prospect_id -> resolved new stage ('client' or 'partenaire') for ones that were 'client_partenaire'
        const ambiguous = [];

        for (const p of oldProspects) {
            if (p.stage === 'client_partenaire') {
                let resolved;
                if (p.outcome_type === 'partenaire') resolved = 'partenaire';
                else if (p.outcome_type === 'produit') resolved = 'client';
                else {
                    // Reached the final stage but outcome was never recorded — default to
                    // 'client', but flag it so it can be checked and corrected manually.
                    resolved = 'client';
                    ambiguous.push(p.name);
                }
                stageMap.set(p.id, resolved);
            }
        }

        // ---- 2. Rename old table out of the way, create the new one ----
        db.exec(`ALTER TABLE prospects RENAME TO prospects_old;`);

        db.exec(`
            CREATE TABLE prospects (
                id              TEXT PRIMARY KEY,
                owner_id        TEXT NOT NULL,
                name            TEXT NOT NULL,
                phone           TEXT,
                country         TEXT,
                city            TEXT,
                quarter         TEXT,
                facebook_profile_url TEXT,
                stage           TEXT NOT NULL CHECK (stage IN (
                                    'nouveau', 'contacte', 'prospect', 'interesse',
                                    'en_decision', 'client', 'partenaire'
                                )),
                stage_updated_at TEXT NOT NULL,
                source          TEXT,
                interest_type   TEXT CHECK (interest_type IN ('produit', 'opportunite', 'indecis') OR interest_type IS NULL),
                is_archived     INTEGER NOT NULL DEFAULT 0,
                next_followup_at TEXT,
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL,
                FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        // ---- 3. Copy every row across, remapping stage where needed ----
        const insert = db.prepare(`
            INSERT INTO prospects (id, owner_id, name, phone, country, city, quarter, facebook_profile_url,
                                    stage, stage_updated_at, source, interest_type, is_archived,
                                    next_followup_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const p of oldProspects) {
            const newStage = stageMap.get(p.id) || p.stage;
            insert.run(
                p.id, p.owner_id, p.name, p.phone, p.country, p.city, p.quarter,
                newStage, p.stage_updated_at, p.source, p.interest_type, p.is_archived,
                p.next_followup_at, p.created_at, p.updated_at
            );
        }

        db.exec(`DROP TABLE prospects_old;`);

        // ---- 4. Recreate indexes (lost when the old table was dropped) ----
        db.exec(`CREATE INDEX idx_prospects_owner ON prospects(owner_id);`);
        db.exec(`CREATE INDEX idx_prospects_stage ON prospects(stage);`);
        db.exec(`CREATE INDEX idx_prospects_archived ON prospects(is_archived);`);
        db.exec(`CREATE INDEX idx_prospects_followup ON prospects(next_followup_at);`);
        db.exec(`CREATE INDEX idx_prospects_country ON prospects(country);`);

        // ---- 5. Remap stage_history rows that reference the old combined stage name,
        //         using the same resolution as the prospect they belong to, so a prospect's
        //         own timeline stays internally consistent (and so the conversion-time
        //         benchmark, which filters on to_stage IN ('client','partenaire'), still
        //         finds these historic conversions instead of silently losing them). ----
        const updateTo = db.prepare(`UPDATE stage_history SET to_stage = ? WHERE prospect_id = ? AND to_stage = 'client_partenaire'`);
        const updateFrom = db.prepare(`UPDATE stage_history SET from_stage = ? WHERE prospect_id = ? AND from_stage = 'client_partenaire'`);
        for (const [prospectId, resolvedStage] of stageMap.entries()) {
            updateTo.run(resolvedStage, prospectId);
            updateFrom.run(resolvedStage, prospectId);
        }

        db.exec('COMMIT;');
        db.exec('PRAGMA legacy_alter_table = OFF;');
        db.exec('PRAGMA foreign_keys = ON;');

        console.log(`✅ Migration terminee : ${oldProspects.length} contact(s) migre(s).`);
        if (ambiguous.length > 0) {
            console.log(`\n⚠️  ${ambiguous.length} contact(s) etaient au stade final sans type enregistre (produit/partenaire).`);
            console.log(`   Ils ont ete places par defaut en "Client" — verifie et corrige si besoin :`);
            ambiguous.forEach(name => console.log(`   - ${name}`));
        }
        console.log(`\nLa base est prete pour la nouvelle version de l'app.`);

    } catch (err) {
        db.exec('ROLLBACK;');
        console.error('\n❌ Erreur pendant la migration, tout a ete annule (rollback).');
        console.error(err.message);
        console.error(`\nTa base originale est intacte. Une sauvegarde existe aussi a : ${backupPath}`);
        process.exit(1);
    }

    db.close();
}

main();
