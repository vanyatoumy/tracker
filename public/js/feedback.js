// public/js/feedback.js — "Donner mon avis": the user's feedback form, and the feedback list in the admin view.
// Plain script (no bundler): all frontend files share one global scope and
// load in the order listed in index.html. Code that runs at load time may
// only use what earlier files define; functions are hoisted per file only.

const FEEDBACK_TYPE_LABELS = { probleme: 'Probleme', idee: 'Idee', question: 'Question', autre: 'Autre' };

// ============================================
// USER SIDE: the form (menu ⋮ → "Donner mon avis")
// ============================================
const feedbackModal = document.getElementById('feedbackModal');

document.getElementById('feedbackBtn').addEventListener('click', () => {
  const form = document.getElementById('feedbackForm');
  form.reset();
  form.querySelector('[type="submit"]').disabled = false;
  document.getElementById('feedbackStatus').classList.add('hidden');
  feedbackModal.classList.remove('hidden');
});

document.getElementById('feedbackForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const status = document.getElementById('feedbackStatus');
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await api('/api/feedback', {
      method: 'POST',
      body: JSON.stringify({
        type: form.elements.type.value,
        message: form.elements.message.value,
        platform: isNativeApp() ? 'android' : 'web',
        app_version: APP_VERSION
      })
    });
    form.reset();
    status.textContent = "Merci ! Ton message a bien ete envoye. On te repondra sur WhatsApp.";
    status.className = 'feedback-status success';
    setTimeout(() => feedbackModal.classList.add('hidden'), 2500);
  } catch (err) {
    status.textContent = err.message;
    status.className = 'feedback-status error';
    submit.disabled = false;
  }
});

// ============================================
// ADMIN SIDE: list, WhatsApp reply, handled / reopened
// ============================================
let adminFeedback = [];
let feedbackFilter = 'nouveau'; // 'nouveau' | 'all'

async function loadAdminFeedback() {
  try {
    adminFeedback = await api('/api/admin/feedback');
  } catch (err) {
    document.getElementById('feedbackList').innerHTML = `<p class="section-hint">${escapeHtml(err.message)}</p>`;
    return;
  }
  renderAdminFeedback();
}

function feedbackReplyText(f) {
  const first = (f.user_name || '').trim().split(/\s+/)[0] || '';
  const excerpt = f.message.length > 120 ? `${f.message.slice(0, 117)}…` : f.message;
  return `Bonjour ${first}, merci pour ton message sur SuiviPro :\n« ${excerpt} »\n\n`;
}

function renderAdminFeedback() {
  const pending = adminFeedback.filter(f => f.status === 'nouveau');
  const counter = document.getElementById('feedbackNewCount');
  counter.textContent = String(pending.length);
  counter.classList.toggle('hidden', pending.length === 0);
  document.querySelectorAll('#feedbackFilter [data-feedback-filter]').forEach(b => {
    b.classList.toggle('active', b.dataset.feedbackFilter === feedbackFilter);
  });

  const shown = feedbackFilter === 'all' ? adminFeedback : pending;
  document.getElementById('feedbackList').innerHTML = shown.length === 0
    ? `<p class="section-hint">${feedbackFilter === 'all' ? 'Aucun message pour le moment.' : 'Aucun message a traiter.'}</p>`
    : shown.map(f => `
        <div class="renewal-item feedback-item feedback-${f.type} ${f.status === 'traite' ? 'is-handled' : ''}">
          <div class="renewal-main">
            <span class="renewal-name"><span class="tag feedback-type">${FEEDBACK_TYPE_LABELS[f.type] || escapeHtml(f.type)}</span> ${escapeHtml(f.user_name)}</span>
            <span class="renewal-detail">${escapeHtml(f.user_phone)} · ${escapeHtml(formatDateTime(f.created_at))}${f.platform ? ` · ${escapeHtml(f.platform)}` : ''}${f.app_version ? ` ${escapeHtml(f.app_version)}` : ''}${f.status === 'traite' ? ' · traite' : ''}</span>
            <p class="feedback-message">${escapeHtml(f.message)}</p>
          </div>
          <div class="renewal-actions">
            <button class="btn-whatsapp" data-feedback-reply="${escapeHtml(f.id)}">${icon('messageCircle')} <span class="btn-label">Repondre</span></button>
            <button class="btn-ghost" data-feedback-status="${escapeHtml(f.id)}" data-to="${f.status === 'traite' ? 'nouveau' : 'traite'}">${f.status === 'traite' ? 'Rouvrir' : 'Marquer traite'}</button>
          </div>
        </div>`).join('');
}

document.getElementById('feedbackFilter').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-feedback-filter]');
  if (!btn) return;
  feedbackFilter = btn.dataset.feedbackFilter;
  renderAdminFeedback();
});

document.getElementById('feedbackList').addEventListener('click', async (e) => {
  const replyBtn = e.target.closest('[data-feedback-reply]');
  if (replyBtn) {
    const f = adminFeedback.find(x => x.id === replyBtn.dataset.feedbackReply);
    const url = f && Planning.whatsappLink(f.user_phone, feedbackReplyText(f));
    if (url) window.open(url, '_blank', 'noopener');
    return;
  }
  const statusBtn = e.target.closest('[data-feedback-status]');
  if (statusBtn) {
    statusBtn.disabled = true;
    try {
      await api(`/api/admin/feedback/${statusBtn.dataset.feedbackStatus}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: statusBtn.dataset.to })
      });
      await loadAdminFeedback();
    } catch (err) {
      alert(err.message);
      statusBtn.disabled = false;
    }
  }
});
