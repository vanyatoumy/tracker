// public/js/admin.js — Admin view: renewals panel and user accounts table.
// Plain script (no bundler): all frontend files share one global scope and
// load in the order listed in index.html. Code that runs at load time may
// only use what earlier files define; functions are hoisted per file only.

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
