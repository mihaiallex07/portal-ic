// ============================================================
// TASK MANAGER — task-manager.js
// Centralizator personal de task-uri + To-Do + Overview admin
// ============================================================
const TaskManager = {
  // State
  tasks: [],        // task-urile personale ale utilizatorului curent (cu date îmbogățite)
  allTasks: [],     // TOATE task-urile din proiecte (pentru tab admin)
  todoTasks: [],    // task-uri To-Do (tabela todo_tasks)
  projects: [],     // proiectele la care e arondat
  phases: [],       // etapele proiectelor
  members: {},      // { projectId: [...members] } — cache per proiect
  allProfiles: [],  // toate profilurile (pentru tab admin)
  assignments: [],  // project_task_assignments pentru userul curent
  allAssignments: [], // toate assignments (pentru tab admin)
  coordProjectIds: new Set(), // proiectele pe care userul le coordonează

  activeTab: 'personal', // 'personal' | 'todo' | 'overview' | 'reports'
  filterStatus: 'all',
  filterProject: 'all',
  searchQuery: '',
  overviewSearch: '',
  overviewFilter: 'all',

  // To-Do state
  todoFilterStatus: 'all',
  todoFilterPriority: 'all',
  todoSearch: '',

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
    const isCoord = Auth.currentProfile?.role === 'coordonator';

    try {
      // 1. Proiecte + Memberships în paralel
      const [allProjectsRes, membershipsRes] = await Promise.all([
        DB.getProjects(),
        dbQuery('project_members', q => q.select('project_id, role').eq('user_id', userId), []),
      ]);

      const allProjects = allProjectsRes.data || [];
      const memberships = membershipsRes.data || [];
      const enrolledIds = new Set(memberships.map(m => String(m.project_id)));
      this.coordProjectIds = new Set(memberships.filter(m => m.role === 'coordonator').map(m => String(m.project_id)));

      if (isGlobalAdmin) {
        this.projects = allProjects;
      } else {
        this.projects = allProjects.filter(p => enrolledIds.has(String(p.id)));
      }

      const projectIds = this.projects.map(p => p.id);

      // 2. Încarcă To-Do tasks (independent de proiecte)
      const todoRes = await dbQuery('todo_tasks', q => {
        if (isGlobalAdmin || isCoord) {
          return q.select('*').order('created_at', { ascending: false });
        } else {
          return q.select('*').eq('assigned_to', userId).order('created_at', { ascending: false });
        }
      }, []);
      this.todoTasks = todoRes.data || [];

      if (projectIds.length === 0) {
        this.tasks = [];
        this.allTasks = [];
        this.phases = [];
        this.assignments = [];
        this.allAssignments = [];
        // Încarcă profiluri pentru admin/coord (necesar pentru To-Do)
        if (isGlobalAdmin || isCoord) {
          const profilesRes = await DB.getUsers();
          this.allProfiles = profilesRes.data || [];
        }
        return;
      }

      // 3. Task-uri, etape, assignments în paralel
      const queries = [
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
          .in('project_id', projectIds), []),
        dbQuery('project_members', q => q
          .select('project_id, user_id, role, profiles!project_members_user_id_fkey(id, full_name, employee_code)')
          .in('project_id', projectIds), []),
      ];

      if (isGlobalAdmin || isCoord) {
        queries.push(DB.getUsers());
      }

      const results = await Promise.all(queries);
      const [tasksRes, phasesRes, assignRes, membersRes, profilesRes] = results;

      const rawTasks = tasksRes.data || [];
      this.phases = phasesRes.data || [];
      this.allAssignments = assignRes.data || [];
      this.allProfiles = (profilesRes?.data || []);

      this.members = {};
      (membersRes.data || []).forEach(m => {
        if (!this.members[m.project_id]) this.members[m.project_id] = [];
        this.members[m.project_id].push(m);
      });

      const userIdStr = String(userId);
      this.assignments = this.allAssignments.filter(a => String(a.user_id) === userIdStr);
      const assignedTaskIds = new Set(this.assignments.map(a => String(a.task_id)));

      const enrichTask = (task) => {
        const project = this.projects.find(p => p.id === task.project_id);
        const phase = this.phases.find(ph => ph.id === task.phase_id);
        const workedH = Math.round((task.minutes_worked || 0) / 60 * 10) / 10;
        const budgetH = task.budget_hours || 0;
        const remainH = Math.round(Math.max(0, budgetH - workedH) * 100) / 100;
        const pct = budgetH > 0 ? Math.min(100, Math.round((workedH / budgetH) * 100)) : 0;

        const taskAssigns = this.allAssignments.filter(a => String(a.task_id) === String(task.id));
        let startDate = null, endDate = null;
        if (taskAssigns.length > 0) {
          const starts = taskAssigns.map(a => a.start_date).filter(Boolean).sort();
          const ends = taskAssigns.map(a => a.end_date).filter(Boolean).sort().reverse();
          startDate = starts[0] || null;
          endDate = ends[0] || null;
        }

        const assignedUsers = taskAssigns.map(a => {
          const profile = this.allProfiles.find(p => String(p.id) === String(a.user_id));
          return profile ? { id: a.user_id, name: profile.full_name || profile.name || 'Necunoscut', code: profile.employee_code } : null;
        }).filter(Boolean);

        const uniqueUsers = [];
        const seenIds = new Set();
        assignedUsers.forEach(u => {
          if (!seenIds.has(u.id)) { seenIds.add(u.id); uniqueUsers.push(u); }
        });

        let computedStatus = task.status || 'de_facut';
        if (pct >= 100) computedStatus = 'depasit';
        else if (pct > 0 || (window.activeTimerData?.taskId === task.id)) computedStatus = 'activ';

        let budgetAlert = null;
        if (budgetH > 0) {
          if (pct >= 100) budgetAlert = 'exceeded';
          else if (pct >= 90) budgetAlert = 'critical';
          else if (pct >= 75) budgetAlert = 'warning';
          else if (pct >= 50) budgetAlert = 'info';
        }

        const isAllocatedToMe =
          String(task.assigned_user_id) === userIdStr ||
          (Array.isArray(task.assigned_users) && task.assigned_users.map(String).includes(userIdStr)) ||
          assignedTaskIds.has(String(task.id));

        return { ...task, project, phase, workedH, budgetH, remainH, pct, startDate, endDate, assignedUsers: uniqueUsers, computedStatus, budgetAlert, isAllocatedToMe };
      };

      this.allTasks = rawTasks.map(enrichTask);

      const myRawTasks = rawTasks.filter(t => {
        if (String(t.assigned_user_id) === userIdStr) return true;
        if (Array.isArray(t.assigned_users) && t.assigned_users.map(String).includes(userIdStr)) return true;
        if (assignedTaskIds.has(String(t.id))) return true;
        return false;
      });

      this.tasks = myRawTasks.map(enrichTask);

    } catch(err) {
      console.error('[TaskManager] loadData error:', err);
      this.tasks = [];
      this.allTasks = [];
      this.todoTasks = [];
    }
  },

  // ── RENDER PAGINA ─────────────────────────────────────────────
  renderPage() {
    const container = document.getElementById('page-content');
    if (!container) return;

    this.injectStyles();

    const isCoord = Auth.currentProfile?.role === 'coordonator';

    container.innerHTML = `
      <div class="tm-wrapper">
        <!-- Header -->
        <div class="tm-header">
          <div>
            <h1 class="tm-title">Task Manager</h1>
            <p class="tm-subtitle">Centralizatorul tău de sarcini</p>
          </div>
          <button class="btn-secondary tm-refresh-btn" onclick="TaskManager.refresh()" title="Reîncarcă">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Reîncarcă
          </button>
        </div>

        <!-- Tabs -->
        <div class="tm-tabs">
          <button class="tm-tab-btn ${this.activeTab === 'personal' ? 'active' : ''}" onclick="TaskManager.setTab('personal')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            Sarcinile mele
          </button>
          <button class="tm-tab-btn ${this.activeTab === 'todo' ? 'active' : ''}" onclick="TaskManager.setTab('todo')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            To-Do
          </button>
          ${isCoord ? `
          <button class="tm-tab-btn ${this.activeTab === 'overview' ? 'active' : ''}" onclick="TaskManager.setTab('overview')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            Overview echipă
          </button>` : ''}
          <button class="tm-tab-btn ${this.activeTab === 'reports' ? 'active' : ''}" onclick="TaskManager.setTab('reports')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v18H3z"/><path d="M9 9h2v6H9z"/><path d="M13 11h2v4h-2z"/><path d="M17 7h2v8h-2z"/></svg>
            Rapoarte
          </button>
        </div>

        <!-- Tab content -->
        <div id="tm-tab-content">
          ${this.renderTabContent()}
        </div>
      </div>
    `;
  },

  renderTabContent() {
    if (this.activeTab === 'personal') return this.renderPersonalTab();
    if (this.activeTab === 'todo') return this.renderTodoTab();
    if (this.activeTab === 'overview') return this.renderOverviewTab();
    if (this.activeTab === 'reports') return this.renderReportsTab();
    return '';
  },

  setTab(tab) {
    this.activeTab = tab;
    const el = document.getElementById('tm-tab-content');
    if (el) {
      el.innerHTML = this.renderTabContent();
      document.querySelectorAll('.tm-tab-btn').forEach(btn => {
        const txt = btn.textContent.trim();
        if (tab === 'personal') btn.classList.toggle('active', txt.includes('mele'));
        else if (tab === 'todo') btn.classList.toggle('active', txt.includes('To-Do'));
        else if (tab === 'overview') btn.classList.toggle('active', txt.includes('echipă'));
        else if (tab === 'reports') btn.classList.toggle('active', txt.includes('Rapoarte'));
        else btn.classList.remove('active');
      });
    }
  },

  // ── TAB PERSONAL ──────────────────────────────────────────────
  renderPersonalTab() {
    const filtered = this.getFilteredTasks();
    const stats = this.calcStats();

    return `
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

      <div class="tm-list" id="tm-task-list">
        ${filtered.length === 0
          ? this.renderEmpty()
          : filtered.map(t => this.renderTaskCard(t)).join('')
        }
      </div>
    `;
  },

  // ── TAB TO-DO ─────────────────────────────────────────────────
  renderTodoTab() {
    const userId = Auth.currentUser?.id;
    const isAdmin = Auth.currentProfile?.role === 'admin';
    const isCoord = Auth.currentProfile?.role === 'coordonator';
    const canAssignOthers = isAdmin || isCoord;

    const filtered = this.getFilteredTodoTasks();
    const total = this.todoTasks.length;
    const todo = this.todoTasks.filter(t => t.status === 'todo').length;
    const inProgress = this.todoTasks.filter(t => t.status === 'in_progress').length;
    const done = this.todoTasks.filter(t => t.status === 'done').length;
    const urgent = this.todoTasks.filter(t => t.priority === 'urgent' && t.status !== 'done').length;

    return `
      <!-- Stats To-Do -->
      <div class="tm-stats-bar">
        <div class="tm-stat" onclick="TaskManager.setTodoFilter('status','all')" style="cursor:pointer">
          <span class="tm-stat-value">${total}</span>
          <span class="tm-stat-label">Total</span>
        </div>
        <div class="tm-stat" onclick="TaskManager.setTodoFilter('status','todo')" style="cursor:pointer">
          <span class="tm-stat-value" style="color:#6B7280">${todo}</span>
          <span class="tm-stat-label">De făcut</span>
        </div>
        <div class="tm-stat tm-stat-activ" onclick="TaskManager.setTodoFilter('status','in_progress')" style="cursor:pointer">
          <span class="tm-stat-value">${inProgress}</span>
          <span class="tm-stat-label">În lucru</span>
        </div>
        <div class="tm-stat" onclick="TaskManager.setTodoFilter('status','done')" style="cursor:pointer">
          <span class="tm-stat-value" style="color:#3B82F6">${done}</span>
          <span class="tm-stat-label">Finalizate</span>
        </div>
        <div class="tm-stat" onclick="TaskManager.setTodoFilter('priority','urgent')" style="cursor:pointer">
          <span class="tm-stat-value" style="color:#EF4444">${urgent}</span>
          <span class="tm-stat-label">Urgente</span>
        </div>
      </div>

      <!-- Filters + Add button -->
      <div class="tm-filters">
        <div class="tm-search-wrap">
          <svg class="tm-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" class="tm-search-input" placeholder="Caută task To-Do..." value="${this.todoSearch}" oninput="TaskManager.onTodoSearch(this.value)">
        </div>
        <div class="tm-filter-group">
          <select class="tm-select" onchange="TaskManager.setTodoFilter('status', this.value)">
            <option value="all" ${this.todoFilterStatus === 'all' ? 'selected' : ''}>Toate statusurile</option>
            <option value="todo" ${this.todoFilterStatus === 'todo' ? 'selected' : ''}>○ De făcut</option>
            <option value="in_progress" ${this.todoFilterStatus === 'in_progress' ? 'selected' : ''}>▶ În lucru</option>
            <option value="done" ${this.todoFilterStatus === 'done' ? 'selected' : ''}>✓ Finalizat</option>
          </select>
          <select class="tm-select" onchange="TaskManager.setTodoFilter('priority', this.value)">
            <option value="all" ${this.todoFilterPriority === 'all' ? 'selected' : ''}>Toate prioritățile</option>
            <option value="urgent" ${this.todoFilterPriority === 'urgent' ? 'selected' : ''}>🔴 Urgent</option>
            <option value="normal" ${this.todoFilterPriority === 'normal' ? 'selected' : ''}>🔵 Normal</option>
            <option value="low" ${this.todoFilterPriority === 'low' ? 'selected' : ''}>⚪ Scăzut</option>
          </select>
        </div>
        <button class="btn-primary" style="font-size:12px;padding:8px 14px;white-space:nowrap" onclick="TaskManager.openTodoModal()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-2px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Task nou
        </button>
      </div>

      <!-- To-Do list -->
      <div class="tm-list" id="tm-todo-list">
        ${filtered.length === 0
          ? `<div style="text-align:center;padding:60px 20px;color:var(--text-muted)">
               <div style="font-size:48px;margin-bottom:12px">✅</div>
               <div style="font-size:15px;font-weight:600;margin-bottom:6px">${this.todoTasks.length === 0 ? 'Nu ai task-uri To-Do.' : 'Niciun task nu corespunde filtrelor.'}</div>
               ${this.todoTasks.length > 0 ? `<button class="btn-secondary" style="margin-top:12px;font-size:12px" onclick="TaskManager.clearTodoFilters()">Resetează filtrele</button>` : ''}
               <div style="margin-top:16px"><button class="btn-primary" style="font-size:12px" onclick="TaskManager.openTodoModal()">+ Adaugă primul task</button></div>
             </div>`
          : filtered.map(t => this.renderTodoCard(t)).join('')
        }
      </div>

      <!-- Modal To-Do (injectat dinamic) -->
      <div id="tm-todo-modal" style="display:none"></div>
    `;
  },

  // ── RENDER CARD TO-DO ─────────────────────────────────────────
  renderTodoCard(task) {
    const userId = Auth.currentUser?.id;
    const isAdmin = Auth.currentProfile?.role === 'admin';
    const isCoord = Auth.currentProfile?.role === 'coordonator';
    const isOwner = String(task.assigned_to) === String(userId) || String(task.created_by) === String(userId);
    const canEdit = isAdmin || isCoord || isOwner;

    const priorityMap = {
      urgent: { label: '🔴 Urgent', bg: '#EF444420', color: '#EF4444', border: '#EF444440' },
      normal: { label: '🔵 Normal', bg: '#3B82F620', color: '#3B82F6', border: '#3B82F640' },
      low:    { label: '⚪ Scăzut', bg: '#6B728020', color: '#6B7280', border: '#6B728040' },
    };
    const statusMap = {
      todo:        { label: '○ De făcut',  bg: '#6B728020', color: '#6B7280', border: '#6B728040' },
      in_progress: { label: '▶ În lucru',  bg: '#10B98120', color: '#10B981', border: '#10B98140' },
      done:        { label: '✓ Finalizat', bg: '#3B82F620', color: '#3B82F6', border: '#3B82F640' },
    };

    const prio = priorityMap[task.priority] || priorityMap.normal;
    const stat = statusMap[task.status] || statusMap.todo;

    const workedH = Math.round((task.minutes_worked || 0) / 60 * 10) / 10;

    const fmtDate = d => {
      if (!d) return null;
      const dt = new Date(d + 'T00:00:00');
      return dt.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const deadlineStr = task.deadline ? fmtDate(task.deadline) : null;
    const isOverdue = task.deadline && task.status !== 'done' && new Date(task.deadline + 'T23:59:59') < new Date();

    // Persoana alocată
    const assignedProfile = this.allProfiles.find(p => String(p.id) === String(task.assigned_to));
    const assignedName = assignedProfile ? (assignedProfile.full_name || assignedProfile.name || 'Necunoscut') : 'Eu';

    // Timer buttons
    const timerHtml = this.renderTodoTimerBtn(task);

    const cardBorderColor = task.priority === 'urgent' && task.status !== 'done' ? '#EF4444'
      : task.status === 'in_progress' ? '#10B981'
      : task.status === 'done' ? '#3B82F6'
      : 'var(--border)';

    const doneStyle = task.status === 'done' ? 'opacity:0.65;' : '';

    return `
      <div class="tm-card tm-todo-card" id="tm-todo-card-${task.id}" style="border-left:3px solid ${cardBorderColor};${doneStyle}">
        <div class="tm-card-header" style="margin-bottom:8px">
          <div class="tm-card-title-row">
            <div class="tm-card-title-wrap">
              <span class="tm-task-name" style="${task.status === 'done' ? 'text-decoration:line-through;color:var(--text-muted)' : ''}">${task.title}</span>
              <span class="tm-status-badge" style="background:${stat.bg};color:${stat.color};border:1px solid ${stat.border}">${stat.label}</span>
              <span class="tm-status-badge" style="background:${prio.bg};color:${prio.color};border:1px solid ${prio.border}">${prio.label}</span>
            </div>
            <div class="tm-card-actions">
              ${timerHtml}
              ${canEdit ? `
              <button class="tm-goto-btn" onclick="TaskManager.openTodoModal(${task.id})" title="Editează">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Editează
              </button>
              ${task.status !== 'done' ? `
              <button class="tm-goto-btn" style="color:#10B981;border-color:#10B98140" onclick="TaskManager.markTodoDone(${task.id})" title="Marchează finalizat">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Done
              </button>` : `
              <button class="tm-goto-btn" onclick="TaskManager.markTodoReopen(${task.id})" title="Redeschide">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>
                Redeschide
              </button>`}
              <button class="tm-goto-btn" style="color:#EF4444;border-color:#EF444440" onclick="TaskManager.deleteTodo(${task.id})" title="Șterge">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              </button>
              ` : ''}
            </div>
          </div>
          ${task.description ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px;line-height:1.5">${task.description}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--text-muted)">
          <span>👤 ${assignedName}</span>
          ${deadlineStr ? `<span style="color:${isOverdue ? '#EF4444' : 'var(--text-muted)'}">📅 ${deadlineStr}${isOverdue ? ' ⚠ Expirat' : ''}</span>` : ''}
          ${workedH > 0 ? `<span>⏱ ${workedH}h lucrate</span>` : ''}
        </div>
      </div>
    `;
  },

  // ── TIMER TO-DO ───────────────────────────────────────────────
  renderTodoTimerBtn(task) {
    if (task.status === 'done') return '';

    const userId = Auth.currentUser?.id;
    // Regula identică cu proiecte.js: doar persoana alocată explicit poate porni timerul
    // Admin/coordonator care nu sunt alocați NU pot porni timerul
    const isAllocatedToMe = String(task.assigned_to) === String(userId);

    if (!isAllocatedToMe) return `<span style="font-size:10px;color:var(--text-muted);padding:4px 8px;font-style:italic">Nealocat</span>`;

    const isRunning = window.activeTimerData && window.activeTimerData.taskId === ('todo_' + task.id);
    const isPaused = window.pausedTimerData && window.pausedTimerData.taskId === ('todo_' + task.id);
    const hasActiveTimer = !!(window.activeTimerData || window.pausedTimerData);

    if (isRunning) {
      return `
        <button class="tm-timer-btn tm-timer-pause" onclick="TaskManager.pauseTodo(${task.id})">⏸ Pauză</button>
        <button class="tm-timer-btn tm-timer-stop" onclick="TaskManager.stopTodo(${task.id})">⏹ Stop</button>
      `;
    }
    if (isPaused) {
      return `
        <button class="tm-timer-btn tm-timer-resume" onclick="TaskManager.resumeTodo(${task.id})">▶ Reia</button>
        <button class="tm-timer-btn tm-timer-stop" onclick="TaskManager.stopTodo(${task.id})">⏹ Stop</button>
      `;
    }
    if (hasActiveTimer) {
      return `<button class="tm-timer-btn tm-timer-start" disabled title="Oprește task-ul activ mai întâi" style="opacity:0.4;cursor:not-allowed">▶ Start</button>`;
    }
    const titleEsc = (task.title || '').replace(/'/g, "\\'");
    return `<button class="tm-timer-btn tm-timer-start" onclick="TaskManager.startTodo(${task.id},'${titleEsc}')">▶ Start</button>`;
  },

  // ── TIMER ACTIONS TO-DO ───────────────────────────────────────
  startTodo(todoId, todoTitle) {
    if (window.activeTimerData) {
      showToast('Oprește task-ul activ înainte de a începe altul.', 'warning');
      return;
    }
    const now = new Date();
    window.activeTimerData = {
      taskId: 'todo_' + todoId,
      todoId: todoId,
      taskName: todoTitle,
      projectId: null,
      phaseId: null,
      isTodo: true,
      userId: Auth?.currentUser?.id || null,
      startTime: Date.now(),
      startHour: now.getHours(),
      startMin: now.getMinutes(),
      pausedMs: 0,
    };
    window.pausedTimerData = null;
    if (typeof _timerSave === 'function') _timerSave();
    if (typeof startGlobalTimer === 'function') startGlobalTimer();
    showToast('▶ To-Do pornit: ' + todoTitle, 'success');
    this.refreshTodoTimerBtns();
  },

  pauseTodo(todoId) {
    if (!window.activeTimerData || window.activeTimerData.taskId !== ('todo_' + todoId)) return;
    window.pausedTimerData = Object.assign({}, window.activeTimerData, { pausedAt: Date.now() });
    window.activeTimerData = null;
    if (typeof stopGlobalTimerInterval === 'function') stopGlobalTimerInterval();
    if (typeof _timerSave === 'function') _timerSave();
    if (typeof updateHeaderTimer === 'function') updateHeaderTimer();
    showToast('⏸ To-Do în pauză', 'info');
    this.refreshTodoTimerBtns();
  },

  resumeTodo(todoId) {
    if (!window.pausedTimerData || window.pausedTimerData.taskId !== ('todo_' + todoId)) return;
    const paused = window.pausedTimerData;
    const additionalPause = Date.now() - paused.pausedAt;
    window.activeTimerData = Object.assign({}, paused, { pausedMs: (paused.pausedMs || 0) + additionalPause });
    delete window.activeTimerData.pausedAt;
    window.pausedTimerData = null;
    if (typeof _timerSave === 'function') _timerSave();
    if (typeof startGlobalTimer === 'function') startGlobalTimer();
    if (typeof updateHeaderTimer === 'function') updateHeaderTimer();
    showToast('▶ To-Do reluat', 'success');
    this.refreshTodoTimerBtns();
  },

  async stopTodo(todoId) {
    const timerData = (window.activeTimerData && window.activeTimerData.taskId === ('todo_' + todoId)) ? window.activeTimerData
                    : (window.pausedTimerData && window.pausedTimerData.taskId === ('todo_' + todoId)) ? window.pausedTimerData
                    : null;
    if (!timerData) return;

    if (typeof stopGlobalTimerInterval === 'function') stopGlobalTimerInterval();
    window.activeTimerData = null;
    window.pausedTimerData = null;

    const elapsed = Date.now() - timerData.startTime - (timerData.pausedMs || 0);
    const minutes = Math.max(1, Math.round(elapsed / 60000));

    const sb = getSupabase();
    const userId = Auth.currentUser?.id;

    try {
      // Salvează în time_entries cu activity_type='todo' și project_task_id=null
      if (sb && userId) {
        const today = new Date().toISOString().split('T')[0];
        await sb.from('time_entries').insert({
          user_id: userId,
          project_task_id: null,
          duration_minutes: minutes,
          date: today,
          activity_type: 'todo',
          description: 'To-Do: ' + (timerData.taskName || ''),
        });

        // Actualizează minutes_worked în todo_tasks
        const todoTask = this.todoTasks.find(t => t.id === todoId);
        if (todoTask) {
          const newMinutes = (todoTask.minutes_worked || 0) + minutes;
          await sb.from('todo_tasks').update({ minutes_worked: newMinutes, updated_at: new Date().toISOString() }).eq('id', todoId);
          todoTask.minutes_worked = newMinutes;
        }
      }

      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      showToast('⏹ To-Do oprit. ' + (h > 0 ? h + 'h ' : '') + m + 'm înregistrate.', 'success');
    } catch(err) {
      console.error('[TaskManager] stopTodo error:', err);
      showToast('Eroare la salvarea timpului.', 'error');
    }

    if (typeof _timerClear === 'function') _timerClear();
    if (typeof updateHeaderTimer === 'function') updateHeaderTimer();
    this.refreshTodoTimerBtns();
  },

  refreshTodoTimerBtns() {
    this.todoTasks.forEach(task => {
      const card = document.getElementById('tm-todo-card-' + task.id);
      if (!card) return;
      const actionsDiv = card.querySelector('.tm-card-actions');
      if (!actionsDiv) return;
      const newTimerHtml = this.renderTodoTimerBtn(task);
      actionsDiv.querySelectorAll('.tm-timer-btn').forEach(b => b.remove());
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = newTimerHtml;
      while (tempDiv.firstChild) {
        actionsDiv.insertBefore(tempDiv.firstChild, actionsDiv.firstChild);
      }
    });
  },

  // ── CRUD TO-DO ────────────────────────────────────────────────
  openTodoModal(editId) {
    const isAdmin = Auth.currentProfile?.role === 'admin';
    const isCoord = Auth.currentProfile?.role === 'coordonator';
    const canAssignOthers = isAdmin || isCoord;
    const userId = Auth.currentUser?.id;

    let task = null;
    if (editId) {
      task = this.todoTasks.find(t => t.id === editId);
    }

    const title = task ? task.title : '';
    const desc = task ? (task.description || '') : '';
    const priority = task ? task.priority : 'normal';
    const deadline = task ? (task.deadline || '') : '';
    const assignedTo = task ? (task.assigned_to || userId) : userId;

    // Construiește lista de utilizatori pentru dropdown
    let usersOptions = '';
    if (canAssignOthers && this.allProfiles.length > 0) {
      usersOptions = this.allProfiles
        .sort((a, b) => (a.full_name || a.name || '').localeCompare(b.full_name || b.name || ''))
        .map(p => `<option value="${p.id}" ${String(p.id) === String(assignedTo) ? 'selected' : ''}>${p.full_name || p.name || p.email || 'Necunoscut'}</option>`)
        .join('');
    }

    const modalHtml = `
      <div class="tm-modal-overlay" onclick="if(event.target===this)TaskManager.closeTodoModal()">
        <div class="tm-modal">
          <div class="tm-modal-header">
            <h3 class="tm-modal-title">${editId ? 'Editează task To-Do' : 'Task To-Do nou'}</h3>
            <button class="tm-modal-close" onclick="TaskManager.closeTodoModal()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="tm-modal-body">
            <div class="tm-form-group">
              <label class="tm-form-label">Titlu *</label>
              <input type="text" id="todo-title" class="tm-form-input" placeholder="Ce trebuie făcut?" value="${title.replace(/"/g, '&quot;')}" maxlength="200">
            </div>
            <div class="tm-form-group">
              <label class="tm-form-label">Descriere</label>
              <textarea id="todo-desc" class="tm-form-input" rows="3" placeholder="Detalii opționale...">${desc}</textarea>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div class="tm-form-group">
                <label class="tm-form-label">Prioritate</label>
                <select id="todo-priority" class="tm-form-input">
                  <option value="urgent" ${priority === 'urgent' ? 'selected' : ''}>🔴 Urgent</option>
                  <option value="normal" ${priority === 'normal' ? 'selected' : ''}>🔵 Normal</option>
                  <option value="low" ${priority === 'low' ? 'selected' : ''}>⚪ Scăzut</option>
                </select>
              </div>
              <div class="tm-form-group">
                <label class="tm-form-label">Deadline</label>
                <input type="date" id="todo-deadline" class="tm-form-input" value="${deadline}">
              </div>
            </div>
            ${canAssignOthers && usersOptions ? `
            <div class="tm-form-group">
              <label class="tm-form-label">Alocă la</label>
              <select id="todo-assigned" class="tm-form-input">
                ${usersOptions}
              </select>
            </div>` : ''}
          </div>
          <div class="tm-modal-footer">
            <button class="btn-secondary" onclick="TaskManager.closeTodoModal()">Anulează</button>
            <button class="btn-primary" onclick="TaskManager.saveTodo(${editId || 'null'})">
              ${editId ? 'Salvează' : 'Adaugă task'}
            </button>
          </div>
        </div>
      </div>
    `;

    const modalEl = document.getElementById('tm-todo-modal');
    if (modalEl) {
      modalEl.innerHTML = modalHtml;
      modalEl.style.display = 'block';
    } else {
      // Fallback: append to body
      const div = document.createElement('div');
      div.id = 'tm-todo-modal-fallback';
      div.innerHTML = modalHtml;
      document.body.appendChild(div);
    }

    // Focus pe titlu
    setTimeout(() => {
      const inp = document.getElementById('todo-title');
      if (inp) inp.focus();
    }, 50);
  },

  closeTodoModal() {
    const el = document.getElementById('tm-todo-modal');
    if (el) el.style.display = 'none';
    const fb = document.getElementById('tm-todo-modal-fallback');
    if (fb) fb.remove();
  },

  async saveTodo(editId) {
    const titleEl = document.getElementById('todo-title');
    const descEl = document.getElementById('todo-desc');
    const priorityEl = document.getElementById('todo-priority');
    const deadlineEl = document.getElementById('todo-deadline');
    const assignedEl = document.getElementById('todo-assigned');

    const title = (titleEl?.value || '').trim();
    if (!title) {
      showToast('Titlul este obligatoriu.', 'warning');
      titleEl?.focus();
      return;
    }

    const sb = getSupabase();
    const userId = Auth.currentUser?.id;
    if (!sb || !userId) return;

    const payload = {
      title,
      description: descEl?.value?.trim() || null,
      priority: priorityEl?.value || 'normal',
      deadline: deadlineEl?.value || null,
      assigned_to: assignedEl ? assignedEl.value : userId,
      updated_at: new Date().toISOString(),
    };

    try {
      if (editId) {
        const { error } = await sb.from('todo_tasks').update(payload).eq('id', editId);
        if (error) throw error;
        // Actualizează local
        const idx = this.todoTasks.findIndex(t => t.id === editId);
        if (idx >= 0) this.todoTasks[idx] = { ...this.todoTasks[idx], ...payload };
        showToast('Task actualizat ✓', 'success');
      } else {
        payload.created_by = userId;
        payload.status = 'todo';
        payload.minutes_worked = 0;
        payload.created_at = new Date().toISOString();
        const { data, error } = await sb.from('todo_tasks').insert(payload).select().single();
        if (error) throw error;
        if (data) this.todoTasks.unshift(data);
        showToast('Task adăugat ✓', 'success');
      }

      this.closeTodoModal();
      this.renderTodoList();
    } catch(err) {
      console.error('[TaskManager] saveTodo error:', err);
      showToast('Eroare la salvare: ' + (err.message || err), 'error');
    }
  },

  async markTodoDone(todoId) {
    const sb = getSupabase();
    if (!sb) return;
    try {
      await sb.from('todo_tasks').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', todoId);
      const task = this.todoTasks.find(t => t.id === todoId);
      if (task) task.status = 'done';
      showToast('Task marcat ca finalizat ✓', 'success');
      this.renderTodoList();
    } catch(err) {
      showToast('Eroare: ' + err.message, 'error');
    }
  },

  async markTodoReopen(todoId) {
    const sb = getSupabase();
    if (!sb) return;
    try {
      await sb.from('todo_tasks').update({ status: 'todo', updated_at: new Date().toISOString() }).eq('id', todoId);
      const task = this.todoTasks.find(t => t.id === todoId);
      if (task) task.status = 'todo';
      showToast('Task redeschis', 'info');
      this.renderTodoList();
    } catch(err) {
      showToast('Eroare: ' + err.message, 'error');
    }
  },

  async deleteTodo(todoId) {
    if (!confirm('Ștergi acest task To-Do? Acțiunea nu poate fi anulată.')) return;
    const sb = getSupabase();
    if (!sb) return;
    try {
      await sb.from('todo_tasks').delete().eq('id', todoId);
      this.todoTasks = this.todoTasks.filter(t => t.id !== todoId);
      showToast('Task șters.', 'info');
      this.renderTodoList();
    } catch(err) {
      showToast('Eroare: ' + err.message, 'error');
    }
  },

  renderTodoList() {
    const listEl = document.getElementById('tm-todo-list');
    if (!listEl) return;
    const filtered = this.getFilteredTodoTasks();
    if (filtered.length === 0) {
      listEl.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text-muted)">
        <div style="font-size:48px;margin-bottom:12px">✅</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:6px">${this.todoTasks.length === 0 ? 'Nu ai task-uri To-Do.' : 'Niciun task nu corespunde filtrelor.'}</div>
        ${this.todoTasks.length > 0 ? `<button class="btn-secondary" style="margin-top:12px;font-size:12px" onclick="TaskManager.clearTodoFilters()">Resetează filtrele</button>` : ''}
      </div>`;
    } else {
      listEl.innerHTML = filtered.map(t => this.renderTodoCard(t)).join('');
    }
  },

  // ── FILTRE TO-DO ──────────────────────────────────────────────
  getFilteredTodoTasks() {
    let tasks = [...this.todoTasks];

    if (this.todoFilterStatus !== 'all') {
      tasks = tasks.filter(t => t.status === this.todoFilterStatus);
    }
    if (this.todoFilterPriority !== 'all') {
      tasks = tasks.filter(t => t.priority === this.todoFilterPriority);
    }
    if (this.todoSearch.trim()) {
      const q = this.todoSearch.toLowerCase().trim();
      tasks = tasks.filter(t =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q)
      );
    }

    // Sortare: urgente primul, apoi după deadline, apoi după creare
    const prioOrder = { urgent: 0, normal: 1, low: 2 };
    const statOrder = { in_progress: 0, todo: 1, done: 2 };
    tasks.sort((a, b) => {
      const so = (statOrder[a.status] ?? 1) - (statOrder[b.status] ?? 1);
      if (so !== 0) return so;
      const po = (prioOrder[a.priority] ?? 1) - (prioOrder[b.priority] ?? 1);
      if (po !== 0) return po;
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return 0;
    });

    return tasks;
  },

  setTodoFilter(type, value) {
    if (type === 'status') this.todoFilterStatus = value;
    if (type === 'priority') this.todoFilterPriority = value;
    this.renderTodoList();
  },

  onTodoSearch(value) {
    this.todoSearch = value;
    this.renderTodoList();
  },

  clearTodoFilters() {
    this.todoFilterStatus = 'all';
    this.todoFilterPriority = 'all';
    this.todoSearch = '';
    this.renderTodoList();
  },

  // ── TAB OVERVIEW ADMIN ────────────────────────────────────────
  renderOverviewTab() {
    if (Auth.currentProfile?.role !== 'coordonator') {
      return `<div style="text-align:center;padding:60px;color:var(--text-muted)">🔒 Acces restricționat — doar coordonatorii de proiect pot vedea acest tab</div>`;
    }

    const isGlobalAdmin = false; // Overview accesibil doar coordonatorilor
    const userId = Auth.currentUser?.id;

    // Coordonator vede DOAR angajații din proiectele pe care le coordonează
    const visibleProjectIds = this.coordProjectIds;

    // Construim harta: userId → { profile, tasks[] }
    const peopleMap = {};

    this.allAssignments.forEach(a => {
      // Dacă coordonator, filtrăm după proiectele coordonate
      if (visibleProjectIds !== null && !visibleProjectIds.has(String(a.project_id))) return;

      const uid = String(a.user_id);
      if (!peopleMap[uid]) {
        const profile = this.allProfiles.find(p => String(p.id) === uid);
        if (!profile) return;
        peopleMap[uid] = {
          id: uid,
          name: profile.full_name || profile.name || 'Necunoscut',
          code: profile.employee_code || '',
          role: profile.role || 'angajat',
          tasks: [],
        };
      }
      const task = this.allTasks.find(t => String(t.id) === String(a.task_id));
      if (task) {
        if (!peopleMap[uid].tasks.find(t => t.id === task.id)) {
          peopleMap[uid].tasks.push(task);
        }
      }
    });

    // Adăugăm și task-urile cu assigned_user_id direct
    this.allTasks.forEach(task => {
      if (!task.assigned_user_id) return;
      // Dacă coordonator, filtrăm după proiectele coordonate
      if (visibleProjectIds !== null && !visibleProjectIds.has(String(task.project_id))) return;

      const uid = String(task.assigned_user_id);
      if (!peopleMap[uid]) {
        const profile = this.allProfiles.find(p => String(p.id) === uid);
        if (!profile) return;
        peopleMap[uid] = {
          id: uid,
          name: profile.full_name || profile.name || 'Necunoscut',
          code: profile.employee_code || '',
          role: profile.role || 'angajat',
          tasks: [],
        };
      }
      if (!peopleMap[uid].tasks.find(t => t.id === task.id)) {
        peopleMap[uid].tasks.push(task);
      }
    });

    let people = Object.values(peopleMap).filter(p => p.tasks.length > 0);

    // Filtrare search
    const sq = this.overviewSearch.toLowerCase().trim();
    if (sq) {
      people = people.filter(p =>
        p.name.toLowerCase().includes(sq) ||
        p.tasks.some(t => (t.name || '').toLowerCase().includes(sq) || (t.project?.name || '').toLowerCase().includes(sq))
      );
    }

    if (this.overviewFilter !== 'all') {
      people = people.filter(p => p.id === this.overviewFilter);
    }

    people.sort((a, b) => {
      const aAlert = a.tasks.filter(t => t.budgetAlert === 'exceeded' || t.budgetAlert === 'critical').length;
      const bAlert = b.tasks.filter(t => t.budgetAlert === 'exceeded' || t.budgetAlert === 'critical').length;
      if (aAlert !== bAlert) return bAlert - aAlert;
      return b.tasks.length - a.tasks.length;
    });

    // Stats — pentru coordonator, calculăm doar din task-urile vizibile
    const visibleTasks = this.allTasks.filter(t => visibleProjectIds.has(String(t.project_id)));

    const totalInLucru = visibleTasks.filter(t => t.computedStatus === 'activ').length;
    const totalDepasit = visibleTasks.filter(t => t.budgetAlert === 'exceeded').length;
    const totalAlerta = visibleTasks.filter(t => t.budgetAlert && t.budgetAlert !== 'exceeded').length;
    const totalAngajati = people.length;

    const allPeopleForFilter = Object.values(peopleMap);

    return `
      <div class="tm-stats-bar" style="margin-bottom:16px">
        <div class="tm-stat">
          <span class="tm-stat-value">${visibleTasks.length}</span>
          <span class="tm-stat-label">Total task-uri</span>
        </div>
        <div class="tm-stat tm-stat-activ">
          <span class="tm-stat-value">${totalInLucru}</span>
          <span class="tm-stat-label">În lucru</span>
        </div>
        <div class="tm-stat tm-stat-depasit">
          <span class="tm-stat-value">${totalDepasit}</span>
          <span class="tm-stat-label">Buget depășit</span>
        </div>
        <div class="tm-stat tm-stat-alert">
          <span class="tm-stat-value">${totalAlerta}</span>
          <span class="tm-stat-label">Alertă buget</span>
        </div>
        <div class="tm-stat">
          <span class="tm-stat-value">${totalAngajati}</span>
          <span class="tm-stat-label">Angajați activi</span>
        </div>
      </div>

      <div class="tm-filters" style="margin-bottom:16px">
        <div class="tm-search-wrap">
          <svg class="tm-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" class="tm-search-input" placeholder="Caută angajat sau task..." value="${this.overviewSearch}" oninput="TaskManager.onOverviewSearch(this.value)">
        </div>
        <select class="tm-select" onchange="TaskManager.setOverviewFilter(this.value)">
          <option value="all">Toți angajații</option>
          ${allPeopleForFilter.sort((a,b) => a.name.localeCompare(b.name)).map(p =>
            `<option value="${p.id}" ${this.overviewFilter === p.id ? 'selected' : ''}>${p.name}</option>`
          ).join('')}
        </select>
      </div>

      <div class="tm-overview-list">
        ${people.length === 0
          ? `<div style="text-align:center;padding:60px;color:var(--text-muted)"><div style="font-size:40px;margin-bottom:12px">👥</div><div style="font-size:15px;font-weight:600">Niciun angajat cu task-uri alocate în proiectele tale</div></div>`
          : people.map(p => this.renderPersonCard(p)).join('')
        }
      </div>
    `;
  },

  renderPersonCard(person) {
    const totalTasks = person.tasks.length;
    const inLucru = person.tasks.filter(t => t.computedStatus === 'activ').length;
    const depasit = person.tasks.filter(t => t.budgetAlert === 'exceeded' || t.budgetAlert === 'critical').length;
    const totalBudget = person.tasks.reduce((s, t) => s + (t.budgetH || 0), 0);
    const totalWorked = person.tasks.reduce((s, t) => s + (t.workedH || 0), 0);
    const overallPct = totalBudget > 0 ? Math.min(100, Math.round((totalWorked / totalBudget) * 100)) : 0;
    const barColor = overallPct >= 100 ? '#EF4444' : overallPct >= 75 ? '#F59E0B' : '#10B981';

    const initials = person.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    const avatarColors = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#06B6D4'];
    const avatarColor = avatarColors[person.name.charCodeAt(0) % avatarColors.length];

    const hasAlert = depasit > 0;

    return `
      <div class="tm-person-card ${hasAlert ? 'tm-person-alert' : ''}">
        <div class="tm-person-header">
          <div class="tm-person-info">
            <div class="tm-avatar" style="background:${avatarColor}20;color:${avatarColor};border:2px solid ${avatarColor}40">${initials}</div>
            <div>
              <div class="tm-person-name">${person.name}</div>
              <div class="tm-person-meta">
                ${person.code ? `<span class="tm-person-code">${person.code}</span>` : ''}
                <span class="tm-person-role">${person.role}</span>
              </div>
            </div>
          </div>
          <div class="tm-person-stats">
            <div class="tm-person-stat">
              <span class="tm-person-stat-val">${totalTasks}</span>
              <span class="tm-person-stat-lbl">task-uri</span>
            </div>
            <div class="tm-person-stat tm-stat-activ">
              <span class="tm-person-stat-val" style="color:#10B981">${inLucru}</span>
              <span class="tm-person-stat-lbl">în lucru</span>
            </div>
            ${depasit > 0 ? `
            <div class="tm-person-stat">
              <span class="tm-person-stat-val" style="color:#EF4444">${depasit}</span>
              <span class="tm-person-stat-lbl">depășit</span>
            </div>` : ''}
          </div>
        </div>

        ${totalBudget > 0 ? `
        <div class="tm-person-budget">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:11px;color:var(--text-muted)">Buget total: ${totalWorked}h / ${totalBudget}h</span>
            <span style="font-size:12px;font-weight:700;color:${barColor}">${overallPct}%</span>
          </div>
          <div style="height:4px;background:${barColor}20;border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${Math.min(100,overallPct)}%;background:${barColor};border-radius:2px;transition:width 0.4s ease-out"></div>
          </div>
        </div>` : ''}

        <div class="tm-person-tasks">
          ${person.tasks.map(t => this.renderPersonTaskRow(t)).join('')}
        </div>
      </div>
    `;
  },

  renderPersonTaskRow(task) {
    const { project, phase, workedH, budgetH, pct, budgetAlert, computedStatus } = task;
    const barColor = pct >= 100 ? '#EF4444' : pct >= 75 ? '#F59E0B' : '#10B981';
    const projColor = project?.color || '#3B82F6';

    let alertIcon = '';
    if (budgetAlert === 'exceeded') alertIcon = '<span style="color:#EF4444;font-size:11px">⚠ Depășit</span>';
    else if (budgetAlert === 'critical') alertIcon = '<span style="color:#DC2626;font-size:11px">🔴 &lt;10%</span>';
    else if (budgetAlert === 'warning') alertIcon = '<span style="color:#D97706;font-size:11px">🟡 &lt;25%</span>';

    return `
      <div class="tm-person-task-row">
        <div class="tm-person-task-info">
          <span class="tm-person-task-dot" style="background:${projColor}"></span>
          <div>
            <div class="tm-person-task-name">${task.name}</div>
            <div class="tm-person-task-meta">
              <span style="color:${projColor};font-size:10px;font-weight:600">${project?.emoji || '📁'} ${project?.name || ''}</span>
              ${phase ? `<span style="color:var(--text-muted);font-size:10px"> · ${phase.code ? phase.code + '. ' : ''}${phase.name}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="tm-person-task-budget">
          ${budgetH > 0 ? `
          <div style="display:flex;align-items:center;gap:8px">
            <div style="width:60px;height:4px;background:${barColor}20;border-radius:2px;overflow:hidden">
              <div style="height:100%;width:${Math.min(100,pct)}%;background:${barColor};border-radius:2px"></div>
            </div>
            <span style="font-size:11px;font-weight:700;color:${barColor}">${pct}%</span>
            <span style="font-size:10px;color:var(--text-muted)">${workedH}/${budgetH}h</span>
            ${alertIcon}
          </div>` : `<span style="font-size:10px;color:var(--text-muted)">Fără buget</span>`}
          <button class="tm-goto-btn" style="padding:2px 8px;font-size:10px" onclick="TaskManager.goToProject(${task.project_id})" title="Deschide proiectul">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </button>
        </div>
      </div>
    `;
  },

  // ── FILTRARE TAB PERSONAL ─────────────────────────────────────
  getFilteredTasks() {
    let tasks = [...this.tasks];

    if (this.filterStatus !== 'all') {
      if (this.filterStatus === 'alert') {
        tasks = tasks.filter(t => t.budgetAlert && t.budgetAlert !== 'exceeded');
      } else {
        tasks = tasks.filter(t => t.computedStatus === this.filterStatus);
      }
    }

    if (this.filterProject !== 'all') {
      tasks = tasks.filter(t => String(t.project_id) === String(this.filterProject));
    }

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      tasks = tasks.filter(t =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.project?.name || '').toLowerCase().includes(q) ||
        (t.phase?.name || '').toLowerCase().includes(q)
      );
    }

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

  // ── RENDER TASK CARD (tab personal) ───────────────────────────
  renderTaskCard(task) {
    const { project, phase, workedH, budgetH, remainH, pct, budgetAlert, computedStatus, startDate, endDate } = task;

    const barColor = pct >= 100 ? '#EF4444' : pct >= 90 ? '#EF4444' : pct >= 75 ? '#F59E0B' : '#10B981';
    const barBg = pct >= 90 ? '#EF444415' : pct >= 75 ? '#F59E0B15' : '#10B98115';

    const statusBadgeHtml = this.statusBadge(computedStatus);

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

    const projColor = project?.color || '#3B82F6';
    const projEmoji = project?.emoji || '📁';
    const timerHtml = this.renderTimerBtn(task);

    const cardBorderColor = budgetAlert === 'exceeded' || budgetAlert === 'critical' ? '#EF4444'
      : budgetAlert === 'warning' ? '#F59E0B'
      : computedStatus === 'activ' ? '#10B981'
      : 'var(--border)';

    return `
      <div class="tm-card" id="tm-card-${task.id}" style="border-left: 3px solid ${cardBorderColor}">
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
          <div class="tm-card-meta">
            <span class="tm-project-badge" style="background:${projColor}20;color:${projColor};border:1px solid ${projColor}40">
              ${projEmoji} ${project?.name || 'Proiect'}
            </span>
            ${phase ? `<span class="tm-phase-badge" style="background:${phase.color || '#6B7280'}20;color:${phase.color || '#6B7280'};border:1px solid ${phase.color || '#6B7280'}40">${phase.code ? phase.code + '. ' : ''}${phase.name}</span>` : ''}
            ${periodHtml}
          </div>
        </div>
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

  // ── TIMER BUTTON (tab personal) ───────────────────────────────
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
    if (!task.isAllocatedToMe) {
      return `<span style="font-size:10px;color:var(--text-muted);padding:4px 8px;font-style:italic">Nealocat</span>`;
    }
    if (hasActiveTimer) {
      return `<button class="tm-timer-btn tm-timer-start" disabled title="Oprește task-ul activ mai întâi" style="opacity:0.4;cursor:not-allowed">▶ Start</button>`;
    }
    const taskNameEsc = (task.name || '').replace(/'/g, "\\'");
    return `<button class="tm-timer-btn tm-timer-start" onclick="TaskManager.startTask(${task.id},'${taskNameEsc}',${task.project_id},${task.phase_id || 'null'})">▶ Start</button>`;
  },

  // ── TIMER ACTIONS (tab personal) ──────────────────────────────
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

    if (typeof TimeTracking !== 'undefined' && TimeTracking.saveFromTimer) {
      const result = await TimeTracking.saveFromTimer(timerData, minutes);
      if (result && result.error) {
        showToast('Eroare la salvarea timpului: ' + result.error.message, 'error');
      } else {
        // Recalculează din zero (nu incremental) — identic cu proiecte.js
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
          const sb = getSupabase();
          if (sb) {
            try {
              const { data: entries } = await sb.from('time_entries')
                .select('duration_minutes')
                .eq('project_task_id', taskId);
              const totalMinutes = (entries || []).reduce((s, e) => s + (e.duration_minutes || 0), 0);
              await sb.from('project_tasks').update({ minutes_worked: totalMinutes }).eq('id', taskId);
              task.minutes_worked = totalMinutes;
              task.workedH = Math.round(totalMinutes / 60 * 10) / 10;
              task.pct = task.budgetH > 0 ? Math.min(100, Math.round((task.workedH / task.budgetH) * 100)) : 0;
              task.remainH = Math.round(Math.max(0, task.budgetH - task.workedH) * 100) / 100;
              if (task.budgetH > 0) {
                if (task.pct >= 100) task.budgetAlert = 'exceeded';
                else if (task.pct >= 90) task.budgetAlert = 'critical';
                else if (task.pct >= 75) task.budgetAlert = 'warning';
                else if (task.pct >= 50) task.budgetAlert = 'info';
                else task.budgetAlert = null;
              }
            } catch(e) { console.error('[TaskManager] recalc error:', e); }
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

  refreshTimerBtns() {
    this.tasks.forEach(task => {
      const card = document.getElementById('tm-card-' + task.id);
      if (!card) return;
      const actionsDiv = card.querySelector('.tm-card-actions');
      if (!actionsDiv) return;
      const gotoBtn = actionsDiv.querySelector('.tm-goto-btn');
      const newTimerHtml = this.renderTimerBtn(task);
      actionsDiv.querySelectorAll('.tm-timer-btn').forEach(b => b.remove());
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

  // ── FILTRE & SEARCH (tab personal) ───────────────────────────
  setFilter(type, value) {
    if (type === 'status') this.filterStatus = value;
    if (type === 'project') this.filterProject = value;
    this.renderTaskList();
  },

  onSearch(value) {
    this.searchQuery = value;
    this.renderTaskList();
  },

  onOverviewSearch(value) {
    this.overviewSearch = value;
    const el = document.getElementById('tm-tab-content');
    if (el) el.innerHTML = this.renderTabContent();
  },

  setOverviewFilter(value) {
    this.overviewFilter = value;
    const el = document.getElementById('tm-tab-content');
    if (el) el.innerHTML = this.renderTabContent();
  },

  renderTaskList() {
    const listEl = document.getElementById('tm-task-list');
    if (!listEl) return;
    const filtered = this.getFilteredTasks();
    listEl.innerHTML = filtered.length === 0
      ? this.renderEmpty()
      : filtered.map(t => this.renderTaskCard(t)).join('');
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
  // ── TAB RAPOARTE ────────────────────────────────────────────────
  renderReportsTab() {
    const profile = Auth.currentProfile;
    const isAdmin = profile?.role === 'admin';
    const isCoord = profile?.role === 'coordonator';
    
    return `
      <div style="padding:20px;max-width:1200px;margin:0 auto">
        <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:24px">
          <h2 style="margin:0 0 20px 0;color:var(--text-primary)">Rapoarte ore lucrate</h2>
          <button onclick="TaskManager.openReportsModal()" style="background:var(--primary);color:#fff;border:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer">📊 Generează raport</button>
          
          <div id="reports-content" style="margin-top:20px">
            <p style="color:var(--text-muted);text-align:center;padding:40px">Selectează filtrul și generează un raport</p>
          </div>
        </div>
      </div>
    `;
  },

  openReportsModal() {
    const profile = Auth.currentProfile;
    const isAdmin = profile?.role === 'admin';
    const isCoord = profile?.role === 'coordonator';
    
    // Build user options based on role
    let userOptions = '';
    if (isAdmin) {
      userOptions = this.allProfiles.map(u => `<option value="${u.id}">${u.full_name || u.name || u.email}</option>`).join('');
    } else if (isCoord) {
      // Doar oamenii coordonați
      const coordMembers = this.allAssignments
        .filter(a => this.coordProjectIds.has(String(a.project_id)))
        .map(a => a.user_id);
      const uniqueMembers = [...new Set(coordMembers)];
      userOptions = uniqueMembers.map(uid => {
        const user = this.allProfiles.find(u => u.id === uid);
        return user ? `<option value="${uid}">${user.full_name || user.name || user.email}</option>` : '';
      }).join('');
    } else {
      // Doar el însuși
      userOptions = `<option value="${profile.id}">${profile.full_name || profile.name}</option>`;
    }
    
    // Build project options
    const projectOptions = this.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    
    const today = new Date().toISOString().split('T')[0];
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const modal = document.createElement('div');
    modal.id = 'reports-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;overflow-y:auto';
    modal.innerHTML = `
      <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:24px;max-width:600px;width:90%;margin:20px auto">
        <h3 style="margin:0 0 20px 0;color:var(--text-primary)">Generează raport ore</h3>
        
        <div style="margin-bottom:16px">
          <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:6px;font-weight:600">Persoană</label>
          <select id="report-user" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--card-bg);color:var(--text-primary);box-sizing:border-box">
            <option value="">— Selectați —</option>
            ${userOptions}
          </select>
        </div>
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
          <div>
            <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:6px;font-weight:600">De la</label>
            <input type="date" id="report-date-from" value="${twoWeeksAgo}" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--card-bg);color:var(--text-primary);box-sizing:border-box" />
          </div>
          <div>
            <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:6px;font-weight:600">Până la</label>
            <input type="date" id="report-date-to" value="${today}" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--card-bg);color:var(--text-primary);box-sizing:border-box" />
          </div>
        </div>
        
        <div style="margin-bottom:16px">
          <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:6px;font-weight:600">Proiect (opțional)</label>
          <select id="report-project" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--card-bg);color:var(--text-primary);box-sizing:border-box">
            <option value="">— Toate proiectele —</option>
            ${projectOptions}
          </select>
        </div>
        
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
          <button onclick="document.getElementById('reports-modal').remove()" style="background:var(--bg-secondary);border:1px solid var(--border);color:var(--text-primary);padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer">Anulează</button>
          <button onclick="TaskManager.generateReport()" style="background:var(--primary);color:#fff;border:none;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer">Generează</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  async generateReport() {
    const userId = document.getElementById('report-user')?.value;
    const dateFrom = document.getElementById('report-date-from')?.value;
    const dateTo = document.getElementById('report-date-to')?.value;
    const projectId = document.getElementById('report-project')?.value;
    
    if (!userId) {
      alert('Selectați o persoană!');
      return;
    }
    if (!dateFrom || !dateTo) {
      alert('Selectați perioada!');
      return;
    }
    
    const sb = getSupabase();
    if (!sb) { alert('Nu ești conectat'); return; }
    
    // Fetch time entries
    let query = sb.from('time_entries')
      .select('id,project_task_id,duration_minutes,created_at,user_id')
      .eq('user_id', userId)
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo + 'T23:59:59');
    
    const { data: timeEntries, error } = await query;
    if (error) {
      alert('Eroare: ' + error.message);
      return;
    }
    
    // Fetch manual hours
    const { data: manualHours } = await sb.from('manual_hours_log')
      .select('id,task_id,minutes,created_at,added_by_profile_id')
      .eq('added_by_profile_id', userId)
      .gte('created_at', dateFrom + 'T00:00:00')
      .lte('created_at', dateTo + 'T23:59:59');
    
    // Fetch tasks with project info
    const taskIds = [...new Set([...(timeEntries || []).map(t => t.project_task_id), ...(manualHours || []).map(m => m.task_id)])];
    const { data: tasks } = await sb.from('project_tasks')
      .select('id,name,project_id,phase_id')
      .in('id', taskIds);
    
    // Fetch projects and phases
    const projectIds = [...new Set((tasks || []).map(t => t.project_id))];
    const { data: projects } = await sb.from('projects')
      .select('id,name')
      .in('id', projectIds);
    
    const phaseIds = [...new Set((tasks || []).map(t => t.phase_id))];
    const { data: phases } = await sb.from('project_phases')
      .select('id,name,code')
      .in('id', phaseIds);
    
    // Build report data
    const reportData = {
      user: this.allProfiles.find(u => u.id === userId),
      dateFrom,
      dateTo,
      timeEntries: timeEntries || [],
      manualHours: manualHours || [],
      tasks: tasks || [],
      projects: projects || [],
      phases: phases || [],
      projectFilter: projectId
    };
    
    document.getElementById('reports-modal').remove();
    this.displayReport(reportData);
  },

  displayReport(data) {
    // Group by project
    const grouped = {};
    const allHours = [
      ...(data.timeEntries || []).map(t => ({ type: 'timer', minutes: t.duration_minutes, taskId: t.project_task_id, date: t.created_at })),
      ...(data.manualHours || []).map(m => ({ type: 'manual', minutes: m.minutes, taskId: m.task_id, date: m.created_at }))
    ];
    
    allHours.forEach(h => {
      const task = data.tasks.find(t => t.id === h.taskId);
      if (!task) return;
      if (data.projectFilter && task.project_id !== parseInt(data.projectFilter)) return;
      
      const projectId = task.project_id;
      if (!grouped[projectId]) {
        grouped[projectId] = { tasks: {}, total: 0 };
      }
      
      const taskId = task.id;
      if (!grouped[projectId].tasks[taskId]) {
        grouped[projectId].tasks[taskId] = { name: task.name, hours: 0, entries: [] };
      }
      
      const hours = h.minutes / 60;
      grouped[projectId].tasks[taskId].hours += hours;
      grouped[projectId].tasks[taskId].entries.push(h);
      grouped[projectId].total += hours;
    });
    
    // Generate HTML
    let html = '<div style="margin-top:20px">';
    let grandTotal = 0;
    
    Object.keys(grouped).forEach(projectId => {
      const project = data.projects.find(p => p.id === parseInt(projectId));
      const group = grouped[projectId];
      grandTotal += group.total;
      
      html += `
        <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px">
          <h4 style="margin:0 0 12px 0;color:var(--text-primary)">${project?.name || 'Necunoscut'}</h4>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="border-bottom:1px solid var(--border)">
                <th style="padding:8px;text-align:left;color:var(--text-muted);font-weight:600">Task</th>
                <th style="padding:8px;text-align:right;color:var(--text-muted);font-weight:600">Ore</th>
              </tr>
            </thead>
            <tbody>
              ${Object.keys(group.tasks).map(taskId => {
                const task = group.tasks[taskId];
                return `
                  <tr style="border-bottom:1px solid var(--border)">
                    <td style="padding:8px;color:var(--text-primary)">${task.name}</td>
                    <td style="padding:8px;text-align:right;color:var(--text-primary);font-weight:600">${task.hours.toFixed(2)}h</td>
                  </tr>
                `;
              }).join('')}
              <tr style="background:var(--card-bg);font-weight:600">
                <td style="padding:8px;color:var(--text-primary)">Total proiect</td>
                <td style="padding:8px;text-align:right;color:var(--primary)">${group.total.toFixed(2)}h</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    });
    
    html += `
      <div style="background:var(--primary);color:#fff;border-radius:8px;padding:16px;text-align:center;font-size:18px;font-weight:600;margin-bottom:20px">
        Total: ${grandTotal.toFixed(2)} ore
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="TaskManager.exportReportPDF()" style="flex:1;background:#DC2626;color:#fff;border:none;padding:10px;border-radius:6px;font-weight:600;cursor:pointer">📄 Export PDF</button>
        <button onclick="TaskManager.exportReportExcel()" style="flex:1;background:#059669;color:#fff;border:none;padding:10px;border-radius:6px;font-weight:600;cursor:pointer">📊 Export Excel</button>
      </div>
    `;
    
    html += '</div>';
    document.getElementById('reports-content').innerHTML = html;
  },

  exportReportPDF() {
    alert('Export PDF - în dezvoltare');
  },

  exportReportExcel() {
    alert('Export Excel - în dezvoltare');
  },

  injectStyles() {
    if (document.getElementById('tm-styles')) return;
    const style = document.createElement('style');
    style.id = 'tm-styles';
    style.textContent = `
      /* ── Task Manager Styles ── */
      .tm-wrapper {
        max-width: 960px;
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

      /* Tabs */
      .tm-tabs {
        display: flex;
        gap: 4px;
        margin-bottom: 20px;
        border-bottom: 2px solid var(--border);
        padding-bottom: 0;
      }
      .tm-tab-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 600;
        color: var(--text-muted);
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        margin-bottom: -2px;
        cursor: pointer;
        border-radius: 6px 6px 0 0;
        transition: color 0.15s, border-color 0.15s, background 0.15s;
      }
      .tm-tab-btn:hover {
        color: var(--text);
        background: var(--bg-secondary);
      }
      .tm-tab-btn.active {
        color: var(--primary);
        border-bottom-color: var(--primary);
        background: none;
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
      .tm-search-input:focus { border-color: var(--primary); }
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
      .tm-select:focus { border-color: var(--primary); }

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
      .tm-card-header { margin-bottom: 12px; }
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
      .tm-goto-btn:hover { color: var(--primary); border-color: var(--primary); }

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
      .tm-period { font-size: 11px; color: var(--text-muted); white-space: nowrap; }

      .tm-budget-section { display: flex; flex-direction: column; gap: 6px; }
      .tm-budget-bar-wrap { height: 6px; border-radius: 3px; overflow: hidden; position: relative; }
      .tm-budget-bar-fill { height: 100%; border-radius: 3px; transition: width 0.4s ease-out; }
      .tm-budget-numbers { display: flex; align-items: center; gap: 12px; font-size: 12px; flex-wrap: wrap; }
      .tm-budget-worked { font-weight: 600; }
      .tm-budget-pct { font-size: 13px; }
      .tm-budget-remain { margin-left: auto; }

      /* To-Do card */
      .tm-todo-card .tm-card-header { margin-bottom: 6px; }

      /* Modal To-Do */
      .tm-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        padding: 20px;
        animation: tm-fade-in 0.15s ease-out;
      }
      @keyframes tm-fade-in {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      .tm-modal {
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 14px;
        width: 100%;
        max-width: 480px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.25);
        animation: tm-modal-in 0.2s cubic-bezier(0.23,1,0.32,1);
      }
      @keyframes tm-modal-in {
        from { opacity: 0; transform: scale(0.95) translateY(8px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
      }
      .tm-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18px 20px 14px;
        border-bottom: 1px solid var(--border);
      }
      .tm-modal-title {
        font-size: 16px;
        font-weight: 700;
        color: var(--text);
        margin: 0;
      }
      .tm-modal-close {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--text-muted);
        padding: 4px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        transition: color 0.15s, background 0.15s;
      }
      .tm-modal-close:hover { color: var(--text); background: var(--bg-secondary); }
      .tm-modal-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
      .tm-modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        padding: 14px 20px 18px;
        border-top: 1px solid var(--border);
      }
      .tm-form-group { display: flex; flex-direction: column; gap: 5px; }
      .tm-form-label { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; }
      .tm-form-input {
        padding: 8px 12px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--bg-secondary);
        color: var(--text);
        font-size: 13px;
        outline: none;
        transition: border-color 0.15s;
        font-family: inherit;
        resize: vertical;
      }
      .tm-form-input:focus { border-color: var(--primary); }

      /* Overview tab — person cards */
      .tm-overview-list { display: flex; flex-direction: column; gap: 12px; }
      .tm-person-card {
        background: var(--bg-secondary);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 16px 18px;
        animation: tm-card-in 0.2s ease-out;
        transition: box-shadow 0.15s;
      }
      .tm-person-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
      .tm-person-alert { border-left: 3px solid #EF4444; }
      .tm-person-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
        flex-wrap: wrap;
        gap: 10px;
      }
      .tm-person-info { display: flex; align-items: center; gap: 10px; }
      .tm-avatar {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        font-weight: 800;
        flex-shrink: 0;
      }
      .tm-person-name { font-size: 14px; font-weight: 700; color: var(--text); }
      .tm-person-meta { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
      .tm-person-code {
        font-size: 10px;
        font-weight: 700;
        padding: 1px 6px;
        border-radius: 4px;
        background: var(--bg);
        border: 1px solid var(--border);
        color: var(--text-muted);
      }
      .tm-person-role { font-size: 11px; color: var(--text-muted); text-transform: capitalize; }
      .tm-person-stats { display: flex; gap: 16px; }
      .tm-person-stat { display: flex; flex-direction: column; align-items: center; gap: 1px; }
      .tm-person-stat-val { font-size: 18px; font-weight: 800; color: var(--text); line-height: 1; }
      .tm-person-stat-lbl { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; }
      .tm-person-budget { margin-bottom: 10px; }
      .tm-person-tasks { display: flex; flex-direction: column; gap: 6px; }
      .tm-person-task-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 7px 10px;
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 8px;
        gap: 10px;
        flex-wrap: wrap;
      }
      .tm-person-task-info { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
      .tm-person-task-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .tm-person-task-name { font-size: 12px; font-weight: 600; color: var(--text); }
      .tm-person-task-meta { display: flex; align-items: center; gap: 4px; }
      .tm-person-task-budget { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

      /* Responsive */
      @media (max-width: 600px) {
        .tm-stats-bar { gap: 8px; }
        .tm-stat { min-width: 80px; padding: 10px 12px; }
        .tm-stat-value { font-size: 18px; }
        .tm-card { padding: 14px 14px; }
        .tm-card-title-row { flex-direction: column; }
        .tm-card-actions { width: 100%; justify-content: flex-start; }
        .tm-budget-remain { margin-left: 0; }
        .tm-person-header { flex-direction: column; align-items: flex-start; }
        .tm-person-stats { gap: 12px; }
        .tm-modal { max-width: 100%; }
      }
    `;
    document.head.appendChild(style);
  },
};
