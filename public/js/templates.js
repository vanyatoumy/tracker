// public/js/templates.js — WhatsApp message templates: send window and templates manager.
// Plain script (no bundler): all frontend files share one global scope and
// load in the order listed in index.html. Code that runs at load time may
// only use what earlier files define; functions are hoisted per file only.

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

// Starter pack (server side: db.STARTER_TEMPLATES) — offered wherever the
// template list is empty, and in the getting-started card.
const STARTER_PACK_BUTTON = `<button type="button" class="btn-primary" data-starter-pack>Ajouter les messages types</button>`;
async function addStarterPack() {
  await api('/api/templates/starter', { method: 'POST' });
  await loadTemplates();
  if (!messageModal.classList.contains('hidden')) await renderTemplateChoices();
  if (!templatesModal.classList.contains('hidden')) await renderTemplatesList();
}
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-starter-pack]');
  if (!btn) return;
  btn.disabled = true;
  try {
    await addStarterPack();
    if (document.querySelector('.tab-btn.active')?.dataset.view === 'today') await loadToday();
  } catch (err) {
    alert(err.message);
    btn.disabled = false;
  }
});

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
    ? `<div class="starter-pack-offer"><p class="section-hint">Aucun modele pour l'instant. Pars de nos messages types (tu pourras les modifier), ou ecris ton message directement.</p>${STARTER_PACK_BUTTON}</div>`
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
    ? `<div class="starter-pack-offer"><p class="section-hint">Aucun modele enregistre. Commence avec nos 7 messages types (premier contact, invitation, relances, reachat, anniversaire…), puis adapte-les a ta facon de parler.</p>${STARTER_PACK_BUTTON}</div>`
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
