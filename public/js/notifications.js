// public/js/notifications.js — Local notifications (mobile): follow-up reminders and the 8am morning summary.
// Plain script (no bundler): all frontend files share one global scope and
// load in the order listed in index.html. Code that runs at load time may
// only use what earlier files define; functions are hoisted per file only.

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

// ---------- Morning summary (mobile only) ----------
// A local notification at 8am ("Aujourd'hui : 3 relances, 1 anniversaire")
// computed with the Today view's rules (Planning.morningSummaryText).
// Notifications are fixed once scheduled, so it's recomputed and
// rescheduled on every refresh — the text matches the latest data the app
// has seen, and it works offline. Id 1 can't collide with the per-contact
// follow-up ids in practice (31-bit hashes of UUIDs).
const MORNING_NOTIF_ID = 1;
const MORNING_HOUR = 8;

function morningSummaryEnabled() {
  try { return localStorage.getItem('morningSummaryOff') !== '1'; } catch { return true; }
}

async function syncMorningSummary(prospects) {
  if (!isNativeApp()) return;
  const { LocalNotifications } = window.Capacitor.Plugins;
  try {
    await LocalNotifications.cancel({ notifications: [{ id: MORNING_NOTIF_ID }] });
    if (!morningSummaryEnabled()) return;
    const at = new Date();
    if (at.getHours() >= MORNING_HOUR) at.setDate(at.getDate() + 1);
    at.setHours(MORNING_HOUR, 0, 0, 0);
    const body = Planning.morningSummaryText(prospects, at);
    if (!body) return;
    await LocalNotifications.schedule({
      notifications: [{ id: MORNING_NOTIF_ID, title: 'Ta journee de prospection', body, schedule: { at }, extra: { view: 'today' } }]
    });
  } catch (err) {
    console.error('Failed to schedule the morning summary:', err);
  }
}

function renderMorningToggle() {
  const btn = document.getElementById('morningToggleBtn');
  btn.classList.toggle('hidden', !isNativeApp());
  btn.textContent = `Resume du matin (8h) : ${morningSummaryEnabled() ? 'active' : 'desactive'}`;
}

document.getElementById('morningToggleBtn').addEventListener('click', async () => {
  try { localStorage.setItem('morningSummaryOff', morningSummaryEnabled() ? '1' : '0'); } catch { /* ignore */ }
  renderMorningToggle();
  if (!Object.values(activeFilters).some(Boolean)) await syncMorningSummary(currentProspects);
});

async function cancelFollowupNotification(prospectId) {
  if (!isNativeApp()) return;
  try {
    const { LocalNotifications } = window.Capacitor.Plugins;
    await LocalNotifications.cancel({ notifications: [{ id: notifIdForProspect(prospectId) }] });
  } catch (err) {
    console.error('Failed to cancel follow-up notification:', err);
  }
}
