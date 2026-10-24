// public/js/detail.js — Contact detail panel: summary, stage, interactions, purchases, details.
// Plain script (no bundler): all frontend files share one global scope and
// load in the order listed in index.html. Code that runs at load time may
// only use what earlier files define; functions are hoisted per file only.

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
