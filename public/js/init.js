// public/js/init.js — Modal close helpers and app start-up (must load last).
// Plain script (no bundler): all frontend files share one global scope and
// load in the order listed in index.html. Code that runs at load time may
// only use what earlier files define; functions are hoisted per file only.

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
    const trialDays = info.trial_days || 0;
    const el = document.getElementById('authPrice');
    // Free trial on: lead with it — it's the strongest reason to sign up.
    if (trialDays > 0) {
      const trialLabel = trialDays % 30 === 0 ? `${trialDays / 30} mois gratuit${trialDays > 30 ? 's' : ''}` : `${trialDays} jours gratuits`;
      el.innerHTML = `<strong>${escapeHtml(trialLabel)}</strong>Sans paiement, sans engagement.${info.price ? ` Ensuite : ${escapeHtml(info.price)}.` : ''}`;
      el.classList.remove('hidden');
      document.getElementById('authSteps').innerHTML =
        `<li>Cree ton compte en 30 secondes</li><li>Utilise SuiviPro gratuitement pendant ${trialDays} jours</li><li>Abonne-toi seulement si l'outil t'aide</li>`;
      document.getElementById('registerSubmitBtn').textContent = `Creer mon compte — ${trialLabel}`;
      return;
    }
    if (!info.price) return;
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
