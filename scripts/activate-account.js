// Admin account activation — run this directly on the machine/server hosting the app.
// New registrations are created inactive (see db.js createUser) and cannot log in
// until activated. There's no admin dashboard yet, so this CLI is the only way to
// flip that flag. Not exposed as an HTTP route on purpose: reachable only by someone
// with direct access to the server/database, never over the network.
//
// Usage:
//   node scripts/activate-account.js
// or non-interactively:
//   node scripts/activate-account.js +237677123456        (activates, default)
//   node scripts/activate-account.js +237677123456 off     (deactivates)

const readline = require('readline/promises');
const { stdin, stdout } = require('process');
const db = require('../db');

async function main() {
    const [, , argPhone, argMode] = process.argv;

    let phone = argPhone;
    let mode = argMode;

    if (!phone) {
        const rl = readline.createInterface({ input: stdin, output: stdout });

        console.log('\n=== Activation de compte (admin) ===\n');

        const users = db.listAllUsers();
        if (users.length === 0) {
            console.log('Aucun compte enregistre pour le moment.');
            rl.close();
            return;
        }

        console.log('Comptes existants :');
        users.forEach(u => console.log(`  - ${u.name}  (${u.phone})  [${u.is_active ? 'actif' : 'INACTIF'}]`));
        console.log('');

        phone = await rl.question('Numero du compte a activer (avec indicatif, ex: +237677123456) : ');
        mode = await rl.question('Activer ou desactiver ? (a = activer [defaut], d = desactiver) : ');

        rl.close();
    }

    phone = phone.trim();
    const active = !(mode && mode.trim().toLowerCase().startsWith('d'));

    try {
        const user = db.setUserActive(phone, active);
        if (active) {
            console.log(`\n✅ Compte active : ${user.name} (${user.phone}).`);
            console.log('La personne peut maintenant se connecter.\n');
        } else {
            console.log(`\n✅ Compte desactive : ${user.name} (${user.phone}).`);
            console.log('La personne ne pourra plus se connecter tant que le compte n\'est pas reactive.\n');
        }
    } catch (err) {
        console.error(`\n❌ ${err.message}\n`);
        process.exit(1);
    }
}

main();
