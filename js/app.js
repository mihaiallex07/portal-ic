// ============================================================
// App.js — Portal Inginerie Creativă
// Orchestrator principal: auth, routing, sidebar, UI
// NOTE: getTodayStr, getDateStr, formatDate, timeAgo, updateNotifBadge
//       sunt definite în data.js / notificari.js — nu le redefinim aici
// ============================================================

// ── ROUTES ──────────────────────────────────────────────────
const ROUTES = {
  'dashboard':         { label: 'Tablou de bord',       module: () => Dashboard.render() },
  'stiri':             { label: 'Știri & Anunțuri',      module: () => Stiri.render() },
  'time-tracking':     { label: 'Time-Tracking',         module: () => TimeTracking.render() },
  'process-overview':  { label: 'Process Overview',      module: () => ProcessOverview.render() },
  'proiecte':          { label: 'Proiecte',              module: () => Proiecte.render() },
  'formulare':         { label: 'Formulare & Cereri',    module: () => Formulare.render() },
  'task-manager':      { label: 'Task Manager',            module: () => TaskManager.render() },
  'viziune':           { label: 'Viziune & Valori',      module: () => Viziune.render() },
  'regulament':        { label: 'Ghid Intern',            module: () => Regulament.render() },
  'procese-proceduri': { label: 'Procese & Proceduri',   module: () => Procese.render() },
  'biblioteca':        { label: 'Bibliotecă tehnică',    module: () => Biblioteca.render() },
  'organigrama':       { label: 'Organigramă',           module: () => Organigrama.render() },
  'echipa':             { label: 'Echipa',                 module: () => Echipa.render() },
  'documente':         { label: 'Documentele mele',      module: () => DocumenteMele.render() },
  'propuneri':         { label: 'Propunerile mele',      module: () => Propuneri.render() },
  'notificari':        { label: 'Notificări',            module: () => Notificari.render() },
  'profil':            { label: 'Profilul meu',          module: () => Profil.render() },
  'admin-utilizatori': { label: 'Utilizatori',           module: () => Admin.render(), adminOnly: true },
  'evenimente':        { label: 'Evenimente Firmă',      module: () => Evenimente.render() },
  'backup':            { label: 'Backup Date',           module: () => Backup.render(), adminOnly: true },
};

let currentRoute = 'dashboard';
let sidebarCollapsed = false;
let authSessionPromise = null;
let authSessionUserId = null;

// Afișările existente care nu indică explicit o localizare adoptă implicit ro-RO.
if (!window.__icRomanianDateLocaleApplied) {
  const nativeToLocaleDateString = Date.prototype.toLocaleDateString;
  Date.prototype.toLocaleDateString = function(locales, options) {
    return nativeToLocaleDateString.call(this, locales || 'ro-RO', options);
  };
  window.__icRomanianDateLocaleApplied = true;
}

// ── DATE ROMÂNEȘTI ────────────────────────────────────────────
// Formularele portalului salvează date ISO (YYYY-MM-DD), dar le afișează și
// permit introducerea lor în formatul unitar DD/MM/YYYY, independent de limba browserului.
const RomanianDateFields = {
  sequence: 0,

  format(isoDate) {
    const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
  },

  parse(value) {
    const match = String(value || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    const [, day, month, year] = match;
    const candidate = `${year}-${month}-${day}`;
    const date = new Date(`${candidate}T12:00:00`);
    return !Number.isNaN(date.getTime()) && date.getFullYear() === Number(year) && date.getMonth() + 1 === Number(month) && date.getDate() === Number(day)
      ? candidate
      : null;
  },

  enhance(input) {
    if (!input || input.dataset.roDateEnhanced === 'true') return;
    input.dataset.roDateEnhanced = 'true';

    const originalId = input.id || `ro-date-field-${++this.sequence}`;
    if (!input.id) input.id = originalId;
    const display = input.cloneNode(false);
    display.type = 'text';
    display.id = `${originalId}-display`;
    display.name = '';
    display.required = false;
    display.autocomplete = 'off';
    display.inputMode = 'numeric';
    display.placeholder = 'DD/MM/YYYY';
    display.value = this.format(input.value);
    display.removeAttribute('min');
    display.removeAttribute('max');
    display.removeAttribute('onchange');
    display.removeAttribute('oninput');
    display.setAttribute('aria-label', input.getAttribute('aria-label') || 'Dată în format zi/lună/an');

    document.querySelectorAll(`label[for="${CSS.escape(originalId)}"]`).forEach(label => {
      label.htmlFor = display.id;
    });

    const wrapper = document.createElement('span');
    wrapper.className = 'ro-date-field';
    wrapper.style.cssText = 'position:relative;display:block;width:100%';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    wrapper.appendChild(display);

    const picker = document.createElement('button');
    picker.type = 'button';
    picker.title = 'Alege data';
    picker.setAttribute('aria-label', 'Alege data din calendar');
    picker.textContent = '▣';
    picker.style.cssText = 'position:absolute;right:10px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:var(--text-muted);font-size:15px;line-height:1;cursor:pointer;padding:3px 4px;z-index:2';
    wrapper.appendChild(picker);

    input.style.cssText += ';position:absolute !important;opacity:0 !important;pointer-events:none !important;width:1px !important;height:1px !important;inset:0 auto auto 0 !important';
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');

    const syncDisplay = () => { display.value = this.format(input.value); };
    input.addEventListener('change', syncDisplay);
    picker.addEventListener('click', () => {
      if (input.disabled) return;
      if (typeof input.showPicker === 'function') input.showPicker();
      else input.focus();
    });
    display.addEventListener('blur', () => {
      const isoDate = this.parse(display.value);
      if (!display.value.trim()) {
        input.value = '';
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      if (!isoDate) {
        display.value = this.format(input.value);
        display.setCustomValidity('Folosește formatul DD/MM/YYYY.');
        display.reportValidity();
        display.setCustomValidity('');
        return;
      }
      input.value = isoDate;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      syncDisplay();
    });
    display.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); display.blur(); }
    });
  },

  scan(root = document) {
    const fields = [];
    if (root instanceof HTMLInputElement && root.type === 'date') fields.push(root);
    if (root.querySelectorAll) fields.push(...root.querySelectorAll('input[type="date"]'));
    fields.forEach(input => this.enhance(input));
  },

  start() {
    document.documentElement.lang = 'ro-RO';
    this.scan();
    new MutationObserver(records => {
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) this.scan(node);
      }));
    }).observe(document.body, { childList: true, subtree: true });
  },
};

function getOAuthErrorFromUrl() {
  const sources = [window.location.search, window.location.hash].filter(Boolean);
  for (const source of sources) {
    const query = new URLSearchParams(source.replace(/^#/, '?'));
    const error = query.get('error_description') || query.get('error');
    if (error) {
      try { return decodeURIComponent(error.replace(/\+/g, ' ')); }
      catch (e) { return error; }
    }
  }
  return null;
}

function clearOAuthUrl() {
  // Erorile OAuth sunt în fragmentul/hash-ul redirectului; nu păstrăm tokenul
  // sau parametrii de eroare în bara de adresă după ce i-am citit.
  window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);
}

async function processAuthSession(session, sb) {
  if (!session?.user) return false;
  const user = session.user;
  if (authSessionPromise && authSessionUserId === user.id) return authSessionPromise;
  if (authSessionUserId === user.id && Auth.currentProfile && !Auth._accessDenied) {
    showApp(user, Auth.currentProfile);
    return true;
  }

  authSessionUserId = user.id;
  authSessionPromise = (async () => {
    Auth.currentUser = user;
    Auth._accessDenied = false;
    await Auth.loadProfile(user.id);
    // SECURITATE: dacă profilul e null după loadProfile, emailul nu este autorizat
    if (!Auth.currentProfile || Auth._accessDenied) {
      Auth._accessDenied = false;
      await sb.auth.signOut();
      showLogin('⛔ Acces neautorizat. Adresa de email <strong>' + (user.email || '') + '</strong> nu este înregistrată în sistem. Contactează administratorul.');
      return false;
    }
    showApp(user, Auth.currentProfile);
    return true;
  })();

  try {
    return await authSessionPromise;
  } finally {
    authSessionPromise = null;
  }
}

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  RomanianDateFields.start();
  initSupabase();
  const sb = getSupabase();
  const oauthError = getOAuthErrorFromUrl();
  if (oauthError) {
    clearOAuthUrl();
    showLogin('⛔ Autentificarea Google a eșuat: <strong>' + oauthError + '</strong>');
  }

  // Listenerul trebuie instalat înainte de getSession(): callback-ul OAuth poate
  // emite INITIAL_SESSION/SIGNED_IN imediat după încărcarea paginii.
  if (sb) {
    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        authSessionUserId = null;
        authSessionPromise = null;
        Auth.currentUser = null;
        Auth.currentProfile = null;
        showLogin();
        return;
      }
      if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        // Nu așteptăm direct în callback-ul Supabase; evităm blocarea lock-ului Auth.
        setTimeout(() => processAuthSession(session, sb), 0);
      } else if (event === 'INITIAL_SESSION' && !session?.user && !oauthError) {
        showLogin();
      }
    });
  }

  const profile = await Auth.init();
  if (profile) {
    authSessionUserId = Auth.currentUser?.id || authSessionUserId;
    showApp(Auth.currentUser, profile);
  } else if (!APP_CONFIG.demoMode && !oauthError) {
    const { data: { session } = {} } = sb ? await sb.auth.getSession() : { data: {} };
    // Dacă există o sesiune, listenerul de mai sus procesează profilul; nu
    // afișăm loginul intermitent peste redirectul Google.
    if (!session?.user) showLogin();
  }
});

// ── SHOW APP ──────────────────────────────────────────────────
function showApp(user, profile) {
  document.getElementById('auth-page').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.body.classList.remove('auth-bg');
  document.body.style.cssText = 'margin:0;padding:0;overflow:hidden;width:100%;height:100%';

  // Update topbar avatar initials
  const topbarAvatar = document.getElementById('topbar-avatar');
  if (topbarAvatar) topbarAvatar.textContent = Auth.getInitials(profile?.full_name);

  // Update sidebar user block
  updateSidebarUser();

  // Show/hide admin section
  const adminSection = document.getElementById('admin-section');
  if (adminSection) adminSection.style.display = Auth.isAdmin() ? 'block' : 'none';

  // Update notification badge (defined in notificari.js)
  if (typeof updateNotifBadge === 'function') updateNotifBadge();

  // Validare timer după login (verifică că timer-ul aparține utilizatorului curent)
  if (typeof _timerValidateUser === 'function') _timerValidateUser();

  // COLABORATOR EXTERN: acces limitat — vede DOAR pagina Proiecte
  const isExternColaborator = profile?.role === 'colaborator_extern';
  if (isExternColaborator) {
    // Ascunde sidebar-ul complet
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.style.display = 'none';
    const mainWrapper = document.getElementById('main-wrapper');
    if (mainWrapper) mainWrapper.style.marginLeft = '0';
    // Ascunde timer, notificări din topbar
    document.querySelectorAll('#timer-widget, #notif-btn').forEach(el => { if(el) el.style.display='none'; });
    // Arată butonul de logout din topbar
    const logoutExt = document.getElementById('topbar-logout-ext');
    if (logoutExt) logoutExt.style.display = 'flex';
    // Navighează direct la proiecte şi blochează orice altă rută
    navigate('proiecte', null);
    window.addEventListener('hashchange', () => {
      const h = window.location.hash.replace('#/', '');
      if (h !== 'proiecte') { navigate('proiecte', null, false); }
    });
    return;
  }

  // Fix routing: citeşte ruta din hash SAU din localStorage (fallback robust)
  const hash = window.location.hash.replace('#/', '').replace('#', '');
  const savedRoute = (() => { try { return localStorage.getItem('ic_last_route'); } catch(e) { return null; } })();
  const route = ROUTES[hash] ? hash : (ROUTES[savedRoute] ? savedRoute : 'dashboard');
  // Dacă era un proiect deschis, navighează la proiecte şi redeschide proiectul
  const savedProjectId = localStorage.getItem('ic_last_project_id');
  if (savedProjectId && route === 'proiecte') {
    navigate('proiecte', null).then(() => {
      setTimeout(() => {
        if (window.Proiecte && Proiecte.projects && Proiecte.projects.length > 0) {
          Proiecte.openProject(parseInt(savedProjectId));
        }
      }, 600);
    });
  } else {
    // Navighează la pagina din hash (sau dashboard dacă hash-ul e gol)
    navigate(route, null);
  }

  window.addEventListener('hashchange', () => {
    const h = window.location.hash.replace('#/', '');
    if (ROUTES[h]) navigate(h, null, true);
  });
}

// ── SHOW LOGIN ────────────────────────────────────────────────
function showLogin(errorMsg) {
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-page').style.display = 'flex';
  document.body.classList.add('auth-bg');
  document.body.style.cssText = '';
  const emailEl = document.getElementById('login-email');
  const passEl = document.getElementById('login-password');
  if (emailEl) emailEl.value = '';
  if (passEl) passEl.value = '';
  // Resetează erorile
  ['login-error', 'register-error'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.textContent = ''; }
  });
  // Afişează mesajul de eroare dacă există
  if (errorMsg) {
    const errEl = document.getElementById('login-error');
    if (errEl) {
      errEl.innerHTML = errorMsg;
      errEl.style.display = 'block';
    }
  }
}

// ── NAVIGATION ────────────────────────────────────────────────
async function navigate(route, linkEl, fromHash = false) {
  if (!ROUTES[route]) return;
  currentRoute = route;

  // Fix routing: salvează ruta curentă în localStorage (fallback pentru refresh)
  try { localStorage.setItem('ic_last_route', route); } catch(e) {}

  if (!fromHash) window.location.hash = '/' + route;

  // Active state in sidebar
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === route);
  });

  // Page title
  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = ROUTES[route].label;

  // Show loading
  setPageLoading(true);

  try {
    await ROUTES[route].module();
  } catch (err) {
    console.error('[Navigate] Error:', err);
    document.getElementById('page-content').innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:300px">
        <div style="text-align:center">
          <div style="font-size:40px;margin-bottom:12px">⚠️</div>
          <div style="font-size:16px;font-weight:700;margin-bottom:6px">Eroare la încărcare</div>
          <div style="font-size:13px;color:var(--text-muted)">${err.message || 'Eroare necunoscută'}</div>
          <button class="btn-primary" style="margin-top:16px" onclick="navigate('${route}', null)">Reîncearcă</button>
        </div>
      </div>
    `;
  }

  // Close mobile sidebar
  if (window.innerWidth < 768) {
    document.getElementById('sidebar')?.classList.remove('mobile-open');
  }
}

// Deschidere directă a unui proiect din modulele care îl referă.
// Așteaptă randarea paginii Proiecte înainte de deschiderea detaliului, fără setTimeout fragil.
async function openProjectDirect(projectId) {
  const id = Number(projectId);
  if (!Number.isFinite(id)) return;
  try { localStorage.setItem('ic_last_project_id', String(id)); } catch (_) {}
  await navigate('proiecte', null);
  if (typeof Proiecte !== 'undefined' && typeof Proiecte.openProject === 'function') {
    await Proiecte.openProject(id);
  }
}
window.openProjectDirect = openProjectDirect;

// Deschide Task Manager direct în tabul cerut. Starea se setează înainte de
// randare, astfel încât pagina nu mai afișează pentru scurt timp tabul implicit.
async function openTaskManagerTab(tab) {
  const allowedTabs = new Set(['reports', 'hours-admin']);
  if (!allowedTabs.has(tab) || typeof TaskManager === 'undefined') return;
  if (tab === 'hours-admin' && !['admin', 'coordonator'].includes(Auth.currentProfile?.role)) return;
  TaskManager.activeTab = tab;
  await navigate('task-manager', null);
}
window.openTaskManagerTab = openTaskManagerTab;

// ── SIDEBAR ───────────────────────────────────────────────────
function updateSidebarUser() {
  const profile = Auth.currentProfile;
  if (!profile) return;
  const avatarEl = document.getElementById('sidebar-avatar');
  const nameEl = document.getElementById('sidebar-name');
  const roleEl = document.getElementById('sidebar-role');
  if (avatarEl) avatarEl.textContent = Auth.getInitials(profile.full_name);
  if (nameEl) nameEl.textContent = profile.full_name || 'Utilizator';
  if (roleEl) {
    const roleMap = { admin: 'Administrator', angajat: 'Angajat' };
    roleEl.textContent = roleMap[profile.role] || profile.role || 'Angajat';
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const mainWrapper = document.getElementById('main-wrapper');
  if (!sidebar) return;
  sidebarCollapsed = !sidebarCollapsed;
  sidebar.classList.toggle('collapsed', sidebarCollapsed);
  if (mainWrapper) mainWrapper.classList.toggle('sidebar-collapsed', sidebarCollapsed);
  const toggleBtn = document.getElementById('sidebar-toggle');
  if (toggleBtn) {
    toggleBtn.innerHTML = sidebarCollapsed
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>`
      : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>`;
  }
}

function toggleMobileSidebar() {
  document.getElementById('sidebar')?.classList.toggle('mobile-open');
}

// ── AUTH FORM HANDLERS ────────────────────────────────────────
function switchTab(tab) {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  if (tab === 'login') {
    if (loginForm) loginForm.style.display = 'block';
    if (registerForm) registerForm.style.display = 'none';
    if (tabLogin) tabLogin.classList.add('active');
    if (tabRegister) tabRegister.classList.remove('active');
  } else {
    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = 'block';
    if (tabLogin) tabLogin.classList.remove('active');
    if (tabRegister) tabRegister.classList.add('active');
  }
  ['login-error', 'register-error'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.textContent = ''; }
  });
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');
  const btnText = btn?.querySelector('.btn-text');
  const btnSpinner = btn?.querySelector('.btn-spinner');

  if (!email || !password) { showAuthError('login-error', 'Completează email și parola.'); return; }

  if (btn) btn.disabled = true;
  if (btnText) btnText.style.display = 'none';
  if (btnSpinner) btnSpinner.style.display = 'inline';

  const result = await Auth.loginWithEmail(email, password);

  if (btn) btn.disabled = false;
  if (btnText) btnText.style.display = 'inline';
  if (btnSpinner) btnSpinner.style.display = 'none';

  if (result.error) {
    showAuthError('login-error', result.error);
  } else {
    showApp(Auth.currentUser, Auth.currentProfile);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const btn = document.getElementById('register-btn');
  const btnText = btn?.querySelector('.btn-text');
  const btnSpinner = btn?.querySelector('.btn-spinner');

  if (!name || !email || !password) { showAuthError('register-error', 'Completează toate câmpurile.'); return; }

  if (btn) btn.disabled = true;
  if (btnText) btnText.style.display = 'none';
  if (btnSpinner) btnSpinner.style.display = 'inline';

  const result = await Auth.registerWithEmail(email, password, name);

  if (btn) btn.disabled = false;
  if (btnText) btnText.style.display = 'inline';
  if (btnSpinner) btnSpinner.style.display = 'none';

  if (result.error) {
    showAuthError('register-error', result.error);
  } else if (result.needsConfirmation) {
    const el = document.getElementById('register-error');
    if (el) { el.style.display = 'block'; el.style.color = 'var(--success)'; el.textContent = '✅ Cont creat! Verifică email-ul pentru confirmare.'; }
  } else {
    showApp(Auth.currentUser, Auth.currentProfile);
  }
}

async function handleGoogleLogin() {
  const result = await Auth.loginWithGoogle();
  if (result?.error) {
    showAuthError('login-error', result.error);
  } else if (APP_CONFIG.demoMode) {
    showApp(Auth.currentUser, Auth.currentProfile);
  }
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  if (!email) { showAuthError('login-error', 'Introdu email-ul pentru resetare parolă.'); return; }
  const result = await Auth.forgotPassword(email);
  const errEl = document.getElementById('login-error');
  if (result.error) {
    showAuthError('login-error', result.error);
  } else if (errEl) {
    errEl.style.display = 'block';
    errEl.style.color = 'var(--success)';
    errEl.textContent = APP_CONFIG.demoMode
      ? '(Demo) Email de resetare simulat trimis.'
      : 'Email de resetare trimis. Verifică inbox-ul.';
  }
}

async function handleLogout() {
  await Auth.logout();
  showLogin();
}

function showAuthError(elId, message) {
  const el = document.getElementById(elId);
  if (el) { el.style.display = 'block'; el.style.color = ''; el.textContent = message; }
}

// ── GLOBAL TIMER (shared between Proiecte and TimeTracking) ───
// Persistat în localStorage pentru a supraviețui refresh-ului
const TIMER_LS_KEY = 'ic_timer_state';

function _timerSave() {
  try {
    localStorage.setItem(TIMER_LS_KEY, JSON.stringify({
      active: window.activeTimerData || null,
      paused: window.pausedTimerData || null
    }));
  } catch(e) {}
}

function _timerLoad() {
  try {
    const raw = localStorage.getItem(TIMER_LS_KEY);
    if (!raw) return;
    const state = JSON.parse(raw);
    const active = state.active || null;
    const paused = state.paused || null;
    // Validare: timer-ul nu trebuie să fie mai vechi de 24h
    const now = Date.now();
    const MAX_AGE = 24 * 60 * 60 * 1000;
    if (active && (now - active.startTime) > MAX_AGE) {
      localStorage.removeItem(TIMER_LS_KEY);
      return;
    }
    if (paused && (now - paused.startTime) > MAX_AGE) {
      localStorage.removeItem(TIMER_LS_KEY);
      return;
    }
    // Validare userId: timer-ul trebuie să aparțină utilizatorului curent
    // Auth.currentUser poate să nu fie încă disponibil la load, deci validăm lazy
    window.activeTimerData = active;
    window.pausedTimerData = paused;
    window._timerPendingUserCheck = true; // flag pentru validare lazy după login
  } catch(e) {}
}

// Apelat după login pentru a valida că timer-ul aparține utilizatorului curent
function _timerValidateUser() {
  if (!window._timerPendingUserCheck) return;
  window._timerPendingUserCheck = false;
  const currentUserId = Auth?.currentUser?.id;
  if (!currentUserId) return;
  const active = window.activeTimerData;
  const paused = window.pausedTimerData;
  if (active && active.userId && active.userId !== currentUserId) {
    window.activeTimerData = null;
    window.pausedTimerData = null;
    _timerClear();
    return;
  }
  if (paused && paused.userId && paused.userId !== currentUserId) {
    window.activeTimerData = null;
    window.pausedTimerData = null;
    _timerClear();
    return;
  }
  // Dacă timer-ul există și e valid, pornim intervalul
  if (window.activeTimerData && !_globalTimerInterval) {
    startGlobalTimer();
  }
}

function _timerClear() {
  try { localStorage.removeItem(TIMER_LS_KEY); } catch(e) {}
}

window.activeTimerData = null;
window.pausedTimerData = null;
let _globalTimerInterval = null;

// Restaurează starea la încărcarea paginii
_timerLoad();

function startGlobalTimer() {
  stopGlobalTimerInterval();
  window._autoStopTriggered = false; // resetează auto-stop la fiecare start nou
  _timerSave();
  _globalTimerInterval = setInterval(updateHeaderTimer, 1000);
  updateHeaderTimer();
}

function stopGlobalTimerInterval() {
  if (_globalTimerInterval) {
    clearInterval(_globalTimerInterval);
    _globalTimerInterval = null;
  }
}

function _fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0');
}

function updateHeaderTimer() {
  const idle = document.getElementById('timer-idle');
  const running = document.getElementById('timer-running');
  const paused = document.getElementById('timer-paused');
  const display = document.getElementById('timer-display');
  const displayPaused = document.getElementById('timer-display-paused');

  if (window.activeTimerData) {
    // RUNNING state
    if (idle) idle.style.display = 'none';
    if (running) running.style.display = 'flex';
    if (paused) paused.style.display = 'none';
    const elapsed = Date.now() - window.activeTimerData.startTime - (window.activeTimerData.pausedMs || 0);
    if (display) display.textContent = _fmtTime(elapsed);
    // Indicator tab browser: ● (verde) + timp + nume task
    const taskName = window.activeTimerData.taskName || 'Task activ';
    const shortName = taskName.length > 22 ? taskName.substring(0, 22) + '…' : taskName;
    document.title = '● ' + _fmtTime(elapsed) + ' — ' + shortName;
    // ── AUTO-STOP după N ore configurabile ──────────────────────
    const _autoStopH = Auth.currentProfile?.timer_auto_stop_hours;
    if (_autoStopH && _autoStopH > 0) {
      const _limitMs = _autoStopH * 3600 * 1000;
      if (elapsed >= _limitMs && !window._autoStopTriggered) {
        window._autoStopTriggered = true;
        showToast('⏹ Timer oprit automat după ' + _autoStopH + 'h. Verifică înregistrarea în Time-Tracking.', 'warning', 8000);
        setTimeout(() => stopActiveTimer(), 100);
      }
    }
  } else if (window.pausedTimerData) {
    // PAUSED state
    if (idle) idle.style.display = 'none';
    if (running) running.style.display = 'none';
    if (paused) paused.style.display = 'flex';
    const elapsed = (window.pausedTimerData.pausedAt || Date.now()) - window.pausedTimerData.startTime - (window.pausedTimerData.pausedMs || 0);
    if (displayPaused) displayPaused.textContent = _fmtTime(elapsed);
    // Indicator tab browser: ⏸ (pauza) + timp + nume task
    const taskNameP = window.pausedTimerData.taskName || 'Task';
    const shortNameP = taskNameP.length > 22 ? taskNameP.substring(0, 22) + '…' : taskNameP;
    document.title = '⏸ ' + _fmtTime(elapsed) + ' — ' + shortNameP;
  } else {
    // IDLE state
    if (idle) idle.style.display = 'flex';
    if (running) running.style.display = 'none';
    if (paused) paused.style.display = 'none';
    // Restaureaza titlul normal
    document.title = 'Inginerie Creativă — Portal Intern';
    stopGlobalTimerInterval();
  }
}

// Pause from header (sau din orice pagina)
function pauseActiveTimer() {
  if (!window.activeTimerData) return;
  // Actualizăm starea local întâi
  window.pausedTimerData = Object.assign({}, window.activeTimerData, { pausedAt: Date.now() });
  window.activeTimerData = null;
  stopGlobalTimerInterval();
  _timerSave();
  updateHeaderTimer();
  // Notificăm modulul Proiecte dacă e activ (pentru a re-randa butoanele din tabel)
  if (typeof Proiecte !== 'undefined' && Proiecte.renderProjectDetail) {
    try { Proiecte.renderProjectDetail(); } catch(e) {}
  }
}

// Resume from header (sau din orice pagina)
function resumeActiveTimer() {
  if (!window.pausedTimerData) return;
  const paused = window.pausedTimerData;
  const additionalPause = Date.now() - (paused.pausedAt || Date.now());
  window.activeTimerData = Object.assign({}, paused, { pausedMs: (paused.pausedMs || 0) + additionalPause });
  delete window.activeTimerData.pausedAt;
  window.pausedTimerData = null;
  _timerSave();
  startGlobalTimer();
  // Notificăm modulul Proiecte dacă e activ
  if (typeof Proiecte !== 'undefined' && Proiecte.renderProjectDetail) {
    try { Proiecte.renderProjectDetail(); } catch(e) {}
  }
}

// Stop from header (sau din orice pagina)
async function stopActiveTimer() {
  const data = window.activeTimerData || window.pausedTimerData;
  if (!data) return;
  // Dacă suntem în pagina Proiecte, delegăm stopTask pentru a salva time_entry
  if (typeof Proiecte !== 'undefined' && Proiecte.stopTask) {
    await Proiecte.stopTask(data.taskId);
    // Fallback: dacă stopTask nu a curatat starea (ex: taskId nepotrivit), curatăm noi
    if (window.activeTimerData || window.pausedTimerData) {
      window.activeTimerData = null;
      window.pausedTimerData = null;
      _timerClear();
      updateHeaderTimer();
    }
  } else {
    // Stop din altă pagină — salvăm direct via TimeTracking.saveFromTimer
    stopGlobalTimerInterval();
    const elapsed = Date.now() - data.startTime - (data.pausedMs || 0);
    const minutes = Math.max(1, Math.round(elapsed / 60000));

    if (typeof TimeTracking !== 'undefined' && TimeTracking.saveFromTimer) {
      const result = await TimeTracking.saveFromTimer(data, minutes);
      if (result && result.error) {
        showToast('Eroare la salvare: ' + result.error.message, 'error');
      } else {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        showToast('⏹ Task oprit. ' + (h > 0 ? h + 'h ' : '') + m + 'm înregistrate în Time-Tracking.', 'success');
      }
    }

    window.activeTimerData = null;
    window.pausedTimerData = null;
    _timerClear();
    updateHeaderTimer();
  }
}

// Quick start modal - start rapid task din header
// 3 dropdown-uri: Proiect → Etapă → Task (filtrate strict după arondare)
function openQuickStartModal() {
  let projects = [];
  if (typeof TimeTracking !== 'undefined' && TimeTracking.projects?.length) {
    projects = TimeTracking.projects;
  } else if (typeof Proiecte !== 'undefined' && Proiecte.projects?.length) {
    const userId = String(Auth.currentUser?.id || '');
    const myProjectIds = new Set(
      (Proiecte.members || []).filter(m => String(m.user_id) === userId).map(m => m.project_id)
    );
    projects = Proiecte.projects.filter(p => p.status === 'activ' && myProjectIds.has(p.id));
  }
  const projectOptions = projects.map(p => `<option value="${p.id}">${p.emoji || ''} ${p.name}</option>`).join('');
  openModal('▶ Start rapid task', `
    <div class="space-y-3">
      <div>
        <label class="label">Proiect *</label>
        <select id="qs-project" class="select" onchange="quickStartLoadPhases(this.value)">
          <option value="">— Selectează proiect —</option>
          ${projectOptions}
        </select>
      </div>
      <div>
        <label class="label">Etapă</label>
        <select id="qs-phase" class="select" onchange="quickStartLoadTasks(document.getElementById('qs-project').value, this.value)" disabled>
          <option value="">— Selectează mai întâi proiectul —</option>
        </select>
      </div>
      <div>
        <label class="label">Task</label>
        <select id="qs-task" class="select" disabled>
          <option value="">— Selectează mai întâi etapa —</option>
        </select>
      </div>
      <div>
        <label class="label">Sau descrie activitatea liber</label>
        <input type="text" id="qs-desc" class="input" placeholder="Ex: Modelare 3D Draft 1, Ședință client..." />
      </div>
    </div>
  `, `
    <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
    <button class="btn-brand" onclick="quickStartConfirm()">▶ Start</button>
  `);
}

function quickStartLoadPhases(projectId) {
  const phaseSelect = document.getElementById('qs-phase');
  const taskSelect = document.getElementById('qs-task');
  if (!phaseSelect || !taskSelect) return;
  if (!projectId) {
    phaseSelect.innerHTML = '<option value="">— Selectează mai întâi proiectul —</option>';
    phaseSelect.disabled = true;
    taskSelect.innerHTML = '<option value="">— Selectează mai întâi etapa —</option>';
    taskSelect.disabled = true;
    return;
  }
  const pid = parseInt(projectId);
  let phases = [];
  if (typeof TimeTracking !== 'undefined' && TimeTracking.phases?.length) {
    phases = TimeTracking.phases.filter(ph => ph.project_id === pid);
  } else if (typeof Proiecte !== 'undefined' && Proiecte.phases?.length) {
    phases = Proiecte.phases.filter(ph => ph.project_id === pid);
  }
  const userId = Auth.currentUser?.id;
  let myTasks = [];
  if (typeof TimeTracking !== 'undefined' && TimeTracking.tasks?.length) {
    myTasks = TimeTracking.tasks.filter(t => t.project_id === pid);
  } else if (typeof Proiecte !== 'undefined' && Proiecte.tasks?.length) {
    myTasks = Proiecte.tasks.filter(t => t.project_id === pid && t.assigned_user_id === userId);
  }
  const phaseIdsWithTasks = new Set(myTasks.map(t => t.phase_id).filter(Boolean));
  const filteredPhases = phases.filter(ph => phaseIdsWithTasks.has(ph.id));
  const hasTasksWithoutPhase = myTasks.some(t => !t.phase_id);
  phaseSelect.innerHTML = '<option value="">— Toate etapele —</option>' +
    filteredPhases.map(ph => `<option value="${ph.id}">${ph.name}</option>`).join('') +
    (hasTasksWithoutPhase ? '<option value="0">Fără etapă</option>' : '');
  phaseSelect.disabled = false;
  taskSelect.innerHTML = '<option value="">— Selectează etapa —</option>';
  taskSelect.disabled = true;
  if (filteredPhases.length === 1 && !hasTasksWithoutPhase) {
    phaseSelect.value = filteredPhases[0].id;
    quickStartLoadTasks(pid, filteredPhases[0].id);
  } else if (filteredPhases.length === 0 && hasTasksWithoutPhase) {
    phaseSelect.value = '0';
    quickStartLoadTasks(pid, '0');
  } else if (filteredPhases.length === 0 && !hasTasksWithoutPhase) {
    quickStartLoadTasks(pid, '');
  }
}

function quickStartLoadTasks(projectId, phaseId) {
  const taskSelect = document.getElementById('qs-task');
  if (!taskSelect) return;
  const pid = parseInt(projectId);
  const userId = Auth.currentUser?.id;
  let tasks = [];
  if (typeof TimeTracking !== 'undefined' && TimeTracking.tasks?.length) {
    tasks = TimeTracking.tasks.filter(t => t.project_id === pid);
  } else if (typeof Proiecte !== 'undefined' && Proiecte.tasks?.length) {
    tasks = Proiecte.tasks.filter(t => t.project_id === pid && t.assigned_user_id === userId);
  }
  if (phaseId !== '' && phaseId !== undefined && phaseId !== null) {
    const phId = parseInt(phaseId);
    if (phId === 0) tasks = tasks.filter(t => !t.phase_id);
    else if (!isNaN(phId)) tasks = tasks.filter(t => t.phase_id === phId);
  }
  taskSelect.innerHTML = '<option value="">— Selectează task —</option>' +
    tasks.map(t => `<option value="${t.id}" data-name="${(t.name||'').replace(/"/g,'&quot;')}">${t.name}</option>`).join('');
  taskSelect.disabled = tasks.length === 0;
}

function quickStartConfirm() {
  const projectId = parseInt(document.getElementById('qs-project')?.value) || null;
  const taskSelect = document.getElementById('qs-task');
  const taskId = taskSelect?.value ? parseInt(taskSelect.value) : null;
  const taskName = taskId
    ? (taskSelect.options[taskSelect.selectedIndex]?.dataset?.name || taskSelect.options[taskSelect.selectedIndex]?.text || '')
    : (document.getElementById('qs-desc')?.value?.trim() || '');
  if (!taskName) { showToast('Completează task-ul sau descrierea', 'error'); return; }

  closeModalForce();

  if (taskId && typeof Proiecte !== 'undefined' && Proiecte.startTask) {
    // Găsim phase_id din task
    const task = Proiecte.tasks?.find(t => t.id === taskId);
    Proiecte.startTask(taskId, taskName, projectId, task?.phase_id || null);
  } else {
    // Start simplu fără task din proiect
    const now = new Date();
    window.activeTimerData = {
      taskId: null, taskName, projectId,
      userId: Auth?.currentUser?.id || null,
      startTime: Date.now(),
      startHour: now.getHours(),
      startMin: now.getMinutes(),
      pausedMs: 0,
    };
    window.pausedTimerData = null;
    startGlobalTimer();
    showToast('▶ Task pornit: ' + taskName, 'success');
  }
}
