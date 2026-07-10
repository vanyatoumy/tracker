// Admin password reset — run this directly on the machine/server hosting the app.
// Not exposed as an HTTP route on purpose: this bypasses login entirely, so it
// should only ever be reachable by someone with direct access to the server/database,
// never over the network.
//
// Usage:
//   node scripts/reset-password.js
// or non-interactively:
//   node scripts/reset-password.js +237677123456 nouveauMotDePasse123

const readline = require('readline/promises');
const { stdin, stdout } = require('process');
const db = require('../db');

async function promptHidden(rl, question) {
    // node:readline has no built-in masked input; keeping this simple (visible input)
    // is intentional — this script only ever runs locally by the admin themselves.
    return rl.question(question);
}

async function main() {
    const [, , argPhone, argPassword] = process.argv;

    let phone = argPhone;
    let password = argPassword;

    if (!phone || !password) {
        const rl = readline.createInterface({ input: stdin, output: stdout });

        console.log('\n=== Reinitialisation de mot de passe (admin) ===\n');

        const users = db.listAllUsers();
        if (users.length === 0) {
            console.log('Aucun compte enregistre pour le moment.');
            rl.close();
            return;
        }

        console.log('Comptes existants :');
        users.forEach(u => console.log(`  - ${u.name}  (${u.phone})`));
        console.log('');

        phone = phone || await promptHidden(rl, 'Numero du compte a reinitialiser (avec indicatif, ex: +237677123456) : ');
        password = password || await promptHidden(rl, 'Nouveau mot de passe (6 caracteres minimum) : ');

        rl.close();
    }

    phone = phone.trim();

    if (!password || password.length < 6) {
        console.error('\n❌ Le mot de passe doit contenir au moins 6 caracteres.');
        process.exit(1);
    }

    try {
        const user = db.resetPasswordByPhone(phone, password);
        console.log(`\n✅ Mot de passe reinitialise pour ${user.name} (${user.phone}).`);
        console.log('Toutes les sessions actives de ce compte ont ete deconnectees par securite.');
        console.log('La personne peut maintenant se reconnecter avec le nouveau mot de passe.\n');
    } catch (err) {
        console.error(`\n❌ ${err.message}\n`);
        process.exit(1);
    }
}

main();
