// public/js/data.js — Filters, data loading (prospects, reminders, stats, archives) and refreshAll().
// Plain script (no bundler): all frontend files share one global scope and
// load in the order listed in index.html. Code that runs at load time may
// only use what earlier files define; functions are hoisted per file only.

// ============================================
// FILTERS
// ============================================
function populateFilterOptions() {
  const sourceSel = document.getElementById('filterSource');
  sourceSel.innerHTML = `<option value="">Toutes les sources</option>` +
    Object.entries(SOURCE_LABELS).filter(([k]) => k !== 'non_renseigne')
      .map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

  const countrySel = document.getElementById('filterCountry');
  countrySel.innerHTML = `<option value="">Tous les pays</option>` +
    COUNTRIES.filter(c => c.name !== 'Autre').map(c => `<option value="${c.name}">${c.name}</option>`).join('');
}

function readFilters() {
  return {
    search: document.getElementById('filterSearch').value.trim(),
    source: document.getElementById('filterSource').value,
    interest_type: document.getElementById('filterInterest').value,
    temperature: document.getElementById('filterTemperature').value,
    country: document.getElementById('filterCountry').value,
    city: document.getElementById('filterCity').value.trim()
  };
}

function buildQuery(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
  return params.toString();
}

let filterDebounce;
['filterSearch', 'filterCity'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    clearTimeout(filterDebounce);
    filterDebounce = setTimeout(() => { activeFilters = readFilters(); updateFilterBadge(); loadProspects(); }, 300);
  });
});
['filterSource', 'filterInterest', 'filterTemperature', 'filterCountry'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    activeFilters = readFilters();
    updateFilterBadge();
    loadProspects();
  });
});
document.getElementById('clearFilters').addEventListener('click', () => {
  document.getElementById('filterSearch').value = '';
  document.getElementById('filterSource').value = '';
  document.getElementById('filterInterest').value = '';
  document.getElementById('filterTemperature').value = '';
  document.getElementById('filterCountry').value = '';
  document.getElementById('filterCity').value = '';
  activeFilters = {};
  updateFilterBadge();
  loadProspects();
});

function updateFilterBadge() {
  const count = Object.values(activeFilters).filter(Boolean).length;
  const badge = document.getElementById('filterBadge');
  badge.textContent = String(count);
  badge.classList.toggle('hidden', count === 0);
}

// ============================================
// LOAD DATA
// ============================================
async function loadProspects() {
  const qs = buildQuery(activeFilters);
  currentProspects = await api(`/api/prospects${qs ? '?' + qs : ''}`);
  renderBoard();
}

async function loadReminders() {
  const due = await api('/api/reminders');
  const badge = document.getElementById('notifBadge');
  const list = document.getElementById('notifList');

  badge.textContent = String(due.length);
  badge.classList.toggle('hidden', due.length === 0);

  if (due.length === 0) {
    list.innerHTML = `<div class="notif-empty">Aucune relance en attente</div>`;
    return;
  }
  list.innerHTML = due.map(p => {
    const wa = waLinkFromPhone(p.phone) || waLinkFromPhone(p.alt_phone);
    return `
      <button class="notif-item" data-wa="${escapeHtml(wa)}" data-id="${escapeHtml(p.id)}">
        <span class="notif-item-main">
          <span class="notif-item-name">${escapeHtml(p.name)}</span>
          <span class="notif-item-phone">${escapeHtml(p.phone)}</span>
        </span>
        <span class="notif-item-time">${formatDateTime(p.next_followup_at)}</span>
      </button>
    `;
  }).join('');
}

document.getElementById('notifList').addEventListener('click', (e) => {
  const item = e.target.closest('.notif-item');
  if (!item) return;
  const wa = item.dataset.wa;
  if (wa) window.open(wa, '_blank', 'noopener');
});

// Period for the whole stats screen ('' = all time), remembered per device.
let statsDays = (() => {
  try { return localStorage.getItem('statsDays') ?? '30'; } catch { return '30'; }
})();

document.getElementById('statsPeriod').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-days]');
  if (!btn) return;
  statsDays = btn.dataset.days;
  try { localStorage.setItem('statsDays', statsDays); } catch { /* per-device nicety only */ }
  await loadStats();
});

const FUNNEL_LABELS = { nouveau: 'Ajoutes', contacte: 'Contactes', prospect: 'Prospects', interesse: 'Interesses', en_decision: 'En decision', converti: 'Clients / partenaires' };

function renderGoalCard(activity) {
  const goal = currentUser?.weekly_goal;
  const done = activity.last_7_days_actions;
  const card = document.getElementById('goalCard');
  if (!goal) {
    card.innerHTML = `
      <div class="goal-text">
        <strong>${done} action${done > 1 ? 's' : ''} ces 7 derniers jours</strong>
        <span>Messages, appels et rencontres. Fixe-toi un objectif pour suivre ta regularite.</span>
      </div>
      <button class="btn-ghost" data-set-goal>Fixer un objectif</button>`;
    return;
  }
  const pct = Math.min(100, Math.round((done / goal) * 100));
  const message = pct >= 100 ? 'Objectif atteint, bravo ! Continue sur cette lancee.'
    : pct >= 60 ? 'Tu y es presque, garde le rythme.'
    : done > 0 ? "C'est parti — chaque message compte."
    : 'Un premier message aujourd\'hui ?';
  card.innerHTML = `
    <div class="goal-text">
      <strong>${done} / ${goal} actions ces 7 derniers jours</strong>
      <span>${message}</span>
      <div class="goal-bar ${pct >= 100 ? 'reached' : ''}"><div style="width:${pct}%"></div></div>
    </div>
    <button class="btn-ghost" data-set-goal>Modifier</button>`;
}

document.getElementById('goalCard').addEventListener('click', async (e) => {
  if (!e.target.closest('[data-set-goal]')) return;
  const answer = prompt("Combien d'actions (messages, appels, rencontres) veux-tu faire par semaine ?\nLaisse vide pour retirer l'objectif.", currentUser?.weekly_goal || 30);
  if (answer === null) return;
  try {
    currentUser = await api('/api/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ weekly_goal: answer.trim() === '' ? null : Number(answer) })
    });
    await loadStats();
  } catch (err) {
    alert(err.message);
  }
});

async function loadStats() {
  const qs = statsDays ? `?days=${statsDays}` : '';
  document.querySelectorAll('#statsPeriod [data-days]').forEach(b => b.classList.toggle('active', b.dataset.days === statsDays));

  const activity = await api(`/api/stats/activity${qs}`);
  renderGoalCard(activity);
  const tile = (label, value, note = '') => `
    <div class="stat-card"><p class="stat-label">${label}</p><p class="stat-value">${value}</p>${note ? `<p class="stat-note">${note}</p>` : ''}</div>`;
  const i = activity.interactions;
  document.getElementById('activityGrid').innerHTML =
    tile('Actions', activity.actions, `${i.message} message${i.message > 1 ? 's' : ''} · ${i.appel} appel${i.appel > 1 ? 's' : ''} · ${i.rencontre} rencontre${i.rencontre > 1 ? 's' : ''}`) +
    tile('Nouveaux contacts', activity.new_contacts) +
    tile('Etapes franchies', activity.stage_advances, 'Contacts que tu as fait avancer') +
    tile('Conversions', activity.conversions, 'Nouveaux clients / partenaires') +
    tile("Chiffre d'affaires", escapeHtml(Number(activity.revenue).toLocaleString('fr-FR')), `${activity.purchases} achat${activity.purchases > 1 ? 's' : ''} enregistre${activity.purchases > 1 ? 's' : ''}`);

  const top = activity.funnel[0].count;
  document.getElementById('funnel').innerHTML = top === 0
    ? `<p class="section-hint">Aucun contact ajoute pendant cette periode.</p>`
    : activity.funnel.map(f => {
        const pct = Math.round((f.count / top) * 100);
        return `
          <div class="funnel-row ${f.stage === 'converti' ? 'won' : ''}">
            <span class="funnel-label">${FUNNEL_LABELS[f.stage]}</span>
            <div class="funnel-bar"><div style="width:${Math.max(pct, f.count ? 2 : 0)}%"></div></div>
            <span class="funnel-count">${f.count} <small>${pct}%</small></span>
          </div>`;
      }).join('');

  const bench = await api(`/api/stats/benchmark${qs}`);
  document.getElementById('statCount').textContent = bench.count;
  document.getElementById('statMedian').textContent = bench.median_days !== null ? `${bench.median_days} j` : '—';
  document.getElementById('statMin').textContent = bench.min_days !== null ? `${bench.min_days} j` : '—';
  document.getElementById('statMax').textContent = bench.max_days !== null ? `${bench.max_days} j` : '—';
  document.getElementById('statMedianNote').textContent = bench.count === 0
    ? "Pas encore de conversion enregistree"
    : `Base sur ${bench.count} conversion(s) reelle(s)`;

  const sources = await api(`/api/stats/sources${qs}`);
  document.querySelector('#sourceTable tbody').innerHTML = sources.length === 0
    ? `<tr><td colspan="4" style="color:var(--text-faint)">Aucune donnee pour le moment</td></tr>`
    : sources.map(s => `
        <tr><td>${sourceLabel(s.source)}</td><td>${s.total}</td><td>${s.converted}</td><td>${s.conversion_rate}%</td></tr>
      `).join('');

  const countries = await api(`/api/stats/countries${qs}`);
  document.querySelector('#countryTable tbody').innerHTML = countries.length === 0
    ? `<tr><td colspan="4" style="color:var(--text-faint)">Aucune donnee pour le moment</td></tr>`
    : countries.map(c => `
        <tr><td>${c.country === 'non_renseigne' ? 'Non renseigne' : escapeHtml(c.country)}</td><td>${c.total}</td><td>${c.converted}</td><td>${c.conversion_rate}%</td></tr>
      `).join('');
}

async function loadArchived() {
  const all = await api('/api/prospects?archived=1');
  const archived = all.filter(p => p.is_archived);
  const list = document.getElementById('archivedList');
  list.innerHTML = archived.length === 0
    ? `<p style="color:var(--text-faint)">Aucun contact archive</p>`
    : archived.map(p => `
        <div class="archived-item" data-id="${p.id}">
          <div>
            <strong>${escapeHtml(p.name)}</strong>
            <span style="color:var(--text-faint); font-size:12px; margin-left:8px;">dernier statut: ${STAGES.find(s => s.key === p.stage)?.label || p.stage}</span>
          </div>
          <button class="restore-btn" data-restore="${p.id}">Restaurer</button>
        </div>
      `).join('');

  list.querySelectorAll('.archived-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.dataset.restore) return;
      openDetail(el.dataset.id);
    });
  });
  list.querySelectorAll('[data-restore]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await api(`/api/prospects/${btn.dataset.restore}/archive`, { method: 'POST', body: JSON.stringify({ archived: false }) });
      await refreshAll();
    });
  });
}

async function refreshAll() {
  await loadProspects();
  await loadReminders();
  // A filtered list isn't the whole picture — keep the last full schedule.
  if (!Object.values(activeFilters).some(Boolean)) syncMorningSummary(currentProspects);
  const activeView = document.querySelector('.tab-btn.active').dataset.view;
  if (activeView === 'today') await loadToday();
  if (activeView === 'stats') await loadStats();
  if (activeView === 'archived') await loadArchived();
}
