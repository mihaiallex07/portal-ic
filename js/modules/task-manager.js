// task-manager.js — Portal Inginerie Creativă
// Centralizator personal de task-uri: toate sarcinile arondate utilizatorului curent
// Sursa de adevăr: tabela project_tasks (via Proiecte sau query direct)
// ============================================================

const TaskManager = {
  // State
  tasks: [],       // task-urile personale ale utilizatorului curent (cu date îmbogățite)
  projects: [],    // proiectele la care e arondat
  phases: [],      // etapele proiectelor
  members: {},     // { projectId: [...members] } — cache per proiect
  assignments: [], // project_task_assignments pentru userul curent

  filterStatus: 'all',   // 'all' | 'activ' | 'de_facut' | 'finalizat' | 'depasit'
  filterProject: 'all',  // 'all' | projectId
  searchQuery: '',

  // ── RENDER PRINCIPAL ──────────────────────────────────────────
  async render() {
    setPageLoading(true);
    await this.loadData();
    this.renderPage();
    setPageLoading(false);
  },

  // ── ÎNCĂRCARE DATE ────────────────────────────────────────────
  async loadData() {
    const sb = getSupabase();
    if (!sb) return;

    const userId = Auth.currentUser?.id;
    if (!userId) return;

    const isGlobalAdmin = Auth.currentProfile?.role === 'admin';

    try {
      // 1. Proiecte + Memberships în paralel
      // Folosim DB.getProjects() exact ca în proiecte.js (identic cu sursa de adevăr)
      const [allProjectsRes, membershipsRes] = await Promise.all([
        DB.getProjects(),
        dbQuery('project_members', q => q.select('project_id, role').eq('user_id', userId), []),
      ]);

      const allProjects = allProjectsRes.data || [];
      const memberships = membershipsRes.data || [];
      const enrolledIds = new Set(memberships.map(m => String(m.project_id)));
      const coordProjectIds = new Set(memberships.filter(m => m.role === 'coordonator').map(m => String(m.project_id)));

      // Admin global vede TOATE proiectele (identic cu pagina Proiecte)
      // Ceilalți văd doar proiectele din project_members
      if (isGlobalAdmin) {
        this.projects = allProjects;
      } else {
        this.projects = allProjects.filter(p => enrolledIds.has(String(p.id)));
      }

      const projectIds = this.projects.map(p => p.id);

      if (projectIds.length === 0) {
        this.tasks = [];
        this.phases = [];
        this.assignments = [];
        return;
      }

      // 2. Task-uri, etape, assignments în paralel (folosim dbQuery pentru consistenta)
      const [tasksRes, phasesRes, assignRes, membersRes] = await Promise.all([
        dbQuery('project_tasks', q => q
          .select('id, name, project_id, phase_id, assigned_user_id, assigned_users, budget_hours, minutes_worked, status, description, display_order')
          .in('project_id', projectIds)
          .order('display_order'), []),
        dbQuery('project_phases', q => q
          .select('id, name, project_id, code, color, display_order')
          .in('project_id', projectIds)
          .order('display_order'), []),
        dbQuery('project_task_assignments', q => q
          .select('task_id, user_id, start_date, end_date, project_id')
          .eq('user_id', userId)
          .in('project_id', projectIds), []),
        dbQuery('project_members', q => q
          .select('project_id, user_id, role, profiles!project_members_user_id_fkey(id, full_name, employee_code)')
          .in('project_id', projectIds), []),
      ]);

      const allTasks = tasksRes.data || [];
      this.phases = phasesRes.data || [];
      this.assignments = assignRes.data || [];

      // Cache members per proiect
      this.members = {};
      (membersRes.data || []).forEach(m => {
        if (!this.members[m.project_id]) this.members[m.project_id] = [];
        this.members[m.project_id].push(m);
      });

      const userIdStr = String(userId);
      const assignedTaskIds = new Set(this.assignments.map(a => String(a.task_id)));
      // Proiectele pe care userul le coordoneaza (rol coordonator SAU admin global)
      const adminOrCoordProjectIds = new Set([
        ...coordProjectIds,
        ...(isGlobalAdmin ? this.projects.map(p => String(p.id)) : []),
      ]);

      console.log('[TaskManager] userId:', userIdStr, 'isAdmin:', isGlobalAdmin,
        'projects:', this.projects.length, 'allTasks:', allTasks.length,
        'assignments:', this.assignments.length, 'coordProjects:', coordProjectIds.size,
        'adminOrCoordProjects:', adminOrCoordProjectIds.size);

      // Filtrare: task-urile vizibile pentru utilizatorul curent
      // Admin global si coordonatori vad TOATE task-urile din proiectele lor
      // Angajatii vad task-urile alocate explicit lor
      const myTasks = allTasks.filter(t => {
        if (adminOrCoordProjectIds.has(String(t.project_id))) return true;
        if (String(t.assigned_user_id) === userIdStr) return true;
        if (Array.isArray(t.assigned_users) && t.assigned_users.map(String).includes(userIdStr)) return true;
        if (assignedTaskIds.has(String(t.id))) return true;
        return false;
      });

      console.log('[TaskManager] myTasks after filter:', myTasks.length);

      // Îmbogățim fiecare task cu date calculate
      this.tasks = myTasks.map(task => {
        const project = this.projects.find(p => p.id === task.project_id);
        const phase = this.phases.find(ph => ph.id === task.phase_id);
        const workedH = Math.round((task.minutes_worked || 0) / 60 * 10) / 10;
        const budgetH = task.budget_hours || 0;
        const remainH = Math.round(Math.max(0, budgetH - workedH) * 100) / 100;
        const pct = budgetH > 0 ? Math.min(100, Math.round((workedH / budgetH) * 100)) : 0;

        // Perioadă din assignments
        const taskAssigns = this.assignments.filter(a => String(a.task_id) === String(task.id));
        let startDate = null, endDate = null;
        if (taskAssigns.length > 0) {
          const starts = taskAssigns.map(a => a.start_date).filter(Boolean).sort();
          const ends = taskAssigns.map(a => a.end_date).filter(Boolean).sort().reverse();
          startDate = starts[0] || null;
          endDate = ends[0] || null;
        }

        // Status calculat
        let computedStatus = task.status || 'de_facut';
        if (pct >= 100) computedStatus = 'depasit';
        else if (pct > 0 || (window.activeTimerData?.taskId === task.id)) computedStatus = 'activ';

        // Alertă buget
        let budgetAlert = null;
        if (budgetH > 0) {
          if (pct >= 100) budgetAlert = 'exceeded';
          else if (pct >= 90) budgetAlert = 'critical';
          else if (pct >= 75) budgetAlert = 'warning';
          else if (pct >= 50) budgetAlert = 'info';
        }

        return {
          ...task,
          project, phase,
          workedH, budgetH, remainH, pct,
          startDate, endDate,
          computedStatus, budgetAlert,
        };
      });

    } catch(err) {
      console.error('[TaskManager] loadData error:', err);
      this.tasks = [];
    }
  },

  // ── RENDER PAGINA ─────────────────────────────────────────────
  renderPage() {
    const container = document.getElementById('page-content');
    if (!container) return;

    const filtered = this.getFilteredTasks();
    const stats = this.calcStats();

    // Banner debug temporar
    const debugInfo = {
      userId: Auth.currentUser?.id || 'N/A',
      role: Auth.currentProfile?.role || 'N/A',
      projects: this.projects.length,
      tasks: this.tasks.length,
      sbOk: !!getSupabase(),
    };

    container.innerHTML = `
      <div class="tm-wrapper">
        <!-- DEBUG BANNER -->
        <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:10px 16px;margin-bottom:16px;font-size:12px;font-family:monospace">
          <strong>🔍 Debug:</strong>
          userId=${debugInfo.userId} |
          role=${debugInfo.role} |
          projects=${debugInfo.projects} |
          tasks=${debugInfo.tasks} |
          supabase=${debugInfo.sbOk}
          <button onclick="this.parentElement.remove()" style="float:right;border:none;background:none;cursor:pointer">✕</button>
        </div>
        <!-- Header -->
        <div class="tm-header">
          <div>
            <h1 class="tm-title">Task Manager</h1>
            <p class="tm-subtitle">Sarcinile tale arondate din toate proiectele</p>
          </div>
          <button class="btn-secondary tm-refresh-btn" onclick="TaskManager.refresh()" title="Reîncarcă">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Reîncarcă
          </button>
        </div>

        <!-- Stats bar -->
        <div class="tm-stats-bar">
          <div class="tm-stat" onclick="TaskManager.setFilter('status','all')" style="cursor:pointer">
            <span class="tm-stat-value">${stats.total}</span>
            <span class="tm-stat-label">Total sarcini</span>
          </div>
          <div class="tm-stat tm-stat-activ" onclick="TaskManager.setFilter('status','activ')" style="cursor:pointer">
            <span class="tm-stat-value">${stats.activ}</span>
            <span class="tm-stat-label">În lucru</span>
          </div>
          <div class="tm-stat tm-stat-de_facut" onclick="TaskManager.setFilter('status','de_facut')" style="cursor:pointer">
            <span class="tm-stat-value">${stats.de_facut}</span>
            <span class="tm-stat-label">De făcut</span>
          </div>
          <div class="tm-stat tm-stat-depasit" onclick="TaskManager.setFilter('status','depasit')" style="cursor:pointer">
            <span class="tm-stat-value">${stats.depasit}</span>
            <span class="tm-stat-label">Buget depășit</span>
          </div>
          <div class="tm-stat tm-stat-alert" onclick="TaskManager.setFilter('status','alert')" style="cursor:pointer">
            <span class="tm-stat-value">${stats.alert}</span>
            <span class="tm-stat-label">Alertă buget</span>
          </div>
        </div>

        <!-- Filters & Search -->
        <div class="tm-filters">
          <div class="tm-search-wrap">
            <svg class="tm-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="tm-search" class="tm-search-input" placeholder="Caută sarcini..." value="${this.searchQuery}" oninput="TaskManager.onSearch(this.value)">
          </div>
          <div class="tm-filter-group">
            <select class="tm-select" onchange="TaskManager.setFilter('status', this.value)">
              <option value="all" ${this.filterStatus === 'all' ? 'selected' : ''}>Toate statusurile</option>
              <option value="activ" ${this.filterStatus === 'activ' ? 'selected' : ''}>▶ În lucru</option>
              <option value="de_facut" ${this.filterStatus === 'de_facut' ? 'selected' : ''}>○ De făcut</option>
              <option value="depasit" ${this.filterStatus === 'depasit' ? 'selected' : ''}>⚠ Buget depășit</option>
              <option value="alert" ${this.filterStatus === 'alert' ? 'selected' : ''}>🔔 Alertă buget</option>
            </select>
            <select class="tm-select" onchange="TaskManager.setFilter('project', this.value)">
              <option value="all" ${this.filterProject === 'all' ? 'selected' : ''}>Toate proiectele</option>
              ${this.projects.map(p => `<option value="${p.id}" ${String(this.filterProject) === String(p.id) ? 'selected' : ''}>${p.emoji || '📁'} ${p.name}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Task list -->
        <div class="tm-list" id="tm-task-list">
          ${filtered.length === 0
            ? this.renderEmpty()
            : filtered.map(t => this.renderTaskCard(t)).join('')
          }
        </div>
      </div>
    `;

    this.injectStyles();
  },

  // ── FILTRARE ──────────────────────────────────────────────────
  getFilteredTasks() {
    let tasks = [...this.tasks];

    // Filtru status
    if (this.filterStatus !== 'all') {
      if (this.filterStatus === 'alert') {
        tasks = tasks.filter(t => t.budgetAlert && t.budgetAlert !== 'exceeded');
      } else {
        tasks = tasks.filter(t => t.computedStatus === this.filterStatus);
      }
    }

    // Filtru proiect
    if (this.filterProject !== 'all') {
      tasks = tasks.filter(t => String(t.project_id) === String(this.filterProject));
    }

    // Filtru search
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      tasks = tasks.filter(t =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.project?.name || '').toLowerCase().includes(q) ||
        (t.phase?.name || '').toLowerCase().includes(q)
      );
    }

    // Sortare: depasit > activ > alert > de_facut; apoi după % buget desc
    const statusOrder = { depasit: 0, activ: 1, alert: 2, de_facut: 3 };
    tasks.sort((a, b) => {
      const ao = statusOrder[a.computedStatus] ?? 3;
      const bo = statusOrder[b.computedStatus] ?? 3;
      if (ao !== bo) return ao - bo;
      return b.pct - a.pct;
    });

    return tasks;
  },

  calcStats() {
    const total = this.tasks.length;
    const activ = this.tasks.filter(t => t.computedStatus === 'activ').length;
    const de_facut = this.tasks.filter(t => t.computedStatus === 'de_facut').length;
    const depasit = this.tasks.filter(t => t.computedStatus === 'depasit').length;
    const alert = this.tasks.filter(t => t.budgetAlert && t.budgetAlert !== 'exceeded').length;
    return { total, activ, de_facut, depasit, alert };
  },

  // ── RENDER TASK CARD ──────────────────────────────────────────
  renderTaskCard(task) {
    const { project, phase, workedH, budgetH, remainH, pct, budgetAlert, computedStatus, startDate, endDate } = task;

    // Culoare bară progres
    const barColor = pct >= 100 ? '#EF4444' : pct >= 90 ? '#EF4444' : pct >= 75 ? '#F59E0B' : '#10B981';
    const barBg = pct >= 90 ? '#EF444415' : pct >= 75 ? '#F59E0B15' : '#10B98115';

    // Badge status
    const statusBadgeHtml = this.statusBadge(computedStatus);

    // Badge alertă buget
    let alertHtml = '';
    if (budgetAlert === 'exceeded') {
      alertHtml = `<span class="tm-alert-badge tm-alert-exceeded">⚠ Buget depășit</span>`;
    } else if (budgetAlert === 'critical') {
      alertHtml = `<span class="tm-alert-badge tm-alert-critical">🔴 Sub 10% rămas</span>`;
    } else if (budgetAlert === 'warning') {
      alertHtml = `<span class="tm-alert-badge tm-alert-warning">🟡 Sub 25% rămas</span>`;
    } else if (budgetAlert === 'info') {
      alertHtml = `<span class="tm-alert-badge tm-alert-info">🔵 Sub 50% rămas</span>`;
    }

    // Perioadă
    const fmtDate = d => {
      if (!d) return null;
      const dt = new Date(d + 'T00:00:00');
      return dt.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' });
    };
    let periodHtml = '';
    if (startDate || endDate) {
      const s = fmtDate(startDate);
      const e = fmtDate(endDate);
      periodHtml = `<span class="tm-period">📅 ${s || '?'} – ${e || '?'}</span>`;
    }

    // Culoare proiect
    const projColor = project?.color || '#3B82F6';
    const projEmoji = project?.emoji || '📁';

    // Buton timer
    const timerHtml = this.renderTimerBtn(task);

    // Card border color bazat pe alertă
    const cardBorderColor = budgetAlert === 'exceeded' || budgetAlert === 'critical' ? '#EF4444'
      : budgetAlert === 'warning' ? '#F59E0B'
      : computedStatus === 'activ' ? '#10B981'
      : 'var(--border)';

    return `
      <div class="tm-card" id="tm-card-${task.id}" style="border-left: 3px solid ${cardBorderColor}">
        <!-- Card header -->
        <div class="tm-card-header">
          <div class="tm-card-title-row">
            <div class="tm-card-title-wrap">
              <span class="tm-task-name">${task.name}</span>
              ${statusBadgeHtml}
              ${alertHtml}
            </div>
            <div class="tm-card-actions">
              ${timerHtml}
              <button class="tm-goto-btn" onclick="TaskManager.goToProject(${task.project_id})" title="Deschide proiectul">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                Proiect
              </button>
            </div>
          </div>

          <!-- Meta info -->
          <div class="tm-card-meta">
            <span class="tm-project-badge" style="background:${projColor}20;color:${projColor};border:1px solid ${projColor}40">
              ${projEmoji} ${project?.name || 'Proiect'}
            </span>
            ${phase ? `<span class="tm-phase-badge" style="background:${phase.color || '#6B7280'}20;color:${phase.color || '#6B7280'};border:1px solid ${phase.color || '#6B7280'}40">${phase.code ? phase.code + '. ' : ''}${phase.name}</span>` : ''}
            ${periodHtml}
          </div>
        </div>

        <!-- Budget progress -->
        <div class="tm-budget-section">
          <div class="tm-budget-bar-wrap" style="background:${barBg}">
            <div class="tm-budget-bar-fill" style="width:${Math.min(100, pct)}%;background:${barColor}"></div>
          </div>
          <div class="tm-budget-numbers">
            <span class="tm-budget-worked" style="color:${barColor}">${workedH}h lucrate</span>
            <span class="tm-budget-pct" style="color:${barColor};font-weight:700">${pct}%</span>
            <span class="tm-budget-remain" style="color:var(--text-muted)">${budgetH > 0 ? remainH + 'h rămase din ' + budgetH + 'h' : 'Fără buget alocat'}</span>
          </div>
        </div>
      </div>
    `;
  },

  // ── TIMER BUTTON ──────────────────────────────────────────────
  renderTimerBtn(task) {
    const isRunning = window.activeTimerData && window.activeTimerData.taskId === task.id;
    const isPaused = window.pausedTimerData && window.pausedTimerData.taskId === task.id;
    const hasActiveTimer = !!(window.activeTimerData || window.pausedTimerData);

    if (isRunning) {
      return `
        <button class="tm-timer-btn tm-timer-pause" onclick="TaskManager.pauseTask(${task.id})">⏸ Pauză</button>
        <button class="tm-timer-btn tm-timer-stop" onclick="TaskManager.stopTask(${task.id})">⏹ Stop</button>
      `;
    }
    if (isPaused) {
      return `
        <button class="tm-timer-btn tm-timer-resume" onclick="TaskManager.resumeTask(${task.id})">▶ Reia</button>
        <button class="tm-timer-btn tm-timer-stop" onclick="TaskManager.stopTask(${task.id})">⏹ Stop</button>
      `;
    }
    if (hasActiveTimer) {
      // Alt task activ — buton dezactivat
      return `<button class="tm-timer-btn tm-timer-start" disabled title="Oprește task-ul activ mai întâi" style="opacity:0.4;cursor:not-allowed">▶ Start</button>`;
    }
    const taskNameEsc = (task.name || '').replace(/'/g, "\\'");
    return `<button class="tm-timer-btn tm-timer-start" onclick="TaskManager.startTask(${task.id},'${taskNameEsc}',${task.project_id},${task.phase_id || 'null'})">▶ Start</button>`;
  },

  // ── TIMER ACTIONS ─────────────────────────────────────────────
  startTask(taskId, taskName, projectId, phaseId) {
    if (window.activeTimerData) {
      showToast('Oprește task-ul activ înainte de a începe altul.', 'warning');
      return;
    }
    const now = new Date();
    window.activeTimerData = {
      taskId, taskName, projectId, phaseId,
      userId: Auth?.currentUser?.id || null,
      startTime: Date.now(),
      startHour: now.getHours(),
      startMin: now.getMinutes(),
      pausedMs: 0,
    };
    window.pausedTimerData = null;
    if (typeof _timerSave === 'function') _timerSave();
    if (typeof startGlobalTimer === 'function') startGlobalTimer();
    showToast('▶ Task pornit: ' + taskName, 'success');
    this.refreshTimerBtns();
  },

  pauseTask(taskId) {
    if (!window.activeTimerData || window.activeTimerData.taskId !== taskId) return;
    window.pausedTimerData = Object.assign({}, window.activeTimerData, { pausedAt: Date.now() });
    window.activeTimerData = null;
    if (typeof stopGlobalTimerInterval === 'function') stopGlobalTimerInterval();
    if (typeof _timerSave === 'function') _timerSave();
    if (typeof updateHeaderTimer === 'function') updateHeaderTimer();
    showToast('⏸ Task în pauză', 'info');
    this.refreshTimerBtns();
  },

  resumeTask(taskId) {
    if (!window.pausedTimerData || window.pausedTimerData.taskId !== taskId) return;
    const paused = window.pausedTimerData;
    const additionalPause = Date.now() - paused.pausedAt;
    window.activeTimerData = Object.assign({}, paused, { pausedMs: (paused.pausedMs || 0) + additionalPause });
    delete window.activeTimerData.pausedAt;
    window.pausedTimerData = null;
    if (typeof _timerSave === 'function') _timerSave();
    if (typeof startGlobalTimer === 'function') startGlobalTimer();
    if (typeof updateHeaderTimer === 'function') updateHeaderTimer();
    showToast('▶ Task reluat', 'success');
    this.refreshTimerBtns();
  },

  async stopTask(taskId) {
    const timerData = (window.activeTimerData && window.activeTimerData.taskId === taskId) ? window.activeTimerData
                    : (window.pausedTimerData && window.pausedTimerData.taskId === taskId) ? window.pausedTimerData
                    : null;
    if (!timerData) return;

    if (typeof stopGlobalTimerInterval === 'function') stopGlobalTimerInterval();
    window.activeTimerData = null;
    window.pausedTimerData = null;

    const elapsed = Date.now() - timerData.startTime - (timerData.pausedMs || 0);
    const minutes = Math.max(1, Math.round(elapsed / 60000));

    // Salvăm în time_entries via TimeTracking.saveFromTimer
    if (typeof TimeTracking !== 'undefined' && TimeTracking.saveFromTimer) {
      const result = await TimeTracking.saveFromTimer(timerData, minutes);
      if (result && result.error) {
        showToast('Eroare la salvarea timpului: ' + result.error.message, 'error');
      } else {
        // Actualizează minutes_worked pe task local și în DB
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
          const sb = getSupabase();
          if (sb) {
            const newMinutes = (task.minutes_worked || 0) + minutes;
            await sb.from('project_tasks').update({ minutes_worked: newMinutes }).eq('id', taskId);
            task.minutes_worked = newMinutes;
            // Recalculăm datele task-ului
            task.workedH = Math.round(newMinutes / 60 * 10) / 10;
            task.pct = task.budgetH > 0 ? Math.min(100, Math.round((task.workedH / task.budgetH) * 100)) : 0;
            task.remainH = Math.round(Math.max(0, task.budgetH - task.workedH) * 100) / 100;
            // Update alertă
            if (task.budgetH > 0) {
              if (task.pct >= 100) task.budgetAlert = 'exceeded';
              else if (task.pct >= 90) task.budgetAlert = 'critical';
              else if (task.pct >= 75) task.budgetAlert = 'warning';
              else if (task.pct >= 50) task.budgetAlert = 'info';
              else task.budgetAlert = null;
            }
          }
        }
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        showToast('⏹ Task oprit. ' + (h > 0 ? h + 'h ' : '') + m + 'm înregistrate.', 'success');
      }
    } else {
      showToast('⏹ Task oprit (' + minutes + 'm)', 'success');
    }

    if (typeof _timerClear === 'function') _timerClear();
    if (typeof updateHeaderTimer === 'function') updateHeaderTimer();
    this.refreshTimerBtns();
  },

  // Reîmprospătează doar butoanele timer fără re-render complet
  refreshTimerBtns() {
    this.tasks.forEach(task => {
      const card = document.getElementById('tm-card-' + task.id);
      if (!card) return;
      const actionsDiv = card.querySelector('.tm-card-actions');
      if (!actionsDiv) return;
      // Înlocuim butoanele timer (primele elemente din actions, înainte de butonul Proiect)
      const gotoBtn = actionsDiv.querySelector('.tm-goto-btn');
      const newTimerHtml = this.renderTimerBtn(task);
      // Ștergem butoanele timer existente
      actionsDiv.querySelectorAll('.tm-timer-btn').forEach(b => b.remove());
      // Inserăm noile butoane timer înainte de butonul goto
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = newTimerHtml;
      while (tempDiv.firstChild) {
        actionsDiv.insertBefore(tempDiv.firstChild, gotoBtn);
      }
    });
  },

  // ── NAVIGARE PROIECT ──────────────────────────────────────────
  goToProject(projectId) {
    navigate('proiecte', null);
    setTimeout(() => {
      if (typeof Proiecte !== 'undefined' && Proiecte.openProject) {
        Proiecte.openProject(projectId);
      }
    }, 300);
  },

  // ── FILTRE & SEARCH ───────────────────────────────────────────
  setFilter(type, value) {
    if (type === 'status') this.filterStatus = value;
    if (type === 'project') this.filterProject = value;
    this.renderTaskList();
  },

  onSearch(value) {
    this.searchQuery = value;
    this.renderTaskList();
  },

  renderTaskList() {
    const listEl = document.getElementById('tm-task-list');
    if (!listEl) return;
    const filtered = this.getFilteredTasks();
    listEl.innerHTML = filtered.length === 0
      ? this.renderEmpty()
      : filtered.map(t => this.renderTaskCard(t)).join('');
    // Actualizăm și select-urile pentru a reflecta filtrele curente
    const statusSel = document.querySelector('.tm-select');
    if (statusSel) statusSel.value = this.filterStatus;
    const projSel = document.querySelectorAll('.tm-select')[1];
    if (projSel) projSel.value = this.filterProject;
  },

  renderEmpty() {
    const msg = this.tasks.length === 0
      ? 'Nu ai sarcini arondate momentan.'
      : 'Nicio sarcină nu corespunde filtrelor selectate.';
    return `
      <div style="text-align:center;padding:60px 20px;color:var(--text-muted)">
        <div style="font-size:48px;margin-bottom:12px">✅</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:6px">${msg}</div>
        ${this.tasks.length > 0 ? `<button class="btn-secondary" style="margin-top:12px;font-size:12px" onclick="TaskManager.clearFilters()">Resetează filtrele</button>` : ''}
      </div>
    `;
  },

  clearFilters() {
    this.filterStatus = 'all';
    this.filterProject = 'all';
    this.searchQuery = '';
    this.renderPage();
  },

  async refresh() {
    setPageLoading(true);
    await this.loadData();
    this.renderPage();
    setPageLoading(false);
    showToast('Date reîncărcate ✓', 'success');
  },

  // ── STATUS BADGE ──────────────────────────────────────────────
  statusBadge(status) {
    const map = {
      activ:    { label: '▶ În lucru',   bg: '#10B98120', color: '#10B981', border: '#10B98140' },
      de_facut: { label: '○ De făcut',   bg: '#6B728020', color: '#6B7280', border: '#6B728040' },
      depasit:  { label: '⚠ Depășit',    bg: '#EF444420', color: '#EF4444', border: '#EF444440' },
      finalizat:{ label: '✓ Finalizat',  bg: '#3B82F620', color: '#3B82F6', border: '#3B82F640' },
    };
    const s = map[status] || map['de_facut'];
    return `<span class="tm-status-badge" style="background:${s.bg};color:${s.color};border:1px solid ${s.border}">${s.label}</span>`;
  },

  // ── INJECT STYLES ─────────────────────────────────────────────
  injectStyles() {
    if (document.getElementById('tm-styles')) return;
    const style = document.createElement('style');
    style.id = 'tm-styles';
    style.textContent = `
      /* ── Task Manager Styles ── */
      .tm-wrapper {
        max-width: 900px;
        margin: 0 auto;
        padding: 0 0 40px;
      }
      .tm-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 20px;
        flex-wrap: wrap;
        gap: 12px;
      }
      .tm-title {
        font-size: 22px;
        font-weight: 800;
        color: var(--text);
        margin: 0 0 4px;
        letter-spacing: -0.3px;
      }
      .tm-subtitle {
        font-size: 13px;
        color: var(--text-muted);
        margin: 0;
      }
      .tm-refresh-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        padding: 7px 14px;
        white-space: nowrap;
      }

      /* Stats bar */
      .tm-stats-bar {
        display: flex;
        gap: 12px;
        margin-bottom: 20px;
        flex-wrap: wrap;
      }
      .tm-stat {
        flex: 1;
        min-width: 100px;
        background: var(--bg-secondary);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 12px 16px;
        display: flex;
        flex-direction: column;
        gap: 3px;
        transition: transform 0.15s, box-shadow 0.15s;
      }
      .tm-stat:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      }
      .tm-stat-value {
        font-size: 22px;
        font-weight: 800;
        color: var(--text);
        line-height: 1;
      }
      .tm-stat-label {
        font-size: 11px;
        color: var(--text-muted);
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }
      .tm-stat-activ .tm-stat-value { color: #10B981; }
      .tm-stat-de_facut .tm-stat-value { color: #6B7280; }
      .tm-stat-depasit .tm-stat-value { color: #EF4444; }
      .tm-stat-alert .tm-stat-value { color: #F59E0B; }

      /* Filters */
      .tm-filters {
        display: flex;
        gap: 10px;
        margin-bottom: 16px;
        flex-wrap: wrap;
        align-items: center;
      }
      .tm-search-wrap {
        position: relative;
        flex: 1;
        min-width: 200px;
      }
      .tm-search-icon {
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--text-muted);
        pointer-events: none;
      }
      .tm-search-input {
        width: 100%;
        padding: 8px 12px 8px 34px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--bg);
        color: var(--text);
        font-size: 13px;
        outline: none;
        transition: border-color 0.15s;
        box-sizing: border-box;
      }
      .tm-search-input:focus {
        border-color: var(--primary);
      }
      .tm-filter-group {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .tm-select {
        padding: 8px 12px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--bg);
        color: var(--text);
        font-size: 12px;
        cursor: pointer;
        outline: none;
        transition: border-color 0.15s;
      }
      .tm-select:focus {
        border-color: var(--primary);
      }

      /* Task cards */
      .tm-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .tm-card {
        background: var(--bg-secondary);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 16px 18px;
        transition: box-shadow 0.15s, transform 0.15s;
        animation: tm-card-in 0.2s ease-out;
      }
      @keyframes tm-card-in {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .tm-card:hover {
        box-shadow: 0 4px 16px rgba(0,0,0,0.08);
        transform: translateY(-1px);
      }
      .tm-card-header {
        margin-bottom: 12px;
      }
      .tm-card-title-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
        flex-wrap: wrap;
      }
      .tm-card-title-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        flex: 1;
        min-width: 0;
      }
      .tm-task-name {
        font-size: 14px;
        font-weight: 700;
        color: var(--text);
        line-height: 1.3;
      }
      .tm-status-badge {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 20px;
        white-space: nowrap;
      }
      .tm-alert-badge {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 20px;
        white-space: nowrap;
      }
      .tm-alert-exceeded { background: #EF444420; color: #EF4444; border: 1px solid #EF444440; }
      .tm-alert-critical { background: #EF444415; color: #DC2626; border: 1px solid #EF444430; }
      .tm-alert-warning  { background: #F59E0B15; color: #D97706; border: 1px solid #F59E0B30; }
      .tm-alert-info     { background: #3B82F615; color: #2563EB; border: 1px solid #3B82F630; }

      .tm-card-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
        flex-wrap: wrap;
      }
      .tm-timer-btn {
        font-size: 11px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 6px;
        cursor: pointer;
        border: 1px solid;
        transition: opacity 0.15s, transform 0.1s;
        white-space: nowrap;
      }
      .tm-timer-btn:active { transform: scale(0.96); }
      .tm-timer-start  { background: #3B82F620; border-color: #3B82F6; color: #3B82F6; }
      .tm-timer-pause  { background: #F59E0B20; border-color: #F59E0B; color: #D97706; }
      .tm-timer-resume { background: #10B98120; border-color: #10B981; color: #10B981; }
      .tm-timer-stop   { background: #EF444420; border-color: #EF4444; color: #EF4444; }
      .tm-goto-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 6px;
        cursor: pointer;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--text-muted);
        transition: color 0.15s, border-color 0.15s;
        white-space: nowrap;
      }
      .tm-goto-btn:hover {
        color: var(--primary);
        border-color: var(--primary);
      }

      /* Card meta */
      .tm-card-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .tm-project-badge, .tm-phase-badge {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 6px;
        white-space: nowrap;
      }
      .tm-period {
        font-size: 11px;
        color: var(--text-muted);
        white-space: nowrap;
      }

      /* Budget section */
      .tm-budget-section {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .tm-budget-bar-wrap {
        height: 6px;
        border-radius: 3px;
        overflow: hidden;
        position: relative;
      }
      .tm-budget-bar-fill {
        height: 100%;
        border-radius: 3px;
        transition: width 0.4s ease-out;
      }
      .tm-budget-numbers {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 12px;
        flex-wrap: wrap;
      }
      .tm-budget-worked { font-weight: 600; }
      .tm-budget-pct { font-size: 13px; }
      .tm-budget-remain { margin-left: auto; }

      /* Responsive */
      @media (max-width: 600px) {
        .tm-stats-bar { gap: 8px; }
        .tm-stat { min-width: 80px; padding: 10px 12px; }
        .tm-stat-value { font-size: 18px; }
        .tm-card { padding: 14px 14px; }
        .tm-card-title-row { flex-direction: column; }
        .tm-card-actions { width: 100%; justify-content: flex-start; }
        .tm-budget-remain { margin-left: 0; }
      }
    `;
    document.head.appendChild(style);
  },
};
