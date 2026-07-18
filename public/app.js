const STAGES = [
  { key: 'nouveau', label: 'Contact' },
  { key: 'contacte', label: 'Contacte' },
  { key: 'prospect', label: 'Prospect' },
  { key: 'interesse', label: 'Interesse' },
  { key: 'en_decision', label: 'En Decision' },
  { key: 'client', label: 'Client' },
  { key: 'partenaire', label: 'Partenaire' }
];
const INTERESSE_INDEX = STAGES.findIndex(s => s.key === 'interesse');

const SOURCE_LABELS = {
  referral: 'Recommandation',
  facebook: 'Facebook',
  instagram: 'Instagram',
  whatsapp_status: 'Statut WhatsApp',
  annuaire_telephonique: 'Annuaire téléphonique',
  groupe_whatsapp: 'Groupe whatsapp',
  evenement: 'Evenement',
  approche_directe: 'Approche directe',
  autre: 'Autre',
  non_renseigne: 'Non renseigne'
};

let currentProspects = [];
let activeProspectId = null;
let currentUser = null;
let activeFilters = {};

function getCollapsedStages() {
  try { return new Set(JSON.parse(localStorage.getItem('collapsedStages') || '[]')); }
  catch { return new Set(); }
}
function setCollapsedStages(set) {
  localStorage.setItem('collapsedStages', JSON.stringify([...set]));
}

// ============================================
// API HELPER
// ============================================
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts
  });
  // Login/register are expected to return 401 for wrong credentials — that's
  // a normal rejection with its own message, not an expired session. Only
  // treat 401 as "your session died, go back to the login screen" for every
  // OTHER endpoint (which require an existing session to begin with).
  const isAuthAttempt = path === '/api/auth/login' || path === '/api/auth/register';
  if (res.status === 401 && !isAuthAttempt) {
    showAuthScreen();
    throw new Error('Session expiree, reconnecte-toi');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erreur inconnue' }));
    throw new Error(err.error || 'Erreur inconnue');
  }
  if (res.status === 204) return null;
  return res.json();
}

// ============================================
// PHONE HELPERS (E.164 in, wa.me link out)
// ============================================
function populateDialSelects() {
  document.querySelectorAll('.dial-select').forEach(sel => {
    sel.innerHTML = COUNTRIES.filter(c => c.dial).map(c =>
      `<option value="${c.dial}">${c.dial} ${c.name}</option>`
    ).join('');
    sel.value = '+237'; // default: Cameroun, matches primary user base
  });
}

function populateCountrySelects() {
  document.querySelectorAll('.country-select').forEach(sel => {
    sel.innerHTML = `<option value="">— Non renseigne —</option>` +
      COUNTRIES.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  });
}

// Combine dial code + local number into a clean E.164-ish string
function buildE164(dial, local) {
  if (!local || !local.trim()) return null;
  const digits = local.replace(/\D/g, '').replace(/^0+/, ''); // strip leading zero (common local habit)
  return digits ? `${dial}${digits}` : null;
}

// Split a stored E.164 number back into {dial, local} for editing
function splitE164(phone) {
  if (!phone) return { dial: '+237', local: '' };
  const match = COUNTRIES
    .filter(c => c.dial)
    .sort((a, b) => b.dial.length - a.dial.length) // longest dial code first to avoid +1 matching +1xxx wrongly for others
    .find(c => phone.startsWith(c.dial));
  if (match) return { dial: match.dial, local: phone.slice(match.dial.length) };
  return { dial: '+237', local: phone.replace(/\D/g, '') };
}

function waLinkFromPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : null;
}

// ============================================
// TIME HELPERS
// ============================================
function daysSince(iso) {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}
function ageClass(iso) {
  const d = daysSince(iso);
  if (d < 2) return 'age-fresh';
  if (d < 5) return 'age-warm';
  return 'age-stale';
}
function relativeTime(iso) {
  const d = daysSince(iso);
  if (d < 1) return "aujourd'hui";
  const days = Math.floor(d);
  return days === 1 ? 'il y a 1 jour' : `il y a ${days} jours`;
}
function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function toDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ============================================
// AUTH FLOW
// ============================================
function showAuthScreen() {
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}
function showApp() {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

document.querySelectorAll('.auth-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('loginForm').classList.toggle('hidden', btn.dataset.auth !== 'login');
    document.getElementById('registerForm').classList.toggle('hidden', btn.dataset.auth !== 'register');
  });
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  const fd = new FormData(e.target);
  try {
    currentUser = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone: fd.get('phone'), password: fd.get('password') })
    });
    await bootApp();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('registerError');
  errEl.textContent = '';
  const fd = new FormData(e.target);
  try {
    const result = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: fd.get('name'), phone: fd.get('phone'), password: fd.get('password') })
    });
    // Accounts are created inactive and need admin activation — no session is
    // issued at registration time, so don't try to boot the app here. Switch
    // to the login tab and show the activation notice there instead.
    e.target.reset();
    document.querySelector('.auth-tab-btn[data-auth="login"]').click();
    document.getElementById('loginError').textContent =
      result.message || 'Compte cree. Il doit etre active par un administrateur avant que tu puisses te connecter.';
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  currentUser = null;
  showAuthScreen();
});

async function bootApp() {
  showApp();
  document.getElementById('currentUserInfo').textContent = currentUser ? `${currentUser.name} · ${currentUser.phone}` : '';
  document.getElementById('adminTabBtn').classList.toggle('hidden', !currentUser?.is_admin);
  populateDialSelects();
  populateCountrySelects();
  populateFilterOptions();
  await refreshAll();
}

// ============================================
// BOARD RENDERING
// ============================================
function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  const collapsed = getCollapsedStages();

  STAGES.forEach((stage, idx) => {
    const items = currentProspects.filter(p => p.stage === stage.key && !p.is_archived);
    const fillPct = ((idx + 1) / STAGES.length) * 100;
    const isCollapsed = collapsed.has(stage.key);

    const col = document.createElement('div');
    col.className = `column ${isCollapsed ? 'collapsed' : ''}`;
    col.innerHTML = `
      <div class="column-header">
        <p class="column-title">
          <span class="column-title-text">
            <button class="collapse-toggle" data-stage="${stage.key}" title="Reduire / agrandir">${isCollapsed ? '▸' : '▾'}</button>
            ${stage.label}
          </span>
          <span class="column-count">${items.length}</span>
        </p>
        <div class="progress-rail"><div class="progress-rail-fill" style="width:${fillPct}%"></div></div>
      </div>
      <div class="column-body" id="col-${stage.key}"></div>
    `;
    board.appendChild(col);

    col.querySelector('.collapse-toggle').addEventListener('click', () => {
      const set = getCollapsedStages();
      if (set.has(stage.key)) set.delete(stage.key); else set.add(stage.key);
      setCollapsedStages(set);
      renderBoard();
    });

    const body = col.querySelector('.column-body');
    if (items.length === 0) {
      body.innerHTML = `<div class="empty-column">Aucun contact</div>`;
      return;
    }
    items.forEach(p => body.appendChild(renderCard(p)));
  });
}

function renderCard(p) {
  const card = document.createElement('div');
  card.className = `card ${ageClass(p.stage_updated_at)}`;
  card.dataset.id = p.id;

  const wa = waLinkFromPhone(p.phone);
  const waLink = wa
    ? `<a class="card-wa" href="${wa}" target="_blank" rel="noopener" title="Ouvrir WhatsApp" onclick="event.stopPropagation()">&#x1F4AC;</a>`
    : '';

  const fbLink = (p.source === 'facebook' && p.facebook_profile_url)
    ? `<a class="card-wa" href="${escapeHtml(p.facebook_profile_url)}" target="_blank" rel="noopener" title="Ouvrir le profil Facebook" onclick="event.stopPropagation()">&#x1F310;</a>`
    : '';

  let followupHtml = '';
  if (p.next_followup_at) {
    const isPast = new Date(p.next_followup_at) <= new Date();
    followupHtml = `<div class="card-followup ${isPast ? 'overdue' : 'upcoming'}">${isPast ? '⏰ Relance en retard' : '📅 ' + formatDateTime(p.next_followup_at)}</div>`;
  }

  const locationBits = [p.quarter, p.city, p.country].filter(Boolean).join(', ');

  card.innerHTML = `
    <div class="card-top">
      <p class="card-name">${escapeHtml(p.name)}</p>
      ${waLink}${fbLink}
    </div>
    <div class="card-meta">
      ${p.source ? `<span class="tag">${SOURCE_LABELS[p.source] || p.source}</span>` : ''}
      ${p.interest_type && p.interest_type !== 'indecis' ? `<span class="tag">${p.interest_type === 'opportunite' ? 'Opportunite' : 'Produit'}</span>` : ''}
    </div>
    ${locationBits ? `<div class="card-meta"><span class="tag">📍 ${escapeHtml(locationBits)}</span></div>` : ''}
    <div class="card-meta"><span>${relativeTime(p.stage_updated_at)}</span></div>
    ${followupHtml}
  `;
  card.addEventListener('click', () => openDetail(p.id));
  return card;
}

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
    filterDebounce = setTimeout(() => { activeFilters = readFilters(); loadProspects(); }, 300);
  });
});
['filterSource', 'filterInterest', 'filterCountry'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    activeFilters = readFilters();
    loadProspects();
  });
});
document.getElementById('clearFilters').addEventListener('click', () => {
  document.getElementById('filterSearch').value = '';
  document.getElementById('filterSource').value = '';
  document.getElementById('filterInterest').value = '';
  document.getElementById('filterCountry').value = '';
  document.getElementById('filterCity').value = '';
  activeFilters = {};
  loadProspects();
});

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
  const bar = document.getElementById('reminderBar');
  const text = document.getElementById('reminderText');
  if (due.length > 0) {
    const names = due.slice(0, 3).map(p => p.name).join(', ');
    const extra = due.length > 3 ? ` et ${due.length - 3} autre(s)` : '';
    text.textContent = `🔔 A relancer aujourd'hui : ${names}${extra}`;
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
}

async function loadStats() {
  const bench = await api('/api/stats/benchmark');
  document.getElementById('statCount').textContent = bench.count;
  document.getElementById('statMedian').textContent = bench.median_days !== null ? `${bench.median_days} j` : '—';
  document.getElementById('statMin').textContent = bench.min_days !== null ? `${bench.min_days} j` : '—';
  document.getElementById('statMax').textContent = bench.max_days !== null ? `${bench.max_days} j` : '—';
  document.getElementById('statMedianNote').textContent = bench.count === 0
    ? "Pas encore de conversion enregistree"
    : `Base sur ${bench.count} conversion(s) reelle(s)`;

  const sources = await api('/api/stats/sources');
  document.querySelector('#sourceTable tbody').innerHTML = sources.length === 0
    ? `<tr><td colspan="4" style="color:var(--text-faint)">Aucune donnee pour le moment</td></tr>`
    : sources.map(s => `
        <tr><td>${SOURCE_LABELS[s.source] || s.source}</td><td>${s.total}</td><td>${s.converted}</td><td>${s.conversion_rate}%</td></tr>
      `).join('');

  const countries = await api('/api/stats/countries');
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
  const activeView = document.querySelector('.tab-btn.active').dataset.view;
  if (activeView === 'stats') await loadStats();
  if (activeView === 'archived') await loadArchived();
}

// ============================================
// TABS
// ============================================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const view = btn.dataset.view;
    document.getElementById(view + 'View').classList.remove('hidden');
    document.getElementById('filterBar').classList.toggle('hidden', view !== 'board');
    if (view === 'stats') await loadStats();
    if (view === 'archived') await loadArchived();
    if (view === 'board') await loadProspects();
    if (view === 'admin') await loadAdminUsers();
  });
});

// ============================================
// ADMIN (visible only to accounts with is_admin — see bootApp)
// ============================================
async function loadAdminUsers() {
  const tbody = document.querySelector('#adminUsersTable tbody');
  tbody.innerHTML = '<tr><td colspan="6">Chargement...</td></tr>';
  let users;
  try {
    users = await api('/api/admin/users');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6">${err.message}</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  users.forEach(u => {
    const isLocked = u.locked_until && new Date(u.locked_until) > new Date();
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.name}${u.is_admin ? ' <span title="Administrateur">👑</span>' : ''}</td>
      <td>${u.phone}</td>
      <td>${u.is_active ? 'Actif' : 'Inactif'}</td>
      <td>${isLocked ? `Verrouille jusqu'a ${new Date(u.locked_until).toLocaleString('fr-FR')}` : '—'}</td>
      <td>${new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
      <td class="admin-actions"></td>
    `;
    const actionsCell = tr.querySelector('.admin-actions');

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn-ghost';
    toggleBtn.textContent = u.is_active ? 'Desactiver' : 'Activer';
    toggleBtn.addEventListener('click', async () => {
      toggleBtn.disabled = true;
      try {
        await api(`/api/admin/users/${u.id}/activate`, {
          method: 'POST',
          body: JSON.stringify({ active: !u.is_active })
        });
        await loadAdminUsers();
      } catch (err) {
        alert(err.message);
        toggleBtn.disabled = false;
      }
    });
    actionsCell.appendChild(toggleBtn);

    if (isLocked) {
      const unlockBtn = document.createElement('button');
      unlockBtn.className = 'btn-ghost';
      unlockBtn.textContent = 'Debloquer';
      unlockBtn.addEventListener('click', async () => {
        unlockBtn.disabled = true;
        try {
          await api(`/api/admin/users/${u.id}/unlock`, { method: 'POST' });
          await loadAdminUsers();
        } catch (err) {
          alert(err.message);
          unlockBtn.disabled = false;
        }
      });
      actionsCell.appendChild(unlockBtn);
    }

    tbody.appendChild(tr);
  });

  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6">Aucun compte.</td></tr>';
  }
}

// ============================================
// ADD PROSPECT MODAL
// ============================================
const addModal = document.getElementById('addModal');
document.getElementById('addProspectBtn').addEventListener('click', () => {
  document.getElementById('addPhoneDial').classList.add('dial-select');
  document.getElementById('addFbGroup').classList.add('hidden');
  addModal.classList.remove('hidden');
});
document.getElementById('addPhoneDial').classList.add('dial-select');
document.getElementById('addCountry').classList.add('country-select');
document.getElementById('addSource').addEventListener('change', (e) => {
  document.getElementById('addFbGroup').classList.toggle('hidden', e.target.value !== 'facebook');
});

document.getElementById('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const phone = buildE164(fd.get('phone_dial'), fd.get('phone_local'));
  const payload = {
    name: fd.get('name'),
    phone,
    country: fd.get('country') || null,
    city: fd.get('city') || null,
    quarter: fd.get('quarter') || null,
    source: fd.get('source') || null,
    facebook_profile_url: fd.get('facebook_profile_url') || null,
    next_followup_at: fd.get('next_followup_at') ? new Date(fd.get('next_followup_at')).toISOString() : null
  };
  const created = await api('/api/prospects', { method: 'POST', body: JSON.stringify(payload) });
  e.target.reset();
  addModal.classList.add('hidden');
  await refreshAll();
  // Land directly on the new contact's detail view — this is the fastest path to
  // hitting "Contacter sur WhatsApp" right after adding someone.
  await openDetail(created.id);
});

// ============================================
// REMINDER DISMISS
// ============================================
document.getElementById('reminderDismiss').addEventListener('click', () => {
  document.getElementById('reminderBar').classList.add('hidden');
});

// ============================================
// DETAIL MODAL
// ============================================
const detailModal = document.getElementById('detailModal');

async function openDetail(id) {
  activeProspectId = id;
  const p = await api(`/api/prospects/${id}`);

  document.getElementById('detailName').textContent = p.name;
  const locationBits = [p.quarter, p.city, p.country].filter(Boolean).join(', ');
  document.getElementById('detailSub').textContent =
    `${locationBits || 'Localisation non renseignee'} · ${SOURCE_LABELS[p.source] || 'Source non renseignee'}`;

  // Prominent WhatsApp button — the main answer to "where do I click to contact this person"
  const waBtn = document.getElementById('detailWaBtn');
  const wa = waLinkFromPhone(p.phone);
  if (wa) {
    waBtn.href = wa;
    waBtn.classList.remove('hidden');
  } else {
    waBtn.classList.add('hidden');
  }

  // stage buttons
  const stageActions = document.getElementById('stageActions');
  stageActions.innerHTML = STAGES.map(s => `
    <button class="stage-btn ${s.key === p.stage ? 'current' : ''}" data-stage="${s.key}">${s.label}</button>
  `).join('');
  stageActions.querySelectorAll('.stage-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.dataset.stage === p.stage) return;
      await api(`/api/prospects/${id}/stage`, { method: 'POST', body: JSON.stringify({ to_stage: btn.dataset.stage }) });
      await openDetail(id);
      await refreshAll();
    });
  });

  // phone + address fields (editable)
  const { dial, local } = splitE164(p.phone);
  document.getElementById('detailPhoneDial').classList.add('dial-select');
  populateDialSelects();
  document.getElementById('detailPhoneDial').value = dial;
  document.getElementById('detailPhoneLocal').value = local;

  document.getElementById('detailCountry').classList.add('country-select');
  populateCountrySelects();
  document.getElementById('detailCountry').value = p.country || '';
  document.getElementById('detailCity').value = p.city || '';
  document.getElementById('detailQuarter').value = p.quarter || '';
  document.getElementById('detailFollowup').value = toDatetimeLocalValue(p.next_followup_at);

  // editable name — mistakes happen, this is the fix for that
  document.getElementById('detailNameInput').value = p.name;

  // source + conditional Facebook profile link (only meaningful for facebook-sourced contacts)
  const sourceSel = document.getElementById('detailSource');
  sourceSel.value = p.source || '';
  document.getElementById('detailFbGroup').classList.toggle('hidden', sourceSel.value !== 'facebook');
  document.getElementById('detailFbUrl').value = p.facebook_profile_url || '';

  // interest_type only becomes relevant once a contact has shown actual interest —
  // surfaced starting at "Interesse" and for every stage after it
  const stageIdx = STAGES.findIndex(s => s.key === p.stage);
  document.getElementById('detailInterestGroup').classList.toggle('hidden', stageIdx < INTERESSE_INDEX);
  document.getElementById('detailInterest').value = p.interest_type || 'indecis';

  await loadInteractions(id);
  await loadHistory(id);

  detailModal.classList.remove('hidden');
}

document.getElementById('detailSource').addEventListener('change', (e) => {
  document.getElementById('detailFbGroup').classList.toggle('hidden', e.target.value !== 'facebook');
});

document.getElementById('saveDetails').addEventListener('click', async () => {
  const dial = document.getElementById('detailPhoneDial').value;
  const local = document.getElementById('detailPhoneLocal').value;
  const phone = buildE164(dial, local);
  const followup = document.getElementById('detailFollowup').value;
  const name = document.getElementById('detailNameInput').value.trim();
  const source = document.getElementById('detailSource').value;

  if (!name) { alert('Le nom ne peut pas etre vide.'); return; }

  try {
    await api(`/api/prospects/${activeProspectId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name,
        phone,
        country: document.getElementById('detailCountry').value || null,
        city: document.getElementById('detailCity').value || null,
        quarter: document.getElementById('detailQuarter').value || null,
        source: source || null,
        facebook_profile_url: source === 'facebook' ? (document.getElementById('detailFbUrl').value || null) : null,
        interest_type: document.getElementById('detailInterest').value || null,
        next_followup_at: followup ? new Date(followup).toISOString() : null
      })
    });
    await openDetail(activeProspectId);
    await refreshAll();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('interactionForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await api(`/api/prospects/${activeProspectId}/interactions`, {
    method: 'POST',
    body: JSON.stringify({ type: fd.get('type'), content: fd.get('content') })
  });
  e.target.reset();
  await loadInteractions(activeProspectId);
});

async function loadInteractions(id) {
  const items = await api(`/api/prospects/${id}/interactions`);
  const list = document.getElementById('interactionsList');
  list.innerHTML = items.length === 0
    ? `<p style="color:var(--text-faint); font-size:12px;">Aucune interaction enregistree</p>`
    : items.map(i => `
        <div class="interaction-item">
          <span class="itype">${i.type}</span>
          <span class="itime">${formatDateTime(i.created_at)}</span>
          <p>${escapeHtml(i.content)}</p>
        </div>
      `).join('');
}

async function loadHistory(id) {
  const items = await api(`/api/prospects/${id}/history`);
  const timeline = document.getElementById('historyTimeline');
  timeline.innerHTML = items.map(h => `
    <div class="timeline-item">
      <div class="timeline-stage">${STAGES.find(s => s.key === h.to_stage)?.label || h.to_stage}</div>
      <div class="timeline-time">${formatDateTime(h.changed_at)}</div>
      ${h.note ? `<div class="timeline-note">${escapeHtml(h.note)}</div>` : ''}
    </div>
  `).join('');
}

document.getElementById('archiveBtn').addEventListener('click', async () => {
  if (!confirm('Marquer ce contact comme perdu ? Il sera retire du pipeline actif.')) return;
  await api(`/api/prospects/${activeProspectId}/archive`, { method: 'POST', body: JSON.stringify({ archived: true }) });
  detailModal.classList.add('hidden');
  await refreshAll();
});

document.getElementById('deleteBtn').addEventListener('click', async () => {
  if (!confirm("Supprimer definitivement ce contact ? Cette action est irreversible — tout l'historique et les interactions seront perdus. Si tu veux juste le retirer du pipeline sans perdre l'historique, utilise plutot \"Marquer comme perdu\".")) return;
  await api(`/api/prospects/${activeProspectId}`, { method: 'DELETE' });
  detailModal.classList.add('hidden');
  await refreshAll();
});

// ============================================
// MODAL CLOSE HELPERS
// ============================================
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => {
    addModal.classList.add('hidden');
    detailModal.classList.add('hidden');
  });
});
[addModal, detailModal].forEach(m => {
  m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { addModal.classList.add('hidden'); detailModal.classList.add('hidden'); }
});

// ============================================
// INIT: check for an existing session before showing either screen
// ============================================
(async function init() {
  try {
    currentUser = await api('/api/auth/me');
    await bootApp();
  } catch {
    showAuthScreen();
  }
})();
