// public/js/forms.js — Add-contact modal and CSV import.
// Plain script (no bundler): all frontend files share one global scope and
// load in the order listed in index.html. Code that runs at load time may
// only use what earlier files define; functions are hoisted per file only.

// ============================================
// ADD PROSPECT MODAL
// ============================================
const addModal = document.getElementById('addModal');
document.getElementById('addProspectBtn').addEventListener('click', () => {
  document.getElementById('addPhoneDial').classList.add('dial-select');
  document.getElementById('addAltPhoneDial').classList.add('dial-select');
  document.getElementById('addFbGroup').classList.add('hidden');
  populateDialSelects();
  addModal.classList.remove('hidden');
});
document.getElementById('addPhoneDial').classList.add('dial-select');
document.getElementById('addAltPhoneDial').classList.add('dial-select');
document.getElementById('addCountry').classList.add('country-select');
document.getElementById('addSource').addEventListener('change', (e) => {
  document.getElementById('addFbGroup').classList.toggle('hidden', e.target.value !== 'facebook');
});

document.getElementById('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const phone = buildE164(fd.get('phone_dial'), fd.get('phone_local'));
  const alt_phone = buildE164(fd.get('alt_phone_dial'), fd.get('alt_phone_local'));
  const payload = {
    name: fd.get('name'),
    phone,
    alt_phone,
    country: fd.get('country') || null,
    city: fd.get('city') || null,
    quarter: fd.get('quarter') || null,
    source: fd.get('source') || null,
    facebook_profile_url: fd.get('facebook_profile_url') || null,
    next_followup_at: fd.get('next_followup_at') ? new Date(fd.get('next_followup_at')).toISOString() : null
  };
  const created = await api('/api/prospects', { method: 'POST', body: JSON.stringify(payload) });
  await syncFollowupNotification(created);
  await savePhoneContact(created);
  e.target.reset();
  addModal.classList.add('hidden');
  await refreshAll();
  // Land directly on the new contact's detail view — this is the fastest path to
  // hitting "Contacter sur WhatsApp" right after adding someone.
  await openDetail(created.id);
});

// ============================================
// IMPORT CONTACTS (CSV)
// ============================================
// Minimal RFC4180-ish CSV parser: handles quoted fields (with embedded
// commas/newlines/escaped quotes) as well as plain unquoted fields. Good
// enough for the contact-export files this feature targets, without pulling
// in a parsing library for one screen.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  // Normalize line endings so \r\n and \r don't produce phantom empty rows.
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  const filtered = rows.filter(r => r.some(c => c.trim() !== ''));
  if (filtered.length === 0) return [];
  const header = filtered[0].map(h => h.trim());
  return filtered.slice(1).map(r => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
}

const importModal = document.getElementById('importModal');
const importStatus = document.getElementById('importStatus');
const importFileInput = document.getElementById('importFileInput');
const importConfirmBtn = document.getElementById('importConfirmBtn');

// Rows parsed from the selected file, held until the user confirms the
// import by clicking "Importer" — selecting a file only previews it.
let pendingImportRows = null;

function resetImportState() {
  pendingImportRows = null;
  importConfirmBtn.disabled = true;
  importConfirmBtn.textContent = 'Importer';
}

document.getElementById('importBtn').addEventListener('click', () => {
  importFileInput.value = '';
  importStatus.classList.add('hidden');
  importStatus.classList.remove('error');
  resetImportState();
  importModal.classList.remove('hidden');
});

importFileInput.addEventListener('change', async () => {
  resetImportState();
  const file = importFileInput.files[0];
  if (!file) {
    importStatus.classList.add('hidden');
    return;
  }

  importStatus.classList.remove('hidden', 'error');
  importStatus.textContent = 'Lecture du fichier…';

  try {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      importStatus.classList.add('error');
      importStatus.textContent = 'Fichier vide ou illisible.';
      return;
    }

    pendingImportRows = rows;
    importConfirmBtn.disabled = false;
    importStatus.classList.remove('error');
    importStatus.textContent = `${rows.length} contact(s) detecte(s) dans le fichier. Clique sur "Importer" pour continuer.`;
  } catch (err) {
    importStatus.classList.add('error');
    importStatus.textContent = err.message || 'Impossible de lire le fichier.';
  }
});

importConfirmBtn.addEventListener('click', async () => {
  if (!pendingImportRows) return;

  importConfirmBtn.disabled = true;
  importConfirmBtn.textContent = 'Import en cours…';
  importStatus.classList.remove('hidden', 'error');
  importStatus.textContent = 'Import en cours…';

  try {
    const result = await api('/api/prospects/import', { method: 'POST', body: JSON.stringify({ rows: pendingImportRows }) });

    importStatus.textContent =
      `${result.imported} contact(s) importe(s) sur ${result.total_rows}. ` +
      `Ignores : ${result.skipped_duplicate_existing} deja dans le pipeline, ` +
      `${result.skipped_duplicate_in_file} doublons dans le fichier, ` +
      `${result.skipped_invalid_phone} numero(s) invalide(s), ` +
      `${result.skipped_no_name} sans nom exploitable.`;

    resetImportState();
    importFileInput.value = '';
    await refreshAll();
  } catch (err) {
    importStatus.classList.add('error');
    importStatus.textContent = err.message || "Echec de l'import.";
    importConfirmBtn.disabled = false;
    importConfirmBtn.textContent = 'Importer';
  }
});
