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

// ============================================
// ICONS (inlined Lucide SVGs — https://lucide.dev, ISC license)
// ============================================
// Inlined rather than loaded from a CDN font/library: the app needs to keep
// working fully offline, and the existing CSP only allows 'self' plus
// Google Fonts — no external icon service fits either constraint. Each is
// the exact source markup from the lucide-static package, just wrapped in
// a size-controlling <span class="icon">.
const ICONS = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  chevronDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  moreVertical: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>',
  wifiOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/></svg>',
  refreshCw: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
  arrowDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>',
  alarmClock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/><path d="M6.38 18.7 4 21"/><path d="M17.64 18.67 20 21"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v3"/><path d="M16 2v3"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>',
  mapPin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>',
  crown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/></svg>',
  messageCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>'
};
function icon(name, extraClass) {
  return `<span class="icon${extraClass ? ' ' + extraClass : ''}">${ICONS[name]}</span>`;
}

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
  // OfflineSync (mobile app only — see offline.js) transparently falls back
  // to a local cache/queue when there's no connectivity. On the web version
  // OfflineSync.enabled is false and this behaves exactly as a plain fetch.
  if (typeof OfflineSync !== 'undefined' && OfflineSync.enabled) {
    return OfflineSync.request(path, opts, showAuthScreen);
  }

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
    // The server also answers 401 when the account was deactivated or its
    // subscription lapsed mid-session — pass that reason through.
    const body = await res.json().catch(() => ({}));
    showAuthScreen();
    throw new Error(body.error || 'Session expiree, reconnecte-toi');
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
// Escapes for both element text and quoted attribute values — the
// textContent/innerHTML round-trip this replaced left `"` and `'` as-is,
// so a value inside href="..." could break out of the attribute.
const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}
function sourceLabel(source) {
  return SOURCE_LABELS[source] || escapeHtml(source);
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

document.querySelectorAll('.password-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.innerHTML = showing ? icon('eye') : icon('eyeOff');
    btn.title = showing ? 'Afficher le mot de passe' : 'Masquer le mot de passe';
  });
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  const fd = new FormData(e.target);
  const phone = fd.get('phone');
  const password = fd.get('password');
  try {
    currentUser = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password })
    });
    // Remembered so the phone number is prefilled next time — deliberately
    // never the password, see the prefill code near the bottom of this file.
    localStorage.setItem('lastLoginPhone', phone);
    // Succeeds whether this came from the real server or (offline) from a
    // previously cached verifier — either way, refresh the local verifier
    // so it always reflects the last password actually used successfully.
    if (typeof OfflineSync !== 'undefined' && OfflineSync.enabled) {
      await OfflineSync.cacheLoginCredential(phone, password, currentUser);
      // Only a real online login returns a fresh session token — offline
      // login just re-verifies the cached password locally (see
      // verifyOfflineLogin in offline.js) and can't obtain a new one. Skip
      // the call entirely in that case, rather than passing something
      // falsy, so whatever token is already cached from the last online
      // login is left untouched instead of being wiped.
      if (currentUser.token) await OfflineSync.setToken(currentUser.token);
    }
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
    let message = result.message || 'Compte cree. Il doit etre active par un administrateur avant que tu puisses te connecter.';
    try {
      const info = await api('/api/subscription/info');
      if (info.price || info.instructions) {
        message += `\n\n${info.price ? `Prix : ${info.price}. ` : ''}${info.instructions || ''}${info.contact ? ` (${info.contact})` : ''}`;
      }
    } catch { /* payment info is optional — skip silently if unreachable */ }
    document.getElementById('loginError').textContent = message;
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  // Signing out must work offline too — clear local state regardless of
  // whether the server call actually goes through. If it doesn't, the
  // server-side session just lingers until it naturally expires; the device
  // itself is still fully signed out.
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* offline — fine, see above */ }
  if (typeof OfflineSync !== 'undefined' && OfflineSync.enabled) await OfflineSync.clearSession();
  currentUser = null;
  showAuthScreen();
});

function setupMenu(btnId, menuId, { closeOnButtonClick = true } = {}) {
  const btn = document.getElementById(btnId);
  const menu = document.getElementById(menuId);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = menu.classList.contains('hidden');
    document.querySelectorAll('.dropdown-menu').forEach(m => {
      if (m !== menu) m.classList.add('hidden');
    });
    menu.classList.toggle('hidden', !willOpen);
    btn.setAttribute('aria-expanded', String(willOpen));
  });
  document.addEventListener('click', (e) => {
    if (!menu.classList.contains('hidden') && !menu.contains(e.target) && e.target !== btn) {
      menu.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
  if (closeOnButtonClick) {
    menu.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') menu.classList.add('hidden');
    });
  }
}

setupMenu('moreMenuBtn', 'moreMenu');
setupMenu('filterMenuBtn', 'filterMenu', { closeOnButtonClick: false });
setupMenu('notifBtn', 'notifMenu');

// ============================================
// LOCAL NOTIFICATIONS (follow-up reminders)
// ============================================
// Only present inside the Capacitor-wrapped mobile app — plain web browsers
// leave window.Capacitor undefined, so every function here is a silent no-op
// there rather than something we need to feature-detect at every call site.
function isNativeApp() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

// Local Notifications needs a stable 32-bit integer id per prospect (not the
// UUID string it actually has) so a reschedule can find and replace the
// previous notification instead of piling up duplicates. djb2 hash, masked
// to a positive 31-bit int (the plugin's id range).
function notifIdForProspect(prospectId) {
  let hash = 5381;
  for (let i = 0; i < prospectId.length; i++) {
    hash = ((hash * 33) ^ prospectId.charCodeAt(i)) >>> 0;
  }
  return hash & 0x7fffffff;
}

async function requestNotificationPermission() {
  if (!isNativeApp()) return;
  try {
    const { LocalNotifications } = window.Capacitor.Plugins;
    await LocalNotifications.requestPermissions();
  } catch (err) {
    console.error('Notification permission request failed:', err);
  }
}

// Cancels any previously scheduled reminder for this prospect, then schedules
// a fresh one if next_followup_at is set, in the future, and the contact
// isn't archived. Called after every create/update so the notification
// always matches whatever's currently saved for that contact.
async function syncFollowupNotification(prospect) {
  if (!isNativeApp()) return;
  const { LocalNotifications } = window.Capacitor.Plugins;
  const id = notifIdForProspect(prospect.id);

  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });

    const at = prospect.next_followup_at ? new Date(prospect.next_followup_at) : null;
    if (!at || at <= new Date() || prospect.is_archived) return;

    await LocalNotifications.schedule({
      notifications: [{
        id,
        title: 'Relance a faire',
        body: prospect.name,
        schedule: { at },
        extra: { prospectId: prospect.id }
      }]
    });
  } catch (err) {
    console.error('Failed to sync follow-up notification:', err);
  }
}

async function cancelFollowupNotification(prospectId) {
  if (!isNativeApp()) return;
  try {
    const { LocalNotifications } = window.Capacitor.Plugins;
    await LocalNotifications.cancel({ notifications: [{ id: notifIdForProspect(prospectId) }] });
  } catch (err) {
    console.error('Failed to cancel follow-up notification:', err);
  }
}

// ============================================
// PHONE CONTACTS (create-on-add only)
// ============================================
// Only for the manual "Ajouter un contact" flow — never for bulk/Google
// import, since those contacts already exist in the phone's address book
// (that's literally where the import read them from) and writing them back
// would just create duplicates.
async function savePhoneContact(prospect) {
  if (!isNativeApp()) return;
  const { Contacts } = window.Capacitor.Plugins;

  try {
    const status = await Contacts.checkPermissions();
    if (status.contacts !== 'granted') {
      const requested = await Contacts.requestPermissions();
      if (requested.contacts !== 'granted') return;
    }

    const phones = [];
    if (prospect.phone) phones.push({ type: 'mobile', number: prospect.phone, isPrimary: true });
    if (prospect.alt_phone) phones.push({ type: 'mobile', number: prospect.alt_phone, isPrimary: false });
    if (phones.length === 0) return;

    await Contacts.createContact({ contact: { name: { given: prospect.name }, phones } });
  } catch (err) {
    console.error('Failed to save phone contact:', err);
  }
}

// Tapping a follow-up notification should jump straight to that contact.
// Registered unconditionally at script load (not inside bootApp) because a
// cold start — app fully closed, launched by tapping the notification — needs
// the listener attached before Capacitor replays the launch notification
// event. If the app isn't logged in/booted yet when that fires, the id is
// held here and opened once bootApp() finishes instead of being dropped.
let pendingNotificationProspectId = null;
if (isNativeApp()) {
  window.Capacitor.Plugins.LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const prospectId = event?.notification?.extra?.prospectId;
    if (!prospectId) return;
    if (currentUser) openDetail(prospectId);
    else pendingNotificationProspectId = prospectId;
  });
}

let offlineStatusInterval = null;
function startOfflineStatusIndicator() {
  if (offlineStatusInterval) return;
  const el = document.getElementById('offlineStatus');
  const tick = async () => {
    const pending = await OfflineSync.pendingCount();
    const failed = (await OfflineSync.failedChanges()).length;
    const offline = !OfflineSync.isOnline;
    if (!offline && pending === 0 && failed === 0) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    if (failed > 0) el.innerHTML = `${icon('alarmClock')} ${failed} echec(s) de synchro · voir`;
    else if (OfflineSync.authBlocked && pending > 0) el.innerHTML = `${icon('wifiOff')} Reconnecte-toi · ${pending} en attente`;
    else if (offline && pending > 0) el.innerHTML = `${icon('wifiOff')} Hors ligne · ${pending} en attente`;
    else if (offline) el.innerHTML = `${icon('wifiOff')} Hors ligne`;
    else el.innerHTML = `${icon('refreshCw')} Synchronisation... ${pending} en attente`;
  };
  // Changes the server rejected while replaying the offline queue (contact
  // deleted elsewhere, invalid data...) — they can't be retried, but the
  // user needs to know they didn't make it rather than losing them silently.
  el.addEventListener('click', async () => {
    const failures = await OfflineSync.failedChanges();
    if (failures.length === 0) return;
    const lines = failures.map(f => {
      const who = f.payload && f.payload.name ? ` (${f.payload.name})` : '';
      return `• ${new Date(f.at).toLocaleString('fr-FR')} — ${f.kind}${who} : ${f.error}`;
    });
    alert(`Ces modifications faites hors ligne ont ete refusees par le serveur et n'ont pas ete enregistrees :\n\n${lines.join('\n')}`);
    await OfflineSync.clearFailedChanges();
    tick();
  });
  tick();
  offlineStatusInterval = setInterval(tick, 3000);
}

// Pull-to-refresh: plain touch events rather than a plugin, since it needs
// no native capability — only fires with an actual touchscreen, so it's a
// no-op on a desktop mouse without any extra guard.
(function setupPullToRefresh() {
  const THRESHOLD = 70;
  const indicator = document.createElement('div');
  indicator.className = 'pull-refresh-indicator hidden';
  document.body.prepend(indicator);

  let startY = null;

  document.addEventListener('touchstart', (e) => {
    startY = (document.scrollingElement?.scrollTop || 0) === 0 ? e.touches[0].clientY : null;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (startY === null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy < 10) { indicator.classList.add('hidden'); return; }
    indicator.innerHTML = dy > THRESHOLD ? `${icon('refreshCw')} Relache pour actualiser` : `${icon('arrowDown')} Tire pour actualiser`;
    indicator.classList.remove('hidden');
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (startY === null) return;
    const dy = (e.changedTouches[0]?.clientY ?? startY) - startY;
    startY = null;
    if (dy <= THRESHOLD) { indicator.classList.add('hidden'); return; }
    indicator.innerHTML = `${icon('refreshCw')} Actualisation...`;
    refreshAll().finally(() => indicator.classList.add('hidden'));
  }, { passive: true });
})();

// Buttons/tabs whose entire function needs the real server (account
// creation, bulk import, admin user management) are disabled while offline
// rather than left clickable to fail with an error after the fact. Runs
// from script load — the register tab lives on the auth screen, before any
// login — not just after bootApp().
function updateOfflineGatedUI() {
  const offline = !OfflineSync.isOnline;
  document.querySelectorAll('[data-requires-online]').forEach(el => {
    el.disabled = offline;
    el.title = offline ? 'Necessite une connexion internet' : '';
  });
}
if (typeof OfflineSync !== 'undefined' && OfflineSync.enabled) {
  updateOfflineGatedUI();
  window.addEventListener('online', updateOfflineGatedUI);
  window.addEventListener('offline', updateOfflineGatedUI);
  setInterval(updateOfflineGatedUI, 3000);
}

let liveRefreshInterval = null;
// Nothing previously re-evaluated "is this follow-up now overdue" or
// refreshed the reminders count over time — both only ever updated as a
// side effect of some other action (creating/editing a contact), so
// leaving the board open and just waiting for a due time to pass showed
// nothing until the next unrelated action or a manual reload. renderBoard()
// re-renders from data already in memory (no network needed — the overdue
// check just compares against the current time), and loadReminders() goes
// through api(), so offline it's answered from the local cache instantly.
function startLiveRefresh() {
  if (liveRefreshInterval) return;
  liveRefreshInterval = setInterval(() => {
    renderBoard();
    loadReminders().catch(() => { /* stale badge until the next tick beats no badge at all */ });
  }, 20000);
}

async function bootApp() {
  showApp();
  const userInfoEl = document.getElementById('currentUserInfo');
  userInfoEl.textContent = currentUser ? `${currentUser.name} · ${currentUser.phone}` : '';
  // Nudge before it becomes a lockout: subscription expiry isn't enforced
  // client-side (the real gate is server-side, at next login — see
  // server.js), this is purely a heads-up while the current session is
  // still valid.
  const daysLeft = subscriptionDaysLeft(currentUser?.subscription_expires_at);
  if (currentUser && daysLeft !== null && daysLeft <= 5) {
    userInfoEl.textContent += ` · Abonnement : ${daysLeft <= 0 ? 'expire' : daysLeft + ' jour' + (daysLeft > 1 ? 's' : '') + ' restant' + (daysLeft > 1 ? 's' : '')}`;
    userInfoEl.classList.add('subscription-warning');
  } else {
    userInfoEl.classList.remove('subscription-warning');
  }
  document.getElementById('adminTabBtn').classList.toggle('hidden', !currentUser?.is_admin);
  populateDialSelects();
  populateCountrySelects();
  populateFilterOptions();
  await requestNotificationPermission();
  if (typeof OfflineSync !== 'undefined' && OfflineSync.enabled) {
    await OfflineSync.setUser(currentUser);
    startOfflineStatusIndicator();
  }
  await refreshAll();
  startLiveRefresh();

  if (pendingNotificationProspectId) {
    const id = pendingNotificationProspectId;
    pendingNotificationProspectId = null;
    await openDetail(id);
  }
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
            <button class="collapse-toggle" data-stage="${stage.key}" title="Reduire / agrandir">${isCollapsed ? icon('chevronRight') : icon('chevronDown')}</button>
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

  // No inline onclick="event.stopPropagation()" on these links: the CSP
  // (script-src 'self', see server.js) silently blocks inline handlers, so
  // a click on the icon also opened the detail panel. The card's own click
  // listener below skips clicks that land on a link instead.
  const wa = waLinkFromPhone(p.phone);
  const waLink = wa
    ? `<a class="card-wa" href="${escapeHtml(wa)}" target="_blank" rel="noopener" title="Ouvrir WhatsApp">${icon('messageCircle')}</a>`
    : '';

  const fbLink = (p.source === 'facebook' && p.facebook_profile_url)
    ? `<a class="card-wa" href="${escapeHtml(p.facebook_profile_url)}" target="_blank" rel="noopener" title="Ouvrir le profil Facebook">${icon('globe')}</a>`
    : '';

  const altWa = waLinkFromPhone(p.alt_phone);
  const altWaLink = altWa
    ? `<a class="card-wa" href="${escapeHtml(altWa)}" target="_blank" rel="noopener" title="Numero secondaire — WhatsApp">${icon('messageCircle')}<sup>2</sup></a>`
    : '';

  let followupHtml = '';
  if (p.next_followup_at) {
    const isPast = new Date(p.next_followup_at) <= new Date();
    followupHtml = `<div class="card-followup ${isPast ? 'overdue' : 'upcoming'}">${isPast ? icon('alarmClock') + ' Relance en retard' : icon('calendar') + ' ' + formatDateTime(p.next_followup_at)}</div>`;
  }

  const locationBits = [p.quarter, p.city, p.country].filter(Boolean).join(', ');

  card.innerHTML = `
    <div class="card-top">
      <p class="card-name">${escapeHtml(p.name)}</p>
      ${waLink}${altWaLink}${fbLink}
    </div>
    <div class="card-meta">
      ${p.source ? `<span class="tag">${sourceLabel(p.source)}</span>` : ''}
      ${p.interest_type && p.interest_type !== 'indecis' ? `<span class="tag">${p.interest_type === 'opportunite' ? 'Opportunite' : 'Produit'}</span>` : ''}
    </div>
    ${locationBits ? `<div class="card-meta"><span class="tag">${icon('mapPin')} ${escapeHtml(locationBits)}</span></div>` : ''}
    <div class="card-meta"><span>${relativeTime(p.stage_updated_at)}</span></div>
    ${followupHtml}
  `;
  card.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    openDetail(p.id);
  });
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
    filterDebounce = setTimeout(() => { activeFilters = readFilters(); updateFilterBadge(); loadProspects(); }, 300);
  });
});
['filterSource', 'filterInterest', 'filterCountry'].forEach(id => {
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
        <tr><td>${sourceLabel(s.source)}</td><td>${s.total}</td><td>${s.converted}</td><td>${s.conversion_rate}%</td></tr>
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
// SUBSCRIPTION (manual payment — see config.js / server.js /api/subscription/info)
// ============================================
function subscriptionDaysLeft(expiresAt) {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt) - new Date()) / (24 * 60 * 60 * 1000));
}

function subscriptionCellText(expiresAt) {
  if (!expiresAt) return '—';
  const days = subscriptionDaysLeft(expiresAt);
  const dateStr = new Date(expiresAt).toLocaleDateString('fr-FR');
  if (days < 0) return `Expire depuis le ${dateStr}`;
  if (days === 0) return `Expire aujourd'hui (${dateStr})`;
  return `${dateStr} (${days} jour${days > 1 ? 's' : ''})`;
}

document.getElementById('subscriptionBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('subscriptionStatus');
  const paymentEl = document.getElementById('subscriptionPayment');
  statusEl.textContent = 'Chargement...';
  paymentEl.classList.add('hidden');
  document.getElementById('subscriptionModal').classList.remove('hidden');

  const days = subscriptionDaysLeft(currentUser?.subscription_expires_at);
  if (days === null) {
    statusEl.textContent = "Aucun abonnement actif pour l'instant.";
  } else if (days < 0) {
    statusEl.textContent = `Ton abonnement a expire le ${new Date(currentUser.subscription_expires_at).toLocaleDateString('fr-FR')}.`;
  } else {
    statusEl.textContent = `Abonnement actif jusqu'au ${new Date(currentUser.subscription_expires_at).toLocaleDateString('fr-FR')} (${days} jour${days > 1 ? 's' : ''} restant${days > 1 ? 's' : ''}).`;
  }

  try {
    const info = await api('/api/subscription/info');
    if (info.price || info.instructions) {
      document.getElementById('subscriptionPrice').textContent = info.price ? `Prix : ${info.price}` : '';
      document.getElementById('subscriptionInstructions').textContent = info.instructions || '';
      document.getElementById('subscriptionContact').textContent = info.contact ? `Contact : ${info.contact}` : '';
      paymentEl.classList.remove('hidden');
    }
  } catch { /* payment info is optional — skip silently if unreachable (e.g. offline) */ }
});

// ============================================
// ADMIN (visible only to accounts with is_admin — see bootApp)
// ============================================
async function loadAdminUsers() {
  const tbody = document.querySelector('#adminUsersTable tbody');
  tbody.innerHTML = '<tr><td colspan="7">Chargement...</td></tr>';
  let users;
  try {
    users = await api('/api/admin/users');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7">${escapeHtml(err.message)}</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  users.forEach(u => {
    const isLocked = u.locked_until && new Date(u.locked_until) > new Date();
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(u.name)}${u.is_admin ? ` <span title="Administrateur">${icon('crown')}</span>` : ''}</td>
      <td>${escapeHtml(u.phone)}</td>
      <td>${u.is_active ? 'Actif' : 'Inactif'}</td>
      <td>${subscriptionCellText(u.subscription_expires_at)}</td>
      <td>${isLocked ? `Verrouille jusqu'a ${new Date(u.locked_until).toLocaleString('fr-FR')}` : '—'}</td>
      <td>${new Date(u.created_at).toLocaleDateString('fr-FR')}</td>
      <td class="admin-actions"></td>
    `;
    const actionsCell = tr.querySelector('.admin-actions');

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn-ghost';
    // Activating isn't just an on/off flip here: it also (re)starts a fresh
    // SUBSCRIPTION_DURATION_DAYS window from now (see db.setUserActiveById),
    // so this button doubles as "renew" for an already-active account whose
    // subscription is running low.
    toggleBtn.textContent = u.is_active ? 'Desactiver' : 'Activer / Renouveler';
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

    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn-ghost';
    resetBtn.textContent = 'Reinitialiser mot de passe';
    resetBtn.addEventListener('click', async () => {
      const newPassword = prompt(`Nouveau mot de passe pour ${u.name} (6 caracteres minimum) :\n\nA transmettre a la personne toi-meme (appel, WhatsApp...) — rien n'est envoye automatiquement.`);
      if (newPassword === null) return; // cancelled
      if (newPassword.length < 6) {
        alert('Le mot de passe doit contenir au moins 6 caracteres.');
        return;
      }
      resetBtn.disabled = true;
      try {
        await api(`/api/admin/users/${u.id}/reset-password`, {
          method: 'POST',
          body: JSON.stringify({ new_password: newPassword })
        });
        alert(`Mot de passe reinitialise pour ${u.name}. Toutes ses sessions actives ont ete deconnectees.`);
      } catch (err) {
        alert(err.message);
      } finally {
        resetBtn.disabled = false;
      }
    });
    actionsCell.appendChild(resetBtn);

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
  document.getElementById('addAltPhoneDial').classList.add('dial-select');
  document.getElementById('addFbGroup').classList.add('hidden');
  populateDialSelects();
  addModal.classList.remove('hidden');
});
document.getElementById('addPhoneDial').classList.add('dial-select');
document.getElementById('addAltPhoneDial').classList.add('dial-select');
document.getElementById('addCountry').classList.add('country-select');
document.getElementById('addSource').addEventListener('change', (e) => {
  document.getElementById('addFbGroup').classList.toggle('hidden', e.target.value !== 'facebook');
});

document.getElementById('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const phone = buildE164(fd.get('phone_dial'), fd.get('phone_local'));
  const alt_phone = buildE164(fd.get('alt_phone_dial'), fd.get('alt_phone_local'));
  const payload = {
    name: fd.get('name'),
    phone,
    alt_phone,
    country: fd.get('country') || null,
    city: fd.get('city') || null,
    quarter: fd.get('quarter') || null,
    source: fd.get('source') || null,
    facebook_profile_url: fd.get('facebook_profile_url') || null,
    next_followup_at: fd.get('next_followup_at') ? new Date(fd.get('next_followup_at')).toISOString() : null
  };
  const created = await api('/api/prospects', { method: 'POST', body: JSON.stringify(payload) });
  await syncFollowupNotification(created);
  await savePhoneContact(created);
  e.target.reset();
  addModal.classList.add('hidden');
  await refreshAll();
  // Land directly on the new contact's detail view — this is the fastest path to
  // hitting "Contacter sur WhatsApp" right after adding someone.
  await openDetail(created.id);
});

// ============================================
// IMPORT CONTACTS (CSV)
// ============================================
// Minimal RFC4180-ish CSV parser: handles quoted fields (with embedded
// commas/newlines/escaped quotes) as well as plain unquoted fields. Good
// enough for the contact-export files this feature targets, without pulling
// in a parsing library for one screen.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  // Normalize line endings so \r\n and \r don't produce phantom empty rows.
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  const filtered = rows.filter(r => r.some(c => c.trim() !== ''));
  if (filtered.length === 0) return [];
  const header = filtered[0].map(h => h.trim());
  return filtered.slice(1).map(r => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
}

const importModal = document.getElementById('importModal');
const importStatus = document.getElementById('importStatus');
const importFileInput = document.getElementById('importFileInput');
const importConfirmBtn = document.getElementById('importConfirmBtn');

// Rows parsed from the selected file, held until the user confirms the
// import by clicking "Importer" — selecting a file only previews it.
let pendingImportRows = null;

function resetImportState() {
  pendingImportRows = null;
  importConfirmBtn.disabled = true;
  importConfirmBtn.textContent = 'Importer';
}

document.getElementById('importBtn').addEventListener('click', () => {
  importFileInput.value = '';
  importStatus.classList.add('hidden');
  importStatus.classList.remove('error');
  resetImportState();
  importModal.classList.remove('hidden');
});

importFileInput.addEventListener('change', async () => {
  resetImportState();
  const file = importFileInput.files[0];
  if (!file) {
    importStatus.classList.add('hidden');
    return;
  }

  importStatus.classList.remove('hidden', 'error');
  importStatus.textContent = 'Lecture du fichier…';

  try {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      importStatus.classList.add('error');
      importStatus.textContent = 'Fichier vide ou illisible.';
      return;
    }

    pendingImportRows = rows;
    importConfirmBtn.disabled = false;
    importStatus.classList.remove('error');
    importStatus.textContent = `${rows.length} contact(s) detecte(s) dans le fichier. Clique sur "Importer" pour continuer.`;
  } catch (err) {
    importStatus.classList.add('error');
    importStatus.textContent = err.message || 'Impossible de lire le fichier.';
  }
});

importConfirmBtn.addEventListener('click', async () => {
  if (!pendingImportRows) return;

  importConfirmBtn.disabled = true;
  importConfirmBtn.textContent = 'Import en cours…';
  importStatus.classList.remove('hidden', 'error');
  importStatus.textContent = 'Import en cours…';

  try {
    const result = await api('/api/prospects/import', { method: 'POST', body: JSON.stringify({ rows: pendingImportRows }) });

    importStatus.textContent =
      `${result.imported} contact(s) importe(s) sur ${result.total_rows}. ` +
      `Ignores : ${result.skipped_duplicate_existing} deja dans le pipeline, ` +
      `${result.skipped_duplicate_in_file} doublons dans le fichier, ` +
      `${result.skipped_invalid_phone} numero(s) invalide(s), ` +
      `${result.skipped_no_name} sans nom exploitable.`;

    resetImportState();
    importFileInput.value = '';
    await refreshAll();
  } catch (err) {
    importStatus.classList.add('error');
    importStatus.textContent = err.message || "Echec de l'import.";
    importConfirmBtn.disabled = false;
    importConfirmBtn.textContent = 'Importer';
  }
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

  // stage buttons (desktop) + equivalent dropdown (mobile — see .stage-select-mobile in style.css)
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

  const stageSelectMobile = document.getElementById('stageSelectMobile');
  stageSelectMobile.innerHTML = STAGES.map(s => `<option value="${s.key}">${s.label}</option>`).join('');
  stageSelectMobile.value = p.stage;
  stageSelectMobile.onchange = async () => {
    if (stageSelectMobile.value === p.stage) return;
    await api(`/api/prospects/${id}/stage`, { method: 'POST', body: JSON.stringify({ to_stage: stageSelectMobile.value }) });
    await openDetail(id);
    await refreshAll();
  };

  // phone + address fields (editable)
  const { dial, local } = splitE164(p.phone);
  document.getElementById('detailPhoneDial').classList.add('dial-select');
  document.getElementById('detailAltPhoneDial').classList.add('dial-select');
  populateDialSelects();
  document.getElementById('detailPhoneDial').value = dial;
  document.getElementById('detailPhoneLocal').value = local;

  const altSplit = splitE164(p.alt_phone);
  document.getElementById('detailAltPhoneDial').value = p.alt_phone ? altSplit.dial : '+237';
  document.getElementById('detailAltPhoneLocal').value = p.alt_phone ? altSplit.local : '';

  const altWaBtn = document.getElementById('detailAltWaBtn');
  const altWa = waLinkFromPhone(p.alt_phone);
  if (altWa) {
    altWaBtn.href = altWa;
    altWaBtn.classList.remove('hidden');
  } else {
    altWaBtn.classList.add('hidden');
  }

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
  const altDial = document.getElementById('detailAltPhoneDial').value;
  const altLocal = document.getElementById('detailAltPhoneLocal').value;
  const alt_phone = buildE164(altDial, altLocal);
  const followup = document.getElementById('detailFollowup').value;
  const name = document.getElementById('detailNameInput').value.trim();
  const source = document.getElementById('detailSource').value;

  if (!name) { alert('Le nom ne peut pas etre vide.'); return; }

  try {
    const updated = await api(`/api/prospects/${activeProspectId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name,
        phone,
        alt_phone,
        country: document.getElementById('detailCountry').value || null,
        city: document.getElementById('detailCity').value || null,
        quarter: document.getElementById('detailQuarter').value || null,
        source: source || null,
        facebook_profile_url: source === 'facebook' ? (document.getElementById('detailFbUrl').value || null) : null,
        interest_type: document.getElementById('detailInterest').value || null,
        next_followup_at: followup ? new Date(followup).toISOString() : null
      })
    });
    await syncFollowupNotification(updated);
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
  await cancelFollowupNotification(activeProspectId);
  detailModal.classList.add('hidden');
  await refreshAll();
});

document.getElementById('deleteBtn').addEventListener('click', async () => {
  if (!confirm("Supprimer definitivement ce contact ? Cette action est irreversible — tout l'historique et les interactions seront perdus. Si tu veux juste le retirer du pipeline sans perdre l'historique, utilise plutot \"Marquer comme perdu\".")) return;
  await api(`/api/prospects/${activeProspectId}`, { method: 'DELETE' });
  await cancelFollowupNotification(activeProspectId);
  detailModal.classList.add('hidden');
  await refreshAll();
});

// ============================================
// MODAL CLOSE HELPERS
// ============================================
const subscriptionModal = document.getElementById('subscriptionModal');
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => {
    addModal.classList.add('hidden');
    detailModal.classList.add('hidden');
    importModal.classList.add('hidden');
    subscriptionModal.classList.add('hidden');
  });
});
[addModal, detailModal, importModal, subscriptionModal].forEach(m => {
  m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { addModal.classList.add('hidden'); detailModal.classList.add('hidden'); importModal.classList.add('hidden'); subscriptionModal.classList.add('hidden'); }
});

// Prefill (never the password) so returning to the login screen doesn't
// mean retyping the phone number every time.
const rememberedPhone = localStorage.getItem('lastLoginPhone');
if (rememberedPhone) document.querySelector('#loginForm input[name="phone"]').value = rememberedPhone;

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
