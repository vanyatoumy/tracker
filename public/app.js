// The first stage used to be labelled "Contact" — right next to "Contacte",
// and the same word the app uses for any person in it. "A contacter" says
// what it actually means: on the list, not reached yet.
const STAGES = [
  { key: 'nouveau', label: 'À contacter' },
  { key: 'contacte', label: 'Contacté' },
  { key: 'prospect', label: 'Prospect' },
  { key: 'interesse', label: 'Intéressé' },
  { key: 'en_decision', label: 'En décision' },
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
let activeProspect = null; // full object for the open detail panel
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
//
// renderBoard() wipes and rebuilds the whole column tree (board.innerHTML =
// ''), so running it unconditionally every tick reset scroll position
// mid-browse and could yank focus away from whatever the user was doing.
// Skip the board re-render (but still refresh the reminders badge) while:
// - any modal is open (add/detail/import/subscription) — the user is mid
//   task, the board underneath isn't urgent for 20s;
// - a text field anywhere has focus — covers the search box and any other
//   in-place editing, not just modals.
function isUserMidInput() {
  const modalOpen = [...document.querySelectorAll('.modal-overlay')]
    .some(m => !m.classList.contains('hidden'));
  const active = document.activeElement;
  const typing = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
  return modalOpen || typing;
}
function startLiveRefresh() {
  if (liveRefreshInterval) return;
  liveRefreshInterval = setInterval(() => {
    if (!isUserMidInput()) {
      renderBoard();
      // Same in-memory re-render for the today list: a follow-up time
      // passing moves a contact from "today" to "overdue" etc.
      if (document.querySelector('.tab-btn.active')?.dataset.view === 'today') renderToday();
    }
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

// On phones the 7 columns can't sit side by side, and stacking them made one
// endless page once a few hundred contacts were imported. Narrow screens
// get a row of stage tabs instead (CSS shows them, and only the
// .mobile-active column, under 900px); desktop ignores both.
let mobileStage = (() => {
  try { return localStorage.getItem('mobileStage') || 'nouveau'; } catch { return 'nouveau'; }
})();

function renderStageTabs() {
  const tabs = document.getElementById('stageTabs');
  tabs.innerHTML = STAGES.map(stage => {
    const count = currentProspects.filter(p => p.stage === stage.key && !p.is_archived).length;
    const won = WON_STAGES.includes(stage.key) ? 'won' : '';
    return `<button class="stage-tab ${won} ${stage.key === mobileStage ? 'active' : ''}" data-mobile-stage="${stage.key}">${stage.label} <span class="stage-tab-count">${count}</span></button>`;
  }).join('');
  tabs.querySelector('.stage-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

document.getElementById('stageTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-mobile-stage]');
  if (!tab) return;
  mobileStage = tab.dataset.mobileStage;
  try { localStorage.setItem('mobileStage', mobileStage); } catch { /* per-device nicety only */ }
  renderBoard();
});

async function moveStage(id, toStage, triggerEl) {
  if (triggerEl) triggerEl.disabled = true;
  try {
    await api(`/api/prospects/${id}/stage`, { method: 'POST', body: JSON.stringify({ to_stage: toStage }) });
    await refreshAll();
  } catch (err) {
    alert(err.message);
    if (triggerEl) triggerEl.disabled = false;
  }
}

// ============================================
// BULK ACTIONS (board selection mode)
// ============================================
// "Selectionner" turns the board's cards into checkboxes; the bar at the
// bottom applies one change to every selected contact in a single request
// (POST /api/prospects/bulk). Online only — the bulk route isn't part of
// the offline queue.
let selectionMode = false;
const selectedIds = new Set();

function setSelectionMode(on) {
  selectionMode = on;
  selectedIds.clear();
  document.getElementById('selectModeBtn').textContent = on ? 'Annuler la selection' : 'Selectionner';
  document.getElementById('selectModeBtn').classList.toggle('active', on);
  document.getElementById('selectHint').classList.toggle('hidden', !on);
  document.body.classList.toggle('selecting', on);
  updateBulkBar();
  renderBoard();
}

function toggleSelected(id) {
  if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
  updateBulkBar();
  renderBoard();
}

function updateBulkBar() {
  const n = selectedIds.size;
  document.getElementById('bulkBar').classList.toggle('hidden', !selectionMode);
  document.getElementById('bulkCount').textContent = `${n} selectionne${n > 1 ? 's' : ''}`;
  document.querySelectorAll('#bulkBar .bulk-actions select, #bulkBar .bulk-actions button').forEach(el => { el.disabled = n === 0; });
}

document.getElementById('bulkStage').innerHTML = '<option value="">Deplacer vers…</option>' +
  STAGES.map(s => `<option value="${s.key}">${s.label}</option>`).join('');

document.getElementById('selectModeBtn').addEventListener('click', () => setSelectionMode(!selectionMode));

// "Tout" / "Aucun" in a column header: every contact of that stage, not
// just the cards currently shown (the column may be paged).
document.getElementById('board').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-select-stage]');
  if (!btn) return;
  const items = currentProspects.filter(p => p.stage === btn.dataset.selectStage && !p.is_archived);
  const all = items.every(p => selectedIds.has(p.id));
  items.forEach(p => { if (all) selectedIds.delete(p.id); else selectedIds.add(p.id); });
  updateBulkBar();
  renderBoard();
});

async function runBulk(action, value, label) {
  const ids = [...selectedIds];
  if (ids.length === 0) return;
  if (!confirm(`${label} : ${ids.length} contact${ids.length > 1 ? 's' : ''} ?`)) return;
  try {
    const res = await api('/api/prospects/bulk', { method: 'POST', body: JSON.stringify({ ids, action, value }) });
    if (action === 'followup') {
      for (const p of res.prospects) await syncFollowupNotification(p);
    }
    if (action === 'archive') {
      for (const p of res.prospects) await cancelFollowupNotification(p.id);
      selectedIds.clear(); // they've left the board
    }
    await refreshAll();
    updateBulkBar();
  } catch (err) {
    alert(err.message);
  }
}

document.getElementById('bulkStage').addEventListener('change', async (e) => {
  const stage = STAGES.find(s => s.key === e.target.value);
  e.target.value = '';
  if (stage) await runBulk('stage', stage.key, `Deplacer vers « ${stage.label} »`);
});

document.getElementById('bulkTemperature').addEventListener('change', async (e) => {
  const value = e.target.value;
  e.target.value = '';
  if (!value) return;
  const t = value === '__clear' ? null : value;
  await runBulk('temperature', t, t ? `Temperature « ${TEMPERATURE_LABELS[t]} »` : 'Retirer la temperature');
});

document.getElementById('bulkBar').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-bulk]');
  if (!btn) return;
  switch (btn.dataset.bulk) {
    case 'followup-tomorrow': {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      return runBulk('followup', tomorrow.toISOString(), 'Programmer une relance demain a 9h');
    }
    case 'followup-clear':
      return runBulk('followup', null, 'Effacer la relance');
    case 'archive':
      return runBulk('archive', true, 'Marquer comme perdus (restaurables depuis « Archives »)');
    case 'cancel':
      return setSelectionMode(false);
  }
});

function renderBoard() {
  const board = document.getElementById('board');
  // board.innerHTML = '' below wipes every column's scroll position along
  // with the DOM (each .column-body scrolls independently, not .board
  // itself) — capture and restore them so re-renders (live refresh,
  // filters, a stage change elsewhere) don't visibly snap columns back to
  // the top mid-browse.
  const scrollTops = {};
  STAGES.forEach(stage => {
    const el = document.getElementById(`col-${stage.key}`);
    if (el) scrollTops[stage.key] = el.scrollTop;
  });
  board.innerHTML = '';
  const collapsed = getCollapsedStages();
  renderStageTabs();

  STAGES.forEach((stage, idx) => {
    const items = currentProspects.filter(p => p.stage === stage.key && !p.is_archived);
    const fillPct = ((idx + 1) / STAGES.length) * 100;
    const isCollapsed = collapsed.has(stage.key);

    const col = document.createElement('div');
    col.className = `column ${isCollapsed ? 'collapsed' : ''} ${WON_STAGES.includes(stage.key) ? 'column-won' : ''} ${stage.key === mobileStage ? 'mobile-active' : ''}`;
    const allSelected = items.length > 0 && items.every(p => selectedIds.has(p.id));
    const selectAllBtn = selectionMode && items.length > 0
      ? `<button class="column-select-all ${allSelected ? 'active' : ''}" data-select-stage="${stage.key}" title="${allSelected ? 'Tout deselectionner' : `Selectionner les ${items.length} contacts de cette colonne`}">${allSelected ? 'Aucun' : 'Tout'}</button>`
      : '';
    col.innerHTML = `
      <div class="column-header">
        <p class="column-title">
          <span class="column-title-text">
            <button class="collapse-toggle" data-stage="${stage.key}" title="Reduire / agrandir">${isCollapsed ? icon('chevronRight') : icon('chevronDown')}</button>
            <span class="column-label" title="${stage.label}">${stage.label}</span>
          </span>
          <span class="column-title-right">${selectAllBtn}<span class="column-count">${items.length}</span></span>
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
    // Drop target for dragged cards — the whole column, so a collapsed or
    // empty column still accepts a card.
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop-target'); });
    col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('drop-target'); });
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('drop-target');
      const id = e.dataTransfer.getData('text/plain');
      const p = currentProspects.find(x => x.id === id);
      if (p && p.stage !== stage.key) moveStage(id, stage.key);
    });
    if (items.length === 0) {
      body.innerHTML = `<div class="empty-column">Aucun contact</div>`;
      return;
    }
    // Only the first COLUMN_PAGE cards are built: a column with hundreds of
    // imported contacts made every re-render (live refresh every 20s
    // included) slow, especially on low-end phones.
    const limit = columnLimits[stage.key] || COLUMN_PAGE;
    items.slice(0, limit).forEach(p => body.appendChild(renderCard(p)));
    if (items.length > limit) {
      const more = document.createElement('button');
      more.className = 'column-more';
      const next = Math.min(COLUMN_PAGE, items.length - limit);
      more.textContent = `Afficher ${next} de plus · ${items.length - limit} restant${items.length - limit > 1 ? 's' : ''}`;
      more.addEventListener('click', () => {
        columnLimits[stage.key] = limit + COLUMN_PAGE;
        renderBoard();
      });
      body.appendChild(more);
    }
    if (scrollTops[stage.key]) body.scrollTop = scrollTops[stage.key];
  });
}

const COLUMN_PAGE = 30;
const columnLimits = {}; // stage -> how many cards are shown (grows with "Afficher plus")

const WON_STAGES = ['client', 'partenaire'];
const TEMPERATURE_LABELS = { froid: 'Froid', tiede: 'Tiede', chaud: 'Chaud' };

function renderCard(p) {
  // A client/partner who hasn't "moved" in 60 days isn't going stale — they
  // are a win. The age colours (grey -> amber -> red) only make sense for
  // contacts still in the pipeline.
  const isWon = WON_STAGES.includes(p.stage);
  const card = document.createElement('div');
  card.className = `card ${isWon ? 'card-won' : ageClass(p.stage_updated_at)}`;
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

  let ageHtml = `<span>${relativeTime(p.stage_updated_at)}</span>`;
  if (isWon) {
    const stageLabel = STAGES.find(s => s.key === p.stage).label;
    const days = Math.floor(daysSince(p.stage_updated_at));
    ageHtml = `<span>${stageLabel} ${days < 1 ? "depuis aujourd'hui" : `depuis ${days} j`}</span>`;
  }
  let reorderHtml = '';
  const reorderAt = isWon ? Planning.reorderDueAt(p) : null;
  if (reorderAt) {
    const due = reorderAt <= new Date();
    reorderHtml = `<div class="card-followup ${due ? 'reorder-due' : 'upcoming'}">${icon('calendar')} ${due ? 'Reachat a proposer' : 'Reachat le ' + reorderAt.toLocaleDateString('fr-FR')}</div>`;
  }

  card.innerHTML = `
    <div class="card-top">
      <p class="card-name">${escapeHtml(p.name)}</p>
      ${waLink}${altWaLink}${fbLink}
    </div>
    <div class="card-meta">
      ${p.source ? `<span class="tag">${sourceLabel(p.source)}</span>` : ''}
      ${p.interest_type && p.interest_type !== 'indecis' ? `<span class="tag">${p.interest_type === 'opportunite' ? 'Opportunite' : 'Produit'}</span>` : ''}
      ${TEMPERATURE_LABELS[p.temperature] ? `<span class="tag temp-${p.temperature}">${TEMPERATURE_LABELS[p.temperature]}</span>` : ''}
    </div>
    ${locationBits ? `<div class="card-meta"><span class="tag">${icon('mapPin')} ${escapeHtml(locationBits)}</span></div>` : ''}
    <div class="card-meta">${ageHtml}</div>
    ${followupHtml}${reorderHtml}
  `;
  // Selection mode: the card is a checkbox — a click selects it instead of
  // opening it, and the per-card actions (advance, drag) step aside.
  if (selectionMode) {
    card.classList.add('selectable');
    card.classList.toggle('selected', selectedIds.has(p.id));
    card.insertAdjacentHTML('afterbegin', `<span class="card-check" aria-hidden="true">${selectedIds.has(p.id) ? '✓' : ''}</span>`);
    card.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      toggleSelected(p.id);
    });
    return card;
  }

  // Quick "next stage" button — the one move a rep makes all day, without
  // opening the detail panel (works on phones, where there's no drag).
  const stageIdx = STAGES.findIndex(s => s.key === p.stage);
  const next = STAGES[stageIdx + 1];
  if (next) {
    const advance = document.createElement('button');
    advance.className = 'card-advance';
    advance.title = `Passer a « ${next.label} »`;
    advance.innerHTML = `${escapeHtml(next.label)} ${icon('chevronRight')}`;
    advance.addEventListener('click', (e) => {
      e.stopPropagation();
      moveStage(p.id, next.key, advance);
    });
    card.appendChild(advance);
  }

  // Desktop: drag the card onto another column (see the drop handlers in renderBoard).
  card.draggable = true;
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', p.id);
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));

  card.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) return;
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
  const activeView = document.querySelector('.tab-btn.active').dataset.view;
  if (activeView === 'today') await loadToday();
  if (activeView === 'stats') await loadStats();
  if (activeView === 'archived') await loadArchived();
}

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
  renderToday();
}

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

  let html = `
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

// ============================================
// MESSAGE TEMPLATES (send from a contact + manage)
// ============================================
const messageModal = document.getElementById('messageModal');
const templatesModal = document.getElementById('templatesModal');
let messageTemplates = [];
let messageTarget = null;      // prospect the message modal is for
let messageTemplateUsed = null; // template picked, for the interaction log

async function loadTemplates() {
  messageTemplates = await api('/api/templates');
  return messageTemplates;
}

async function openMessageModal(prospect) {
  messageTarget = prospect;
  messageTemplateUsed = null;
  document.getElementById('messageModalTitle').textContent = `Message a ${prospect.name}`;
  document.getElementById('messageText').value = '';
  messageModal.classList.remove('hidden');
  await renderTemplateChoices();
}

async function renderTemplateChoices() {
  const container = document.getElementById('messageTemplateChoices');
  try {
    await loadTemplates();
  } catch (err) {
    container.innerHTML = `<p class="section-hint">${escapeHtml(err.message)}</p>`;
    return;
  }
  container.innerHTML = messageTemplates.length === 0
    ? `<p class="section-hint">Aucun modele pour l'instant. Cree ton premier avec « Gerer les modeles », ou ecris ton message directement.</p>`
    : messageTemplates.map(t => `<button type="button" class="template-chip ${messageTemplateUsed && messageTemplateUsed.id === t.id ? 'active' : ''}" data-template="${escapeHtml(t.id)}">${escapeHtml(t.name)}</button>`).join('');
}

document.getElementById('messageTemplateChoices').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-template]');
  if (!chip) return;
  const t = messageTemplates.find(x => x.id === chip.dataset.template);
  if (!t) return;
  messageTemplateUsed = t;
  document.getElementById('messageText').value = Planning.fillTemplate(t.body, messageTarget, currentUser);
  document.querySelectorAll('#messageTemplateChoices .template-chip').forEach(c => c.classList.toggle('active', c === chip));
});

document.getElementById('messageSendBtn').addEventListener('click', async () => {
  const p = messageTarget;
  const text = document.getElementById('messageText').value.trim();
  const url = Planning.whatsappLink(p.phone || p.alt_phone, text);
  if (!url) { alert("Ce contact n'a pas de numero de telephone."); return; }
  // Open first, synchronously inside the click: a window.open() that comes
  // after an await is treated as a popup and blocked by browsers.
  window.open(url, '_blank', 'noopener');
  messageModal.classList.add('hidden');

  if (!text) return;
  const content = (messageTemplateUsed ? `WhatsApp (modele « ${messageTemplateUsed.name} ») : ` : 'WhatsApp : ') + text;
  try {
    await api(`/api/prospects/${p.id}/interactions`, {
      method: 'POST',
      body: JSON.stringify({ type: 'message', content: content.slice(0, 2000) })
    });
    // Reaching out to a brand-new contact means they're now contacted.
    if (p.stage === 'nouveau') {
      await api(`/api/prospects/${p.id}/stage`, { method: 'POST', body: JSON.stringify({ to_stage: 'contacte' }) });
    }
    if (!detailModal.classList.contains('hidden') && activeProspectId === p.id) await openDetail(p.id);
    await refreshAll();
  } catch (err) {
    alert(`Message ouvert dans WhatsApp, mais pas enregistre dans l'historique : ${err.message}`);
  }
});

document.getElementById('messageManageBtn').addEventListener('click', () => openTemplatesModal());
document.getElementById('templatesBtn').addEventListener('click', () => openTemplatesModal());

function resetTemplateForm() {
  const form = document.getElementById('templateForm');
  form.reset();
  form.elements.id.value = '';
  document.getElementById('templateFormTitle').textContent = 'Nouveau modele';
  document.getElementById('templateCancelEdit').classList.add('hidden');
}

async function openTemplatesModal() {
  resetTemplateForm();
  templatesModal.classList.remove('hidden');
  await renderTemplatesList();
}

async function renderTemplatesList() {
  const list = document.getElementById('templatesList');
  try {
    await loadTemplates();
  } catch (err) {
    list.innerHTML = `<p class="section-hint">${escapeHtml(err.message)}</p>`;
    return;
  }
  list.innerHTML = messageTemplates.length === 0
    ? `<p class="section-hint">Aucun modele enregistre.</p>`
    : messageTemplates.map(t => `
        <div class="template-item">
          <div class="template-item-main">
            <strong>${escapeHtml(t.name)}</strong>
            <p>${escapeHtml(t.body)}</p>
          </div>
          <div class="template-item-actions">
            <button class="btn-ghost" data-edit-template="${escapeHtml(t.id)}">Modifier</button>
            <button class="btn-ghost" data-delete-template="${escapeHtml(t.id)}">Supprimer</button>
          </div>
        </div>`).join('');
}

document.getElementById('templatesList').addEventListener('click', async (e) => {
  const editBtn = e.target.closest('[data-edit-template]');
  if (editBtn) {
    const t = messageTemplates.find(x => x.id === editBtn.dataset.editTemplate);
    if (!t) return;
    const form = document.getElementById('templateForm');
    form.elements.id.value = t.id;
    form.elements.name.value = t.name;
    form.elements.body.value = t.body;
    document.getElementById('templateFormTitle').textContent = `Modifier « ${t.name} »`;
    document.getElementById('templateCancelEdit').classList.remove('hidden');
    form.elements.name.focus();
    return;
  }
  const deleteBtn = e.target.closest('[data-delete-template]');
  if (deleteBtn) {
    if (!confirm('Supprimer ce modele ?')) return;
    try {
      await api(`/api/templates/${deleteBtn.dataset.deleteTemplate}`, { method: 'DELETE' });
      resetTemplateForm();
      await renderTemplatesList();
      if (!messageModal.classList.contains('hidden')) await renderTemplateChoices();
    } catch (err) {
      alert(err.message);
    }
  }
});

document.getElementById('templateCancelEdit').addEventListener('click', resetTemplateForm);

document.getElementById('templateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const id = form.elements.id.value;
  const payload = { name: form.elements.name.value, body: form.elements.body.value };
  try {
    await api(id ? `/api/templates/${id}` : '/api/templates', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(payload)
    });
    resetTemplateForm();
    await renderTemplatesList();
    if (!messageModal.classList.contains('hidden')) await renderTemplateChoices();
  } catch (err) {
    alert(err.message);
  }
});

// ============================================
// TABS
// ============================================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const view = btn.dataset.view;
    if (view !== 'board' && selectionMode) setSelectionMode(false);
    document.getElementById(view + 'View').classList.remove('hidden');
    document.getElementById('filterBar').classList.toggle('hidden', view !== 'board');
    if (view === 'today') await loadToday({ fresh: true });
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
// ---------- Renewals: who to chase for payment (rules in planning.js) ----------
let adminUsers = [];
let subscriptionInfoCache = null;
async function getSubscriptionInfo() {
  if (!subscriptionInfoCache) {
    try { subscriptionInfoCache = await api('/api/subscription/info'); } catch { subscriptionInfoCache = {}; }
  }
  return subscriptionInfoCache;
}

const REMINDER_FRESH_DAYS = 14; // "relance il y a N j" shown for this long

function renewalRow(entry, kind) {
  const u = entry.user;
  const dateStr = entry.at ? entry.at.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
  const when = kind === 'soon' ? `Expire ${entry.days <= 1 ? 'demain' : `dans ${entry.days} j`} (${dateStr})`
    : kind === 'expired' ? `Expire depuis ${entry.days === 0 ? "aujourd'hui" : `${entry.days} j`} (${dateStr})`
    : `Inscrit ${entry.days === 0 ? "aujourd'hui" : `il y a ${entry.days} j`}, jamais active`;
  const reminded = u.renewal_reminded_at && daysSince(u.renewal_reminded_at) < REMINDER_FRESH_DAYS
    ? `<span class="tag reminded">Relance ${relativeTime(u.renewal_reminded_at)}</span>` : '';
  return `
    <div class="renewal-item renewal-${kind}">
      <div class="renewal-main">
        <span class="renewal-name">${escapeHtml(u.name)}</span>
        <span class="renewal-detail">${escapeHtml(u.phone)} · ${escapeHtml(when)} ${reminded}</span>
      </div>
      <div class="renewal-actions">
        <button class="btn-whatsapp" data-remind="${escapeHtml(u.id)}" data-kind="${kind}">${icon('messageCircle')} <span class="btn-label">${kind === 'pending' ? 'Envoyer les instructions' : 'Relancer'}</span></button>
        <button class="btn-ghost" data-renew="${escapeHtml(u.id)}">${kind === 'pending' ? 'Activer' : 'Renouveler'}</button>
      </div>
    </div>`;
}

function renderRenewals(users) {
  adminUsers = users;
  const { soon, expired } = Planning.renewalGroups(users);
  const pending = Planning.pendingActivations(users);
  const now = new Date();
  const active = users.filter(u => u.is_active && (!u.subscription_expires_at || new Date(u.subscription_expires_at) >= now)).length;

  const tile = (label, value, note) => `<div class="stat-card"><p class="stat-label">${label}</p><p class="stat-value">${value}</p><p class="stat-note">${note}</p></div>`;
  document.getElementById('renewalSummary').innerHTML =
    tile('Comptes actifs', active, 'Abonnement en cours') +
    tile('Expirent sous 7 jours', soon.length, 'A relancer avant la coupure') +
    tile('Expires (30 j)', expired.length, 'Encore recuperables') +
    tile('Inscrits sans paiement', pending.length, 'Inscrits ces 30 derniers jours');

  const section = (title, entries, kind) => entries.length === 0 ? '' : `
    <section class="renewal-section">
      <h3 class="today-section-title">${title} <span class="today-count">${entries.length}</span></h3>
      <div class="today-list">${entries.map(e => renewalRow(e, kind)).join('')}</div>
    </section>`;
  const html = section('Expirent bientot', soon, 'soon') + section('Expires recemment', expired, 'expired') + section('Inscrits, en attente de paiement', pending, 'pending');
  document.getElementById('renewalLists').innerHTML = html || `<p class="section-hint">Personne a relancer pour le moment.</p>`;
}

document.getElementById('renewalLists').addEventListener('click', async (e) => {
  const remindBtn = e.target.closest('[data-remind]');
  if (remindBtn) {
    const u = adminUsers.find(x => x.id === remindBtn.dataset.remind);
    if (!u) return;
    const info = subscriptionInfoCache || {};
    const text = remindBtn.dataset.kind === 'pending' ? Planning.activationMessage(u, info) : Planning.renewalMessage(u, info);
    // Open first, synchronously inside the click (popup blockers), then record.
    window.open(Planning.whatsappLink(u.phone, text), '_blank', 'noopener');
    try {
      await api(`/api/admin/users/${u.id}/renewal-reminded`, { method: 'POST' });
      await loadAdminUsers();
    } catch (err) {
      alert(`WhatsApp ouvert, mais la relance n'a pas ete enregistree : ${err.message}`);
    }
    return;
  }
  const renewBtn = e.target.closest('[data-renew]');
  if (renewBtn) {
    const u = adminUsers.find(x => x.id === renewBtn.dataset.renew);
    if (!u || !confirm(`Activer / renouveler l'abonnement de ${u.name} ? (nouvelle periode a partir d'aujourd'hui)`)) return;
    renewBtn.disabled = true;
    try {
      await api(`/api/admin/users/${u.id}/activate`, { method: 'POST', body: JSON.stringify({ active: true }) });
      await loadAdminUsers();
    } catch (err) {
      alert(err.message);
      renewBtn.disabled = false;
    }
  }
});

async function loadAdminUsers() {
  await getSubscriptionInfo();
  const tbody = document.querySelector('#adminUsersTable tbody');
  tbody.innerHTML = '<tr><td colspan="7">Chargement...</td></tr>';
  let users;
  try {
    users = await api('/api/admin/users');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7">${escapeHtml(err.message)}</td></tr>`;
    return;
  }

  renderRenewals(users);

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
  // openDetail() also re-renders the open panel after each save; only a
  // switch to another contact folds the details / "Autres actions" back up.
  if (id !== activeProspectId || detailModal.classList.contains('hidden')) {
    detailModal.querySelectorAll('details').forEach(d => { d.open = false; });
  }
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

  document.getElementById('detailBirthday').value = p.birthday || '';
  renderTemperaturePicker(p.temperature);

  activeProspect = p;
  document.getElementById('detailTemplateBtn').classList.toggle('hidden', !(p.phone || p.alt_phone));

  // Purchases matter once someone is a client — or if any were recorded
  // before they moved stage, so that history doesn't silently disappear.
  const showPurchases = ['client', 'partenaire'].includes(p.stage) || !!p.last_purchase_at;
  document.getElementById('purchasesSection').classList.toggle('hidden', !showPurchases);
  if (showPurchases) {
    document.getElementById('reorderInterval').value = p.reorder_interval_days || '';
    renderReorderNext(p);
    document.querySelector('#purchaseForm [name="purchased_at"]').value = toDateInputValue(new Date());
    await loadPurchases(id);
  }

  await loadInteractions(id);
  await loadHistory(id);

  detailModal.classList.remove('hidden');
}

document.getElementById('detailTemplateBtn').addEventListener('click', () => {
  if (activeProspect) openMessageModal(activeProspect);
});

function toDateInputValue(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function renderReorderNext(p) {
  const el = document.getElementById('reorderNext');
  const dueAt = Planning.reorderDueAt(p);
  if (!p.reorder_interval_days) el.textContent = '';
  else if (!p.last_purchase_at) el.textContent = 'Ajoute un achat pour activer le rappel.';
  else if (!dueAt) el.textContent = 'Le rappel ne concerne que les clients et partenaires.';
  else el.textContent = `Prochain reachat : ${dueAt.toLocaleDateString('fr-FR')}${dueAt < new Date() ? ' (a relancer)' : ''}`;
}

async function loadPurchases(id) {
  const list = document.getElementById('purchasesList');
  let items;
  try {
    items = await api(`/api/prospects/${id}/purchases`);
  } catch (err) {
    list.innerHTML = `<p class="section-hint">${escapeHtml(err.message)}</p>`;
    return;
  }
  list.innerHTML = items.length === 0
    ? `<p class="section-hint">Aucun achat enregistre.</p>`
    : items.map(x => `
        <div class="purchase-item">
          <span class="purchase-date">${new Date(x.purchased_at).toLocaleDateString('fr-FR')}</span>
          <span class="purchase-product">${escapeHtml(x.product || '—')}</span>
          <span class="purchase-amount">${x.amount !== null && x.amount !== undefined ? escapeHtml(Number(x.amount).toLocaleString('fr-FR')) : ''}</span>
          <button class="purchase-delete" data-delete-purchase="${escapeHtml(x.id)}" title="Supprimer cet achat">${icon('x')}</button>
        </div>`).join('');
}

document.getElementById('reorderInterval').addEventListener('change', async (e) => {
  const value = e.target.value.trim();
  try {
    const updated = await api(`/api/prospects/${activeProspectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ reorder_interval_days: value === '' ? null : Number(value) })
    });
    activeProspect = { ...activeProspect, ...updated };
    renderReorderNext(activeProspect);
    await refreshAll();
  } catch (err) {
    alert(err.message);
    e.target.value = activeProspect?.reorder_interval_days || '';
  }
});

document.getElementById('purchaseForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const [y, m, d] = form.elements.purchased_at.value.split('-').map(Number);
  try {
    await api(`/api/prospects/${activeProspectId}/purchases`, {
      method: 'POST',
      body: JSON.stringify({
        // Noon local time: a date-only purchase must not slide to the
        // previous/next day once converted to UTC.
        purchased_at: new Date(y, m - 1, d, 12).toISOString(),
        product: form.elements.product.value || null,
        amount: form.elements.amount.value === '' ? null : Number(form.elements.amount.value)
      })
    });
    form.reset();
    await openDetail(activeProspectId);
    await refreshAll();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('purchasesList').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-delete-purchase]');
  if (!btn || !confirm('Supprimer cet achat ?')) return;
  try {
    await api(`/api/prospects/${activeProspectId}/purchases/${btn.dataset.deletePurchase}`, { method: 'DELETE' });
    await openDetail(activeProspectId);
    await refreshAll();
  } catch (err) {
    alert(err.message);
  }
});

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
        birthday: document.getElementById('detailBirthday').value || null,
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

const INTERACTION_LABELS = { message: 'Message', appel: 'Appel', rencontre: 'Rencontre', note: 'Note' };

// Top of the detail panel: stage age + the last exchange, so the rep
// knows where they left off without scrolling past the contact form.
function renderDetailSummary(interactions) {
  const p = activeProspect;
  if (!p) return;
  const stageLabel = STAGES.find(s => s.key === p.stage)?.label || p.stage;
  const stageDays = Math.floor(daysSince(p.stage_updated_at));
  const last = interactions[0];
  document.getElementById('detailSummaryText').innerHTML = `
    <p class="summary-stage">${escapeHtml(stageLabel)} <span>${stageDays < 1 ? "depuis aujourd'hui" : `depuis ${stageDays} j`}</span></p>
    ${last
      ? `<p class="summary-last-label">Dernier echange · ${escapeHtml(INTERACTION_LABELS[last.type] || last.type)} · ${escapeHtml(relativeTime(last.created_at))}</p>
         <p class="summary-last">${escapeHtml(last.content)}</p>`
      : `<p class="summary-last-label">Aucun echange enregistre pour l'instant.</p>`}
  `;
}

function renderTemperaturePicker(value) {
  document.querySelectorAll('#detailTemperature [data-temperature]').forEach(b => {
    b.classList.toggle('active', b.dataset.temperature === value);
  });
}

// The rep's gut feeling about the contact, one tap; tapping the active one
// again clears it.
document.getElementById('detailTemperature').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-temperature]');
  if (!btn || !activeProspect) return;
  const value = activeProspect.temperature === btn.dataset.temperature ? null : btn.dataset.temperature;
  renderTemperaturePicker(value);
  try {
    const updated = await api(`/api/prospects/${activeProspectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ temperature: value })
    });
    activeProspect = { ...activeProspect, ...updated };
    await refreshAll();
  } catch (err) {
    alert(err.message);
    renderTemperaturePicker(activeProspect.temperature);
  }
});

// Saved as soon as it's changed: planning the next step is the main thing
// done on this screen, it shouldn't need the "Enregistrer les coordonnees"
// button hidden inside the folded contact details.
document.getElementById('detailFollowup').addEventListener('change', async (e) => {
  const value = e.target.value;
  try {
    const updated = await api(`/api/prospects/${activeProspectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ next_followup_at: value ? new Date(value).toISOString() : null })
    });
    activeProspect = { ...activeProspect, ...updated };
    await syncFollowupNotification(updated);
    await refreshAll();
  } catch (err) {
    alert(err.message);
  }
});

async function loadInteractions(id) {
  const items = await api(`/api/prospects/${id}/interactions`);
  renderDetailSummary(items);
  const list = document.getElementById('interactionsList');
  list.innerHTML = items.length === 0
    ? `<p style="color:var(--text-faint); font-size:12px;">Aucune interaction enregistree</p>`
    : items.map(i => `
        <div class="interaction-item">
          <span class="itype">${escapeHtml(INTERACTION_LABELS[i.type] || i.type)}</span>
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
// Modals can stack (detail -> message -> templates), so closing one —
// close button, backdrop click or Escape — only closes that one (Escape:
// the topmost, i.e. the last open overlay in the DOM).
const subscriptionModal = document.getElementById('subscriptionModal');
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => btn.closest('.modal-overlay').classList.add('hidden'));
});
document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); });
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = [...document.querySelectorAll('.modal-overlay')].filter(m => !m.classList.contains('hidden'));
  if (open.length) open[open.length - 1].classList.add('hidden');
  else if (selectionMode) setSelectionMode(false);
});

// Prefill (never the password) so returning to the login screen doesn't
// mean retyping the phone number every time.
const rememberedPhone = localStorage.getItem('lastLoginPhone');
if (rememberedPhone) document.querySelector('#loginForm input[name="phone"]').value = rememberedPhone;

// Price on the sign-up pitch (public endpoint, no login needed). Stays
// hidden when no price is configured or the server can't be reached.
(async function loadAuthPrice() {
  try {
    const info = await api('/api/subscription/info');
    if (!info.price) return;
    const el = document.getElementById('authPrice');
    el.innerHTML = `<strong>${escapeHtml(info.price)}</strong>Acces complet pendant ${escapeHtml(String(info.duration_days))} jours, sans engagement.`;
    el.classList.remove('hidden');
  } catch { /* optional — the pitch reads fine without a price */ }
})();

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
