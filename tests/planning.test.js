const test = require('node:test');
const assert = require('node:assert/strict');
const Planning = require('../public/planning');

// Fixed "now": a Wednesday, mid-afternoon local time.
const NOW = new Date(2026, 9, 21, 15, 0, 0);
const daysAgo = (n, hour = 10) => new Date(2026, 9, 21 - n, hour, 0, 0).toISOString();
const daysAhead = (n, hour = 10) => new Date(2026, 9, 21 + n, hour, 0, 0).toISOString();

let seq = 0;
function prospect(fields) {
    return {
        id: `p${++seq}`,
        name: 'Contact',
        stage: 'nouveau',
        is_archived: 0,
        next_followup_at: null,
        stage_updated_at: daysAgo(0),
        created_at: daysAgo(0),
        reorder_interval_days: null,
        last_purchase_at: null,
        ...fields
    };
}
const ids = (section) => section.map(x => x.prospect.id);

test('follow-ups split into overdue (before today) and today, earliest first', () => {
    const late2 = prospect({ next_followup_at: daysAgo(2) });
    const late1 = prospect({ next_followup_at: daysAgo(1) });
    const thisMorning = prospect({ next_followup_at: daysAgo(0, 9) });   // already passed, but today
    const tonight = prospect({ next_followup_at: daysAgo(0, 20) });
    const tomorrow = prospect({ next_followup_at: daysAhead(1) });

    const s = Planning.buildToday([tonight, late1, tomorrow, thisMorning, late2], NOW);
    assert.deepEqual(ids(s.overdue), [late2.id, late1.id]);
    assert.equal(s.overdue[0].days, 2);
    assert.deepEqual(ids(s.today), [thisMorning.id, tonight.id]);
    const everywhere = Object.values(s).flatMap(ids);
    assert.ok(!everywhere.includes(tomorrow.id), 'a contact planned for later is not on today\'s list');
});

test('reorders: due once last purchase + interval is reached, for converted contacts only', () => {
    const due = prospect({ stage: 'client', reorder_interval_days: 30, last_purchase_at: daysAgo(31) });
    const dueToday = prospect({ stage: 'partenaire', reorder_interval_days: 30, last_purchase_at: daysAgo(30, 20) });
    const notYet = prospect({ stage: 'client', reorder_interval_days: 30, last_purchase_at: daysAgo(10) });
    const noInterval = prospect({ stage: 'client', last_purchase_at: daysAgo(90) });
    const noPurchase = prospect({ stage: 'client', reorder_interval_days: 30 });
    const notClient = prospect({ stage: 'interesse', reorder_interval_days: 30, last_purchase_at: daysAgo(90), stage_updated_at: daysAgo(1) });

    const s = Planning.buildToday([notYet, dueToday, noInterval, due, noPurchase, notClient], NOW);
    assert.deepEqual(ids(s.reorders), [due.id, dueToday.id]);
    assert.equal(s.reorders[0].days, 1);
});

test('cold: mid-pipeline contacts idle for 7+ days with nothing scheduled, longest idle first', () => {
    const veryCold = prospect({ stage: 'interesse', stage_updated_at: daysAgo(20) });
    const cold = prospect({ stage: 'contacte', stage_updated_at: daysAgo(7) });
    const warm = prospect({ stage: 'prospect', stage_updated_at: daysAgo(6) });
    const coldButPlanned = prospect({ stage: 'en_decision', stage_updated_at: daysAgo(30), next_followup_at: daysAhead(3) });
    const client = prospect({ stage: 'client', stage_updated_at: daysAgo(60) });

    const s = Planning.buildToday([cold, warm, client, veryCold, coldButPlanned], NOW);
    assert.deepEqual(ids(s.cold), [veryCold.id, cold.id]);
    assert.equal(s.cold[0].days, 20);
});

test('untouched: still "nouveau" with nothing scheduled, oldest first; archived contacts never show', () => {
    const old = prospect({ created_at: daysAgo(5) });
    const fresh = prospect({ created_at: daysAgo(0) });
    const planned = prospect({ next_followup_at: daysAhead(2) });
    const archived = prospect({ is_archived: 1, next_followup_at: daysAgo(3) });

    const s = Planning.buildToday([fresh, planned, archived, old], NOW);
    assert.deepEqual(ids(s.untouched), [old.id, fresh.id]);
    assert.ok(!Object.values(s).flatMap(ids).includes(archived.id));
});

test('a contact appears in one section only — the most urgent', () => {
    const p = prospect({ stage: 'client', next_followup_at: daysAgo(1), reorder_interval_days: 30, last_purchase_at: daysAgo(60) });
    const s = Planning.buildToday([p], NOW);
    assert.deepEqual(ids(s.overdue), [p.id]);
    assert.equal(s.reorders.length, 0);
});

test('fillTemplate replaces known variables (any case) and leaves unknown ones visible', () => {
    const p = { name: '  Marie Ngo Bassa ', city: 'Douala' };
    const user = { name: 'Tony Mbarga' };
    assert.equal(
        Planning.fillTemplate('Bonjour {prenom} ({NOM}) de {ville}, c\'est {moi}. {inconnu}', p, user),
        'Bonjour Marie (Marie Ngo Bassa) de Douala, c\'est Tony. {inconnu}'
    );
    assert.equal(Planning.fillTemplate('Salut {prenom} de {ville}', { name: 'Paul' }, null), 'Salut Paul de ');
});

test('whatsappLink encodes the message text', () => {
    assert.equal(Planning.whatsappLink('+237 677-12-34-56', 'Salut & bienvenue ?'), 'https://wa.me/237677123456?text=Salut%20%26%20bienvenue%20%3F');
    assert.equal(Planning.whatsappLink('+237677123456', ''), 'https://wa.me/237677123456');
    assert.equal(Planning.whatsappLink(null, 'x'), null);
});

test('birthdays: listed first (any stage), month and day only, 29 Feb wished on the 28th in other years', () => {
    const today = prospect({ name: 'Zoe', birthday: '1990-10-21', next_followup_at: daysAgo(3) });
    const alsoToday = prospect({ name: 'Ali', stage: 'client', birthday: '1985-10-21' });
    const notToday = prospect({ birthday: '1990-10-22' });
    const archived = prospect({ birthday: '1990-10-21', is_archived: 1 });

    const s = Planning.buildToday([today, notToday, alsoToday, archived], NOW);
    assert.deepEqual(ids(s.birthdays), [alsoToday.id, today.id]);
    assert.equal(s.overdue.length, 0, 'the birthday is the reason to call today, not a second entry');

    assert.equal(Planning.isBirthdayToday('2000-02-29', new Date(2027, 1, 28)), true);
    assert.equal(Planning.isBirthdayToday('2000-02-29', new Date(2028, 1, 28)), false);
    assert.equal(Planning.isBirthdayToday('2000-02-29', new Date(2028, 1, 29)), true);
    assert.equal(Planning.isBirthdayToday('', NOW), false);
    assert.equal(Planning.isBirthdayToday(null, NOW), false);
});
