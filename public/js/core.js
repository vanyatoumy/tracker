// public/js/core.js — Shared state, stage/source constants, icons, API helper, phone and time helpers.
// Plain script (no bundler): all frontend files share one global scope and
// load in the order listed in index.html. Code that runs at load time may
// only use what earlier files define; functions are hoisted per file only.

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

// Sent with feedback so a reported problem can be tied to a release. Keep
// in step with versionName in android/app/build.gradle (see the release
// steps in public/downloads/README.md).
const APP_VERSION = '1.2';

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
