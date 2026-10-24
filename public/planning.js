// ============================================
// PLANNING: the "Aujourd'hui" to-do list + message templates
// ============================================
// Pure functions only (no DOM, no network), computed from the prospect list
// the app already has — so the "Aujourd'hui" view works offline from the
// cached list exactly like the board does, and these rules can be unit
// tested in Node (tests/planning.test.js).
//
// Loaded as a plain <script> before app.js (no bundler in this project), so
// it's a global `Planning` object; also exported for Node when required.

const Planning = (() => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  // A contact mid-pipeline with no stage change for this long, and nothing
  // scheduled, is going cold.
  const COLD_AFTER_DAYS = 7;

  const CONVERTED_STAGES = ['client', 'partenaire'];
  const IN_PROGRESS_STAGES = ['contacte', 'prospect', 'interesse', 'en_decision'];

  // Local-time midnight: "today" is the user's day, not UTC's.
  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function daysBetween(from, to) {
    return Math.floor((startOfDay(to) - startOfDay(from)) / DAY_MS);
  }

  function reorderDueAt(p) {
    if (!p.reorder_interval_days || !p.last_purchase_at) return null;
    if (!CONVERTED_STAGES.includes(p.stage)) return null;
    return new Date(new Date(p.last_purchase_at).getTime() + p.reorder_interval_days * DAY_MS);
  }

  // birthday is 'YYYY-MM-DD'; only month and day matter. A 29 February
  // birthday is wished on the 28th in non-leap years.
  function isBirthdayToday(birthday, now) {
    const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(birthday || '');
    if (!m) return false;
    let month = Number(m[1]);
    let day = Number(m[2]);
    const year = now.getFullYear();
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    if (month === 2 && day === 29 && !leap) day = 28;
    return now.getMonth() + 1 === month && now.getDate() === day;
  }

  // Splits the active (non-archived) prospects into what to do today, most
  // urgent first. A contact only ever lands in the first section it
  // qualifies for, so the list never shows the same person twice.
  //   birthdays — birthday today: a once-a-year reason to reach out
  //   overdue   — follow-up date before today
  //   today     — follow-up date today
  //   reorders  — client/partenaire whose next reorder is due (today or past)
  //   cold      — mid-pipeline, untouched for COLD_AFTER_DAYS, nothing scheduled
  //   untouched — still "nouveau" and nothing scheduled: never contacted yet
  function buildToday(prospects, now = new Date()) {
    const todayStart = startOfDay(now);
    const tomorrowStart = new Date(todayStart.getTime() + DAY_MS);
    const sections = { birthdays: [], overdue: [], today: [], reorders: [], cold: [], untouched: [] };

    for (const p of prospects) {
      if (p.is_archived) continue;
      if (isBirthdayToday(p.birthday, now)) {
        sections.birthdays.push({ prospect: p });
        continue;
      }
      const followup = p.next_followup_at ? new Date(p.next_followup_at) : null;

      if (followup && followup < todayStart) {
        sections.overdue.push({ prospect: p, at: followup, days: daysBetween(followup, now) });
        continue;
      }
      if (followup && followup < tomorrowStart) {
        sections.today.push({ prospect: p, at: followup });
        continue;
      }
      const reorderAt = reorderDueAt(p);
      if (reorderAt && reorderAt < tomorrowStart) {
        sections.reorders.push({ prospect: p, at: reorderAt, days: daysBetween(reorderAt, now) });
        continue;
      }
      if (followup) continue; // something is already planned for later
      if (IN_PROGRESS_STAGES.includes(p.stage)) {
        const idleDays = daysBetween(new Date(p.stage_updated_at), now);
        if (idleDays >= COLD_AFTER_DAYS) sections.cold.push({ prospect: p, days: idleDays });
        continue;
      }
      if (p.stage === 'nouveau') {
        sections.untouched.push({ prospect: p, days: daysBetween(new Date(p.created_at), now) });
      }
    }

    const byAt = (a, b) => a.at - b.at;
    sections.overdue.sort(byAt);
    sections.today.sort(byAt);
    sections.reorders.sort(byAt);
    sections.cold.sort((a, b) => b.days - a.days);
    sections.untouched.sort((a, b) => b.days - a.days);
    sections.birthdays.sort((a, b) => a.prospect.name.localeCompare(b.prospect.name));
    return sections;
  }

  // ---------- subscription renewals (admin view) ----------

  // Accounts to chase for renewal:
  //   soon    — expiring within the next `soonDays` days (soonest first)
  //   expired — expired within the last `expiredDays` days (most recent
  //             first); older than that, the person has most likely moved
  //             on and the list would only grow.
  function renewalGroups(users, now = new Date(), { soonDays = 7, expiredDays = 30 } = {}) {
    const soonLimit = new Date(now.getTime() + soonDays * DAY_MS);
    const expiredLimit = new Date(now.getTime() - expiredDays * DAY_MS);
    const soon = [];
    const expired = [];
    for (const u of users) {
      if (!u.subscription_expires_at) continue;
      const at = new Date(u.subscription_expires_at);
      if (at >= now && at < soonLimit) soon.push({ user: u, at, days: Math.ceil((at - now) / DAY_MS) });
      else if (at < now && at >= expiredLimit) expired.push({ user: u, at, days: Math.floor((now - at) / DAY_MS) });
    }
    soon.sort((a, b) => a.at - b.at);
    expired.sort((a, b) => b.at - a.at);
    return { soon, expired };
  }

  // Signed up, never activated (no subscription yet), recently: people who
  // took the first step but haven't paid — newest first.
  function pendingActivations(users, now = new Date(), { withinDays = 30 } = {}) {
    const limit = new Date(now.getTime() - withinDays * DAY_MS);
    return users
      .filter(u => !u.is_active && !u.subscription_expires_at && new Date(u.created_at) >= limit)
      .map(u => ({ user: u, days: Math.floor((now - new Date(u.created_at)) / DAY_MS) }))
      .sort((a, b) => a.days - b.days);
  }

  function activationMessage(user, info = {}) {
    const first = (user.name || '').trim().split(/\s+/)[0] || '';
    const lines = [
      `Bonjour ${first}, merci pour ton inscription sur Suivi Prospection !`,
      'Pour activer ton compte, il reste a regler l\'abonnement.'
    ];
    if (info.price) lines.push(`Tarif : ${info.price}.`);
    if (info.instructions) lines.push(info.instructions);
    lines.push('Des reception, j\'active ton acces.');
    return lines.join('\n');
  }

  // WhatsApp text the admin sends to remind someone to renew. info is
  // /api/subscription/info (price, instructions — any may be blank).
  function renewalMessage(user, info = {}, now = new Date()) {
    const first = (user.name || '').trim().split(/\s+/)[0] || '';
    const at = new Date(user.subscription_expires_at);
    const date = at.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    const lines = [
      at < now
        ? `Bonjour ${first}, ton abonnement Suivi Prospection a expire le ${date}.`
        : `Bonjour ${first}, ton abonnement Suivi Prospection expire le ${date}.`,
      at < now
        ? 'Pour retrouver ton acces et tous tes contacts, il suffit de le renouveler.'
        : 'Pour continuer sans interruption, pense a le renouveler.'
    ];
    if (info.price) lines.push(`Tarif : ${info.price}.`);
    if (info.instructions) lines.push(info.instructions);
    lines.push('Merci et bonne prospection !');
    return lines.join('\n');
  }

  // ---------- message templates ----------

  const TEMPLATE_VARIABLES = {
    prenom: (p) => (p.name || '').trim().split(/\s+/)[0] || '',
    nom: (p) => (p.name || '').trim(),
    ville: (p) => p.city || '',
    moi: (p, user) => (user && user.name ? user.name.trim().split(/\s+/)[0] : '')
  };

  // "{prenom}" -> "Marie", case-insensitive; unknown {words} are left as-is
  // so a typo stays visible in the preview instead of silently vanishing.
  function fillTemplate(body, prospect, user) {
    return String(body || '').replace(/\{(\w+)\}/g, (match, key) => {
      const fn = TEMPLATE_VARIABLES[key.toLowerCase()];
      return fn ? fn(prospect || {}, user) : match;
    });
  }

  function whatsappLink(phone, text) {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (!digits) return null;
    return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  }

  return {
    COLD_AFTER_DAYS,
    buildToday,
    isBirthdayToday,
    reorderDueAt,
    renewalGroups,
    renewalMessage,
    pendingActivations,
    activationMessage,
    fillTemplate,
    whatsappLink,
    TEMPLATE_VARIABLE_NAMES: Object.keys(TEMPLATE_VARIABLES)
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Planning;
