// public/js/shell.js — App shell: phone contacts, offline indicator, pull-to-refresh, live refresh, bootApp().
// Plain script (no bundler): all frontend files share one global scope and
// load in the order listed in index.html. Code that runs at load time may
// only use what earlier files define; functions are hoisted per file only.

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
    // Morning summary: just land on the Today view (the default anyway).
    if (event?.notification?.extra?.view === 'today') {
      if (currentUser) document.querySelector('[data-view="today"]')?.click();
      return;
    }
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

// Logged in with an expired subscription = the server's grace period
// (read-only; past it, the session would have been refused). Say so plainly
// and point to the renewal instructions, instead of letting every save fail.
async function renderGraceBanner() {
  const banner = document.getElementById('graceBanner');
  const expiresAt = currentUser?.subscription_expires_at ? new Date(currentUser.subscription_expires_at) : null;
  if (!expiresAt || expiresAt >= new Date()) {
    banner.classList.add('hidden');
    return;
  }
  let graceDays = 3;
  try { graceDays = (await api('/api/subscription/info')).grace_days ?? graceDays; } catch { /* offline: default */ }
  const until = new Date(expiresAt.getTime() + graceDays * 24 * 60 * 60 * 1000);
  const fmt = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  banner.innerHTML = currentUser.is_trial
    ? `<span><strong>Ton essai gratuit s'est terminé le ${escapeHtml(fmt(expiresAt))}.</strong>
       Ton compte est en lecture seule jusqu'au ${escapeHtml(fmt(until))} : abonne-toi pour garder tes contacts et continuer à travailler.</span>
       <button class="btn-primary" data-grace-renew>M'abonner</button>`
    : `<span><strong>Ton abonnement a expiré le ${escapeHtml(fmt(expiresAt))}.</strong>
       Ton compte est en lecture seule jusqu'au ${escapeHtml(fmt(until))}, puis l'accès sera coupé. Renouvelle-le pour continuer à travailler.</span>
       <button class="btn-primary" data-grace-renew>Comment renouveler</button>`;
  banner.classList.remove('hidden');
}

document.getElementById('graceBanner').addEventListener('click', (e) => {
  if (e.target.closest('[data-grace-renew]')) document.getElementById('subscriptionBtn').click();
});

async function bootApp() {
  showApp();
  const userInfoEl = document.getElementById('currentUserInfo');
  userInfoEl.textContent = currentUser ? `${currentUser.name} · ${currentUser.phone}` : '';
  // Nudge before it becomes a lockout: subscription expiry isn't enforced
  // client-side (the real gate is server-side, at next login — see
  // server.js), this is purely a heads-up while the current session is
  // still valid.
  const daysLeft = subscriptionDaysLeft(currentUser?.subscription_expires_at);
  const daysText = d => `${d} jour${d > 1 ? 's' : ''} restant${d > 1 ? 's' : ''}`;
  if (currentUser?.is_trial && daysLeft !== null && daysLeft > 0) {
    // Free trial: always shown (it's a countdown the user should see),
    // highlighted in the last 5 days.
    userInfoEl.textContent += ` · Essai gratuit : ${daysText(daysLeft)}`;
    userInfoEl.classList.toggle('subscription-warning', daysLeft <= 5);
  } else if (currentUser && daysLeft !== null && daysLeft <= 5) {
    userInfoEl.textContent += ` · ${currentUser.is_trial ? 'Essai gratuit' : 'Abonnement'} : ${daysLeft <= 0 ? 'termine' : daysText(daysLeft)}`;
    userInfoEl.classList.add('subscription-warning');
  } else {
    userInfoEl.classList.remove('subscription-warning');
  }
  document.getElementById('adminTabBtn').classList.toggle('hidden', !currentUser?.is_admin);
  renderGraceBanner();
  renderMorningToggle();
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

  // Guided tours (js/tour.js): send any "seen" marks left pending offline,
  // then show the tour of the screen we land on, if not seen yet.
  flushPendingTours();
  if (pendingNotificationProspectId) {
    const id = pendingNotificationProspectId;
    pendingNotificationProspectId = null;
    await openDetail(id);
  } else {
    maybeStartTour(document.querySelector('.tab-btn.active')?.dataset.view);
  }
}
