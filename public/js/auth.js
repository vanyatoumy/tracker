// public/js/auth.js — Login / register screen, password toggle, dropdown menus.
// Plain script (no bundler): all frontend files share one global scope and
// load in the order listed in index.html. Code that runs at load time may
// only use what earlier files define; functions are hoisted per file only.

// ============================================
// AUTH FLOW
// ============================================
function showAuthScreen() {
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}
function showApp() {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}

document.querySelectorAll('.auth-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('loginForm').classList.toggle('hidden', btn.dataset.auth !== 'login');
    document.getElementById('registerForm').classList.toggle('hidden', btn.dataset.auth !== 'register');
  });
});

document.querySelectorAll('.password-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.innerHTML = showing ? icon('eye') : icon('eyeOff');
    btn.title = showing ? 'Afficher le mot de passe' : 'Masquer le mot de passe';
  });
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  const fd = new FormData(e.target);
  const phone = fd.get('phone');
  const password = fd.get('password');
  try {
    currentUser = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, password })
    });
    // Remembered so the phone number is prefilled next time — deliberately
    // never the password, see the prefill code near the bottom of this file.
    localStorage.setItem('lastLoginPhone', phone);
    // Succeeds whether this came from the real server or (offline) from a
    // previously cached verifier — either way, refresh the local verifier
    // so it always reflects the last password actually used successfully.
    if (typeof OfflineSync !== 'undefined' && OfflineSync.enabled) {
      await OfflineSync.cacheLoginCredential(phone, password, currentUser);
      // Only a real online login returns a fresh session token — offline
      // login just re-verifies the cached password locally (see
      // verifyOfflineLogin in offline.js) and can't obtain a new one. Skip
      // the call entirely in that case, rather than passing something
      // falsy, so whatever token is already cached from the last online
      // login is left untouched instead of being wiped.
      if (currentUser.token) await OfflineSync.setToken(currentUser.token);
    }
    await bootApp();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('registerError');
  errEl.textContent = '';
  const fd = new FormData(e.target);
  try {
    const result = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: fd.get('name'), phone: fd.get('phone'), password: fd.get('password') })
    });
    // Accounts are created inactive and need admin activation — no session is
    // issued at registration time, so don't try to boot the app here. Switch
    // to the login tab and show the activation notice there instead.
    e.target.reset();
    document.querySelector('.auth-tab-btn[data-auth="login"]').click();
    let message = result.message || 'Compte cree. Il doit etre active par un administrateur avant que tu puisses te connecter.';
    try {
      const info = await api('/api/subscription/info');
      if (info.price || info.instructions) {
        message += `\n\n${info.price ? `Prix : ${info.price}. ` : ''}${info.instructions || ''}${info.contact ? ` (${info.contact})` : ''}`;
      }
    } catch { /* payment info is optional — skip silently if unreachable */ }
    document.getElementById('loginError').textContent = message;
  } catch (err) {
    errEl.textContent = err.message;
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  // Signing out must work offline too — clear local state regardless of
  // whether the server call actually goes through. If it doesn't, the
  // server-side session just lingers until it naturally expires; the device
  // itself is still fully signed out.
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* offline — fine, see above */ }
  if (typeof OfflineSync !== 'undefined' && OfflineSync.enabled) await OfflineSync.clearSession();
  currentUser = null;
  showAuthScreen();
});

function setupMenu(btnId, menuId, { closeOnButtonClick = true } = {}) {
  const btn = document.getElementById(btnId);
  const menu = document.getElementById(menuId);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = menu.classList.contains('hidden');
    document.querySelectorAll('.dropdown-menu').forEach(m => {
      if (m !== menu) m.classList.add('hidden');
    });
    menu.classList.toggle('hidden', !willOpen);
    btn.setAttribute('aria-expanded', String(willOpen));
  });
  document.addEventListener('click', (e) => {
    if (!menu.classList.contains('hidden') && !menu.contains(e.target) && e.target !== btn) {
      menu.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
  if (closeOnButtonClick) {
    menu.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') menu.classList.add('hidden');
    });
  }
}

setupMenu('moreMenuBtn', 'moreMenu');
setupMenu('filterMenuBtn', 'filterMenu', { closeOnButtonClick: false });
setupMenu('notifBtn', 'notifMenu');
