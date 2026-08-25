// ============================================================
// Process Overview — Portal Inginerie Creativă
// Gantt: afișează exclusiv Proiect → Etapă → Task alocat, în perioada programată reală.
// Fără bare generale de membership sau proiect fără task; alocările viitoare rămân pe axa cronologică.
// ============================================================
const ProcessOverview = {
  ZOOM_PX: 28,
  LABEL_W: 240,
  ROW_H: 44,
  BAR_H: 12,
  MAX_BARS: 999,
  DEPT_H: 32,
  DAYS: 90,
  offsetDays: 0,
  projects: [],
  users: [],
  memberships: [],
  taskAssignments: [],
  tasks: [],
  phases: [],
  viewSettings: null,

  isAdmin() {
    return Auth.currentProfile?.role === 'admin';
  },

  isCoordinator() {
    return ['coordonator', 'coordinator', 'coord'].includes(Auth.currentProfile?.role);
  },

  canManageView() {
    return this.isAdmin() || this.isCoordinator();
  },

  settingsKey() {
    return `portal-ic:process-overview:${Auth.currentUser?.id || Auth.currentProfile?.id || 'guest'}`;
  },

  loadViewSettings() {
    if (this.viewSettings) return;
    const defaults = { userIds: null, department: '', role: '', sort: 'department' };
    try {
      const saved = JSON.parse(localStorage.getItem(this.settingsKey()) || 'null');
      this.viewSettings = { ...defaults, ...(saved || {}) };
    } catch (_) {
      this.viewSettings = defaults;
    }
  },

  saveViewSettings() {
    try { localStorage.setItem(this.settingsKey(), JSON.stringify(this.viewSettings)); } catch (_) {}
  },

  setViewSetting(key, value) {
    this.loadViewSettings();
    this.viewSettings[key] = value;
    this.saveViewSettings();
    this.renderPage();
  },

  resetViewSettings() {
    this.viewSettings = { userIds: null, department: '', role: '', sort: 'department' };
    this.saveViewSettings();
    this.renderPage();
  },

  toDateString(date) {
    const d = date instanceof Date ? date : new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  addDays(dateString, days) {
    const d = new Date(`${dateString}T12:00:00`);
    d.setDate(d.getDate() + days);
    return this.toDateString(d);
  },

  userRoleLabel(user) {
    return user.role || user.position || user.job_title || 'Fără rol';
  },

  visibleUsers() {
    this.loadViewSettings();
    const selected = this.viewSettings.userIds === null ? null : new Set(this.viewSettings.userIds.map(String));
    return this.users.filter(user => {
      if (user.is_active === false) return false;
      if (selected && !selected.has(String(user.id))) return false;
      if (this.viewSettings.department && (user.department || 'General') !== this.viewSettings.department) return false;
      if (this.viewSettings.role && this.userRoleLabel(user) !== this.viewSettings.role) return false;
      return true;
    });
  },

  groupedUsers() {
    const users = [...this.visibleUsers()];
    const sort = this.viewSettings?.sort || 'department';
    const alpha = (a, b) => String(a.full_name || a.name || '').localeCompare(String(b.full_name || b.name || ''), 'ro');
    if (sort === 'alphabetic') return [{ label: 'Echipă', users: users.sort(alpha) }];
    const field = sort === 'role' ? (u => this.userRoleLabel(u)) : (u => u.department || 'General');
    const groups = {};
    users.forEach(user => {
      const key = field(user);
      if (!groups[key]) groups[key] = [];
      groups[key].push(user);
    });
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b, 'ro'))
      .map(([label, groupUsers]) => ({ label, users: groupUsers.sort(alpha) }));
  },

  // Configurația Gantt este comună pentru firmă și poate fi modificată numai de admin.
  layoutLoaded: false,
  layoutDraft: null,

  canManageView() { return this.isAdmin(); },
  settingsKey() { return 'process_overview_layout'; },
  defaultViewSettings() { return { userIds: null, departmentOrder: [], userOrder: [] }; },

  async loadViewSettings() {
    if (this.layoutLoaded) return;
    this.viewSettings = this.defaultViewSettings();
    try {
      const { data } = await getSupabase().from('app_settings').select('value').eq('key', this.settingsKey()).maybeSingle();
      if (data?.value) this.viewSettings = { ...this.viewSettings, ...JSON.parse(data.value) };
    } catch (_) {}
    this.layoutLoaded = true;
  },

  async saveViewSettings() {
    if (!this.isAdmin()) return;
    const sb = getSupabase();
    const payload = { key: this.settingsKey(), value: JSON.stringify(this.viewSettings), updated_by: Auth.currentUser?.id || Auth.currentProfile?.id, updated_at: new Date().toISOString() };
    const { data: existing } = await sb.from('app_settings').select('id').eq('key', this.settingsKey()).maybeSingle();
    const result = existing ? await sb.from('app_settings').update(payload).eq('id', existing.id) : await sb.from('app_settings').insert(payload);
    if (result.error) throw result.error;
  },

  async resetViewSettings() {
    if (!this.isAdmin()) return;
    this.viewSettings = this.defaultViewSettings();
    await this.saveViewSettings();
    this.renderPage();
  },

  userRoleLabel(user) { return user.position || user.job_title || 'Funcție necompletată'; },
  activeUsers() { return this.users.filter(user => user.is_active !== false); },

  orderedDepartments() {
    const available = [...new Set(this.activeUsers().map(user => user.department || 'General'))];
    const saved = this.viewSettings?.departmentOrder || [];
    return [...saved.filter(department => available.includes(department)), ...available.filter(department => !saved.includes(department)).sort((a, b) => a.localeCompare(b, 'ro'))];
  },

  orderedUsers(department) {
    const users = this.activeUsers().filter(user => (user.department || 'General') === department);
    const saved = this.viewSettings?.userOrder || [];
    const index = id => { const found = saved.indexOf(String(id)); return found < 0 ? Number.MAX_SAFE_INTEGER : found; };
    return users.sort((a, b) => index(a.id) - index(b.id) || String(a.full_name || a.name || '').localeCompare(String(b.full_name || b.name || ''), 'ro'));
  },

  visibleUsers() {
    const ids = this.viewSettings?.userIds;
    const selected = ids === null || !ids ? null : new Set(ids.map(String));
    return this.activeUsers().filter(user => !selected || selected.has(String(user.id)));
  },

  groupedUsers() {
    const selected = new Set(this.visibleUsers().map(user => String(user.id)));
    return this.orderedDepartments().map(label => ({ label, users: this.orderedUsers(label).filter(user => selected.has(String(user.id))) })).filter(group => group.users.length);
  },

  draftOrderedUsers(department) {
    const users = this.activeUsers().filter(user => (user.department || 'General') === department);
    const order = this.layoutDraft?.userOrder || [];
    const index = id => { const found = order.indexOf(String(id)); return found < 0 ? Number.MAX_SAFE_INTEGER : found; };
    return users.sort((a, b) => index(a.id) - index(b.id) || String(a.full_name || a.name || '').localeCompare(String(b.full_name || b.name || ''), 'ro'));
  },

  openLayoutEditor() {
    if (!this.isAdmin()) return;
    const allUsers = this.activeUsers();
    this.layoutDraft = {
      userIds: this.viewSettings.userIds === null ? allUsers.map(user => String(user.id)) : [...this.viewSettings.userIds],
      departmentOrder: [...this.orderedDepartments()],
      userOrder: [...(this.viewSettings.userOrder || [])],
    };
    openModal('Aranjare Process Overview', `<p class="text-sm text-muted" style="margin:0 0 12px">Selectează persoanele și stabilește ordinea departamentelor și a oamenilor. Setarea se aplică tuturor utilizatorilor portalului.</p><div id="po-layout-editor"></div>`, `<button class="btn-secondary" onclick="closeModalForce()">Anulează</button><button class="btn-brand" onclick="ProcessOverview.saveLayoutEditor()">Salvează aranjarea</button>`);
    this.renderLayoutEditor();
  },

  renderLayoutEditor() {
    const target = document.getElementById('po-layout-editor');
    if (!target || !this.layoutDraft) return;
    const selected = new Set(this.layoutDraft.userIds);
    target.innerHTML = this.layoutDraft.departmentOrder.map((department, groupIndex) => {
      const users = this.draftOrderedUsers(department);
      return `<div style="border:1px solid var(--border);border-radius:8px;margin-bottom:10px;overflow:hidden"><div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#F8FAFC"><strong style="flex:1;font-size:12px">${department}</strong><button class="btn-secondary" style="padding:2px 6px;font-size:11px" onclick="ProcessOverview.moveDraftDepartment(${groupIndex},-1)">↑</button><button class="btn-secondary" style="padding:2px 6px;font-size:11px" onclick="ProcessOverview.moveDraftDepartment(${groupIndex},1)">↓</button></div>${users.map(user => `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-top:1px solid var(--border)"><input type="checkbox" ${selected.has(String(user.id)) ? 'checked' : ''} onchange="ProcessOverview.toggleDraftUser('${user.id}',this.checked)"><span style="flex:1"><strong style="font-size:12px">${user.full_name || user.name}</strong><span class="text-xs text-muted" style="display:block">${this.userRoleLabel(user)}</span></span><button class="btn-secondary" style="padding:2px 6px;font-size:11px" onclick="ProcessOverview.moveDraftUser('${user.id}',-1)">↑</button><button class="btn-secondary" style="padding:2px 6px;font-size:11px" onclick="ProcessOverview.moveDraftUser('${user.id}',1)">↓</button></div>`).join('')}</div>`;
    }).join('');
  },

  moveDraftDepartment(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= this.layoutDraft.departmentOrder.length) return;
    const order = [...this.layoutDraft.departmentOrder];
    [order[index], order[target]] = [order[target], order[index]];
    this.layoutDraft.departmentOrder = order;
    this.renderLayoutEditor();
  },

  moveDraftUser(userId, direction) {
    const user = this.activeUsers().find(item => String(item.id) === String(userId));
    if (!user) return;
    const peers = this.draftOrderedUsers(user.department || 'General').filter(item => this.layoutDraft.userIds.includes(String(item.id)));
    const index = peers.findIndex(item => String(item.id) === String(userId));
    const target = index + direction;
    if (target < 0 || target >= peers.length) return;
    const fromId = String(peers[index].id), toId = String(peers[target].id);
    const order = [...this.layoutDraft.userOrder];
    const fromIndex = order.indexOf(fromId), toIndex = order.indexOf(toId);
    if (fromIndex >= 0 && toIndex >= 0) [order[fromIndex], order[toIndex]] = [order[toIndex], order[fromIndex]];
    else if (fromIndex < 0 && toIndex < 0) { order.push(...peers.map(item => String(item.id))); [order[order.length - peers.length + index], order[order.length - peers.length + target]] = [order[order.length - peers.length + target], order[order.length - peers.length + index]]; }
    this.layoutDraft.userOrder = order;
    this.renderLayoutEditor();
  },

  toggleDraftUser(userId, checked) {
    const ids = new Set(this.layoutDraft.userIds);
    checked ? ids.add(String(userId)) : ids.delete(String(userId));
    this.layoutDraft.userIds = [...ids];
    this.renderLayoutEditor();
  },

  async saveLayoutEditor() {
    this.viewSettings = { ...this.defaultViewSettings(), ...this.layoutDraft };
    await this.saveViewSettings();
    closeModalForce();
    this.renderPage();
  },

  resolveTaskPeriod(task, project, assignment = null) {
    const assignmentStart = assignment?.start_date;
    const assignmentEnd = assignment?.end_date;
    if (assignmentStart && assignmentEnd) return { start: assignmentStart, end: assignmentEnd, source: 'assignment', explicit: true };
    if (task.task_start_date && task.task_end_date) return { start: task.task_start_date, end: task.task_end_date, source: 'task', explicit: true };
    if (assignmentStart) return { start: assignmentStart, end: this.addDays(assignmentStart, 4), source: 'assignment', explicit: false };
    if (assignmentEnd) return { start: this.addDays(assignmentEnd, -4), end: assignmentEnd, source: 'assignment', explicit: false };
    if (task.task_start_date) return { start: task.task_start_date, end: this.addDays(task.task_start_date, 4), source: 'task', explicit: false };
    if (task.task_end_date) return { start: this.addDays(task.task_end_date, -4), end: task.task_end_date, source: 'task', explicit: false };
    return null;
  },

  makeTaskBar(task, project, userId, assignment = null) {
    const phase = this.phases.find(ph => ph.id === task.phase_id);
    const period = this.resolveTaskPeriod(task, project, assignment);
    if (!period) return null;
    const workedH = Math.round(((task.minutes_worked || 0) / 60) * 10) / 10;
    const budgetH = Number(task.budget_hours || 0);
    return {
      assignmentId: assignment?.id || null,
      taskId: task.id,
      taskName: task.name,
      phaseName: phase?.name || '',
      phaseId: task.phase_id,
      projName: project.name,
      projId: project.id,
      projCode: project.abbreviation || project.code,
      projColor: project.color || '#FFCB09',
      userId,
      start_date: period.start,
      end_date: period.end,
      periodSource: period.source,
      hasExplicitPeriod: period.explicit,
      budgetH,
      workedH,
      pct: budgetH > 0 ? Math.min(100, Math.round((workedH / budgetH) * 100)) : 0,
    };
  },

  buildUserBars(activeProjects) {
    const barsByUser = {};
    const taskById = new Map(this.tasks.map(task => [String(task.id), task]));
    const projectById = new Map(activeProjects.map(project => [String(project.id), project]));
    const byTaskUser = new Map();
    const sourceWeight = { assignment: 4, task: 3, project: 2, unscheduled: 1 };
    const addBar = bar => {
      if (!bar) return;
      const key = `${bar.taskId || 'project'}:${bar.userId}`;
      const existing = byTaskUser.get(key);
      if (existing && sourceWeight[existing.periodSource] >= sourceWeight[bar.periodSource]) return;
      if (existing) {
        const list = barsByUser[bar.userId] || [];
        const index = list.indexOf(existing);
        if (index >= 0) list.splice(index, 1);
      }
      if (!barsByUser[bar.userId]) barsByUser[bar.userId] = [];
      barsByUser[bar.userId].push(bar);
      byTaskUser.set(key, bar);
    };

    this.taskAssignments.forEach(assignment => {
      const task = taskById.get(String(assignment.task_id));
      const project = projectById.get(String(assignment.project_id));
      if (task && project && assignment.user_id) addBar(this.makeTaskBar(task, project, assignment.user_id, assignment));
    });

    this.tasks.forEach(task => {
      const project = projectById.get(String(task.project_id));
      if (!project) return;
      const assignedIds = new Set([task.assigned_user_id, ...(Array.isArray(task.assigned_users) ? task.assigned_users : [])].filter(Boolean).map(String));
      assignedIds.forEach(userId => {
        const matching = this.taskAssignments.find(a => String(a.task_id) === String(task.id) && String(a.user_id) === userId) || null;
        addBar(this.makeTaskBar(task, project, userId, matching));
      });
    });

    return barsByUser;
  },

  aggregateProjectBars(barsByUser) {
    const aggregated = {};
    Object.entries(barsByUser).forEach(([userId, bars]) => {
      const byProject = new Map();
      bars.forEach(bar => {
        const key = String(bar.projId);
        if (!byProject.has(key)) {
          byProject.set(key, {
            ...bar,
            taskId: null,
            assignmentId: null,
            taskName: '',
            taskDetails: [],
            hasExplicitPeriod: false,
            budgetH: 0,
            workedH: 0,
            pct: 0,
          });
        }
        const group = byProject.get(key);
        if (bar.start_date < group.start_date) group.start_date = bar.start_date;
        if (bar.end_date > group.end_date) group.end_date = bar.end_date;
        group.hasExplicitPeriod = group.hasExplicitPeriod || bar.hasExplicitPeriod;
        group.budgetH += Number(bar.budgetH || 0);
        group.workedH += Number(bar.workedH || 0);
        if (bar.taskName) {
          const detail = `${bar.phaseName ? `${bar.phaseName} — ` : ''}${bar.taskName}`;
          if (!group.taskDetails.includes(detail)) group.taskDetails.push(detail);
        }
      });
      aggregated[userId] = [...byProject.values()].map(group => ({
        ...group,
        taskDetails: group.taskDetails.sort((a, b) => a.localeCompare(b, 'ro')),
        pct: group.budgetH > 0 ? Math.min(100, Math.round((group.workedH / group.budgetH) * 100)) : 0,
      }));
    });
    return aggregated;
  },

  layoutBars(bars, startDate, days) {
    const timelineStart = new Date(`${this.toDateString(startDate)}T12:00:00`);
    const timelineEnd = new Date(timelineStart);
    timelineEnd.setDate(timelineEnd.getDate() + days - 1);
    const tracks = [];
    const arranged = [];
    [...bars].sort((a, b) => {
      if (b.hasExplicitPeriod !== a.hasExplicitPeriod) return b.hasExplicitPeriod ? 1 : -1;
      return new Date(`${a.start_date}T12:00:00`) - new Date(`${b.start_date}T12:00:00`);
    }).forEach(bar => {
      const sourceStart = new Date(`${bar.start_date}T12:00:00`);
      const sourceEnd = new Date(`${bar.end_date}T12:00:00`);
      const barStart = sourceStart < timelineStart ? timelineStart : sourceStart;
      const barEnd = sourceEnd > timelineEnd ? timelineEnd : sourceEnd;
      if (barStart > barEnd) return;
      const left = Math.round((barStart - timelineStart) / 86400000) * this.ZOOM_PX;
      const width = Math.max(this.ZOOM_PX, Math.round((barEnd - barStart) / 86400000 + 1) * this.ZOOM_PX);
      let track = tracks.findIndex(end => end <= left);
      if (track < 0) { track = tracks.length; tracks.push(-Infinity); }
      tracks[track] = left + width + 3;
      arranged.push({ ...bar, left, width, track });
    });
    const rowHeight = Math.max(this.ROW_H, 14 + Math.max(1, tracks.length) * (this.BAR_H + 7));
    return { bars: arranged, rowHeight };
  },

  renderControls() {
    if (!this.isAdmin()) return '';
    const displayed = this.visibleUsers().length;
    return `
      <div class="card" style="padding:12px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:11px;font-weight:800;color:var(--text-muted);letter-spacing:.03em">ARANJARE GANTT</span>
        <span class="text-sm text-muted">${displayed} persoane vizibile pentru toată echipa</span>
        <button class="btn-secondary" style="height:34px;padding:0 10px;margin-left:auto" onclick="ProcessOverview.openLayoutEditor()">Aranjează persoane și departamente</button>
        <button style="border:0;background:none;color:var(--text-muted);font-size:12px;cursor:pointer" onclick="ProcessOverview.resetViewSettings()">Resetează</button>
      </div>`;
  },

  openPeopleSelector() {
    if (!this.canManageView()) return;
    this.loadViewSettings();
    const selected = this.viewSettings.userIds === null ? new Set(this.users.map(user => String(user.id))) : new Set(this.viewSettings.userIds.map(String));
    const users = [...this.users].filter(user => user.is_active !== false).sort((a, b) => String(a.full_name || a.name || '').localeCompare(String(b.full_name || b.name || ''), 'ro'));
    openModal('Persoane afișate în Gantt', `
      <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:12px"><span class="text-sm text-muted">Alege persoanele care apar în Gantt. Preferința se salvează pentru contul tău.</span><button class="btn-secondary" style="padding:5px 8px;font-size:11px" onclick="ProcessOverview.toggleAllPeople(true)">Toți</button></div>
      <div id="po-people-list" style="max-height:360px;overflow:auto;border:1px solid var(--border);border-radius:8px">
        ${users.map(user => `<label style="display:flex;align-items:center;gap:9px;padding:9px 10px;border-bottom:1px solid var(--border);cursor:pointer"><input type="checkbox" class="po-person-check" value="${user.id}" ${selected.has(String(user.id)) ? 'checked' : ''}/><span style="flex:1"><strong style="font-size:13px">${user.full_name || user.name}</strong><span class="text-xs text-muted" style="display:block;margin-top:2px">${user.department || 'General'} · ${this.userRoleLabel(user)}</span></span></label>`).join('')}
      </div>
    `, `<button class="btn-secondary" onclick="closeModalForce()">Anulează</button><button class="btn-brand" onclick="ProcessOverview.savePeopleSelection()">Salvează afișarea</button>`);
  },

  toggleAllPeople(checked) {
    document.querySelectorAll('.po-person-check').forEach(input => { input.checked = checked; });
  },

  savePeopleSelection() {
    this.loadViewSettings();
    this.viewSettings.userIds = [...document.querySelectorAll('.po-person-check:checked')].map(input => input.value);
    this.saveViewSettings();
    closeModalForce();
    this.renderPage();
  },

  async render() {
    const content = document.getElementById('page-content');
    content.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>Se încarcă...</p></div>`;

    const [projRes, userRes] = await Promise.all([DB.getProjects(), DB.getUsers()]);
    this.projects = (projRes.data || []).filter(p => p.status !== 'arhivat');
    this.users = userRes.data || [];
    await this.loadViewSettings();

    const activeProjects = this.projects.filter(p => p.status === 'activ' || p.status === 'in_progress');

    if (activeProjects.length > 0) {
      const projIds = activeProjects.map(p => p.id);
      const [membRes, tasksRes, phasesRes, assignRes] = await Promise.all([
        dbQuery('project_members', q =>
          q.select('project_id,user_id,role').in('project_id', projIds), []),
        dbQuery('project_tasks', q =>
          q.select('id,name,phase_id,project_id,assigned_user_id,assigned_users,task_start_date,task_end_date,budget_hours,minutes_worked,status').in('project_id', projIds), []),
        dbQuery('project_phases', q =>
          q.select('id,name,project_id').in('project_id', projIds), []),
        dbQuery('project_task_assignments', q =>
          q.select('id,task_id,project_id,user_id,start_date,end_date').in('project_id', projIds), []),
      ]);
      this.memberships = membRes.data || [];
      this.tasks = tasksRes.data || [];
      this.phases = phasesRes.data || [];
      this.taskAssignments = assignRes.data || [];
    } else {
      this.memberships = [];
      this.tasks = [];
      this.phases = [];
      this.taskAssignments = [];
    }

    this.renderPage();
  },

  renderPage() {
    const content = document.getElementById('page-content');
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() + this.offsetDays);
    const days = this.DAYS;
    const totalW = days * this.ZOOM_PX;
    const LW = this.LABEL_W;
    const activeProjects = this.projects.filter(p => p.status === 'activ' || p.status === 'in_progress');
    const profile = Auth.currentProfile;
    const isAdmin = profile?.role === 'admin';

    // Sunt incluse numai task-urile alocate, cu perioadă pe alocare sau pe task.
    // Proiectele fără task programat și simpla apartenență în proiect nu generează bare.
    const userBarsMap = this.buildUserBars(activeProjects);
    const userGroups = this.groupedUsers();

    // Month header
    let monthSegs = [];
    for (let d = 0; d < days; d++) {
      const dt = new Date(startDate);
      dt.setDate(dt.getDate() + d);
      const key = `${dt.getFullYear()}-${dt.getMonth()}`;
      if (!monthSegs.length || monthSegs[monthSegs.length - 1].key !== key) {
        monthSegs.push({ key, label: dt.toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' }), start: d, count: 1 });
      } else {
        monthSegs[monthSegs.length - 1].count++;
      }
    }

    // Day header
    let dayHeader = '';
    for (let d = 0; d < days; d++) {
      const dt = new Date(startDate);
      dt.setDate(dt.getDate() + d);
      const isToday = dt.toDateString() === today.toDateString();
      const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
      dayHeader += `<div class="gantt-day-cell ${isToday ? 'today' : ''} ${isWeekend ? 'weekend' : ''}">${dt.getDate()}</div>`;
    }

    // Rânduri: fiecare task suprapus primește o pistă verticală proprie.
    let rowsHtml = '';
    if (userGroups.length === 0) {
      rowsHtml = `<div style="padding:48px;text-align:center;color:var(--text-muted)">Nu există persoane care corespund filtrelor selectate.</div>`;
    } else {
      userGroups.forEach(group => {
        rowsHtml += `
          <div class="gantt-row dept-row">
            <div class="gantt-label dept-label" style="width:${LW}px">${group.label}</div>
            <div class="gantt-cells" style="width:${totalW}px">${this._weekendCells(startDate, days)}</div>
          </div>`;
        group.users.forEach(user => {
          const layout = this.layoutBars(userBarsMap[user.id] || [], startDate, days);
          const barsHtml = layout.bars.map(bar => {
            const color = bar.projColor;
            const textColor = this.isLightColor(color) ? '#221F1F' : '#fff';
            const top = 8 + bar.track * (this.BAR_H + 7);
            const barLabel = `${bar.projCode || bar.projName} — ${bar.taskName}`;
            const opacity = bar.hasExplicitPeriod ? '1' : '0.72';
            const border = bar.hasExplicitPeriod ? '' : 'border:1px dashed rgba(0,0,0,0.32);';
            const periodHint = bar.hasExplicitPeriod ? 'Perioadă programată' : 'Perioadă estimată dintr-o dată setată';
            const safeTaskName = (bar.taskName || '').replace(/"/g, '&quot;');
            const safeProjName = (bar.projName || '').replace(/"/g, '&quot;');
            const safePhaseName = (bar.phaseName || '').replace(/"/g, '&quot;');
            const safeTaskList = encodeURIComponent((bar.taskDetails || (bar.taskName ? [`${bar.phaseName ? `${bar.phaseName} — ` : ''}${bar.taskName}`] : [])).join('\n'));
            const canDrag = this.canManageView() && bar.assignmentId;
            const dragHandles = canDrag ? `<div class="gantt-bar-handle gantt-bar-handle-left" onmousedown="ProcessOverview.startDrag(event,this.parentElement,'left')" style="position:absolute;left:0;top:0;width:6px;height:100%;cursor:ew-resize;background:rgba(0,0,0,0.15);border-radius:4px 0 0 4px"></div><div class="gantt-bar-handle gantt-bar-handle-right" onmousedown="ProcessOverview.startDrag(event,this.parentElement,'right')" style="position:absolute;right:0;top:0;width:6px;height:100%;cursor:ew-resize;background:rgba(0,0,0,0.15);border-radius:0 4px 4px 0"></div>` : '';
            return `<div class="gantt-bar po-bar" style="left:${bar.left}px;top:${top}px;width:${bar.width}px;background:${color};color:${textColor};opacity:${opacity};${border}cursor:pointer;position:absolute" data-assignment-id="${bar.assignmentId || ''}" data-task-id="${bar.taskId || ''}" data-proj-id="${bar.projId || ''}" data-is-admin="${this.isAdmin() ? '1' : '0'}" data-task-name="${safeTaskName}" data-task-list="${safeTaskList}" data-proj-name="${safeProjName}" data-phase-name="${safePhaseName}" data-start="${bar.start_date}" data-end="${bar.end_date}" data-budget="${bar.budgetH}" data-worked="${bar.workedH}" data-pct="${bar.pct}" data-bar-color="${color}" title="${periodHint}" onmouseenter="ProcessOverview.showTooltip(event,this)" onmouseleave="ProcessOverview.hideTooltip()" onclick="ProcessOverview.handleBarClick(event,this)"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none">${barLabel}</span>${dragHandles}</div>`;
          }).join('');
          rowsHtml += `
            <div class="gantt-row" style="height:${layout.rowHeight}px">
              <div class="gantt-label" style="width:${LW}px;height:${layout.rowHeight}px">
                <div class="gantt-user-avatar">${Auth.getInitials(user.full_name || user.name || '')}</div>
                <div class="gantt-user-info"><div class="gantt-user-name">${user.full_name || user.name || 'Fără nume'}</div><div class="gantt-user-pos" style="font-size:10px">${this.userRoleLabel(user)}</div></div>
              </div>
              <div class="gantt-cells" style="width:${totalW}px;position:relative;height:${layout.rowHeight}px">${this._weekendCells(startDate, days)}${this._todayLine(startDate, days)}${barsHtml}</div>
            </div>`;
        });
      });
    }

    const monthHeaderHtml = monthSegs.map(s =>
      `<div class="gantt-month-cell" style="width:${s.count * this.ZOOM_PX}px">${s.label}</div>`
    ).join('');

    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Process Overview</h1>
          <p class="page-subtitle">Vizualizare Gantt \u2014 task-uri alocate per angajat (Proiect \u2192 Etap\u0103 \u2192 Task)</p>
        </div>
        <div class="flex gap-2">
          <button class="btn-secondary" onclick="ProcessOverview.shiftDays(-${this.DAYS})" title="Perioad\u0103 anterioar\u0103">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
            Anterior
          </button>
          <button class="btn-secondary" onclick="ProcessOverview.resetView()">Azi</button>
          <button class="btn-secondary" onclick="ProcessOverview.shiftDays(${this.DAYS})" title="Perioad\u0103 urm\u0103toare">
            Urm\u0103tor
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>
      ${this.renderControls()}
      <div class="card" style="padding:0;overflow:hidden">
        ${activeProjects.length > 0 ? `
        <div class="gantt-legend">
          <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
            ${activeProjects.map(p =>
              `<div class="gantt-legend-item">
                <div class="gantt-legend-dot" style="background:${p.color || '#FFCB09'}"></div>
                <span>${p.abbreviation || p.code} \u2014 ${p.name}</span>
              </div>`
            ).join('')}
            <div style="display:flex;align-items:center;gap:6px;margin-left:auto;font-size:11px;color:var(--text-muted)">
              <div style="width:20px;height:10px;background:#aaa;border:1px dashed rgba(0,0,0,0.3);border-radius:2px;opacity:0.6"></div>
              <span>Perioadă estimată — task fără interval explicit</span>
            </div>
          </div>
        </div>` : ''}
        <div class="gantt-container" id="gantt-scroll">
          <div class="gantt-header-row">
            <div class="gantt-header-label" style="width:${LW}px">Angajat</div>
            <div class="gantt-header-timeline" style="width:${totalW}px">
              <div class="gantt-months">${monthHeaderHtml}</div>
              <div class="gantt-days">${dayHeader}</div>
            </div>
          </div>
          <div class="gantt-body">
            ${rowsHtml}
          </div>
        </div>
      </div>
      <!-- Tooltip Gantt -->
      <div id="po-tooltip" style="display:none;position:fixed;z-index:9999;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.18);padding:14px 18px;min-width:220px;max-width:320px;pointer-events:none;font-size:13px;line-height:1.6;"></div>
      <!-- Modal info bar (non-admin) -->
      <div id="po-info-modal" style="display:none;position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.35);align-items:center;justify-content:center">
        <div style="background:var(--card-bg);border-radius:14px;padding:28px 32px;min-width:340px;max-width:460px;box-shadow:0 16px 48px rgba(0,0,0,0.22)">
          <div id="po-info-modal-content"></div>
          <div style="text-align:right;margin-top:20px">
            <button class="btn-primary" onclick="document.getElementById('po-info-modal').style.display='none'">Închide</button>
          </div>
        </div>
      </div>
    `;
  },

  showTooltip(e, el) {
    const tooltip = document.getElementById('po-tooltip');
    if (!tooltip) return;
    const projName = el.dataset.projName || '';
    const phaseName = el.dataset.phaseName || '';
    const taskName = el.dataset.taskName || '';
    const taskList = (() => { try { return decodeURIComponent(el.dataset.taskList || '').split('\n').filter(Boolean); } catch (_) { return []; } })();
    const start = el.dataset.start || '';
    const end = el.dataset.end || '';
    const budget = parseFloat(el.dataset.budget || '0');
    const worked = parseFloat(el.dataset.worked || '0');
    const pct = parseInt(el.dataset.pct || '0');
    const isAdmin = el.dataset.isAdmin === '1';
    const fmtDate = d => d ? new Date(d).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const barColor = pct > 90 ? '#EF4444' : pct > 70 ? '#F59E0B' : '#10B981';
    let html = `<div style="font-weight:700;font-size:14px;margin-bottom:6px">${projName}</div>`;
    if (phaseName) html += `<div style="color:var(--text-muted);font-size:12px;margin-bottom:2px">📁 ${phaseName}</div>`;
    if (taskName) html += `<div style="font-weight:600;margin-bottom:8px">✅ ${taskName}</div>`;
    if (taskList.length) html += `<div style="margin:8px 0"><div style="font-size:11px;font-weight:800;color:var(--text-muted);letter-spacing:.03em;margin-bottom:4px">TASK-URI ALOCATE (${taskList.length})</div><div style="max-height:110px;overflow:auto;font-size:12px">${taskList.map(task => `<div style="padding:2px 0">• ${task}</div>`).join('')}</div></div>`;
    html += `<div style="display:flex;gap:16px;font-size:12px;color:var(--text-muted);margin-bottom:8px"><span>📅 ${fmtDate(start)}</span><span>→</span><span>${fmtDate(end)}</span></div>`;
    if (budget > 0) {
      html += `<div style="margin-bottom:6px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px"><span>Progres ore</span><span style="color:${barColor};font-weight:600">${worked}h / ${budget}h (${pct}%)</span></div><div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px"></div></div></div>`;
    }
    const projId = el.dataset.projId || '';
    if (projId) {
      html += `<div style="margin-top:8px;font-size:11px;color:var(--primary);font-weight:600">🖱 Click pentru a deschide proiectul</div>`;
    } else if (taskName) {
      html += `<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">🖱 Click pentru detalii</div>`;
    }
    tooltip.innerHTML = html;
    tooltip.style.display = 'block';
    const margin = 14;
    const tw = tooltip.offsetWidth || 280;
    const th = tooltip.offsetHeight || 140;
    let x = e.clientX + margin;
    let y = e.clientY + margin;
    if (x + tw > window.innerWidth - 8) x = e.clientX - tw - margin;
    if (y + th > window.innerHeight - 8) y = e.clientY - th - margin;
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  },

  hideTooltip() {
    const tooltip = document.getElementById('po-tooltip');
    if (tooltip) tooltip.style.display = 'none';
  },

  handleBarClick(eventOrEl, maybeEl) {
    // Suportă și semnătura veche (doar el) cât și nouă (event, el)
    const el = maybeEl || eventOrEl;
    const event = maybeEl ? eventOrEl : null;
    // Dacă tocmai s-a terminat un drag, nu deschide pagina proiectului
    if (this._justDragged) {
      this._justDragged = false;
      if (event) { event.stopPropagation(); event.preventDefault(); }
      return;
    }
    this.hideTooltip();
    const isAdmin = el.dataset.isAdmin === '1';
    const taskId = el.dataset.taskId;
    const projId = el.dataset.projId;
    const taskName = el.dataset.taskName || '';
    const projName = el.dataset.projName || '';
    const phaseName = el.dataset.phaseName || '';
    const start = el.dataset.start || '';
    const end = el.dataset.end || '';
    const budget = parseFloat(el.dataset.budget || '0');
    const worked = parseFloat(el.dataset.worked || '0');
    const pct = parseInt(el.dataset.pct || '0');
    const barColor2 = pct > 90 ? '#EF4444' : pct > 70 ? '#F59E0B' : '#10B981';
    if (projId) {
      openProjectDirect(projId);
      return;
    }
    const fmtDate = d => d ? new Date(d).toLocaleDateString('ro-RO', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
    let html = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px"><div style="width:14px;height:14px;border-radius:3px;background:${el.dataset.barColor || '#FFCB09'};flex-shrink:0"></div><h3 style="margin:0;font-size:16px;font-weight:700">${projName}</h3></div>`;
    if (phaseName) html += `<div style="margin-bottom:6px;color:var(--text-muted);font-size:13px">📁 Etapă: <strong style="color:var(--text)">${phaseName}</strong></div>`;
    if (taskName) html += `<div style="margin-bottom:12px;font-size:14px">✅ Task: <strong>${taskName}</strong></div>`;
    html += `<div style="display:flex;gap:24px;margin-bottom:12px;font-size:13px"><div><div style="color:var(--text-muted);font-size:11px;margin-bottom:2px">DATA START</div><strong>${fmtDate(start)}</strong></div><div><div style="color:var(--text-muted);font-size:11px;margin-bottom:2px">DATA FINAL</div><strong>${fmtDate(end)}</strong></div></div>`;
    if (budget > 0) {
      html += `<div style="margin-top:8px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span style="color:var(--text-muted)">Progres ore</span><span style="color:${barColor2};font-weight:700">${worked}h / ${budget}h (${pct}%)</span></div><div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${barColor2};border-radius:3px"></div></div></div>`;
    }
    const modal = document.getElementById('po-info-modal');
    document.getElementById('po-info-modal-content').innerHTML = html;
    modal.style.display = 'flex';
  },

  _weekendCells(startDate, days) {
    let html = '';
    for (let d = 0; d < days; d++) {
      const dt = new Date(startDate);
      dt.setDate(dt.getDate() + d);
      if (dt.getDay() === 0 || dt.getDay() === 6) {
        html += `<div class="gantt-weekend-shade" style="left:${d * this.ZOOM_PX}px;width:${this.ZOOM_PX}px"></div>`;
      }
    }
    return html;
  },

  _todayLine(startDate, days) {
    const today = new Date();
    const diff = Math.round((today - startDate) / 86400000);
    if (diff < 0 || diff >= days) return '';
    const left = diff * this.ZOOM_PX + this.ZOOM_PX / 2;
    return `<div class="gantt-today-line" style="left:${left}px"></div>`;
  },

  // ============================================================
  // DRAG & DROP pentru extindere/scurtare perioadă task (admin)
  // ============================================================
  _dragState: null,
  _justDragged: false,

  startDrag(e, barEl, edge) {
    e.preventDefault();
    e.stopPropagation();
    this.hideTooltip();
    const startX = e.clientX;
    const origLeft = parseInt(barEl.style.left) || 0;
    const origWidth = parseInt(barEl.style.width) || 0;
    const origStart = barEl.dataset.start;
    const origEnd = barEl.dataset.end;
    const assignmentId = barEl.dataset.assignmentId;
    const taskName = barEl.dataset.taskName || '';
    if (!assignmentId) return;

    this._dragState = {
      barEl, edge, startX, origLeft, origWidth,
      origStart, origEnd, assignmentId, taskName,
      newStart: origStart, newEnd: origEnd,
      moved: false,
    };

    barEl.style.opacity = '0.7';
    barEl.style.outline = '2px dashed #FFCB09';

    // Indicator dată
    let indicator = document.getElementById('po-drag-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'po-drag-indicator';
      indicator.style.cssText = 'position:fixed;z-index:10001;background:#221F1F;color:#fff;padding:6px 10px;border-radius:6px;font-size:12px;font-weight:600;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,0.3)';
      document.body.appendChild(indicator);
    }
    indicator.style.display = 'block';

    document.addEventListener('mousemove', this._onDragMove);
    document.addEventListener('mouseup', this._onDragEnd);
  },

  _onDragMove(e) {
    const s = ProcessOverview._dragState;
    if (!s) return;
    const dx = e.clientX - s.startX;
    const ZOOM = ProcessOverview.ZOOM_PX;
    const days = Math.round(dx / ZOOM);
    if (days !== 0) s.moved = true;

    const origStartDate = new Date(s.origStart);
    const origEndDate = new Date(s.origEnd);

    if (s.edge === 'left') {
      const newStartDate = new Date(origStartDate);
      newStartDate.setDate(newStartDate.getDate() + days);
      // Nu permite start după end
      if (newStartDate >= origEndDate) return;
      s.newStart = newStartDate.toISOString().split('T')[0];
      const newWidth = Math.max(ZOOM, s.origWidth - days * ZOOM);
      const newLeft = s.origLeft + days * ZOOM;
      s.barEl.style.left = newLeft + 'px';
      s.barEl.style.width = newWidth + 'px';
    } else {
      const newEndDate = new Date(origEndDate);
      newEndDate.setDate(newEndDate.getDate() + days);
      if (newEndDate <= origStartDate) return;
      s.newEnd = newEndDate.toISOString().split('T')[0];
      const newWidth = Math.max(ZOOM, s.origWidth + days * ZOOM);
      s.barEl.style.width = newWidth + 'px';
    }

    // Actualizează indicator
    const indicator = document.getElementById('po-drag-indicator');
    if (indicator) {
      const fmt = d => new Date(d).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' });
      indicator.textContent = `${fmt(s.newStart)} → ${fmt(s.newEnd)}`;
      indicator.style.left = (e.clientX + 14) + 'px';
      indicator.style.top = (e.clientY - 30) + 'px';
    }
  },

  async _onDragEnd(e) {
    const s = ProcessOverview._dragState;
    if (!s) return;
    document.removeEventListener('mousemove', ProcessOverview._onDragMove);
    document.removeEventListener('mouseup', ProcessOverview._onDragEnd);

    const indicator = document.getElementById('po-drag-indicator');
    if (indicator) indicator.style.display = 'none';
    s.barEl.style.opacity = '';
    s.barEl.style.outline = '';

    if (!s.moved || (s.newStart === s.origStart && s.newEnd === s.origEnd)) {
      ProcessOverview._dragState = null;
      return;
    }

    ProcessOverview._justDragged = true;
    setTimeout(() => { ProcessOverview._justDragged = false; }, 300);

    // Salvează în DB
    try {
      const { error } = await getSupabase()
        .from('project_task_assignments')
        .update({ start_date: s.newStart, end_date: s.newEnd })
        .eq('id', s.assignmentId);
      if (error) throw error;

      // Actualizează cache local
      const a = ProcessOverview.taskAssignments.find(x => x.id == s.assignmentId);
      if (a) {
        a.start_date = s.newStart;
        a.end_date = s.newEnd;
      }

      const fmtDate = d => new Date(d).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' });
      showToast(`Perioadă actualizată: ${fmtDate(s.newStart)} → ${fmtDate(s.newEnd)}`, 'success');
      ProcessOverview.renderPage();
    } catch (err) {
      console.error('Eroare salvare perioadă:', err);
      showToast('Eroare la salvarea perioadei: ' + err.message, 'error');
      ProcessOverview.renderPage();
    }

    ProcessOverview._dragState = null;
  },

  shiftDays(n) {
    this.offsetDays += n;
    this.renderPage();
    const scroll = document.getElementById('gantt-scroll');
    if (scroll) scroll.scrollLeft = 0;
  },

  resetView() {
    this.offsetDays = 0;
    this.renderPage();
  },

  isLightColor(hex) {
    if (!hex) return false;
    const h = hex.replace('#', '');
    if (h.length < 6) return false;
    const r = parseInt(h.substr(0,2),16);
    const g = parseInt(h.substr(2,2),16);
    const b = parseInt(h.substr(4,2),16);
    const luminance = (0.299*r + 0.587*g + 0.114*b) / 255;
    return luminance > 0.55;
  },
};
