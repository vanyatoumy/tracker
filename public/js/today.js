// public/js/today.js — Today view and the getting-started card.
// Plain script (no bundler): all frontend files share one global scope and
// load in the order listed in index.html. Code that runs at load time may
// only use what earlier files define; functions are hoisted per file only.

// ============================================
// TODAY VIEW — "who do I contact today?" (rules in planning.js)
// ============================================
const TODAY_SECTIONS = [
  { key: 'birthdays', title: 'Anniversaires', hint: 'Un petit message aujourd\'hui fait toujours plaisir.' },
  { key: 'overdue', title: 'Relances en retard' },
  { key: 'today', title: "Relances d'aujourd'hui" },
  { key: 'reorders', title: 'Reachats a proposer', hint: 'Clients dont le delai de reachat est atteint.' },
  { key: 'cold', title: 'Contacts qui refroidissent', hint: `Sans mouvement depuis ${Planning.COLD_AFTER_DAYS} jours ou plus, et aucune relance prevue.` },
  { key: 'untouched', title: 'Jamais contactes', hint: 'Nouveaux contacts sans relance prevue.' }
];
// Long sections (e.g. hundreds of imported, never-contacted contacts) show
// the first few and a "show more" button rather than one endless page.
const TODAY_SECTION_LIMIT = 10;
const expandedTodaySections = new Set();
let todayProspects = [];

// The board's list is filtered by the search/filter panel; this view must
// always see everything, so it only reuses that list when no filter is on.
async function loadToday({ fresh = false } = {}) {
  const filtered = Object.values(activeFilters).some(Boolean);
  todayProspects = (fresh || filtered) ? await api('/api/prospects') : currentProspects;
  await loadOnboarding();
  renderToday();
}

// ---------- "Bien démarrer": getting-started card for new accounts ----------
// Three steps (contacts, message templates, first message sent), shown at
// the top of the Today view until all are done or the user hides it. Both
// end states are remembered per device so the extra requests stop.
let onboarding = null; // { contacts, templates, actions } while shown, else null
function onboardingFlag(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key) === '1';
    localStorage.setItem(key, '1');
  } catch { /* per-device nicety only */ }
  return false;
}

async function loadOnboarding() {
  if (onboardingFlag('onboardingDone') || onboardingFlag('onboardingHidden')) { onboarding = null; return; }
  let templates = 0;
  let actions = 0;
  try { templates = (await api('/api/templates')).length; } catch { /* unknown: not done */ }
  try { actions = (await api('/api/stats/activity')).actions; } catch { /* offline: not done */ }
  onboarding = { contacts: todayProspects.length, templates, actions };
  if (onboarding.contacts > 0 && templates > 0 && actions > 0) {
    onboardingFlag('onboardingDone', true);
    onboarding = null;
  }
}

function onboardingHtml() {
  if (!onboarding) return '';
  const steps = [
    {
      done: onboarding.contacts > 0,
      title: 'Ajoute tes contacts',
      text: 'Importe ton repertoire Google en une fois, ou ajoute tes contacts un par un.',
      actions: `<button class="btn-primary" data-onboard="import">Importer mes contacts</button><button class="btn-ghost" data-onboard="add">Ajouter un contact</button>`
    },
    {
      done: onboarding.templates > 0,
      title: 'Prepare tes messages',
      text: 'Des messages types prets a envoyer sur WhatsApp, que tu adaptes a ta facon de parler.',
      actions: `${STARTER_PACK_BUTTON}<button class="btn-ghost" data-onboard="templates">Ecrire les miens</button>`
    },
    {
      done: onboarding.actions > 0,
      title: 'Envoie ton premier message',
      text: 'Touche « Message » sur un contact de ta liste du jour : le message part sur WhatsApp et le contact passe a « Contacte ».',
      actions: ''
    }
  ];
  const doneCount = steps.filter(s => s.done).length;
  return `
    <section class="onboarding-card">
      <div class="onboarding-head">
        <h2 class="section-title">Bien demarrer <span class="today-count">${doneCount}/3</span></h2>
        <button class="btn-ghost" data-onboard="hide">Masquer</button>
      </div>
      <ol class="onboarding-steps">
        ${steps.map(s => `
          <li class="${s.done ? 'done' : ''}">
            <span class="onboarding-check">${s.done ? '✓' : ''}</span>
            <div>
              <strong>${s.title}</strong>
              <p>${s.text}</p>
              ${s.done || !s.actions ? '' : `<div class="onboarding-actions">${s.actions}</div>`}
            </div>
          </li>`).join('')}
      </ol>
    </section>`;
}

document.getElementById('todayContent').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-onboard]');
  if (!btn) return;
  switch (btn.dataset.onboard) {
    case 'import': return document.getElementById('importBtn').click();
    case 'add': return document.getElementById('addProspectBtn').click();
    case 'templates': return openTemplatesModal();
    case 'hide':
      onboardingFlag('onboardingHidden', true);
      onboarding = null;
      return renderToday();
  }
});

function todayItemDetail(sectionKey, item) {
  const p = item.prospect;
  switch (sectionKey) {
    case 'birthdays':
      return `C'est son anniversaire aujourd'hui · ${STAGES.find(s => s.key === p.stage)?.label || p.stage}`;
    case 'overdue':
      return `En retard de ${item.days} j · prevue le ${formatDateTime(p.next_followup_at)}`;
    case 'today':
      return `Prevue a ${new Date(p.next_followup_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    case 'reorders':
      return `Dernier achat le ${new Date(p.last_purchase_at).toLocaleDateString('fr-FR')} · ` +
        (item.days <= 0 ? "reachat prevu aujourd'hui" : `reachat depasse de ${item.days} j`);
    case 'cold':
      return `${STAGES.find(s => s.key === p.stage)?.label || p.stage} · sans mouvement depuis ${item.days} j`;
    case 'untouched':
      return item.days === 0 ? "Ajoute aujourd'hui" : `Ajoute il y a ${item.days} j`;
    default:
      return '';
  }
}

function renderToday() {
  const container = document.getElementById('todayContent');
  const sections = Planning.buildToday(todayProspects);
  const total = TODAY_SECTIONS.reduce((n, s) => n + sections[s.key].length, 0);
  const dateLabel = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  let html = onboardingHtml() + `
    <div class="today-header">
      <h2 class="section-title">${escapeHtml(dateLabel)}</h2>
      <p class="section-hint">${total === 0 ? "Rien d'urgent aujourd'hui. Profites-en pour ajouter de nouveaux contacts !" : `${total} contact${total > 1 ? 's' : ''} a traiter`}</p>
    </div>`;

  for (const section of TODAY_SECTIONS) {
    const items = sections[section.key];
    if (items.length === 0) continue;
    const expanded = expandedTodaySections.has(section.key);
    const shown = expanded ? items : items.slice(0, TODAY_SECTION_LIMIT);
    html += `
      <section class="today-section today-${section.key}">
        <h3 class="today-section-title">${section.title} <span class="today-count">${items.length}</span></h3>
        ${section.hint ? `<p class="section-hint">${section.hint}</p>` : ''}
        <div class="today-list">
          ${shown.map(item => {
            const p = item.prospect;
            const canMessage = !!(p.phone || p.alt_phone);
            return `
              <div class="today-item" data-id="${escapeHtml(p.id)}">
                <div class="today-item-main">
                  <span class="today-item-name">${escapeHtml(p.name)}</span>
                  <span class="today-item-detail">${escapeHtml(todayItemDetail(section.key, item))}</span>
                </div>
                <div class="today-item-actions">
                  ${canMessage ? `<button class="btn-whatsapp" data-message="${escapeHtml(p.id)}" title="Envoyer un message WhatsApp">${icon('messageCircle')} <span class="btn-label">Message</span></button>` : ''}
                  <button class="btn-ghost" data-snooze="${escapeHtml(p.id)}" title="Programmer une relance demain a 9h">Demain</button>
                </div>
              </div>`;
          }).join('')}
        </div>
        ${items.length > shown.length ? `<button class="btn-ghost today-more" data-expand="${section.key}">Voir les ${items.length - shown.length} autres</button>` : ''}
      </section>`;
  }
  container.innerHTML = html;
}

document.getElementById('todayContent').addEventListener('click', async (e) => {
  const expandBtn = e.target.closest('[data-expand]');
  if (expandBtn) {
    expandedTodaySections.add(expandBtn.dataset.expand);
    renderToday();
    return;
  }
  const messageBtn = e.target.closest('[data-message]');
  if (messageBtn) {
    const p = todayProspects.find(x => x.id === messageBtn.dataset.message);
    if (p) openMessageModal(p);
    return;
  }
  const snoozeBtn = e.target.closest('[data-snooze]');
  if (snoozeBtn) {
    snoozeBtn.disabled = true;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    try {
      const updated = await api(`/api/prospects/${snoozeBtn.dataset.snooze}`, {
        method: 'PATCH',
        body: JSON.stringify({ next_followup_at: tomorrow.toISOString() })
      });
      await syncFollowupNotification(updated);
      await refreshAll();
    } catch (err) {
      alert(err.message);
      snoozeBtn.disabled = false;
    }
    return;
  }
  const row = e.target.closest('.today-item');
  if (row) openDetail(row.dataset.id);
});
