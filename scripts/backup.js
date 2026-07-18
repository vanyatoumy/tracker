// Automated backup: snapshot -> compress -> prune old local copies -> optional offsite push.
//
// Intended to be run on a schedule via system cron on the host (NOT an
// in-process setInterval in server.js), so a crashed/restarting app doesn't
// silently stop backups, and vice versa. Example crontab entry (daily at 3am):
//
//   0 3 * * * cd /path/to/mlm-tracker && /usr/bin/node scripts/backup.js >> /var/log/mlm-backup.log 2>&1
//
// Usage:
//   node scripts/backup.js
//
// Configuration is via env vars (see .env.example): BACKUP_DIR,
// BACKUP_RETENTION_DAYS, BACKUP_REMOTE.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const config = require('../config');
const db = require('../db');

function timestamp() {
    // e.g. 2026-07-18T03-00-00
    return new Date().toISOString().replace(/:/g, '-').split('.')[0];
}

function log(msg) {
    console.log(`[backup ${new Date().toISOString()}] ${msg}`);
}

function compressFile(srcPath, destPath) {
    const input = fs.readFileSync(srcPath);
    const compressed = zlib.gzipSync(input);
    fs.writeFileSync(destPath, compressed);
}

function pruneOldBackups(dir, retentionDays) {
    if (!retentionDays || retentionDays <= 0) return;
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const entries = fs.readdirSync(dir).filter(f => f.startsWith('tracker-') && f.endsWith('.db.gz'));
    for (const file of entries) {
        const full = path.join(dir, file);
        const stat = fs.statSync(full);
        if (stat.mtimeMs < cutoff) {
            fs.unlinkSync(full);
            log(`Pruned old local backup: ${file}`);
        }
    }
}

function pushOffsite(localPath, remote) {
    if (!remote) {
        log('BACKUP_REMOTE not set — skipping offsite copy (local-only backup).');
        return;
    }
    // Shells out to the system rsync binary rather than adding a cloud SDK
    // dependency. Requires passwordless SSH key auth to already be set up
    // on the host — that's an operator/deploy-time concern, not this script's.
    try {
        execFileSync('rsync', ['-az', localPath, remote], { stdio: 'inherit' });
        log(`Pushed offsite via rsync to ${remote}`);
    } catch (err) {
        log(`rsync failed (${err.message}). Falling back to scp...`);
        execFileSync('scp', [localPath, remote], { stdio: 'inherit' });
        log(`Pushed offsite via scp to ${remote}`);
    }
}

function main() {
    const dir = config.BACKUP_DIR;
    fs.mkdirSync(dir, { recursive: true });

    const ts = timestamp();
    const snapshotPath = path.join(dir, `tracker-${ts}.db`);
    const gzPath = `${snapshotPath}.gz`;

    log(`Taking consistent snapshot via VACUUM INTO -> ${snapshotPath}`);
    db.backupTo(snapshotPath);

    log(`Compressing -> ${gzPath}`);
    compressFile(snapshotPath, gzPath);
    fs.unlinkSync(snapshotPath); // keep only the compressed copy locally

    const sizeKb = Math.round(fs.statSync(gzPath).size / 1024);
    log(`Backup ready: ${gzPath} (${sizeKb} KB)`);

    pushOffsite(gzPath, config.BACKUP_REMOTE);

    pruneOldBackups(dir, config.BACKUP_RETENTION_DAYS);

    log('Backup complete.');
}

try {
    main();
} catch (err) {
    console.error(`[backup] FAILED: ${err.message}`);
    process.exit(1);
}
