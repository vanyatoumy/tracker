// public/js/board.js — Pipeline board: stage tabs, bulk actions (selection mode), columns and cards.
// Plain script (no bundler): all frontend files share one global scope and
// load in the order listed in index.html. Code that runs at load time may
// only use what earlier files define; functions are hoisted per file only.

// ============================================
// BOARD RENDERING
// ============================================

// On phones the 7 columns can't sit side by side, and stacking them made one
// endless page once a few hundred contacts were imported. Narrow screens
// get a row of stage tabs instead (CSS shows them, and only the
// .mobile-active column, under 900px); desktop ignores both.
let mobileStage = (() => {
  try { return localStorage.getItem('mobileStage') || 'nouveau'; } catch { return 'nouveau'; }
})();

function renderStageTabs() {
  const tabs = document.getElementById('stageTabs');
  tabs.innerHTML = STAGES.map(stage => {
    const count = currentProspects.filter(p => p.stage === stage.key && !p.is_archived).length;
    const won = WON_STAGES.includes(stage.key) ? 'won' : '';
    return `<button class="stage-tab ${won} ${stage.key === mobileStage ? 'active' : ''}" data-mobile-stage="${stage.key}">${stage.label} <span class="stage-tab-count">${count}</span></button>`;
  }).join('');
  tabs.querySelector('.stage-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

document.getElementById('stageTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-mobile-stage]');
  if (!tab) return;
  mobileStage = tab.dataset.mobileStage;
  try { localStorage.setItem('mobileStage', mobileStage); } catch { /* per-device nicety only */ }
  renderBoard();
});

async function moveStage(id, toStage, triggerEl) {
  if (triggerEl) triggerEl.disabled = true;
  try {
    await api(`/api/prospects/${id}/stage`, { method: 'POST', body: JSON.stringify({ to_stage: toStage }) });
    await refreshAll();
  } catch (err) {
    alert(err.message);
    if (triggerEl) triggerEl.disabled = false;
  }
}

// ============================================
// BULK ACTIONS (board selection mode)
// ============================================
// "Selectionner" turns the board's cards into checkboxes; the bar at the
// bottom applies one change to every selected contact in a single request
// (POST /api/prospects/bulk). Online only — the bulk route isn't part of
// the offline queue.
let selectionMode = false;
const selectedIds = new Set();

function setSelectionMode(on) {
  selectionMode = on;
  selectedIds.clear();
  document.getElementById('selectModeBtn').textContent = on ? 'Annuler la selection' : 'Selectionner';
  document.getElementById('selectModeBtn').classList.toggle('active', on);
  document.getElementById('selectHint').classList.toggle('hidden', !on);
  document.body.classList.toggle('selecting', on);
  updateBulkBar();
  renderBoard();
}

function toggleSelected(id) {
  if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
  updateBulkBar();
  renderBoard();
}

function updateBulkBar() {
  const n = selectedIds.size;
  document.getElementById('bulkBar').classList.toggle('hidden', !selectionMode);
  document.getElementById('bulkCount').textContent = `${n} selectionne${n > 1 ? 's' : ''}`;
  document.querySelectorAll('#bulkBar .bulk-actions select, #bulkBar .bulk-actions button').forEach(el => { el.disabled = n === 0; });
}

document.getElementById('bulkStage').innerHTML = '<option value="">Deplacer vers…</option>' +
  STAGES.map(s => `<option value="${s.key}">${s.label}</option>`).join('');

document.getElementById('selectModeBtn').addEventListener('click', () => setSelectionMode(!selectionMode));

// "Tout" / "Aucun" in a column header: every contact of that stage, not
// just the cards currently shown (the column may be paged).
document.getElementById('board').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-select-stage]');
  if (!btn) return;
  const items = currentProspects.filter(p => p.stage === btn.dataset.selectStage && !p.is_archived);
  const all = items.every(p => selectedIds.has(p.id));
  items.forEach(p => { if (all) selectedIds.delete(p.id); else selectedIds.add(p.id); });
  updateBulkBar();
  renderBoard();
});

async function runBulk(action, value, label) {
  const ids = [...selectedIds];
  if (ids.length === 0) return;
  if (!confirm(`${label} : ${ids.length} contact${ids.length > 1 ? 's' : ''} ?`)) return;
  try {
    const res = await api('/api/prospects/bulk', { method: 'POST', body: JSON.stringify({ ids, action, value }) });
    if (action === 'followup') {
      for (const p of res.prospects) await syncFollowupNotification(p);
    }
    if (action === 'archive') {
      for (const p of res.prospects) await cancelFollowupNotification(p.id);
      selectedIds.clear(); // they've left the board
    }
    await refreshAll();
    updateBulkBar();
  } catch (err) {
    alert(err.message);
  }
}

document.getElementById('bulkStage').addEventListener('change', async (e) => {
  const stage = STAGES.find(s => s.key === e.target.value);
  e.target.value = '';
  if (stage) await runBulk('stage', stage.key, `Deplacer vers « ${stage.label} »`);
});

document.getElementById('bulkTemperature').addEventListener('change', async (e) => {
  const value = e.target.value;
  e.target.value = '';
  if (!value) return;
  const t = value === '__clear' ? null : value;
  await runBulk('temperature', t, t ? `Temperature « ${TEMPERATURE_LABELS[t]} »` : 'Retirer la temperature');
});

document.getElementById('bulkBar').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-bulk]');
  if (!btn) return;
  switch (btn.dataset.bulk) {
    case 'followup-tomorrow': {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      return runBulk('followup', tomorrow.toISOString(), 'Programmer une relance demain a 9h');
    }
    case 'followup-clear':
      return runBulk('followup', null, 'Effacer la relance');
    case 'archive':
      return runBulk('archive', true, 'Marquer comme perdus (restaurables depuis « Archives »)');
    case 'cancel':
      return setSelectionMode(false);
  }
});

function renderBoard() {
  const board = document.getElementById('board');
  // board.innerHTML = '' below wipes every column's scroll position along
  // with the DOM (each .column-body scrolls independently, not .board
  // itself) — capture and restore them so re-renders (live refresh,
  // filters, a stage change elsewhere) don't visibly snap columns back to
  // the top mid-browse.
  const scrollTops = {};
  STAGES.forEach(stage => {
    const el = document.getElementById(`col-${stage.key}`);
    if (el) scrollTops[stage.key] = el.scrollTop;
  });
  board.innerHTML = '';
  const collapsed = getCollapsedStages();
  renderStageTabs();

  STAGES.forEach((stage, idx) => {
    const items = currentProspects.filter(p => p.stage === stage.key && !p.is_archived);
    const fillPct = ((idx + 1) / STAGES.length) * 100;
    const isCollapsed = collapsed.has(stage.key);

    const col = document.createElement('div');
    col.className = `column ${isCollapsed ? 'collapsed' : ''} ${WON_STAGES.includes(stage.key) ? 'column-won' : ''} ${stage.key === mobileStage ? 'mobile-active' : ''}`;
    const allSelected = items.length > 0 && items.every(p => selectedIds.has(p.id));
    const selectAllBtn = selectionMode && items.length > 0
      ? `<button class="column-select-all ${allSelected ? 'active' : ''}" data-select-stage="${stage.key}" title="${allSelected ? 'Tout deselectionner' : `Selectionner les ${items.length} contacts de cette colonne`}">${allSelected ? 'Aucun' : 'Tout'}</button>`
      : '';
    col.innerHTML = `
      <div class="column-header">
        <p class="column-title">
          <span class="column-title-text">
            <button class="collapse-toggle" data-stage="${stage.key}" title="Reduire / agrandir">${isCollapsed ? icon('chevronRight') : icon('chevronDown')}</button>
            <span class="column-label" title="${stage.label}">${stage.label}</span>
          </span>
          <span class="column-title-right">${selectAllBtn}<span class="column-count">${items.length}</span></span>
        </p>
        <div class="progress-rail"><div class="progress-rail-fill" style="width:${fillPct}%"></div></div>
      </div>
      <div class="column-body" id="col-${stage.key}"></div>
    `;
    board.appendChild(col);

    col.querySelector('.collapse-toggle').addEventListener('click', () => {
      const set = getCollapsedStages();
      if (set.has(stage.key)) set.delete(stage.key); else set.add(stage.key);
      setCollapsedStages(set);
      renderBoard();
    });

    const body = col.querySelector('.column-body');
    // Drop target for dragged cards — the whole column, so a collapsed or
    // empty column still accepts a card.
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop-target'); });
    col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('drop-target'); });
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('drop-target');
      const id = e.dataTransfer.getData('text/plain');
      const p = currentProspects.find(x => x.id === id);
      if (p && p.stage !== stage.key) moveStage(id, stage.key);
    });
    if (items.length === 0) {
      body.innerHTML = `<div class="empty-column">Aucun contact</div>`;
      return;
    }
    // Only the first COLUMN_PAGE cards are built: a column with hundreds of
    // imported contacts made every re-render (live refresh every 20s
    // included) slow, especially on low-end phones.
    const limit = columnLimits[stage.key] || COLUMN_PAGE;
    items.slice(0, limit).forEach(p => body.appendChild(renderCard(p)));
    if (items.length > limit) {
      const more = document.createElement('button');
      more.className = 'column-more';
      const next = Math.min(COLUMN_PAGE, items.length - limit);
      more.textContent = `Afficher ${next} de plus · ${items.length - limit} restant${items.length - limit > 1 ? 's' : ''}`;
      more.addEventListener('click', () => {
        columnLimits[stage.key] = limit + COLUMN_PAGE;
        renderBoard();
      });
      body.appendChild(more);
    }
    if (scrollTops[stage.key]) body.scrollTop = scrollTops[stage.key];
  });
}

const COLUMN_PAGE = 30;
const columnLimits = {}; // stage -> how many cards are shown (grows with "Afficher plus")

const WON_STAGES = ['client', 'partenaire'];
const TEMPERATURE_LABELS = { froid: 'Froid', tiede: 'Tiede', chaud: 'Chaud' };

function renderCard(p) {
  // A client/partner who hasn't "moved" in 60 days isn't going stale — they
  // are a win. The age colours (grey -> amber -> red) only make sense for
  // contacts still in the pipeline, and measure the last *activity* — stage
  // change or logged exchange (Planning.lastActivityAt) — so a contact you
  // messaged yesterday isn't flagged red just because it didn't move stage.
  const isWon = WON_STAGES.includes(p.stage);
  const lastActivity = Planning.lastActivityAt(p).toISOString();
  const card = document.createElement('div');
  card.className = `card ${isWon ? 'card-won' : ageClass(lastActivity)}`;
  card.dataset.id = p.id;

  // No inline onclick="event.stopPropagation()" on these links: the CSP
  // (script-src 'self', see server.js) silently blocks inline handlers, so
  // a click on the icon also opened the detail panel. The card's own click
  // listener below skips clicks that land on a link instead.
  const wa = waLinkFromPhone(p.phone);
  const waLink = wa
    ? `<a class="card-wa" href="${escapeHtml(wa)}" target="_blank" rel="noopener" title="Ouvrir WhatsApp">${icon('messageCircle')}</a>`
    : '';

  const fbLink = (p.source === 'facebook' && p.facebook_profile_url)
    ? `<a class="card-wa" href="${escapeHtml(p.facebook_profile_url)}" target="_blank" rel="noopener" title="Ouvrir le profil Facebook">${icon('globe')}</a>`
    : '';

  const altWa = waLinkFromPhone(p.alt_phone);
  const altWaLink = altWa
    ? `<a class="card-wa" href="${escapeHtml(altWa)}" target="_blank" rel="noopener" title="Numero secondaire — WhatsApp">${icon('messageCircle')}<sup>2</sup></a>`
    : '';

  let followupHtml = '';
  if (p.next_followup_at) {
    const isPast = new Date(p.next_followup_at) <= new Date();
    followupHtml = `<div class="card-followup ${isPast ? 'overdue' : 'upcoming'}">${isPast ? icon('alarmClock') + ' Relance en retard' : icon('calendar') + ' ' + formatDateTime(p.next_followup_at)}</div>`;
  }

  const locationBits = [p.quarter, p.city, p.country].filter(Boolean).join(', ');

  let ageHtml = `<span title="Changement d'étape ou échange noté (appel, message, rencontre, note)">Dernière activité ${relativeTime(lastActivity)}</span>`;
  if (isWon) {
    const stageLabel = STAGES.find(s => s.key === p.stage).label;
    const days = Math.floor(daysSince(p.stage_updated_at));
    ageHtml = `<span>${stageLabel} ${days < 1 ? "depuis aujourd'hui" : `depuis ${days} j`}</span>`;
  }
  let reorderHtml = '';
  const reorderAt = isWon ? Planning.reorderDueAt(p) : null;
  if (reorderAt) {
    const due = reorderAt <= new Date();
    reorderHtml = `<div class="card-followup ${due ? 'reorder-due' : 'upcoming'}">${icon('calendar')} ${due ? 'Reachat a proposer' : 'Reachat le ' + reorderAt.toLocaleDateString('fr-FR')}</div>`;
  }

  card.innerHTML = `
    <div class="card-top">
      <p class="card-name">${escapeHtml(p.name)}</p>
      ${waLink}${altWaLink}${fbLink}
    </div>
    <div class="card-meta">
      ${p.source ? `<span class="tag">${sourceLabel(p.source)}</span>` : ''}
      ${p.interest_type && p.interest_type !== 'indecis' ? `<span class="tag">${p.interest_type === 'opportunite' ? 'Opportunite' : 'Produit'}</span>` : ''}
      ${TEMPERATURE_LABELS[p.temperature] ? `<span class="tag temp-${p.temperature}">${TEMPERATURE_LABELS[p.temperature]}</span>` : ''}
    </div>
    ${locationBits ? `<div class="card-meta"><span class="tag">${icon('mapPin')} ${escapeHtml(locationBits)}</span></div>` : ''}
    <div class="card-meta">${ageHtml}</div>
    ${followupHtml}${reorderHtml}
  `;
  // Selection mode: the card is a checkbox — a click selects it instead of
  // opening it, and the per-card actions (advance, drag) step aside.
  if (selectionMode) {
    card.classList.add('selectable');
    card.classList.toggle('selected', selectedIds.has(p.id));
    card.insertAdjacentHTML('afterbegin', `<span class="card-check" aria-hidden="true">${selectedIds.has(p.id) ? '✓' : ''}</span>`);
    card.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      toggleSelected(p.id);
    });
    return card;
  }

  // Quick "next stage" button — the one move a rep makes all day, without
  // opening the detail panel (works on phones, where there's no drag).
  const stageIdx = STAGES.findIndex(s => s.key === p.stage);
  const next = STAGES[stageIdx + 1];
  if (next) {
    const advance = document.createElement('button');
    advance.className = 'card-advance';
    advance.title = `Passer a « ${next.label} »`;
    advance.innerHTML = `${escapeHtml(next.label)} ${icon('chevronRight')}`;
    advance.addEventListener('click', (e) => {
      e.stopPropagation();
      moveStage(p.id, next.key, advance);
    });
    card.appendChild(advance);
  }

  // Desktop: drag the card onto another column (see the drop handlers in renderBoard).
  card.draggable = true;
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', p.id);
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));

  card.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) return;
    openDetail(p.id);
  });
  return card;
}
