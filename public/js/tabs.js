// public/js/tabs.js — Tab navigation, grace banner and the subscription panel.
// Plain script (no bundler): all frontend files share one global scope and
// load in the order listed in index.html. Code that runs at load time may
// only use what earlier files define; functions are hoisted per file only.

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
