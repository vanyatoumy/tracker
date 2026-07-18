const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, makeClient } = require('./helpers');
const db = require('../db');

test.before(async () => { await startServer(); });
test.after(async () => { await stopServer(); });

const PASSWORD = 'password123';

async function loginAs(phone) {
    const client = makeClient();
    const res = await client.post('/api/auth/login', { phone, password: PASSWORD });
    assert.equal(res.status, 200);
    return client;
}

test('import: raw Google Contacts export rows are parsed, junk names / invalid phones / in-file dupes are skipped and counted', async () => {
    const phone = '+237600444001';
    db.createUser({ name: 'Importer', phone, password: PASSWORD });
    db.setUserActive(phone, true);
    const client = await loginAs(phone);

    const rows = [
        { 'First Name': 'Marie', 'Last Name': 'Ngo', 'Phone 1 - Value': '+237677123456' },
        { 'First Name': '..', 'Last Name': '', 'Phone 1 - Value': '+237677123457' }, // junk name
        { 'First Name': 'No Phone Guy', 'Last Name': '', 'Phone 1 - Value': '' }, // no phone at all
        { 'First Name': 'Dup', 'Last Name': 'Person', 'Phone 1 - Value': '+237677123458' },
        { 'First Name': 'Dup Person', 'Last Name': 'Again', 'Phone 1 - Value': '+237677123458' }, // dup phone in-file
        { 'First Name': 'UK', 'Last Name': 'Contact', 'Phone 1 - Value': '+447578248217' },
        // Cameroon number missing the leading trunk digit (8 digits instead of 9)
        { 'First Name': 'Missing', 'Last Name': 'Six', 'Phone 1 - Value': '77123459' },
        // multiple phones packed into one Google export field, joined by ":::"
        { 'First Name': 'Two', 'Last Name': 'Phones', 'Phone 1 - Value': '+237677123460:::+237677123461' }
    ];

    const res = await client.post('/api/prospects/import', { rows });
    assert.equal(res.status, 200);
    assert.equal(res.body.total_rows, 8);
    // One candidate per PERSON, not per phone number — "Two Phones" contact
    // collapses into a single prospect with its second number kept as alt_phone.
    assert.equal(res.body.imported, 5); // Marie, Dup, UK, Missing Six, Two Phones
    assert.equal(res.body.skipped_no_name, 1);
    assert.equal(res.body.skipped_invalid_phone, 1);
    assert.equal(res.body.skipped_duplicate_in_file, 1);
    assert.equal(res.body.skipped_duplicate_existing, 0);

    const list = await client.get('/api/prospects');
    assert.equal(list.body.length, 5);

    const uk = list.body.find(p => p.name === 'UK Contact');
    assert.ok(uk);
    assert.equal(uk.phone, '+447578248217');
    assert.equal(uk.country, 'United Kingdom');

    const missingSix = list.body.find(p => p.name === 'Missing Six');
    assert.ok(missingSix);
    assert.equal(missingSix.phone, '+237677123459');

    const twoPhones = list.body.filter(p => p.name === 'Two Phones');
    assert.equal(twoPhones.length, 1); // one person, not one row per number
    assert.equal(twoPhones[0].phone, '+237677123460');
    assert.equal(twoPhones[0].alt_phone, '+237677123461');
});

test('import: re-running the same file skips everything as already-existing duplicates', async () => {
    const phone = '+237600444002';
    db.createUser({ name: 'Importer2', phone, password: PASSWORD });
    db.setUserActive(phone, true);
    const client = await loginAs(phone);

    const rows = [
        { 'First Name': 'Repeat', 'Last Name': 'Contact', 'Phone 1 - Value': '+237677999111' }
    ];

    const first = await client.post('/api/prospects/import', { rows });
    assert.equal(first.body.imported, 1);

    const second = await client.post('/api/prospects/import', { rows });
    assert.equal(second.body.imported, 0);
    assert.equal(second.body.skipped_duplicate_existing, 1);

    const list = await client.get('/api/prospects');
    assert.equal(list.body.length, 1);
});

test('import: legacy pre-converted format (Name, Country Code, Phone Number, Country) still works', async () => {
    const phone = '+237600444003';
    db.createUser({ name: 'Importer3', phone, password: PASSWORD });
    db.setUserActive(phone, true);
    const client = await loginAs(phone);

    const rows = [
        { Name: 'Legacy Contact', 'Country Code': '+237', 'Phone Number': '677123456', Country: 'Cameroun' }
    ];

    const res = await client.post('/api/prospects/import', { rows });
    assert.equal(res.status, 200);
    assert.equal(res.body.imported, 1);

    const list = await client.get('/api/prospects');
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].phone, '+237677123456');
});

test('import: a secondary phone that collides with an existing contact is dropped, not the whole person', async () => {
    const phone = '+237600444004';
    db.createUser({ name: 'Importer4', phone, password: PASSWORD });
    db.setUserActive(phone, true);
    const client = await loginAs(phone);

    // Someone already in the pipeline with this number as their primary phone.
    await client.post('/api/prospects/import', {
        rows: [{ 'First Name': 'Existing', 'Last Name': 'Contact', 'Phone 1 - Value': '+237677555001' }]
    });

    // A new contact whose *secondary* number collides with that existing phone.
    const res = await client.post('/api/prospects/import', {
        rows: [{
            'First Name': 'New', 'Last Name': 'Person',
            'Phone 1 - Value': '+237677555002:::+237677555001'
        }]
    });
    assert.equal(res.body.imported, 1);

    const list = await client.get('/api/prospects');
    const newPerson = list.body.find(p => p.name === 'New Person');
    assert.ok(newPerson);
    assert.equal(newPerson.phone, '+237677555002');
    assert.equal(newPerson.alt_phone, null); // dropped: already claimed by Existing Contact
});

test('import: unauthenticated requests are rejected', async () => {
    const client = makeClient();
    const res = await client.post('/api/prospects/import', { rows: [] });
    assert.equal(res.status, 401);
});
