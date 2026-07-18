// Bootstrap-only: grant or revoke admin rights on an account, directly
// against the DB. There is no HTTP route for this — admins can activate
// accounts, unlock lockouts, and view the user list over HTTP (see
// /api/admin/* in server.js), but minting *new* admins stays a manual,
// server-access-only action for now.
//
// You'll typically only run this once, to make your own account an admin
// after registering it normally through the app.
//
// Usage:
//   node scripts/set-admin.js
// or non-interactively:
//   node scripts/set-admin.js +237677123456        (grants admin, default)
//   node scripts/set-admin.js +237677123456 off      (revokes admin)

const readline = require('readline/promises');
const { stdin, stdout } = require('process');
const db = require('../db');

async function main() {
    const [, , argPhone, argMode] = process.argv;

    let phone = argPhone;
    let mode = argMode;

    if (!phone) {
        const rl = readline.createInterface({ input: stdin, output: stdout });

        console.log('\n=== Droits administrateur (bootstrap) ===\n');

        const users = db.listAllUsers();
        if (users.length === 0) {
            console.log('Aucun compte enregistre pour le moment.');
            rl.close();
            return;
        }

        console.log('Comptes existants :');
        users.forEach(u => console.log(`  - ${u.name}  (${u.phone})  [${u.is_admin ? 'admin' : 'utilisateur'}]`));
        console.log('');

        phone = await rl.question('Numero du compte (avec indicatif, ex: +237677123456) : ');
        mode = await rl.question('Accorder ou retirer les droits admin ? (a = accorder [defaut], r = retirer) : ');

        rl.close();
    }

    phone = phone.trim();
    const grant = !(mode && mode.trim().toLowerCase().startsWith('r'));

    try {
        const user = db.setUserAdmin(phone, grant);
        if (grant) {
            console.log(`\n✅ ${user.name} (${user.phone}) est maintenant administrateur.`);
            console.log('Il/elle peut se connecter normalement et acceder aux routes /api/admin/*.\n');
        } else {
            console.log(`\n✅ Droits administrateur retires pour ${user.name} (${user.phone}).\n`);
        }
    } catch (err) {
        console.error(`\n❌ ${err.message}\n`);
        process.exit(1);
    }
}

main();
