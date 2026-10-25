// public/js/tour.js — Guided tours: the first time a screen is opened, highlight its key elements one by one with a short explanation.
// Plain script (no bundler): all frontend files share one global scope and
// load in the order listed in index.html. Code that runs at load time may
// only use what earlier files define; functions are hoisted per file only.
//
// One tour per screen (TOURS below). A tour runs once per account: when it
// is finished or skipped, its id is saved on the server (PATCH /api/auth/me
// { tour_seen }) and comes back in currentUser.tours_seen on every device.
// Offline (mobile), the id is kept in a per-account local "pending" list and
// sent at the next successful sync, so the tour doesn't reappear meanwhile.
// "Revoir la visite" (menu ⋮, and the "?" in a contact's record) replays a
// tour on demand.

// ============================================
// TOUR CONTENT
// ============================================
// Each step: target() returns the element to highlight (null = step skipped,
// e.g. no contact yet, or an element that only exists on desktop), title,
// text (string, or function returning one — for desktop/phone variants).
const isPhoneLayout = () => window.matchMedia('(max-width: 900px)').matches;
const $ = (selector) => document.querySelector(selector);
// First matching element actually on screen (on phones, cards of the
// stages not shown are in the DOM but hidden).
const firstVisible = (selector) => [...document.querySelectorAll(selector)].find(isVisible) || null;

// Run before a tour's steps are measured, to put the screen in a state that
// can show them all.
const TOUR_PREPARE = {
  // Phone: only one stage is shown. If it's empty, the card steps (colours,
  // advance button) would be skipped — show the first stage with contacts.
  board: () => {
    if (!isPhoneLayout() || firstVisible('#board .card')) return;
    const tab = [...document.querySelectorAll('.stage-tab')].find(t => Number(t.querySelector('.stage-tab-count')?.textContent) > 0);
    if (tab) tab.click();
  }
};

const TOURS = {
  today: [
    { target: () => $('#todayContent .onboarding-card'), title: 'Bien démarrer',
      text: 'Trois étapes pour bien commencer : ajouter tes contacts, préparer tes messages, envoyer ton premier message. Elles se cochent toutes seules.' },
    { target: () => $('#todayContent .today-header'), title: 'Ta liste du jour',
      text: "Chaque jour, l'app calcule qui contacter en priorité : anniversaires, relances en retard ou du jour, réachats à proposer, contacts qui refroidissent, contacts jamais contactés." },
    { target: () => $('#todayContent .today-item'), title: 'Un contact à traiter',
      text: 'Touche le nom pour ouvrir sa fiche. « Message » prépare un WhatsApp à partir de tes messages types ; « Demain » reporte la relance à demain 9h.' },
    { target: () => $('.tabs'), title: 'Les autres écrans',
      text: "Pipeline : tous tes contacts, étape par étape. Statistiques : ton activité et tes résultats. Archives : les contacts marqués perdus, que tu peux restaurer." },
    { target: () => $('#addProspectBtn'), title: 'Ajouter un contact',
      text: 'Ajoute un contact en quelques secondes : nom, téléphone, source. Le lien WhatsApp est créé automatiquement.' },
    { target: () => $('#moreMenuBtn'), title: 'Le menu ⋮',
      text: "Importer tes contacts Google, gérer tes messages types, ton abonnement, nous donner ton avis… et « Revoir la visite » pour relancer ces explications." }
  ],

  board: [
    { target: () => (isPhoneLayout() ? $('#stageTabs') : $('#board .column')), title: 'Les étapes de ton pipeline',
      text: () => isPhoneLayout()
        ? 'Tes contacts avancent étape par étape : À contacter → Contacté → Prospect → Intéressé → En décision → Client / Partenaire. Touche une étape pour voir ses contacts ; le chiffre indique combien il y en a.'
        : 'Tes contacts avancent de gauche à droite : À contacter → Contacté → Prospect → Intéressé → En décision → Client / Partenaire. Le chiffre en haut de chaque colonne indique combien il y en a.' },
    { target: () => firstVisible('#board .card'), title: 'La couleur des cartes',
      text: "La bordure indique depuis quand rien ne s'est passé avec ce contact (changement d'étape ou échange noté) : gris = moins de 2 jours, orange = 2 à 5 jours, rouge = 5 jours ou plus, à relancer ! Vert = client ou partenaire." },
    { target: () => firstVisible('#board .card-advance'), title: 'Faire avancer un contact',
      text: () => isPhoneLayout()
        ? "Ce bouton passe le contact à l'étape suivante, sans ouvrir sa fiche."
        : "Ce bouton passe le contact à l'étape suivante. Tu peux aussi glisser une carte dans une autre colonne." },
    { target: () => $('#selectModeBtn'), title: 'Actions groupées',
      text: 'Sélectionne plusieurs contacts (ou une colonne entière) pour les déplacer, changer leur température, programmer ou effacer une relance, ou les archiver en une seule fois.' },
    { target: () => $('#filterMenuBtn'), title: 'Rechercher et filtrer',
      text: 'Retrouve un contact par son nom ou son numéro, ou filtre par source, intérêt, température, pays ou ville.' }
  ],

  detail: [
    { target: () => $('#detailModal .detail-summary'), title: "L'essentiel du contact",
      text: "L'étape actuelle et depuis quand, le dernier échange, la prochaine relance (modifiable directement, enregistrée tout de suite) et ta « température » : froid, tiède ou chaud." },
    { target: () => $('#detailTemplateBtn:not(.hidden)') || $('#detailWaBtn:not(.hidden)'), title: 'Écrire sur WhatsApp',
      text: '« Message type » prépare un message à partir de tes modèles, déjà personnalisé avec le prénom. Le bouton vert ouvre une conversation vide.' },
    { target: () => (isPhoneLayout() ? $('#stageSelectMobile') : $('#stageActions')), title: "Changer d'étape",
      text: "Fais avancer (ou reculer) le contact. Chaque changement est gardé dans la chronologie des étapes." },
    { target: () => $('#interactionForm'), title: 'Noter un échange',
      text: "Appel, message, rencontre ou note : garde une trace de ce qui a été dit. C'est aussi ce qui remet la carte au gris dans le pipeline." },
    { target: () => $('#detailModal .detail-coords'), title: 'Les coordonnées',
      text: "Téléphones, localisation, anniversaire, source… Repliées pour ne pas encombrer : touche-les pour les ouvrir et les modifier." },
    { target: () => $('#detailModal .danger-zone'), title: 'Autres actions',
      text: 'Marquer comme perdu (le contact reste récupérable dans Archives) ou supprimer définitivement, en cas d\'erreur ou de doublon.' }
  ],

  stats: [
    { target: () => $('#statsPeriod'), title: 'La période',
      text: 'Choisis la période analysée : 7 jours, 30 jours, 90 jours ou tout ton historique. Tout l\'écran s\'adapte.' },
    { target: () => $('#goalCard'), title: 'Ton objectif de la semaine',
      text: "Fixe-toi un nombre d'actions par semaine (messages, appels, rencontres) : la barre montre où tu en es sur les 7 derniers jours." },
    { target: () => $('#activityGrid'), title: 'Ton activité',
      text: 'Ce que tu as fait (actions, nouveaux contacts, étapes franchies) et ce que ça a donné (conversions, chiffre d\'affaires).' },
    { target: () => $('#funnel'), title: "L'entonnoir",
      text: "Sur les contacts ajoutés pendant la période, combien ont atteint chaque étape : tu vois tout de suite où ça bloque." }
  ],

  admin: [
    { target: () => $('#renewalSummary'), title: 'Les abonnements en un coup d\'œil',
      text: 'Comptes actifs, abonnements qui expirent bientôt, expirés récemment, inscrits sans paiement.' },
    { target: () => $('#renewalLists'), title: 'Qui relancer',
      text: '« Relancer » ouvre WhatsApp avec un message prêt (date, prix, instructions de paiement). « Renouveler » démarre une nouvelle période après paiement. Les relances sont notées pour ne pas relancer deux fois.' },
    { target: () => $('#feedbackList'), title: 'Retours utilisateurs',
      text: 'Les problèmes, idées et questions envoyés depuis « Donner mon avis ». Réponds sur WhatsApp, puis marque-les comme traités.' },
    { target: () => $('#adminUsersTable'), title: 'Tous les comptes',
      text: 'Activer ou désactiver un compte, débloquer après des échecs de connexion, réinitialiser un mot de passe.' }
  ]
};

// ============================================
// SEEN / PENDING (per account)
// ============================================
function pendingToursKey() { return `toursPending:${currentUser?.id || ''}`; }
function pendingTours() {
  try { return JSON.parse(localStorage.getItem(pendingToursKey()) || '[]'); } catch { return []; }
}
function savePendingTours(list) {
  try { localStorage.setItem(pendingToursKey(), JSON.stringify(list)); } catch { /* still marked in memory */ }
}
function tourSeen(id) {
  return (currentUser?.tours_seen || []).includes(id) || pendingTours().includes(id);
}

async function markTourSeen(id) {
  if (!currentUser) return;
  currentUser.tours_seen = [...new Set([...(currentUser.tours_seen || []), id])];
  savePendingTours([...new Set([...pendingTours(), id])]);
  await flushPendingTours();
}

// Sends locally-pending tour ids to the server; stops at the first failure
// (offline) and keeps the rest for next time. Called after each tour and at
// start-up (bootApp).
async function flushPendingTours() {
  for (const id of pendingTours()) {
    try {
      const user = await api('/api/auth/me', { method: 'PATCH', body: JSON.stringify({ tour_seen: id }) });
      if (user && Array.isArray(user.tours_seen)) currentUser.tours_seen = user.tours_seen;
      savePendingTours(pendingTours().filter(t => t !== id));
    } catch {
      break;
    }
  }
}

// ============================================
// ENGINE
// ============================================
let activeTour = null; // { id, steps, index, root, spot, bubble }

function isVisible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && el.getClientRects().length > 0;
}

// Auto-start for a screen, unless already seen, another tour is running, or
// the user is busy elsewhere (a window open on top, selection mode).
function maybeStartTour(id) {
  if (!currentUser || activeTour || tourSeen(id)) return;
  if (typeof selectionMode !== 'undefined' && selectionMode) return;
  const openModals = [...document.querySelectorAll('.modal-overlay')].filter(m => !m.classList.contains('hidden'));
  const allowed = id === 'detail' ? ['detailModal'] : [];
  if (openModals.some(m => !allowed.includes(m.id))) return;
  // Let the screen finish rendering (lists, cards) before measuring it.
  setTimeout(() => startTour(id), 400);
}

function startTour(id, { force = false } = {}) {
  if (activeTour || (!force && tourSeen(id))) return false;
  if (TOUR_PREPARE[id]) TOUR_PREPARE[id]();
  const steps = (TOURS[id] || []).filter(s => isVisible(s.target()));
  if (steps.length === 0) return false;

  const root = document.createElement('div');
  root.className = 'tour-root';
  root.innerHTML = `
    <div class="tour-spot"></div>
    <div class="tour-bubble" role="dialog" aria-modal="true" aria-labelledby="tourTitle">
      <div class="tour-progress"></div>
      <h3 id="tourTitle" class="tour-title"></h3>
      <p class="tour-text"></p>
      <div class="tour-actions">
        <button type="button" class="tour-skip" data-tour="skip">Passer la visite</button>
        <span class="tour-nav">
          <button type="button" class="btn-ghost" data-tour="prev">Précédent</button>
          <button type="button" class="btn-primary" data-tour="next">Suivant</button>
        </span>
      </div>
    </div>`;
  document.body.appendChild(root);
  activeTour = { id, steps, index: 0, root, spot: root.querySelector('.tour-spot'), bubble: root.querySelector('.tour-bubble') };

  root.addEventListener('click', (e) => {
    const action = e.target.closest('[data-tour]')?.dataset.tour;
    if (action === 'next') tourNext();
    else if (action === 'prev') tourGo(activeTour.index - 1);
    else if (action === 'skip') endTour();
  });
  document.addEventListener('keydown', tourKeydown, true);
  window.addEventListener('resize', positionTour);
  document.addEventListener('scroll', positionTour, true);
  tourGo(0);
  return true;
}

function tourNext() {
  if (!activeTour) return;
  if (activeTour.index >= activeTour.steps.length - 1) endTour();
  else tourGo(activeTour.index + 1);
}

function tourGo(index) {
  if (!activeTour || index < 0) return;
  activeTour.index = index;
  const step = activeTour.steps[index];
  const { bubble } = activeTour;
  bubble.querySelector('.tour-progress').textContent = `${index + 1} / ${activeTour.steps.length}`;
  bubble.querySelector('.tour-title').textContent = step.title;
  bubble.querySelector('.tour-text').textContent = typeof step.text === 'function' ? step.text() : step.text;
  bubble.querySelector('[data-tour="prev"]').disabled = index === 0;
  bubble.querySelector('[data-tour="next"]').textContent = index === activeTour.steps.length - 1 ? 'Terminer' : 'Suivant';
  const el = step.target();
  if (el) el.scrollIntoView({ block: 'center', inline: 'nearest' });
  positionTour();
  bubble.querySelector('[data-tour="next"]').focus({ preventScroll: true });
}

// Spotlight over the target (padded), bubble below it — or above when there
// isn't room — kept fully inside the viewport. Re-run on scroll / resize.
function positionTour() {
  if (!activeTour) return;
  const el = activeTour.steps[activeTour.index].target();
  const { spot, bubble } = activeTour;
  if (!isVisible(el)) {
    spot.style.display = 'none';
    Object.assign(bubble.style, { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' });
    return;
  }
  const pad = 6;
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  Object.assign(spot.style, {
    display: 'block',
    top: `${Math.max(r.top - pad, 4)}px`,
    left: `${Math.max(r.left - pad, 4)}px`,
    width: `${Math.min(r.width + pad * 2, vw - 8)}px`,
    height: `${Math.min(r.height + pad * 2, vh - 8)}px`
  });
  bubble.style.transform = 'none';
  const bw = bubble.offsetWidth;
  const bh = bubble.offsetHeight;
  const margin = 12;
  let top;
  if (r.bottom + pad + margin + bh <= vh) top = r.bottom + pad + margin;          // below
  else if (r.top - pad - margin - bh >= 0) top = r.top - pad - margin - bh;      // above
  else top = Math.max(margin, vh - bh - margin);                                 // tall target: pin to the bottom
  const left = Math.min(Math.max(r.left, margin), vw - bw - margin);
  bubble.style.top = `${top}px`;
  bubble.style.left = `${Math.max(left, margin)}px`;
}

// Capture phase + stopImmediatePropagation: while a tour is shown, Escape
// ends the tour only (not also the window underneath, see init.js).
function tourKeydown(e) {
  if (!activeTour) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); endTour(); }
  else if (e.key === 'ArrowRight' || (e.key === 'Enter' && !e.target.closest('[data-tour="prev"], [data-tour="skip"]'))) {
    e.preventDefault(); e.stopImmediatePropagation(); tourNext();
  } else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); tourGo(activeTour.index - 1); }
}

// Finished or skipped: either way it's "seen" — the user can replay it.
function endTour() {
  if (!activeTour) return;
  const { id, root } = activeTour;
  activeTour = null;
  root.remove();
  document.removeEventListener('keydown', tourKeydown, true);
  window.removeEventListener('resize', positionTour);
  document.removeEventListener('scroll', positionTour, true);
  markTourSeen(id);
}

// ============================================
// REPLAY
// ============================================
document.getElementById('replayTourBtn').addEventListener('click', () => {
  const view = document.querySelector('.tab-btn.active')?.dataset.view;
  if (!startTour(view, { force: true })) {
    alert("Pas de visite pour cet écran. Les visites existent pour Aujourd'hui, Pipeline, Statistiques, Admin, et la fiche d'un contact (bouton « ? »).");
  }
});

document.getElementById('detailTourBtn').addEventListener('click', () => startTour('detail', { force: true }));
