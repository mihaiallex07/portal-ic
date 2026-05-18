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
  'formulare':         { label: 'Formulare & Cereri',    module: () => Placeholder.render('Formulare & Cereri', 'Formularele și cererile interne vor fi disponibile în curând.', 'file-text') },
  'viziune':           { label: 'Viziune & Valori',      module: () => Viziune.render() },
  'regulament':        { label: 'Regulament intern',     module: () => Regulament.render() },
  'procese-proceduri': { label: 'Procese & Proceduri',   module: () => ProceseProc.render() },
  'biblioteca':        { label: 'Bibliotecă tehnică',    module: () => Biblioteca.render() },
  'organigrama':       { label: 'Organigramă',           module: () => Organigrama.render() },
  'echipa':             { label: 'Echipa',                 module: () => Echipa.render() },
  'documente':         { label: 'Documentele mele',      module: () => DocumenteMele.render() },
  'propuneri':         { label: 'Propunerile mele',      module: () => Propuneri.render() },
  'notificari':        { label: 'Notificări',            module: () => Notificari.render() },
  'profil':            { label: 'Profilul meu',          module: () => Profil.render() },
  'admin-utilizatori': { label: 'Utilizatori',           module: () => Admin.render(), adminOnly: true },
  'evenimente':        { label: 'Evenimente Firmă',      module: () => Placeholder.render('Evenimente Firmă', 'Calendarul evenimentelor companiei va fi disponibil în curând.', 'calendar') },
};

let currentRoute = 'dashboard';
let sidebarCollapsed = false;

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initSupabase();
  const profile = await Auth.init();

  if (profile) {
    showApp(Auth.currentUser, profile);
  } else if (!APP_CONFIG.demoMode) {
    const sb = getSupabase();
    if (sb) {
      sb.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          Auth.currentUser = session.user;
          await Auth.loadProfile(session.user.id);
          showApp(session.user, Auth.currentProfile);
        } else if (event === 'SIGNED_OUT') {
          Auth.currentUser = null;
          Auth.currentProfile = null;
          showLogin();
        }
      });
    }
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

  // Hash routing
  const hash = window.location.hash.replace('#/', '');
  const route = ROUTES[hash] ? hash : 'dashboard';
  navigate(route, null);

  window.addEventListener('hashchange', () => {
    const h = window.location.hash.replace('#/', '');
    if (ROUTES[h]) navigate(h, null, true);
  });
}

// ── SHOW LOGIN ────────────────────────────────────────────────
function showLogin() {
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-page').style.display = 'flex';
  document.body.classList.add('auth-bg');
  document.body.style.cssText = '';
  const emailEl = document.getElementById('login-email');
  const passEl = document.getElementById('login-password');
  if (emailEl) emailEl.value = '';
  if (passEl) passEl.value = '';
  ['login-error', 'register-error'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'none'; el.textContent = ''; }
  });
}

// ── NAVIGATION ────────────────────────────────────────────────
async function navigate(route, linkEl, fromHash = false) {
  if (!ROUTES[route]) return;
  currentRoute = route;

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
    window.activeTimerData = state.active || null;
    window.pausedTimerData = state.paused || null;
  } catch(e) {}
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
  } else if (window.pausedTimerData) {
    // PAUSED state
    if (idle) idle.style.display = 'none';
    if (running) running.style.display = 'none';
    if (paused) paused.style.display = 'flex';
    const elapsed = (window.pausedTimerData.pausedAt || Date.now()) - window.pausedTimerData.startTime - (window.pausedTimerData.pausedMs || 0);
    if (displayPaused) displayPaused.textContent = _fmtTime(elapsed);
  } else {
    // IDLE state
    if (idle) idle.style.display = 'flex';
    if (running) running.style.display = 'none';
    if (paused) paused.style.display = 'none';
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
    Proiecte.stopTask(data.taskId);
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
function openQuickStartModal() {
  // Colectăm proiectele active disponibile
  const projects = (typeof Proiecte !== 'undefined' && Proiecte.projects) ? Proiecte.projects.filter(p => p.status === 'activ') : [];
  const projectOptions = projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  openModal('Start rapid task', `
    <div class="space-y-3">
      <div>
        <label class="label">Proiect</label>
        <select id="qs-project" class="select" onchange="quickStartLoadTasks(this.value)">
          <option value="">— Selectează proiect —</option>
          ${projectOptions}
        </select>
      </div>
      <div>
        <label class="label">Task</label>
        <select id="qs-task" class="select">
          <option value="">— Selectează task —</option>
        </select>
      </div>
      <div>
        <label class="label">Sau descrie activitatea</label>
        <input type="text" id="qs-desc" class="input" placeholder="Ex: Modelare 3D Draft 1" />
      </div>
    </div>
  `, `
    <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
    <button class="btn-brand" onclick="quickStartConfirm()">▶ Start</button>
  `);
}

function quickStartLoadTasks(projectId) {
  const taskSelect = document.getElementById('qs-task');
  if (!taskSelect) return;
  const pid = parseInt(projectId);
  const profile = Auth.currentProfile;
  const isAdmin = profile?.role === 'admin' || profile?.role === 'coordonator';
  const userId = Auth.currentUser?.id;

  // Sursă de task-uri: preferă TimeTracking.tasks (deja filtrat după utilizator curent)
  // Fallback la Proiecte.tasks cu filtru strict
  let tasks = [];
  if (typeof TimeTracking !== 'undefined' && TimeTracking.tasks?.length) {
    // TimeTracking.tasks este filtrat: admin vede tot, angajat vede doar task-urile lui
    tasks = TimeTracking.tasks.filter(t => t.project_id === pid);
  } else {
    // Fallback: Proiecte.tasks — filtru strict: doar task-urile alocate explicit utilizatorului
    const allTasks = (typeof Proiecte !== 'undefined' && Proiecte.tasks) ? Proiecte.tasks : [];
    tasks = allTasks.filter(t => {
      if (t.project_id !== pid) return false;
      if (isAdmin) return true;
      // Angajat: vede doar task-urile alocate lui explicit
      return t.assigned_user_id === userId;
    });
  }

  taskSelect.innerHTML = '<option value="">— Selectează task —</option>' +
    tasks.map(t => `<option value="${t.id}" data-name="${(t.name||'').replace(/"/g,'&quot;')}">${t.name}</option>`).join('');
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

