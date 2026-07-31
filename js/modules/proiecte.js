// ============================================================
// MODUL PROIECTE — Portal Inginerie Creativă
// Etape prestabilite, buget ore, coordonatori, echipă, timer
// ============================================================

// Etape și task-uri prestabilite
const PRESET_PHASES = [
  {
    code: 'A', name: 'Administrativ pe proiect', color: '#3B82F6',
    tasks: [
      'Creare proiect Portal IC + Google Drive',
      'Verificare date Input',
      'Calendar - întocmire și prezentare',
      'Comunicare cu beneficiarul (mail-uri, telefoane, zoom-uri de lămurire)',
      'Comunicare cu echipa de proiectare',
      'Print + livrare fizica',
    ]
  },
  {
    code: 'B', name: 'Proiectare Arhitectura', color: '#EC4899',
    tasks: [
      'Teme de proiectare',
      'Modelare 3D Draft 1',
      'Modelare 3D Draft 2',
      'Corelare specialități',
      'Prezentare către beneficiar',
      'Verificare de către coordonator',
      'Implementare feedback',
      'Redactare piese desenate',
      'Redactare piese scrise',
      'Livrare electronică',
    ]
  },
  {
    code: 'C', name: 'Etape Structura', color: '#8B5CF6',
    tasks: [
      'Verificare date input și Calendar',
      'Tema de proiectare',
      'Calcul structural',
      'Modelare 3D Draft 1',
      'Modelare 3D Draft 2',
      'Corelare specialități',
      'Prezentare către beneficiar',
      'Verificare de către coordonator',
      'Implementare feedback',
      'Redactare piese desenate',
      'Redactare piese scrise',
      'Livrare electronică',
    ]
  },
  {
    code: 'D', name: 'Proiectare Instalații', color: '#F59E0B',
    tasks: [
      'Verificare date input și Calendar',
      'Tema de proiectare',
      'Modelare 3D',
      'Corelare specialități',
      'Prezentare către beneficiar',
      'Verificare de către coordonator',
      'Implementare feedback',
      'Redactare piese desenate',
      'Redactare piese scrise',
      'Livrare electronică',
    ]
  },
  {
    code: 'E', name: 'Execuție', color: '#EF4444',
    tasks: [
      'Deviz',
      'Achiziții',
      'Planificare',
      'Urmărire șantier',
      'Rapoarte',
      'Predare',
    ]
  },
  {
    code: 'F', name: 'Social Media (pe proiect)', color: '#10B981',
    tasks: [
      'Creare conținut',
    ]
  },
  {
    code: 'G', name: 'Conformare Energetică și Certificări', color: '#0EA5E9',
    tasks: [
      'Verificare date input și Calendar',
      'Tema de proiectare Studiu de Conformare',
      'Întocmire Studiu de Conformare',
      'Prezentare Studiu de conformare',
      'Implementare Feedback',
      'Livrare electronică',
      'Verificare detalii integrate',
      'Precertificare',
    ]
  },
];

const Proiecte = {
  projects: [],
  currentProject: null,
  currentTab: 'etape',
  members: [],
  phases: [],
  tasks: [],
  allUsers: [],
  taskAssignments: [],  // cache project_task_assignments pentru proiectul curent
  editMode: false,  // modul editare blocat implicit

  async init() {
    await this.loadData();
    this.renderList();
  },

  async loadData() {
    const userId = Auth.currentUser?.id;
    const isAdmin = Auth.currentProfile?.role === 'admin';
    const [projRes, usersRes, membershipsRes, allTasksRes] = await Promise.all([
      DB.getProjects(),
      DB.getUsers(),
      dbQuery('project_members', q => q.select('project_id,role').eq('user_id', userId), []),
      // Fetchăm toate task-urile pentru a calcula consumed_hours și budget_hours pe fiecare proiect
      dbQuery('project_tasks', q => q.select('project_id,minutes_worked,budget_hours'), []),
    ]);
    const allProjects = projRes.data || [];
    this.allUsers = usersRes.data || [];
    this.userMemberships = membershipsRes.data || [];
    // Calculăm consumed_hours și budget_hours din suma task-urilor fiecărui proiect
    const allTasks = allTasksRes.data || [];
    const minutesByProject = {};
    const budgetByProject = {};
    allTasks.forEach(t => {
      if (!t.project_id) return;
      if (t.minutes_worked) minutesByProject[t.project_id] = (minutesByProject[t.project_id] || 0) + t.minutes_worked;
      if (t.budget_hours) budgetByProject[t.project_id] = (budgetByProject[t.project_id] || 0) + t.budget_hours;
    });
    allProjects.forEach(p => {
      p.consumed_hours = Math.round((minutesByProject[p.id] || 0) / 60 * 10) / 10;
      // Suprascrie budget_hours cu suma reală din task-uri (câmpul din DB poate fi 0/neactualizat)
      if (budgetByProject[p.id] !== undefined) p.budget_hours = budgetByProject[p.id];
    });
    if (isAdmin) {
      this.projects = allProjects;
    } else {
      const enrolledIds = new Set(this.userMemberships.map(m => m.project_id));
      this.projects = allProjects.filter(p => enrolledIds.has(p.id));
    }
  },

  async loadProjectDetails(projectId) {
    const [membersRes, phasesRes, tasksRes, assignRes] = await Promise.all([
      dbQuery('project_members', q => q.select('*, profiles!project_members_user_id_fkey(id,full_name,name,email,employee_code,role)').eq('project_id', projectId), []),
      dbQuery('project_phases', q => q.select('*').eq('project_id', projectId).order('display_order'), []),
      dbQuery('project_tasks', q => q.select('*').eq('project_id', projectId).order('display_order'), []),
      dbQuery('project_task_assignments', q => q.select('task_id,user_id,start_date,end_date').eq('project_id', projectId), []),
    ]);
    this.members = membersRes.data || [];
    this.phases = phasesRes.data || [];
    this.tasks = tasksRes.data || [];
    this.taskAssignments = assignRes.data || [];
    // Sincronizare automată minutes_worked din time_entries + manual_hours_log
    // Rulează în background și re-renderizează dacă găsește diferențe
    this._syncTaskMinutes(projectId).catch(e => console.warn('[Proiecte] _syncTaskMinutes error:', e));
  },

  // ── Recalcul centralizat minutes_worked pentru UN task (din zero, din DB) ──
  // Apelat după orice operație de scriere (stop timer, save entry, save manual, delete, edit)
  async _recalcAndSaveTaskMinutes(taskId) {
    const sb = getSupabase();
    if (!sb) return 0;
    const [timeRes, manualRes] = await Promise.all([
      sb.from('time_entries').select('duration_minutes').eq('project_task_id', taskId),
      sb.from('manual_hours_log').select('minutes').eq('task_id', taskId),
    ]);
    const timeMin = (timeRes.data || []).reduce((s, r) => s + (r.duration_minutes || 0), 0);
    const manualMin = (manualRes.data || []).reduce((s, r) => s + (r.minutes || 0), 0);
    const realMinutes = timeMin + manualMin;
    await sb.from('project_tasks').update({ minutes_worked: realMinutes }).eq('id', taskId);
    // Actualizează și în memoria locală
    const task = this.tasks?.find(t => t.id === taskId);
    if (task) task.minutes_worked = realMinutes;
    return realMinutes;
  },

  // Recalculează minutes_worked pentru toate task-urile unui proiect
  // și salvează valorile corecte în DB (rulează în background)
  async _syncTaskMinutes(projectId) {
    const sb = getSupabase();
    if (!sb || !this.tasks || this.tasks.length === 0) return;
    const taskIds = this.tasks.map(t => t.id);
    // Preia toate time_entries și manual_hours_log pentru proiect dintr-o singură cerere
    const [timeRes, manualRes] = await Promise.all([
      sb.from('time_entries').select('project_task_id,duration_minutes').in('project_task_id', taskIds),
      sb.from('manual_hours_log').select('task_id,minutes').in('task_id', taskIds),
    ]);
    const timeEntries = timeRes.data || [];
    const manualLogs = manualRes.data || [];
    // Calculează totalul per task
    const minutesMap = {};
    for (const t of this.tasks) minutesMap[t.id] = 0;
    for (const e of timeEntries) {
      if (minutesMap[e.project_task_id] !== undefined)
        minutesMap[e.project_task_id] += (e.duration_minutes || 0);
    }
    for (const m of manualLogs) {
      if (minutesMap[m.task_id] !== undefined)
        minutesMap[m.task_id] += (m.minutes || 0);
    }
    // Actualizează task-urile care au valori diferite față de DB
    const updates = this.tasks.filter(t => minutesMap[t.id] !== (t.minutes_worked || 0));
    for (const task of updates) {
      const newVal = minutesMap[task.id];
      const { error } = await sb.from('project_tasks').update({ minutes_worked: newVal }).eq('id', task.id);
      if (!error) task.minutes_worked = newVal;
    }
    // Re-render întotdeauna după sync (valorile din memorie au fost actualizate)
    if (String(this.currentProject?.id) === String(projectId)) {
      this.renderProjectDetail();
    }
  },

  renderList() {
    const profile = Auth.currentProfile;
    const isAdmin = profile && profile.role === 'admin';
    const container = document.getElementById('page-content');
    if (!container) return;

    const statusColors = { activ: 'green', suspendat: 'yellow', finalizat: 'gray', intern: 'blue' };
    const statusLabels = { activ: 'Activ', suspendat: 'Suspendat', finalizat: 'Finalizat', intern: 'Intern' };

    const cards = this.projects.length === 0
      ? `<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--text-muted)">
          <div style="font-size:48px;margin-bottom:12px">📋</div>
          <p>Nu există proiecte încă.</p>
          ${isAdmin ? `<button class="btn-primary" style="margin-top:12px" onclick="Proiecte.openCreateModal()">Creează primul proiect</button>` : ''}
        </div>`
      : this.projects.map(p => this.renderProjectCard(p, statusColors, statusLabels)).join('');

    container.innerHTML = `
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px">
        <div>
          <h1 class="page-title">Proiecte</h1>
          <p class="page-subtitle">Gestionare proiecte și buget ore</p>
        </div>
        ${isAdmin ? `<button class="btn-primary" onclick="Proiecte.openCreateModal()">+ Proiect nou</button>` : ''}
      </div>

      <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
        <button class="btn-filter active" onclick="Proiecte.filterProjects('all',this)">Toate (${this.projects.length})</button>
        <button class="btn-filter" onclick="Proiecte.filterProjects('activ',this)">Active (${this.projects.filter(p=>p.status==='activ').length})</button>
        <button class="btn-filter" onclick="Proiecte.filterProjects('suspendat',this)">Suspendate (${this.projects.filter(p=>p.status==='suspendat').length})</button>
        <button class="btn-filter" onclick="Proiecte.filterProjects('finalizat',this)">Finalizate (${this.projects.filter(p=>p.status==='finalizat').length})</button>
      </div>

      <div id="projects-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px">
        ${cards}
      </div>
    `;
  },

  renderProjectCard(p, statusColors, statusLabels) {
    const consumed = p.consumed_hours || 0;
    const budget = p.budget_hours || 0;
    const pct = budget > 0 ? Math.min(100, Math.round((consumed / budget) * 100)) : 0;
    const barColor = pct > 90 ? '#EF4444' : pct > 70 ? '#F59E0B' : '#10B981';
    const color = p.color || '#3B82F6';

    return `
      <div class="project-card" onclick="Proiecte.openProject(${p.id})" style="cursor:pointer;background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:20px;transition:box-shadow 0.2s;border-left:4px solid ${color}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:40px;height:40px;border-radius:8px;background:${color}20;display:flex;align-items:center;justify-content:center;font-weight:700;color:${color};font-size:14px">${p.code || '?'}</div>
            <div>
              <div style="font-weight:600;font-size:15px">${p.name}</div>
              <div style="font-size:12px;color:var(--text-muted)">${p.client_name || 'Fără client'}</div>
            </div>
          </div>
          <span class="badge badge-${statusColors[p.status] || 'gray'}">${statusLabels[p.status] || p.status}</span>
        </div>
        <div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:4px">
            <span>Ore lucrate</span>
            <span style="font-weight:600;color:var(--text)">${consumed}h / ${budget}h (${pct}%)</span>
          </div>
          <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px;transition:width 0.3s"></div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text-muted)">
          📅 ${p.start_date ? formatDate(p.start_date) : '—'} → ${p.end_date ? formatDate(p.end_date) : '—'}
        </div>
      </div>
    `;
  },

  filterProjects(filter, btn) {
    document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const grid = document.getElementById('projects-grid');
    if (!grid) return;
    const filtered = filter === 'all' ? this.projects : this.projects.filter(p => p.status === filter);
    const statusColors = { activ: 'green', suspendat: 'yellow', finalizat: 'gray', intern: 'blue' };
    const statusLabels = { activ: 'Activ', suspendat: 'Suspendat', finalizat: 'Finalizat', intern: 'Intern' };
    grid.innerHTML = filtered.length === 0
      ? `<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--text-muted)">Niciun proiect în această categorie.</div>`
      : filtered.map(p => this.renderProjectCard(p, statusColors, statusLabels)).join('');
  },

  async openProject(projectId) {
    this.currentProject = this.projects.find(p => p.id === projectId);
    if (!this.currentProject) return;
    await this.loadProjectDetails(projectId);
    this.currentTab = 'etape';
    this.editMode = false;  // reset la fiecare deschidere
    localStorage.setItem('ic_last_project_id', projectId);  // Fix 1: persistă proiectul curent
    this.renderProjectDetail();
  },

  // ── Activează / dezactivează modul editare ────────────────────────────────
  toggleEditMode() {
    this.editMode = !this.editMode;
    console.log('🔄 toggleEditMode:', { editMode: this.editMode });
    this.renderProjectDetail();
    // Re-renderizează tab-ul curent pentru a reflecta schimbarea canEdit
    setTimeout(() => {
      const tabContent = document.getElementById('tab-content');
      if (tabContent) {
        const canManage = (Auth.currentProfile?.role === 'admin') || this.members.some(m => String(m.user_id) === String(Auth.currentProfile?.id) && (m.role === 'coordonator' || m.role === 'coord'));
        const canEdit = canManage && this.editMode;
        console.log('🔄 Re-rendering tab after editMode change:', { canEdit, currentTab: this.currentTab });
        tabContent.innerHTML = this.renderTab(this.currentTab, canEdit);
      }
    }, 0);
    if (this.editMode) showToast('Mod editare activat — poți modifica bugetele și responsabilii', 'info');
  },

  // ── Salvează și iese din mod editare ─────────────────────────────────────
  async saveEditMode() {
    this.editMode = false;
    this.renderProjectDetail();
    showToast('Modificări salvate ✓', 'success');
  },

  // ── Înregistrează o modificare în project_change_log ─────────────────────
  async logChange(changeType, entityType, entityName, oldValue, newValue, description) {
    const sb = getSupabase();
    if (!sb || !this.currentProject) return;
    const profile = Auth.currentProfile;
    if (!profile) return;
    try {
      await sb.from('project_change_log').insert({
        project_id: this.currentProject.id,
        changed_by: profile.id,
        changed_by_name: profile.full_name || profile.name || profile.email || 'Necunoscut',
        change_type: changeType,
        entity_type: entityType,
        entity_name: entityName || null,
        old_value: oldValue != null ? String(oldValue) : null,
        new_value: newValue != null ? String(newValue) : null,
        description: description || null,
      });
    } catch(e) {
      console.warn('logChange error:', e.message);
    }
  },
  // Fix 2: re-renderizează doar tab-ul Etape fără scroll-reset
  async _refreshEtapeOnly() {
    await this.loadProjectDetails(this.currentProject.id);
    const profile = Auth.currentProfile;
    const isAdmin = profile && profile.role === 'admin';
    const profileIdStr = String(profile?.id || '');
    const isCoord = this.members.some(m => String(m.user_id) === profileIdStr && (m.role === 'coordonator' || m.role === 'coord'));
    const canEdit = (isAdmin || isCoord) && this.editMode;
    // Actualizează header-ul de progres total
    const totalConsumed = this.tasks.length > 0
      ? Math.round(this.tasks.reduce((s, t) => s + (t.minutes_worked || 0), 0) / 60 * 10) / 10
      : (this.currentProject.consumed_hours || 0);
    const totalBudget = this.tasks.length > 0
      ? this.tasks.reduce((s, t) => s + (t.budget_hours || 0), 0)
      : (this.currentProject.budget_hours || 0);
    const totalPct = totalBudget > 0 ? Math.min(100, Math.round((totalConsumed / totalBudget) * 100)) : 0;
    const totalBarColor = totalPct > 90 ? '#EF4444' : totalPct > 70 ? '#F59E0B' : '#10B981';
    const progressHeader = document.querySelector('#page-content .progress-header-text');
    if (progressHeader) {
      progressHeader.textContent = `${totalConsumed}h lucrate din ${totalBudget}h bugetate (${totalPct}%)`;
      progressHeader.style.color = totalBarColor;
    }
    const progressBar = document.querySelector('#page-content .progress-header-bar');
    if (progressBar) {
      progressBar.style.width = totalPct + '%';
      progressBar.style.background = totalBarColor;
    }
    // Fix 2: salvează scroll-ul pe page-content (containerul principal) și pe data-etape-scroll
    const pageContent = document.getElementById('page-content');
    const savedPageScroll = pageContent ? pageContent.scrollTop : 0;
    const tabContent = document.getElementById('tab-content');
    if (tabContent) {
      const etapeContainer = tabContent.querySelector('[data-etape-scroll]');
      const savedEtapeScroll = etapeContainer ? etapeContainer.scrollTop : 0;
      tabContent.innerHTML = this.renderTab(this.currentTab, canEdit);
      // Restaurează scroll-ul pe page-content
      if (pageContent && savedPageScroll > 0) pageContent.scrollTop = savedPageScroll;
      // Restaurează scroll-ul pe containerul de etape
      const newEtapeContainer = tabContent.querySelector('[data-etape-scroll]');
      if (newEtapeContainer && savedEtapeScroll > 0) newEtapeContainer.scrollTop = savedEtapeScroll;
    } else {
      this.renderProjectDetail();
    }
  },

  renderProjectDetail() {
    const p = this.currentProject;
    if (!p) return;
    const profile = Auth.currentProfile;
    const isAdmin = profile && profile.role === 'admin';
    const profileIdStr = String(profile?.id || '');
    const isCoord = this.members.some(m => String(m.user_id) === profileIdStr && (m.role === 'coordonator' || m.role === 'coord'));
    const canManage = isAdmin || isCoord;  // poate vedea butoanele de editare
    const canEdit = canManage && this.editMode;  // poate modifica efectiv câmpurile
    // DEBUG temporar pentru a diagnostica problemele de permisiuni
    console.log('[Proiecte] renderProjectDetail:', { profileId: profileIdStr, role: profile?.role, isAdmin, isCoord, canManage, editMode: this.editMode, canEdit, membersCount: this.members.length });

    const container = document.getElementById('page-content');
    if (!container) return;

    // Calculăm consumed_hours și budget_hours din suma task-urilor (dacă task-urile sunt deja încărcate)
    const consumedFromTasks = this.tasks.length > 0
      ? Math.round(this.tasks.reduce((s, t) => s + (t.minutes_worked || 0), 0) / 60 * 10) / 10
      : (p.consumed_hours || 0);
    const budgetFromTasks = this.tasks.length > 0
      ? this.tasks.reduce((s, t) => s + (t.budget_hours || 0), 0)
      : (p.budget_hours || 0);
    const consumed = consumedFromTasks;
    const budget = budgetFromTasks;
    const pct = budget > 0 ? Math.min(100, Math.round((consumed / budget) * 100)) : 0;
    const barColor = pct > 90 ? '#EF4444' : pct > 70 ? '#F59E0B' : '#10B981';
    const color = p.color || '#3B82F6';

    container.innerHTML = `
      <div style="margin-bottom:20px">
        <button class="btn-secondary" onclick="Proiecte.backToList()" style="margin-bottom:16px">← Înapoi la proiecte</button>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div style="display:flex;align-items:center;gap:14px">
            <div style="width:52px;height:52px;border-radius:10px;background:${color}20;display:flex;align-items:center;justify-content:center;font-weight:700;color:${color};font-size:18px">${p.code || '?'}</div>
            <div>
              <div style="display:flex;align-items:center;gap:8px">
                <h2 style="font-size:20px;font-weight:700;margin:0">${p.name}</h2>
                <span class="badge badge-green">${p.status === 'activ' ? 'Activ' : (p.status || '')}</span>
              </div>
              <div style="font-size:13px;color:var(--text-muted);margin-top:2px">
                Cod: <strong>${p.code || '—'}</strong> &nbsp;·&nbsp;
                Client: <strong>${p.client_name || '—'}</strong> &nbsp;·&nbsp;
                Perioadă: <strong>${p.start_date ? formatDate(p.start_date) : '—'} – ${p.end_date ? formatDate(p.end_date) : '—'}</strong>
              </div>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            ${p.drive_url ? `<a href="${p.drive_url}" target="_blank" rel="noopener" class="btn-secondary" style="display:flex;align-items:center;gap:6px;text-decoration:none"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> Drive</a>` : ''}
            ${canManage ? `<button class="btn-secondary" onclick="Proiecte.openEditProject()">⚙ Setări</button>` : ''}
            ${canManage ? `<button class="btn-secondary" onclick="Beneficiari.openPanel(${p.id}, '${(p.name||'').replace(/'/g,"\\'")}')">&#128101; Beneficiari</button>` : ''}
            ${canManage && !this.editMode ? `<button onclick="Proiecte.toggleEditMode()" style="display:flex;align-items:center;gap:6px;background:var(--brand-dark,#1e293b);color:#fff;border:1px solid var(--brand-dark,#1e293b);padding:8px 14px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Editează</button>` : ''}
            ${canManage && this.editMode ? `<button class="btn-secondary" onclick="Proiecte.toggleEditMode()" style="color:var(--text-muted)">✕ Anulează</button>` : ''}
            ${canManage && this.editMode ? `<button class="btn-primary" onclick="Proiecte.saveEditMode()" style="display:flex;align-items:center;gap:6px;background:#10B981;border-color:#10B981"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Salvează</button>` : ''}
            ${canManage && this.editMode ? `<button class="btn-primary" onclick="Proiecte.openAddPhaseModal()">+ Etapă</button>` : ''}
          </div>
        </div>

        <div style="margin-top:16px;padding:12px 16px;background:var(--card-bg);border:1px solid var(--border);border-radius:8px">
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
            <span style="color:var(--text-muted)">Progres total ore</span>
            <span class="progress-header-text" style="font-weight:600;color:${barColor}">${consumed}h lucrate din ${budget}h bugetate (${pct}%)</span>
          </div>
          <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">
            <div class="progress-header-bar" style="height:100%;width:${pct}%;background:${barColor};border-radius:4px;transition:width 0.4s"></div>
          </div>
        </div>
      </div>

      ${canManage && this.editMode ? `<div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:10px 16px;margin-bottom:16px;display:flex;align-items:center;gap:10px;font-size:13px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span style="color:#92400E"><strong>Mod editare activ</strong> — modifică bugetele și responsabilii, apoi apasă <strong>Salvează</strong>.</span></div>` : ''}
      <div style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:20px">
        ${['etape','echipa','rapoarte','jurnal','jurnal-proiect'].map(tab => `
          <button onclick="Proiecte.switchTab('${tab}')" id="tab-${tab}" style="padding:10px 20px;border:none;background:none;cursor:pointer;font-size:14px;font-weight:${this.currentTab===tab?'600':'400'};color:${this.currentTab===tab?'var(--primary)':'var(--text-muted)'};border-bottom:${this.currentTab===tab?'2px solid var(--primary)':'2px solid transparent'};margin-bottom:-2px;transition:all 0.2s">
            ${{etape:'Etape & Sarcini',echipa:'Echipă',rapoarte:'Rapoarte',jurnal:'Jurnal modificări','jurnal-proiect':'Jurnal Proiect'}[tab]}
          </button>
        `).join('')}
      </div>

      <div id="tab-content">
        ${this.renderTab(this.currentTab, canEdit)}
      </div>
    `;
  },

  renderTab(tab, canEdit) {
    console.log('📑 renderTab:', { tab, canEdit });
    if (tab === 'etape') return this.renderEtapeTab(canEdit);
    if (tab === 'echipa') return this.renderEchipaTab(canEdit);
    if (tab === 'rapoarte') return this.renderRapoarteTab();
    if (tab === 'jurnal') { setTimeout(() => this.renderJurnalTab(), 80); return '<div id="jurnal-content"><div style="text-align:center;padding:40px;color:var(--text-muted)">Se încarcă jurnalul...</div></div>'; }
    if (tab === 'jurnal-proiect') { setTimeout(() => this.renderJurnalProiectTab(canEdit), 80); return '<div id="jurnal-proiect-content"><div style="text-align:center;padding:40px;color:var(--text-muted)">Se încarcă jurnalul proiectului...</div></div>'; }
    return '';
  },

  renderEtapeTab(canEdit) {
    console.log('📊 renderEtapeTab:', { canEdit, phasesCount: this.phases.length });
    if (this.phases.length === 0) {
      return `
        <div style="text-align:center;padding:60px;color:var(--text-muted)">
          <div style="font-size:48px;margin-bottom:12px">📋</div>
          <p>Nu există etape definite pentru acest proiect.</p>
          ${canEdit ? `<button class="btn-primary" style="margin-top:12px" onclick="Proiecte.openAddPhaseModal()">Adaugă prima etapă</button>` : ''}
        </div>
      `;
    }

    return `
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <h3 style="font-size:16px;font-weight:600;margin:0">Etape de lucru</h3>
          ${canEdit ? `<button class="btn-primary btn-sm" onclick="Proiecte.openAddPhaseModal()">+ Adaugă etapă</button>` : ''}
        </div>

        <div data-etape-scroll style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;overflow:hidden;max-height:65vh;overflow-y:auto">
          <table style="width:100%;border-collapse:collapse;table-layout:fixed">
            <thead style="position:sticky;top:0;z-index:5">
              <tr style="background:var(--bg-secondary);font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;box-shadow:0 1px 0 var(--border)">
                <th style="padding:10px 16px;text-align:left">Etapă / Sarcină</th>
                <th style="padding:10px 12px;text-align:center;width:150px">Perioadă</th>
                <th style="padding:10px 12px;text-align:center;width:100px">Buget (H)</th>
                <th style="padding:10px 12px;text-align:center;width:100px">Lucrat (H)</th>
                <th style="padding:10px 12px;text-align:center;width:100px">Rămas (H)</th>
                <th style="padding:10px 12px;text-align:left;width:160px">Progres</th>
                <th style="padding:10px 12px;text-align:left;width:160px">Responsabil</th>
                <th style="padding:10px 12px;width:120px"></th>
              </tr>
            </thead>
            ${this.phases.map(phase => this.renderPhaseRows(phase, canEdit)).join('')}
          </table>
        </div>
      </div>
    `;
  },

  renderPhaseRows(phase, canEdit) {
    const profile = Auth.currentProfile;
    const isAdmin = profile?.role === 'admin';
    const profileIdStr = String(profile?.id || '');
    const isCoord = this.members.some(m => String(m.user_id) === profileIdStr && (m.role === 'coordonator' || m.role === 'coord'));
    // Admin și coordonatori văd toate task-urile; angajații văd doar task-urile asignate lor
    const allPhaseTasks = this.tasks.filter(t => t.phase_id === phase.id);
    const phaseTasks = (isAdmin || isCoord) ? allPhaseTasks : allPhaseTasks.filter(t => t.assigned_user_id === profile?.id);
    const budgetH = phase.budget_hours || 0;
    const workedMin = phaseTasks.reduce((sum, t) => sum + (t.minutes_worked || 0), 0);
    const workedH = Math.round(workedMin / 60 * 10) / 10;
    const remainH = Math.round(Math.max(0, budgetH - workedH) * 10) / 10;  // Fix 3: max 1 zecimală
    const rawPct = budgetH > 0 ? Math.round((workedH / budgetH) * 100) : 0;  // Fix 4: pct real
    const pct = Math.min(100, rawPct);
    const isExact100 = rawPct === 100;
    const isOverBudget = rawPct > 100;
    const barColor = isOverBudget ? '#EF4444' : isExact100 ? '#10B981' : pct > 90 ? '#EF4444' : pct > 70 ? '#F59E0B' : '#10B981';
    const color = phase.color || '#3B82F6';
    const phaseBodyId = 'phasebody-' + phase.id;

    const tasksBudgetSum = this.tasks.filter(t => t.phase_id === phase.id).reduce((s, t) => s + (t.budget_hours || 0), 0);
    const displayBudget = tasksBudgetSum > 0 ? tasksBudgetSum : budgetH;
    // Fix: remainH trebuie calculat din displayBudget (suma sarcinilor), nu din budgetH (valoarea DB care poate fi desincronizată)
    const remainHPhase = Math.round(Math.max(0, displayBudget - workedH) * 10) / 10;  // Fix 3: max 1 zecimală
    const phaseRow = `
      <tbody>
        <tr style="border-top:2px solid var(--border);background:var(--bg-secondary)">
          <td style="padding:10px 16px">
            <div style="display:flex;align-items:center;gap:8px">
              <button onclick="Proiecte.togglePhase('${phaseBodyId}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:11px;padding:2px 4px;line-height:1">▼</button>
              <div style="width:12px;height:12px;border-radius:3px;background:${color};flex-shrink:0"></div>
              <strong style="font-size:14px">${phase.code ? phase.code + '. ' : ''}${phase.name}</strong>
              <span style="font-size:11px;color:var(--text-muted)">(${phaseTasks.length} sarcini)</span>
            </div>
          </td>
          <td style="padding:10px 12px;text-align:center;color:var(--text-muted);font-size:12px"></td>
          <td style="padding:10px 12px;text-align:center"><strong>${displayBudget}h</strong></td>
          <td style="padding:10px 12px;text-align:center;color:#3B82F6;font-weight:600">${workedH}h</td>
          <td style="padding:10px 12px;text-align:center;color:var(--text-muted)">${remainHPhase}h</td>
          <td style="padding:10px 12px">
            <div style="display:flex;align-items:center;gap:6px">
              <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px"></div>
              </div>
              <span style="font-size:11px;color:var(--text-muted);width:30px">${pct}%</span>
            </div>
          </td>
          <td style="padding:10px 12px;font-size:12px;color:var(--text-muted)"></td>
          <td style="padding:10px 12px;text-align:center"></td>
          <td style="padding:10px 12px;text-align:right">
            ${canEdit ? `
              <button onclick="Proiecte.openAddTaskModal(${phase.id})" style="background:none;border:none;cursor:pointer;color:var(--primary);font-size:13px;margin-right:6px" title="Adaugă sarcină">＋</button>
              <button onclick="Proiecte.deletePhase(${phase.id})" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:13px" title="Șterge etapă">🗑</button>
            ` : ''}
          </td>
        </tr>
      </tbody>
      <tbody id="${phaseBodyId}">
        ${phaseTasks.map((task, idx) => this.renderTaskRow(task, idx + 1, canEdit, budgetH)).join('')}
        ${canEdit ? `
          <tr style="border-top:1px solid var(--border)">
            <td colspan="9" style="padding:6px 16px 6px 52px">
              <button onclick="Proiecte.openAddTaskModal(${phase.id})" style="background:none;border:none;cursor:pointer;color:var(--primary);font-size:12px">＋ Adaugă sarcină</button>
            </td>
          </tr>
        ` : ''}
      </tbody>
    `;
    return phaseRow;
  },

  renderTaskRow(task, idx, canEdit, phaseBudget) {
    const workedH = Math.round((task.minutes_worked || 0) / 60 * 10) / 10;
    const budgetH = task.budget_hours || 0;
    const remainH = Math.round(Math.max(0, budgetH - workedH) * 10) / 10;  // Fix 3: max 1 zecimală
    const rawPct = budgetH > 0 ? Math.round((workedH / budgetH) * 100) : 0;  // Fix 4: pct real fără clamp
    const pct = Math.min(100, rawPct);  // pentru progress bar (nu depășeşte 100%)
    // Fix 4: culoare și label corect: 100% exact = verde, >100% = roşu Depăşit
    const isExact100 = rawPct === 100;
    const isOverBudget = rawPct > 100;
    const barColor = isOverBudget ? '#EF4444' : isExact100 ? '#10B981' : pct > 90 ? '#EF4444' : pct > 70 ? '#F59E0B' : '#10B981';
    const profile = Auth.currentProfile;
    // canManage = admin/coord indiferent de editMode (pentru butoane Start, Asignare vizualizare, Consum manual)
    // Verifică atât rolul global (profiles.role) cât și rolul în proiect (project_members.role)
    const isAdminOrCoord = profile?.role === 'admin' || profile?.role === 'coordonator' || profile?.role === 'coord' ||
      this.members.some(m => String(m.user_id) === String(profile?.id) && (m.role === 'coordonator' || m.role === 'coord' || m.role === 'admin'));

    // Perioadă task: din project_task_assignments (prima înregistrare sau interval comun)
    const taskAssigns = (this.taskAssignments || []).filter(a => a.task_id === task.id);
    const fmtShort = d => {
      if (!d) return null;
      const dt = new Date(d);
      return dt.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' });
    };
    let periodHtml;
    if (taskAssigns.length === 0) {
      // Fără perioadă alocată
      periodHtml = canEdit
        ? `<button onclick="Proiecte.openAssignModal(${task.id})" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:11px;padding:2px 6px;border:1px dashed var(--border);border-radius:4px" title="Setează perioadă">+ Perioadă</button>`
        : `<span style="color:var(--text-muted);font-size:11px">—</span>`;
    } else if (taskAssigns.length === 1) {
      // Un singur angajat — afișază start–end
      const a = taskAssigns[0];
      const s = fmtShort(a.start_date);
      const e = fmtShort(a.end_date);
      const label = (s && e) ? `${s} – ${e}` : (s || e || '—');
      periodHtml = canEdit
        ? `<button onclick="Proiecte.openAssignModal(${task.id})" style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--text);padding:2px 6px;border:1px solid var(--border);border-radius:4px;white-space:nowrap" title="Editează perioadă">📅 ${label}</button>`
        : `<span style="font-size:11px;white-space:nowrap">📅 ${label}</span>`;
    } else {
      // Mai mulți angajați — verifică dacă au aceeași perioadă sau perioade diferite
      const starts = [...new Set(taskAssigns.map(a => a.start_date).filter(Boolean))];
      const ends = [...new Set(taskAssigns.map(a => a.end_date).filter(Boolean))];
      const sameStart = starts.length === 1;
      const sameEnd = ends.length === 1;
      if (sameStart && sameEnd) {
        // Toți în aceeași perioadă
        const s = fmtShort(starts[0]);
        const e = fmtShort(ends[0]);
        const label = (s && e) ? `${s} – ${e}` : (s || e || '—');
        periodHtml = canEdit
          ? `<button onclick="Proiecte.openAssignModal(${task.id})" style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--text);padding:2px 6px;border:1px solid var(--border);border-radius:4px;white-space:nowrap" title="Editează perioadă (${taskAssigns.length} angajați)">📅 ${label} <span style='color:var(--text-muted)'>×${taskAssigns.length}</span></button>`
          : `<span style="font-size:11px;white-space:nowrap">📅 ${label} <span style='color:var(--text-muted)'>×${taskAssigns.length}</span></span>`;
      } else {
        // Perioade diferite per angajat
        periodHtml = canEdit
          ? `<button onclick="Proiecte.openAssignModal(${task.id})" style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--primary);padding:2px 6px;border:1px solid var(--primary);border-radius:4px;white-space:nowrap" title="Perioade diferite per angajat">📅 ${taskAssigns.length} perioade</button>`
          : `<span style="font-size:11px;color:var(--primary);white-space:nowrap">📅 ${taskAssigns.length} perioade</span>`;
      }
    }

    // Suport multi-responsabil: assigned_users array sau fallback la assigned_user_id
    const assignedIds = Array.isArray(task.assigned_users) && task.assigned_users.length > 0
      ? task.assigned_users
      : (task.assigned_user_id ? [task.assigned_user_id] : []);
    // Verifică și project_task_assignments pentru alocare
    const taskAssignedUserIds = (this.taskAssignments || []).filter(a => a.task_id === task.id).map(a => a.user_id);
    const isAssigned = assignedIds.includes(profile.id) || taskAssignedUserIds.includes(profile.id);
    // Doar persoanele alocate explicit pot porni timerul (adminii nu pot porni task-uri la care nu sunt alocati)
    const canStart = isAssigned;

    // Generăm avatarele pentru toți responsabilii (stivă cu overlap)
    const avatarsHtml = assignedIds.length > 0
      ? `<div style="display:flex;align-items:center">` +
        assignedIds.slice(0, 5).map((uid, i) => {
          const code = this.getUserCode(uid);
          const name = this.getUserName(uid);
          const u = this.allUsers.find(u => u.id === uid);
          const avatarBg = 'var(--brand-dark)';
          return u && u.avatar_url
            ? `<img src="${u.avatar_url}" title="${name}" style="width:26px;height:26px;border-radius:50%;object-fit:cover;border:2px solid var(--bg);margin-left:${i > 0 ? '-8px' : '0'};z-index:${5 - i}">`
            : `<span title="${name}" style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:${avatarBg};color:#fff;font-size:10px;font-weight:700;border:2px solid var(--bg);margin-left:${i > 0 ? '-8px' : '0'};z-index:${5 - i}">${code}</span>`;
        }).join('') +
        (assignedIds.length > 5 ? `<span style="margin-left:2px;font-size:11px;color:var(--text-muted)">+${assignedIds.length - 5}</span>` : '') +
        `</div>`
      : `<span style="color:var(--text-muted);font-size:12px">👤 Asignează</span>`;

    return `
      <tr style="border-top:1px solid var(--border);font-size:13px" id="task-row-${task.id}">
        <td style="padding:8px 16px 8px 52px">
          <span style="color:var(--text-muted);margin-right:8px">${idx}.</span>
          ${task.name}
        </td>
        <td style="padding:8px 12px;text-align:center">
          ${periodHtml}
        </td>
        <td style="padding:8px 12px;text-align:center">
          ${canEdit ? `<input type="number" value="${budgetH}" min="0" style="width:70px;text-align:center;padding:3px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font-size:12px" onchange="Proiecte.updateTaskBudget(${task.id},${task.phase_id},this.value,${phaseBudget})">` : `${budgetH}h`}
        </td>
        <td style="padding:8px 12px;text-align:center;color:#3B82F6">${workedH}h</td>
        <td style="padding:8px 12px;text-align:center;color:var(--text-muted)">${remainH}h</td>
        <td style="padding:8px 12px">
          <div style="display:flex;align-items:center;gap:6px">
            <div style="flex:1;height:4px;background:var(--border);border-radius:2px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${barColor};border-radius:2px"></div>
            </div>
            <span style="font-size:11px;color:${isOverBudget ? '#EF4444' : isExact100 ? '#10B981' : 'var(--text-muted)'};width:36px">${isOverBudget ? rawPct + '%' : pct + '%'}</span>
          </div>
          ${isExact100 ? `<div style="font-size:10px;color:#10B981;font-weight:600;margin-top:2px">✓ Done</div>` : ''}
          ${isOverBudget ? `<div style="font-size:10px;color:#EF4444;font-weight:600;margin-top:2px">⚠ Depăşit</div>` : ''}
        </td>
        <td style="padding:8px 12px;font-size:12px">
          ${canEdit && isAdminOrCoord ? `
            <button onclick="Proiecte.openAssignModal(${task.id})" style="background:none;border:none;cursor:pointer;padding:0" title="Asignează responsabili">
              ${avatarsHtml}
            </button>
          ` : (assignedIds.length > 0 ? avatarsHtml : '—')}
        </td>

        <td style="padding:8px 12px;text-align:right;white-space:nowrap">
          ${canStart ? this.renderTimerBtn(task) : ''}
          ${canEdit ? `<button onclick="Proiecte.openManualConsumeModal(${task.id})" style="background:none;border:none;cursor:pointer;color:#10B981;font-size:13px;margin-left:4px;padding:2px 4px;border-radius:4px" title="Consum manual ore">⏱</button>` : ''}
          ${canEdit ? `
            <button onclick="Proiecte.openEditTaskModal(${task.id})" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:13px;margin-left:4px;padding:2px 4px;border-radius:4px" title="Editează">✏️</button>
          ` : ''}
          ${(isAdminOrCoord && this.editMode) ? `<button onclick="Proiecte.deleteTask(${task.id})" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:13px;margin-left:2px;padding:2px 4px;border-radius:4px" title="Șterge">🗑</button>` : ''}
        </td>
      </tr>
    `;
  },

  renderTimerBtn(task) {
    const isRunning = window.activeTimerData && window.activeTimerData.taskId === task.id;
    const isPaused = window.pausedTimerData && window.pausedTimerData.taskId === task.id;
    if (isRunning) {
      return `
        <button onclick="Proiecte.pauseTask(${task.id})" style="background:#F59E0B20;border:1px solid #F59E0B;color:#F59E0B;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px">⏸ Pauză</button>
        <button onclick="Proiecte.stopTask(${task.id})" style="background:#EF444420;border:1px solid #EF4444;color:#EF4444;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px;margin-left:2px">⏹ Stop</button>
      `;
    }
    if (isPaused) {
      return `
        <button onclick="Proiecte.resumeTask(${task.id})" style="background:#10B98120;border:1px solid #10B981;color:#10B981;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px">▶ Reia</button>
        <button onclick="Proiecte.stopTask(${task.id})" style="background:#EF444420;border:1px solid #EF4444;color:#EF4444;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px;margin-left:2px">⏹ Stop</button>
      `;
    }
    const taskNameEsc = (task.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    return `<button onclick="Proiecte.startTask(${task.id},'${taskNameEsc}',${task.project_id},${task.phase_id})" style="background:var(--primary-light,#3B82F620);border:1px solid var(--primary);color:var(--primary);border-radius:4px;padding:3px 8px;cursor:pointer;font-size:11px">▶ Start</button>`;
  },

  renderEchipaTab(canEdit) {
    const coords = this.members.filter(m => m.role === 'coordonator');
    const membri = this.members.filter(m => m.role === 'angajat');
    const colaboratori = this.members.filter(m => m.role === 'colaborator_extern');
    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <h3 style="font-size:15px;font-weight:600;margin:0">Coordonatori (${coords.length})</h3>
            ${canEdit ? `<button class="btn-sm btn-secondary" onclick="Proiecte.openAddMemberModal('coordonator')">+ Adaugă</button>` : ''}
          </div>
          ${coords.length === 0 ? `<p style="color:var(--text-muted);font-size:13px">Niciun coordonator asignat.</p>` : ''}
          ${coords.map(m => this.renderMemberCard(m, canEdit)).join('')}
        </div>
        <div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <h3 style="font-size:15px;font-weight:600;margin:0">Membri echipă (${membri.length})</h3>
            ${canEdit ? `<button class="btn-sm btn-secondary" onclick="Proiecte.openAddMemberModal('angajat')">+ Adaugă</button>` : ''}
          </div>
          ${membri.length === 0 ? `<p style="color:var(--text-muted);font-size:13px">Niciun membru asignat.</p>` : ''}
          ${membri.map(m => this.renderMemberCard(m, canEdit)).join('')}
        </div>
      </div>
      <!-- Colaboratori externi -->
      <div style="border-top:1px solid var(--border);padding-top:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:10px">
            <h3 style="font-size:15px;font-weight:600;margin:0">Colaboratori externi (${colaboratori.length})</h3>
            <span style="font-size:11px;background:#78350f20;color:#F59E0B;padding:2px 8px;border-radius:12px;font-weight:600">Acces limitat la proiect</span>
          </div>
          ${canEdit ? `<button class="btn-sm btn-secondary" onclick="Proiecte.openAddCollaboratorModal()" style="border-color:#F59E0B;color:#F59E0B">+ Invită colaborator</button>` : ''}
        </div>
        ${colaboratori.length === 0 ? `
          <div style="padding:20px;background:var(--bg-secondary);border-radius:8px;border:1px dashed var(--border);text-align:center">
            <div style="font-size:24px;margin-bottom:8px">🤝</div>
            <p style="color:var(--text-muted);font-size:13px;margin:0">Niciun colaborator extern invitat. Colaboratorii pot fi asignați la task-uri și văd doar proiectul lor.</p>
          </div>
        ` : colaboratori.map(m => this.renderCollaboratorCard(m, canEdit)).join('')}
      </div>
    `;
  },
  renderCollaboratorCard(m, canEdit) {
    const u = m.profiles || {};
    const name = u.full_name || u.name || u.email || 'Colaborator extern';
    const email = u.email || m.external_email || '';
    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2) || 'CE';
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--card-bg);border:1px solid #F59E0B40;border-radius:8px;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:50%;background:#78350f;display:flex;align-items:center;justify-content:center;color:#F59E0B;font-weight:700;font-size:13px">${initials}</div>
          <div>
            <div style="font-weight:600;font-size:13px">${name}</div>
            <div style="font-size:11px;color:var(--text-muted)">${email}</div>
            <div style="font-size:10px;color:#F59E0B;margin-top:2px">🔒 Acces limitat — vede doar task-urile lui</div>
          </div>
        </div>
        ${canEdit ? `<button onclick="Proiecte.removeMember(${m.id})" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:13px" title="Elimină">✕</button>` : ''}
      </div>
    `;
  },

  renderMemberCard(m, canEdit) {
    const u = m.profiles || {};
    const name = u.full_name || u.name || u.email || 'Utilizator';
    const code = u.employee_code || '??';
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--card-bg);border:1px solid var(--border);border-radius:8px;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:13px">${code}</div>
          <div>
            <div style="font-weight:600;font-size:13px">${name}</div>
            <div style="font-size:11px;color:var(--text-muted)">${u.email || ''}</div>
          </div>
        </div>
        ${canEdit ? `<button onclick="Proiecte.removeMember(${m.id})" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:13px" title="Elimină">✕</button>` : ''}
      </div>
    `;
  },

  renderRapoarteTab() {
    const profile = Auth.currentProfile;
    const isAdmin = profile?.role === 'admin';
    const profileIdStr = String(profile?.id || '');
    const isCoord = this.members.some(m => String(m.user_id) === profileIdStr && (m.role === 'coordonator' || m.role === 'coord'));
    const totalBudget = this.phases.reduce((s, p) => s + (p.budget_hours || 0), 0);
    // Fix 3: suma minute→ore o singură dată pentru a evita acumularea erorilor float
    const totalMinutes = this.tasks.reduce((s, t) => s + (t.minutes_worked || 0), 0);
    const totalWorked = Math.round(totalMinutes / 60 * 10) / 10;
    const totalRemaining = Math.round(Math.max(0, totalBudget - totalWorked) * 10) / 10;
    const rawPct = totalBudget > 0 ? Math.round((totalWorked / totalBudget) * 100) : 0;  // Fix 4: pct real
    const pct = Math.min(100, rawPct);
    const isExact100 = rawPct === 100;
    const isOverBudget = rawPct > 100;
    // Fix 4: 100% exact = verde, >100% = roşu
    const pctColor = isOverBudget ? '#EF4444' : isExact100 ? '#10B981' : pct > 90 ? '#EF4444' : pct > 70 ? '#F59E0B' : '#10B981';
    const totalTasks = this.tasks.length;
    // Task e finalizat dacă orele consumate >= bugetul de ore
    const doneTasks = this.tasks.filter(t => {
      const worked = Math.round((t.minutes_worked || 0) / 60 * 10) / 10;
      const budget = t.budget_hours || 0;
      return budget > 0 && worked >= budget;
    }).length;
    const taskPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    // Calcul ore pe etapa
    const phaseRows = this.phases.map(phase => {
      const allPhaseTasks = this.tasks.filter(t => t.phase_id === phase.id);
      const phaseTasks = (isAdmin || isCoord) ? allPhaseTasks : allPhaseTasks.filter(t => t.assigned_user_id === profile?.id);
      // Fix 3: suma minute→ore o singură dată
      const phaseMinutes = phaseTasks.reduce((s, t) => s + (t.minutes_worked || 0), 0);
      const worked = Math.round(phaseMinutes / 60 * 10) / 10;
      const budget = phase.budget_hours || 0;
      const rawP = budget > 0 ? Math.round((worked / budget) * 100) : 0;  // Valoare reala, chiar daca >100%
      const p = Math.min(100, rawP);  // Pentru bara de progres (capped la 100%)
      const isOverBudgetPhase = rawP > 100;
      const barColor = isOverBudgetPhase ? '#EF4444' : p > 90 ? '#EF4444' : p > 70 ? '#F59E0B' : '#10B981';
      const statusDot = isOverBudgetPhase ? '🔴' : p > 90 ? '🔴' : p > 70 ? '🟡' : '🟢';
      return { phase, worked, budget, p, rawP, barColor, statusDot, isOverBudgetPhase };
    });

    // Calcul ore pe membru (doar pentru admin/coord)
    const memberStats = (isAdmin || isCoord) ? (() => {
      const map = {};
      this.tasks.forEach(t => {
        const uid = t.assigned_user_id;
        if (!uid) return;
        const member = this.members.find(m => String(m.user_id) === String(uid));
        const name = member?.profiles?.full_name || t.assigned_user_name || 'Necunoscut';
        if (!map[uid]) map[uid] = { name, worked: 0, tasks: 0 };
        map[uid].worked += Math.round((t.minutes_worked || 0) / 60 * 10) / 10;
        map[uid].tasks++;
      });
      return Object.values(map).sort((a, b) => b.worked - a.worked);
    })() : [];

    const maxMemberWorked = memberStats.length > 0 ? Math.max(...memberStats.map(m => m.worked)) : 1;

    return `
      <!-- KPI Cards -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:24px">
        <div style="padding:18px 20px;background:linear-gradient(135deg,#1e3a5f 0%,#1a4a8a 100%);border-radius:12px;color:#fff;position:relative;overflow:hidden">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;opacity:0.75;margin-bottom:8px">Ore bugetate</div>
          <div style="font-size:32px;font-weight:800;line-height:1">${totalBudget}<span style="font-size:16px;font-weight:500;opacity:0.8">h</span></div>
          <div style="position:absolute;right:-10px;bottom:-10px;font-size:56px;opacity:0.1">⏱</div>
        </div>
        <div style="padding:18px 20px;background:linear-gradient(135deg,#065f46 0%,#059669 100%);border-radius:12px;color:#fff;position:relative;overflow:hidden">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;opacity:0.75;margin-bottom:8px">Ore lucrate</div>
          <div style="font-size:32px;font-weight:800;line-height:1">${totalWorked}<span style="font-size:16px;font-weight:500;opacity:0.8">h</span></div>
          <div style="position:absolute;right:-10px;bottom:-10px;font-size:56px;opacity:0.1">✅</div>
        </div>
        <div style="padding:18px 20px;background:linear-gradient(135deg,#7c3aed 0%,#a855f7 100%);border-radius:12px;color:#fff;position:relative;overflow:hidden">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;opacity:0.75;margin-bottom:8px">Rămase</div>
          <div style="font-size:32px;font-weight:800;line-height:1">${totalRemaining}<span style="font-size:16px;font-weight:500;opacity:0.8">h</span></div>
          <div style="position:absolute;right:-10px;bottom:-10px;font-size:56px;opacity:0.1">📅</div>
        </div>
        <div style="padding:18px 20px;background:${isOverBudget ? 'linear-gradient(135deg,#7f1d1d 0%,#ef4444 100%)' : isExact100 ? 'linear-gradient(135deg,#065f46 0%,#059669 100%)' : 'linear-gradient(135deg,#78350f 0%,#f59e0b 100%)'};border-radius:12px;color:#fff;position:relative;overflow:hidden">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;opacity:0.75;margin-bottom:8px">Consum buget</div>
          <div style="font-size:32px;font-weight:800;line-height:1">${rawPct}<span style="font-size:16px;font-weight:500;opacity:0.8">%</span></div>
          <div style="position:absolute;right:-10px;bottom:-10px;font-size:56px;opacity:0.1">📊</div>
        </div>
        <div style="padding:18px 20px;background:linear-gradient(135deg,#1e3a5f 0%,#0ea5e9 100%);border-radius:12px;color:#fff;position:relative;overflow:hidden">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;opacity:0.75;margin-bottom:8px">Task-uri</div>
          <div style="font-size:32px;font-weight:800;line-height:1">${doneTasks}<span style="font-size:16px;font-weight:500;opacity:0.8">/${totalTasks}</span></div>
          <div style="font-size:11px;opacity:0.8;margin-top:4px">${taskPct}% finalizate</div>
          <div style="position:absolute;right:-10px;bottom:-10px;font-size:56px;opacity:0.1">✔</div>
        </div>
      </div>

      <!-- Bara progres generala -->
      <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div style="font-size:14px;font-weight:700">Progres general buget</div>
          <div style="font-size:13px;color:${pctColor};font-weight:700">${totalWorked}h din ${totalBudget}h (${rawPct}%)</div>
        </div>
        <div style="height:14px;background:var(--border);border-radius:7px;overflow:hidden;position:relative">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,${pctColor},${pctColor}cc);border-radius:7px;transition:width 0.6s ease"></div>
        </div>
        ${isExact100 ? `<div style="margin-top:8px;font-size:12px;color:#10B981;font-weight:600">✓ Buget consumat complet</div>` : isOverBudget ? `<div style="margin-top:8px;font-size:12px;color:#EF4444;font-weight:600">⚠ Buget depăşit cu ${rawPct - 100}%</div>` : rawPct > 80 ? `<div style="margin-top:8px;font-size:12px;color:#F59E0B;font-weight:600">⚠ Atenție: buget aproape epuizat</div>` : ''}
      </div>

      <!-- Ore pe etapa -->
      <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px">
        <h3 style="font-size:14px;font-weight:700;margin:0 0 16px;display:flex;align-items:center;gap:8px">
          <span style="width:4px;height:16px;background:var(--brand);border-radius:2px;display:inline-block"></span>
          Ore pe etapă
        </h3>
        ${phaseRows.length === 0 ? '<p style="color:var(--text-muted);font-size:13px">Nu există etape definite.</p>' : phaseRows.map(({phase, worked, budget, p, rawP, barColor, statusDot}) => `
          <div style="margin-bottom:16px;padding:14px;background:var(--bg-secondary);border-radius:8px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <div style="display:flex;align-items:center;gap:8px">
                <span>${statusDot}</span>
                <span style="font-size:13px;font-weight:600">${phase.code ? phase.code + '. ' : ''}${phase.name}</span>
              </div>
              <div style="display:flex;align-items:center;gap:12px">
                <span style="font-size:12px;color:var(--text-muted)">${worked}h lucrate</span>
                <span style="font-size:12px;font-weight:700;color:${barColor}">${rawP}%</span>
                <span style="font-size:12px;color:var(--text-muted);background:var(--border);padding:2px 8px;border-radius:4px">${budget}h buget</span>
              </div>
            </div>
            <div style="height:10px;background:var(--border);border-radius:5px;overflow:hidden">
              <div style="height:100%;width:${p}%;background:linear-gradient(90deg,${barColor},${barColor}bb);border-radius:5px;transition:width 0.5s ease"></div>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Ore pe membru (doar admin/coord) -->
      ${(isAdmin || isCoord) && memberStats.length > 0 ? `
      <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:20px">
        <h3 style="font-size:14px;font-weight:700;margin:0 0 16px;display:flex;align-items:center;gap:8px">
          <span style="width:4px;height:16px;background:#a855f7;border-radius:2px;display:inline-block"></span>
          Ore pe membru
        </h3>
        ${memberStats.map((m, i) => {
          const barW = maxMemberWorked > 0 ? Math.round((m.worked / maxMemberWorked) * 100) : 0;
          const colors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316'];
          const c = colors[i % colors.length];
          return `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
              <div style="width:28px;height:28px;border-radius:50%;background:${c};color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${m.name.charAt(0).toUpperCase()}</div>
              <div style="flex:1">
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                  <span style="font-weight:600">${m.name}</span>
                  <span style="color:var(--text-muted)">${m.worked}h &bull; ${m.tasks} task-uri</span>
                </div>
                <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">
                  <div style="height:100%;width:${barW}%;background:${c};border-radius:4px;opacity:0.85"></div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      ` : ''}
    `;
  },

  // ── Tab Jurnal modificări ────────────────────────────────────────────────────
  async renderJurnalTab() {
    const container = document.getElementById('jurnal-content');
    if (!container || !this.currentProject) return;
    const sb = getSupabase();
    if (!sb) { container.innerHTML = '<p style="color:var(--text-muted);padding:20px">Nu ești conectat la baza de date.</p>'; return; }
    const { data, error } = await sb
      .from('project_change_log')
      .select('*')
      .eq('project_id', this.currentProject.id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      container.innerHTML = `<p style="color:var(--danger);padding:20px">Eroare la încărcare: ${error.message}</p>`;
      return;
    }
    if (!data || data.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:60px;color:var(--text-muted)">
          <div style="font-size:48px;margin-bottom:12px">📋</div>
          <p>Nu există modificări înregistrate încă pentru acest proiect.</p>
        </div>`;
      return;
    }
    const changeTypeIcon = { update: '✏️', insert: '➕', delete: '🗑️', assign: '👤', budget: '⏱️' };
    const changeTypeLabel = { update: 'Modificare', insert: 'Adăugare', delete: 'Ștergere', assign: 'Asignare', budget: 'Buget' };
    const rows = data.map(log => {
      const dt = new Date(log.created_at);
      const dateStr = dt.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeStr = dt.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
      const icon = changeTypeIcon[log.change_type] || '📝';
      const label = changeTypeLabel[log.change_type] || log.change_type;
      const entityBadge = log.entity_type ? `<span style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:4px;padding:1px 6px;font-size:11px;color:var(--text-muted)">${log.entity_type}</span>` : '';
      const valueDiff = (log.old_value != null && log.new_value != null)
        ? `<span style="color:#EF4444;text-decoration:line-through;margin-right:6px">${log.old_value}</span><span style="color:var(--text-muted);margin-right:6px">→</span><span style="color:#10B981">${log.new_value}</span>`
        : (log.new_value != null ? `<span style="color:#10B981">${log.new_value}</span>` : '');
      return `
        <tr style="border-top:1px solid var(--border);font-size:13px">
          <td style="padding:10px 12px;white-space:nowrap;color:var(--text-muted)">${dateStr}<br><span style="font-size:11px">${timeStr}</span></td>
          <td style="padding:10px 12px;font-weight:600">${log.changed_by_name || 'Necunoscut'}</td>
          <td style="padding:10px 12px">${icon} ${label} ${entityBadge}</td>
          <td style="padding:10px 12px;color:var(--text-muted)">${log.entity_name || ''}</td>
          <td style="padding:10px 12px">${valueDiff}</td>
          <td style="padding:10px 12px;color:var(--text-muted);font-size:12px">${log.description || ''}</td>
        </tr>`;
    }).join('');
    container.innerHTML = `
      <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:var(--bg-secondary)">
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:var(--text-muted);font-weight:600;white-space:nowrap">Data</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:var(--text-muted);font-weight:600">Utilizator</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:var(--text-muted);font-weight:600">Tip</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:var(--text-muted);font-weight:600">Element</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:var(--text-muted);font-weight:600">Valoare</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:var(--text-muted);font-weight:600">Detalii</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  },

  // ── Tab Jurnal Proiect (Design Diary) ────────────────────────────────────────────────────
  async renderJurnalProiectTab(canEdit) {
    const container = document.getElementById('jurnal-proiect-content');
    if (!container || !this.currentProject) return;
    const sb = getSupabase();
    if (!sb) { container.innerHTML = '<p style="color:var(--text-muted);padding:20px">Nu ești conectat la baza de date.</p>'; return; }
    
    // Fetch decisions
    const { data, error } = await sb
      .from('project_decisions')
      .select('*')
      .eq('project_id', this.currentProject.id)
      .eq('is_latest', true).order('decision_date', { ascending: false })
      .limit(200);
    
    if (error) {
      container.innerHTML = `<p style="color:var(--danger);padding:20px">Eroare la încărcare: ${error.message}</p>`;
      return;
    }
    
    const profile = Auth.currentProfile;
    const isAdmin = profile && profile.role === 'admin';
    const profileIdStr = String(profile?.id || '');
    const isCoord = this.members.some(m => String(m.user_id) === profileIdStr && (m.role === 'coordonator' || m.role === 'coord'));
    const canAddDecision = isAdmin || isCoord;
    
    let html = '<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;overflow:hidden">';
    
    if (canAddDecision) {
      html += `
        <div style="padding:16px;border-bottom:1px solid var(--border);background:var(--bg-secondary)">
          <button onclick="Proiecte.openAddDecisionModal()" style="background:var(--primary);color:#fff;border:none;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer">+ Adaugă decizie</button>
        </div>
      `;
    }
    
    if (!data || data.length === 0) {
      html += `
        <div style="text-align:center;padding:60px;color:var(--text-muted)">
          <div style="font-size:48px;margin-bottom:12px">📋</div>
          <p>Nu există decizii înregistrate încă pentru acest proiect.</p>
        </div>
      `;
    } else {
      const profile = Auth.currentProfile;
      const isAdmin = profile && profile.role === 'admin';
      const profileIdStr = String(profile?.id || '');
      const isCoord = this.members.some(m => String(m.user_id) === profileIdStr && (m.role === 'coordonator' || m.role === 'coord'));
      const canEditDelete = isAdmin || isCoord;
      
      const rows = data.map(dec => {
        const decisionDate = dec.decision_date || new Date(dec.created_at).toISOString().split('T')[0];
        const dateStr = new Date(decisionDate + 'T00:00:00').toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' });
        const createdByName = this.getUserName(dec.created_by) || 'Necunoscut';
        const decisionMakerName = this.getUserName(dec.decision_maker) || 'Necunoscut';
        const revisionBadge = !dec.is_latest ? '<span style="background:#EF4444;color:#fff;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:600">Arhivat</span>' : '';
        const actionButtons = canEditDelete ? `
          <button onclick="Proiecte.openEditDecisionModal(${dec.id}, '${(dec.decision || '').replace(/'/g, "\'")}')"
            style="background:none;border:1px solid var(--primary);color:var(--primary);padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer;margin-right:4px">Editează</button>
          <button onclick="Proiecte.deleteDecision(${dec.id})"
            style="background:none;border:1px solid #EF4444;color:#EF4444;padding:4px 8px;border-radius:4px;font-size:11px;cursor:pointer">Șterge</button>
        ` : '';
        return `
          <tr style="border-top:1px solid var(--border);font-size:13px">
            <td style="padding:10px 12px;white-space:nowrap;color:var(--text-muted)">${dateStr}</td>
            <td style="padding:10px 12px;font-weight:600">${createdByName}</td>
            <td style="padding:10px 12px;font-weight:600;color:var(--primary)">${decisionMakerName}</td>
            <td style="padding:10px 12px">${dec.decision}${revisionBadge ? '<br>' + revisionBadge : ''}</td>
            <td style="padding:10px 12px;white-space:nowrap;font-size:12px">${actionButtons}</td>
          </tr>
        `;
      }).join('');
      
      html += `
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:var(--bg-secondary)">
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:var(--text-muted);font-weight:600;white-space:nowrap">Data</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:var(--text-muted);font-weight:600">Completat de</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:var(--text-muted);font-weight:600">Decizie luată de</th>
              <th style="padding:10px 12px;text-align:left;font-size:12px;color:var(--text-muted);font-weight:600">Decizia</th>
              ${canEditDelete ? '<th style="padding:10px 12px;text-align:left;font-size:12px;color:var(--text-muted);font-weight:600">Acțiuni</th>' : ''}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    }
    
    html += '</div>';
    container.innerHTML = html;
  },

  openAddDecisionModal() {
    const today = new Date().toISOString().split('T')[0];
    const memberOptions = this.members.map(m => {
      const user = this.allUsers.find(u => u.id === m.user_id);
      return `<option value="${m.user_id}">${user?.full_name || user?.name || user?.email || 'Necunoscut'}</option>`;
    }).join('');
    
    const modal = document.createElement('div');
    modal.id = 'decision-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000';
    modal.innerHTML = `
      <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:24px;max-width:500px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.2)">
        <h3 style="margin:0 0 20px 0;color:var(--text-primary)">Adaugă decizie</h3>
        
        <div style="margin-bottom:16px">
          <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:6px;font-weight:600">Data (când intră în vigoare)</label>
          <input type="date" id="modal-decision-date" value="${today}" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--card-bg);color:var(--text-primary);box-sizing:border-box" />
        </div>
        
        <div style="margin-bottom:16px">
          <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:6px;font-weight:600">Cine a luat decizia?</label>
          <select id="modal-decision-maker" style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--card-bg);color:var(--text-primary);box-sizing:border-box">
            <option value="">— Selectați —</option>
            ${memberOptions}
          </select>
        </div>
        
        <div style="margin-bottom:20px">
          <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:6px;font-weight:600">Decizia</label>
          <textarea id="modal-decision-text" placeholder="Descrieți decizia..." style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;min-height:80px;background:var(--card-bg);color:var(--text-primary);box-sizing:border-box"></textarea>
        </div>
        
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button onclick="document.getElementById('decision-modal').remove()" style="background:var(--bg-secondary);border:1px solid var(--border);color:var(--text-primary);padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer">Anulează</button>
          <button onclick="Proiecte.saveDecisionFromModal()" style="background:var(--primary);color:#fff;border:none;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer">Salvează</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('modal-decision-text').focus();
  },

  async saveDecisionFromModal() {
    const decisionText = document.getElementById('modal-decision-text')?.value?.trim();
    const decisionDate = document.getElementById('modal-decision-date')?.value;
    const decisionMakerId = document.getElementById('modal-decision-maker')?.value;
    
    if (!decisionText) {
      alert('Descrieți decizia!');
      return;
    }
    if (!decisionDate) {
      alert('Selectați data!');
      return;
    }
    if (!decisionMakerId) {
      alert('Selectați cine a luat decizia!');
      return;
    }
    
    const sb = getSupabase();
    if (!sb) { alert('Nu ești conectat'); return; }
    
    const profile = Auth.currentProfile;
    if (!profile) { alert('Profil necunoscut'); return; }
    
    const { error } = await sb.from('project_decisions').insert([
      {
        project_id: this.currentProject.id,
        decision: decisionText,
        decision_date: decisionDate,
        created_by: profile.id,
        decision_maker: decisionMakerId,
      }
    ]);
    
    if (error) {
      alert('Eroare la salvare: ' + error.message);
      return;
    }
    
    document.getElementById('decision-modal').remove();
    this.renderJurnalProiectTab(true);
  },
  openEditDecisionModal(decisionId, currentText) {
    const sb = getSupabase();
    if (!sb) { alert('Nu ești conectat'); return; }
    
    // Fetch decision and history
    sb.from('project_decisions')
      .select('*')
      .eq('id', decisionId)
      .single()
      .then(({ data: decision, error }) => {
        if (error) { alert('Eroare: ' + error.message); return; }
        
        sb.from('project_decisions_history')
          .select('*')
          .eq('decision_id', decisionId)
          .order('edited_at', { ascending: false })
          .then(({ data: history, error: histError }) => {
            if (histError) history = [];
            this.showEditDecisionModal(decision, history || []);
          });
      });
  },

  showEditDecisionModal(decision, history) {
    const profile = Auth.currentProfile;
    const isAdmin = profile && profile.role === 'admin';
    const profileIdStr = String(profile?.id || '');
    const isCoord = this.members.some(m => String(m.user_id) === profileIdStr && (m.role === 'coordonator' || m.role === 'coord'));
    const canEdit = isAdmin || isCoord;
    
    let historyHtml = '';
    if (history && history.length > 0) {
      historyHtml = '<div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--border)"><h4 style="margin:0 0 12px 0;font-size:12px;color:var(--text-muted);font-weight:600">Istoricul reviziilor:</h4>';
      historyHtml += history.map(h => {
        const dt = new Date(h.edited_at);
        const dateStr = dt.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const editorName = this.getUserName(h.edited_by) || 'Necunoscut';
        return `
          <div style="background:var(--bg-secondary);padding:10px;border-radius:6px;margin-bottom:8px;font-size:12px">
            <div style="color:var(--text-muted);margin-bottom:6px"><strong>${editorName}</strong> — ${dateStr}</div>
            <div style="color:var(--text-muted)"><strong>Veche:</strong> ${h.old_decision}</div>
            <div style="color:var(--text-primary);margin-top:4px"><strong>Nouă:</strong> ${h.new_decision}</div>
          </div>
        `;
      }).join('');
      historyHtml += '</div>';
    }
    
    const modal = document.createElement('div');
    modal.id = 'edit-decision-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;overflow-y:auto';
    modal.innerHTML = `
      <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:24px;max-width:600px;width:90%;box-shadow:0 10px 40px rgba(0,0,0,0.2);margin:20px auto">
        <h3 style="margin:0 0 20px 0;color:var(--text-primary)">Editează decizie</h3>
        
        <div style="margin-bottom:20px">
          <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:6px;font-weight:600">Decizia (în vigoare)</label>
          <textarea id="edit-decision-text" placeholder="Descrieți decizia..." style="width:100%;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit;resize:vertical;min-height:80px;background:var(--card-bg);color:var(--text-primary);box-sizing:border-box;${canEdit ? '' : 'opacity:0.6;cursor:not-allowed'}" ${canEdit ? '' : 'disabled'}>${decision.decision}</textarea>
        </div>
        
        ${historyHtml}
        
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
          <button onclick="document.getElementById('edit-decision-modal').remove()" style="background:var(--bg-secondary);border:1px solid var(--border);color:var(--text-primary);padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer">Închide</button>
          ${canEdit ? `<button onclick="Proiecte.saveEditedDecision(${decision.id})" style="background:var(--primary);color:#fff;border:none;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer">Salvează</button>` : ''}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    if (canEdit) document.getElementById('edit-decision-text').focus();
  },

  async saveEditedDecision(decisionId) {
    const newText = document.getElementById('edit-decision-text')?.value?.trim();
    if (!newText) {
      alert('Decizia nu poate fi goală!');
      return;
    }
    
    const sb = getSupabase();
    if (!sb) { alert('Nu ești conectat'); return; }
    
    const profile = Auth.currentProfile;
    if (!profile) { alert('Profil necunoscut'); return; }
    
    // Get old decision
    const { data: oldData, error: fetchError } = await sb
      .from('project_decisions')
      .select('decision')
      .eq('id', decisionId)
      .single();
    
    if (fetchError) {
      alert('Eroare la preluare: ' + fetchError.message);
      return;
    }
    
    const oldDecision = oldData.decision;
    
    // Update decision
    const { error: updateError } = await sb
      .from('project_decisions')
      .update({ decision: newText })
      .eq('id', decisionId);
    
    if (updateError) {
      alert('Eroare la actualizare: ' + updateError.message);
      return;
    }
    
    // Add to history
    await sb.from('project_decisions_history').insert([
      {
        decision_id: decisionId,
        old_decision: oldDecision,
        new_decision: newText,
        edited_by: profile.id,
      }
    ]);
    
    document.getElementById('edit-decision-modal').remove();
    this.renderJurnalProiectTab(true);
  },

  async deleteDecision(decisionId) {
    if (!confirm('Sigur doriți să ștergeți această decizie?')) return;
    
    const sb = getSupabase();
    if (!sb) { alert('Nu ești conectat'); return; }
    
    const { error } = await sb
      .from('project_decisions')
      .delete()
      .eq('id', decisionId);
    
    if (error) {
      alert('Eroare la ștergere: ' + error.message);
      return;
    }
    
    this.renderJurnalProiectTab(true);
  },

  switchTab(tab) {
    this.currentTab = tab;
    const profile = Auth.currentProfile;
    const isAdmin = profile && profile.role === 'admin';
    const profileIdStr = String(profile?.id || '');
    const isCoord = this.members.some(m => String(m.user_id) === profileIdStr && (m.role === 'coordonator' || m.role === 'coord'));
    const canEdit = (isAdmin || isCoord) && this.editMode;
    console.log('📑 switchTab:', { tab, canEdit, editMode: this.editMode });
    ['etape', 'echipa', 'rapoarte', 'jurnal', 'jurnal-proiect'].forEach(t => {
      const btn = document.getElementById('tab-' + t);
      if (btn) {
        btn.style.fontWeight = t === tab ? '600' : '400';
        btn.style.color = t === tab ? 'var(--primary)' : 'var(--text-muted)';
        btn.style.borderBottom = t === tab ? '2px solid var(--primary)' : '2px solid transparent';
      }
    });
    const content = document.getElementById('tab-content');
    if (content) content.innerHTML = this.renderTab(tab, canEdit);
  },

  togglePhase(phaseBodyId) {
    const tbody = document.getElementById(phaseBodyId);
    if (!tbody) return;
    tbody.style.display = tbody.style.display === 'none' ? '' : 'none';
  },

  backToList() {
    this.currentProject = null;
    localStorage.removeItem('ic_last_project_id');  // Fix 1: șterge proiectul salvat
    this.renderList();
  },

  getUserName(userId) {
    const u = this.allUsers.find(u => u.id === userId);
    return u ? (u.full_name || u.name || u.email) : String(userId);
  },

  getUserCode(userId) {
    const u = this.allUsers.find(u => u.id === userId);
    if (!u) return '??';
    if (u.employee_code) return u.employee_code;
    // Fallback: initiale din full_name
    const name = u.full_name || u.name || '';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase() || '??';
  },

  // ===== TIMER =====
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
    this.renderProjectDetail();
    showToast('▶ Task pornit: ' + taskName, 'success');
  },

  pauseTask(taskId) {
    if (!window.activeTimerData || window.activeTimerData.taskId !== taskId) return;
    window.pausedTimerData = Object.assign({}, window.activeTimerData, { pausedAt: Date.now() });
    window.activeTimerData = null;
    if (typeof stopGlobalTimerInterval === 'function') stopGlobalTimerInterval();
    if (typeof _timerSave === 'function') _timerSave();
    if (typeof updateHeaderTimer === 'function') updateHeaderTimer();
    this.renderProjectDetail();
    showToast('⏸ Task în pauză', 'info');
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
    this.renderProjectDetail();
    showToast('▶ Task reluat', 'success');
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

    // Salvăm în time_entries via TimeTracking.saveFromTimer (câmpuri camelCase corecte)
    if (typeof TimeTracking !== 'undefined' && TimeTracking.saveFromTimer) {
      const result = await TimeTracking.saveFromTimer(timerData, minutes);
      if (result && result.error) {
        showToast('Eroare la salvarea timpului: ' + result.error.message, 'error');
      } else {
        // Recalculează minutes_worked din zero (nu incremental) pentru acuratețe maximă
        await this._recalcAndSaveTaskMinutes(taskId);
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        showToast('⏹ Task oprit. ' + (h > 0 ? h + 'h ' : '') + m + 'm înregistrate în Time-Tracking.', 'success');
      }
    } else {
      showToast('⏹ Task oprit (' + minutes + 'm)', 'success');
    }

    if (typeof _timerClear === 'function') _timerClear();
    if (typeof updateHeaderTimer === 'function') updateHeaderTimer();
    this.renderProjectDetail();
  },


  // ── Actualizare buget task (inline input onchange) ────────────────────────
  async updateTaskBudget(taskId, phaseId, newValue, phaseBudget) {
    const budgetH = parseFloat(newValue) || 0;
    const sb = getSupabase();
    if (!sb) return;
    const task = this.tasks.find(t => t.id === taskId);
    const oldBudget = task ? (task.budget_hours || 0) : null;
    const { error } = await sb.from('project_tasks').update({ budget_hours: budgetH }).eq('id', taskId);
    if (error) { showToast('Eroare: ' + error.message, 'error'); return; }
    // Log modificare buget
    this.logChange('budget', 'task', task?.name, oldBudget != null ? oldBudget + 'h' : null, budgetH + 'h', 'Modificare buget ore task');
    // Actualizează bugetul fazei automat (suma task-urilor)
    await this.recalcPhaseBudget(phaseId);
    showToast('Buget task actualizat', 'success');
    await this.loadProjectDetails(this.currentProject.id);
    this.renderProjectDetail();
  },

  // ── Actualizare buget etapă (inline input onchange) ───────────────────────
  async updatePhaseBudget(phaseId, newValue) {
    const budgetH = parseFloat(newValue) || 0;
    const sb = getSupabase();
    if (!sb) return;
    const phase = this.phases.find(p => p.id === phaseId);
    const oldBudget = phase?.budget_hours ?? null;
    const { error } = await sb.from('project_phases').update({ budget_hours: budgetH }).eq('id', phaseId);
    if (error) { showToast('Eroare: ' + error.message, 'error'); return; }
    if (phase) phase.budget_hours = budgetH;
    if (oldBudget !== budgetH) {
      this.logChange('budget', 'etapă', phase?.name || 'etapă', oldBudget != null ? oldBudget + 'h' : null, budgetH + 'h', 'Modificare buget ore etapă');
    }
    showToast('Buget etapă actualizat', 'success');
    // Nu re-render complet pentru a nu pierde focus
  },

  // ── Recalculează bugetul etapei din suma task-urilor ─────────────────────
  async recalcPhaseBudget(phaseId) {
    const phaseTasks = this.tasks.filter(t => t.phase_id === phaseId);
    const totalBudget = phaseTasks.reduce((s, t) => s + (t.budget_hours || 0), 0);
    const sb = getSupabase();
    if (!sb) return;
    await sb.from('project_phases').update({ budget_hours: totalBudget }).eq('id', phaseId);
    const phase = this.phases.find(p => p.id === phaseId);
    if (phase) phase.budget_hours = totalBudget;
  },

  // ── Ștergere task ─────────────────────────────────────────────────────────
  async deleteTask(taskId) {
    if (!confirm('Ești sigur că vrei să ștergi această sarcină? Aceasta va șterge și toate înregistrările de timp asociate.')) return;
    const task = this.tasks.find(t => t.id === taskId);
    const sb = getSupabase();
    if (!sb) return;
    try {
      // 1. Șterge time_entries asociate
      await sb.from('time_entries').delete().eq('task_id', taskId);
      // 2. Șterge manual_hours_log asociate
      await sb.from('manual_hours_log').delete().eq('task_id', taskId);
      // 3. Șterge task-ul
      const { error } = await sb.from('project_tasks').delete().eq('id', taskId);
      if (error) { showToast('Eroare: ' + error.message, 'error'); return; }
      this.logChange('delete', 'task', task?.name, null, null, 'Sarcină ștearsă din proiect');
      showToast('Sarcină ștearsă', 'success');
      if (task?.phase_id) await this.recalcPhaseBudget(task.phase_id);
      await this.loadProjectDetails(this.currentProject.id);
      this.renderProjectDetail();
    } catch (err) {
      showToast('Eroare la ștergere: ' + err.message, 'error');
    }
  },

  // ── Ștergere etapă ───────────────────────────────────────────────────────────────────────────────
  async deletePhase(phaseId) {
    const phase = (this.phases || []).find(p => p.id === phaseId);
    const phaseName = phase?.name || 'etapă';
    const taskCount = (this.tasks || []).filter(t => t.phase_id === phaseId).length;
    if (taskCount > 0) {
      showToast(`Nu poți șterge etapa "${phaseName}" — are ${taskCount} sarcin${taskCount === 1 ? 'ă' : 'i'} alocate. Șterge mai întâi sarcinile.`, 'error');
      return;
    }
    if (!confirm(`Ștergi etapa "${phaseName}"? Această acțiune nu poate fi anulată.`)) return;
    const sb = getSupabase();
    if (!sb) return;
    try {
      const { error } = await sb.from('project_phases').delete().eq('id', phaseId);
      if (error) { showToast('Eroare la ștergere: ' + error.message, 'error'); return; }
      this.logChange('delete', 'etapă', phaseName, null, null, 'Etapă ștearsă din proiect');
      showToast(`Etapa "${phaseName}" a fost ștearsă.`, 'success');
      await this.loadProjectDetails(this.currentProject.id);
      this.renderProjectDetail();
    } catch (err) {
      showToast('Eroare: ' + err.message, 'error');
    }
  },

  // ── Modal consum manual ore (admin/coordonator) ─────────────────────────────────────────────────
  async openManualConsumeModal(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;
    const budgetH = task.budget_hours || 0;
    const sb = getSupabase();
    let logHtml = '';
    // Recalculează minutes_worked din manual_hours_log + time_entries pentru a corecta orice inconsistență
    let timeEntriesHtml = '';
    if (sb) {
      const [logsCheck, timeCheck] = await Promise.all([
        sb.from('manual_hours_log').select('minutes').eq('task_id', taskId),
        sb.from('time_entries').select('id,duration_minutes,description,start_time,date,created_at,profiles!time_entries_user_id_fkey(full_name,employee_code)').eq('project_task_id', taskId).order('created_at', { ascending: false }).limit(50),
      ]);
      const manualMin = (logsCheck.data || []).reduce((s, r) => s + (r.minutes || 0), 0);
      const timeEntries = timeCheck.data || [];
      const timeMin = timeEntries.reduce((s, r) => s + (r.duration_minutes || 0), 0);
      const realMinutes = manualMin + timeMin;
      // Dacă valoarea din DB diferă, sincronizează
      if (realMinutes !== (task.minutes_worked || 0)) {
        await sb.from('project_tasks').update({ minutes_worked: realMinutes }).eq('id', taskId);
        task.minutes_worked = realMinutes;
      }
      // Generează HTML pentru time_entries
      if (timeEntries.length > 0) {
        timeEntriesHtml = `
          <div style="margin-top:4px">
            <div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Înregistrări Time-Tracking (${timeEntries.length})</div>
            <div style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:8px">
              ${timeEntries.map(te => {
                const h = Math.floor((te.duration_minutes || 0) / 60);
                const m = (te.duration_minutes || 0) % 60;
                const durStr = h > 0 ? (m > 0 ? h + 'h ' + m + 'min' : h + 'h') : m + 'min';
                const rawDate = te.start_time || te.date || te.created_at;
                const parsedDate = rawDate ? new Date(rawDate) : null;
                const dateStr = (parsedDate && !isNaN(parsedDate)) ? parsedDate.toLocaleDateString('ro-RO', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—';
                const who = te.profiles?.full_name || te.profiles?.employee_code || 'Necunoscut';
                return `<div style="padding:8px 12px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:10px">
                  <div style="flex:1;min-width:0">
                    <div style="display:flex;align-items:center;gap:8px">
                      <span style="font-weight:600;font-size:13px;color:#3B82F6">${durStr}</span>
                      <span style="font-size:11px;color:var(--text-muted)">${who} · ${dateStr}</span>
                    </div>
                    ${te.description ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px;font-style:italic">&quot;${te.description}&quot;</div>` : ''}
                  </div>
                  <button onclick="Proiecte.deleteTimeEntry(${te.id},${te.duration_minutes || 0},${taskId})" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:13px;padding:2px 4px;flex-shrink:0" title="Şterge înregistrare">🗑</button>
                </div>`;
              }).join('')}
            </div>
          </div>`;
      }
    }
    const workedH = Math.round((task.minutes_worked || 0) / 60 * 10) / 10;
    if (sb) {
      const { data: logs } = await sb.from('manual_hours_log')
        .select('id,minutes,note,created_at,added_by_profile_id,profiles!manual_hours_log_added_by_profile_id_fkey(full_name,employee_code)')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (logs && logs.length > 0) {
        const isAdmin = Auth.currentProfile?.role === 'admin' || Auth.currentProfile?.role === 'coordonator';
        logHtml = `
          <div style="margin-top:4px">
            <div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Istoric consum manual</div>
            <div style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:8px">
              ${logs.map(log => {
                const h = Math.floor(log.minutes / 60);
                const m = log.minutes % 60;
                const durStr = h > 0 ? (m > 0 ? h + 'h ' + m + 'min' : h + 'h') : m + 'min';
                const dateStr = new Date(log.created_at).toLocaleDateString('ro-RO', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
                const who = log.profiles?.full_name || log.profiles?.employee_code || 'Necunoscut';
                return `<div id="mhl-row-${log.id}" style="padding:8px 12px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;gap:10px">
                  <div style="flex:1;min-width:0">
                    <div style="display:flex;align-items:center;gap:8px">
                      <span style="font-weight:600;font-size:13px;color:var(--brand-dark)">+${durStr}</span>
                      <span style="font-size:11px;color:var(--text-muted)">${who} · ${dateStr}</span>
                    </div>
                    ${log.note ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px;font-style:italic">"${log.note}"</div>` : ''}
                  </div>
                  ${isAdmin ? `<div style="display:flex;gap:4px;flex-shrink:0">
                    <button onclick="Proiecte.openEditManualLog(${log.id},${log.minutes},${taskId})" style="background:none;border:none;cursor:pointer;color:var(--primary);font-size:13px;padding:2px 4px" title="Editează">✏️</button>
                    <button onclick="Proiecte.deleteManualLog(${log.id},${log.minutes},${taskId})" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:13px;padding:2px 4px" title="Șterge">🗑</button>
                  </div>` : ''}
                </div>`;
              }).join('')}
            </div>
          </div>`;
      } else {
        logHtml = `<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:8px">Niciun consum manual înregistrat.</div>`;
      }
    }

    openModal('Consum manual ore — ' + task.name, `
      <div style="display:grid;gap:12px">
        <div style="background:var(--bg-secondary);border-radius:8px;padding:12px;font-size:13px">
          <div>Ore bugetate: <strong>${budgetH}h</strong></div>
          <div>Ore consumate curent: <strong>${workedH}h</strong></div>
          <div>Ore rămase: <strong>${Math.round(Math.max(0, budgetH - workedH) * 100) / 100}h</strong></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>
            <label class="form-label">Ore</label>
            <input type="number" id="manual-hours-h" class="form-input" min="0" max="9999" step="1" value="0" placeholder="0" style="text-align:center">
          </div>
          <div>
            <label class="form-label">Minute (0–59)</label>
            <input type="number" id="manual-hours-m" class="form-input" min="0" max="59" step="1" value="0" placeholder="0" style="text-align:center">
          </div>
        </div>
        <div>
          <label class="form-label">Notă (opțional)</label>
          <input id="manual-note" class="form-input" placeholder="Ex: Ore lucrate înainte de crearea proiectului în portal">
        </div>
        <div style="font-size:12px;color:var(--text-muted)">
          ⚠️ Aceste ore vor fi adăugate direct la contorul de ore consumate al sarcinii, fără a crea o înregistrare în Time-Tracking.
        </div>
        ${timeEntriesHtml}
        ${logHtml}
      </div>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
      <button onclick="Proiecte.resetTaskHours(${taskId})" style="background:none;border:1px solid #ef4444;color:#ef4444;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;margin-right:auto" title="Recalculează din jurnal">↺ Recalculează</button>
      <button class="btn-brand" onclick="Proiecte.saveManualConsume(${taskId})">Adaugă ore</button>
    `);
  },
  // Șterge o înregistrare din time_entries și actualizează minutes_worked
  async deleteTimeEntry(entryId, durationMinutes, taskId) {
    if (!confirm('Sigur vrei să ștergi această înregistrare de timp? Acțiunea nu poate fi anulată.')) return;
    const sb = getSupabase();
    if (!sb) return;
    console.log('🗑️ deleteTimeEntry:', { entryId, durationMinutes, taskId });
    const { error } = await sb.from('time_entries').delete().eq('id', entryId);
    if (error) { console.error('❌ Eroare ștergere time_entry:', error); showToast('Eroare la ștergere: ' + error.message, 'error'); return; }
    console.log('✅ time_entry șters din DB');
    // Actualizează minutes_worked pe task
    const task = this.tasks.find(t => t.id === taskId);
    if (task) {
      const newMin = Math.max(0, (task.minutes_worked || 0) - durationMinutes);
      console.log('📊 Actualizare minutes_worked:', { oldMin: task.minutes_worked, newMin, durationMinutes });
      const { error: updateErr } = await sb.from('project_tasks').update({ minutes_worked: newMin }).eq('id', taskId);
      if (updateErr) { console.error('❌ Eroare update minutes_worked:', updateErr); } else { console.log('✅ minutes_worked actualizat în DB'); }
      task.minutes_worked = newMin;
    }
    showToast('✅ Înregistrare de timp ștearsă', 'success');
    // Redeschide modalul cu datele actualizate (nu închide fereastra)
    await this.openManualConsumeModal(taskId);
  },
  // Recalculează și sincronizează minutes_worked din manual_hours_log + time_entries
  async resetTaskHours(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;
    const sb = getSupabase();
    if (!sb) return;
    const [logsRes, timeRes] = await Promise.all([
      sb.from('manual_hours_log').select('minutes').eq('task_id', taskId),
      sb.from('time_entries').select('duration_minutes').eq('project_task_id', taskId),
    ]);
    const manualMin = (logsRes.data || []).reduce((s, r) => s + (r.minutes || 0), 0);
    const timeMin = (timeRes.data || []).reduce((s, r) => s + (r.duration_minutes || 0), 0);
    const realMinutes = manualMin + timeMin;
    const { error } = await sb.from('project_tasks').update({ minutes_worked: realMinutes }).eq('id', taskId);
    if (error) { showToast('Eroare: ' + error.message, 'error'); return; }
    task.minutes_worked = realMinutes;
    closeModalForce();
    const h = Math.floor(realMinutes / 60);
    const m = realMinutes % 60;
    const hStr = h > 0 ? h + 'h ' : '';
    const mStr = m > 0 ? m + 'min' : '';
    showToast(`✅ Ore recalculate: ${hStr}${mStr || '0min'} (manual: ${Math.round(manualMin/60*10)/10}h + time-tracking: ${Math.round(timeMin/60*10)/10}h)`, 'success');
    await this._refreshEtapeOnly();  // Fix 2: fără scroll-reset
  },

  async saveManualConsume(taskId) {
    const hoursH = parseInt(document.getElementById('manual-hours-h')?.value) || 0;
    const hoursM = parseInt(document.getElementById('manual-hours-m')?.value) || 0;
    const minutes = hoursH * 60 + hoursM;
    if (minutes <= 0) { showToast('Selectează cel puțin 15 minute', 'error'); return; }
    const note = document.getElementById('manual-note')?.value?.trim() || null;
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;
    const sb = getSupabase();
    if (!sb) return;
    const userUUID = Auth.currentUser?.id;
    if (!userUUID) { showToast('Utilizator neidentificat', 'error'); return; }

    // Inserează în manual_hours_log
    const { error: logError } = await sb.from('manual_hours_log').insert({
      task_id: taskId,
      project_id: task.project_id,
      added_by: userUUID,
      added_by_profile_id: userUUID,
      minutes,
      note,
    });
        if (logError) { showToast('Eroare la salvarea istoricului: ' + logError.message, 'error'); return; }
    // Recalculează minutes_worked din zero pentru acuratețe maximă
    await this._recalcAndSaveTaskMinutes(taskId);
    closeModalForce();
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    showToast(`✅ ${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'min ' : ''}adăugate manual pe sarcină`, 'success');
    await this._refreshEtapeOnly();  // Fix 2: fără scroll-reset
  },

  async openEditManualLog(logId, currentMinutes, taskId) {
    const currentH = Math.floor(currentMinutes / 60);
    const currentM = currentMinutes % 60;
    openModal('Editează consum manual ore', `
      <div style="display:grid;gap:12px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>
            <label class="form-label">Ore</label>
            <input type="number" id="edit-mhl-h" class="form-input" min="0" max="9999" step="1" value="${currentH}" style="text-align:center">
          </div>
          <div>
            <label class="form-label">Minute (0-59)</label>
            <input type="number" id="edit-mhl-m" class="form-input" min="0" max="59" step="15" value="${currentM}" style="text-align:center">
          </div>
        </div>
        <div>
          <label class="form-label">Notă (opțional)</label>
          <input id="edit-mhl-note" class="form-input" placeholder="Notă">
        </div>
      </div>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
      <button class="btn-brand" onclick="Proiecte.saveEditManualLog(${logId},${currentMinutes},${taskId})">Salvează</button>
    `);
  },

  async saveEditManualLog(logId, oldMinutes, taskId) {
    const newH = parseInt(document.getElementById('edit-mhl-h')?.value) || 0;
    const newM = parseInt(document.getElementById('edit-mhl-m')?.value) || 0;
    const newMinutes = newH * 60 + newM;
    if (newMinutes <= 0) { showToast('Selectează cel puțin 15 minute', 'error'); return; }
    const note = document.getElementById('edit-mhl-note')?.value?.trim() || null;
    const sb = getSupabase();
    if (!sb) return;

    const { error: logError } = await sb.from('manual_hours_log').update({ minutes: newMinutes, note, updated_at: new Date().toISOString() }).eq('id', logId);
        if (logError) { showToast('Eroare: ' + logError.message, 'error'); return; }
    // Recalculează minutes_worked din zero pentru acuratețe maximă
    await this._recalcAndSaveTaskMinutes(taskId);
    closeModalForce();
    showToast('✅ Consum manual actualizat', 'success');
    await this._refreshEtapeOnly();  // Fix 2: fără scroll-reset
  },

  async deleteManualLog(logId, minutes, taskId) {
    if (!confirm('Ștergi această înregistrare de consum manual? Orele vor fi scăzute din totalul sarcinii.')) return;
    const sb = getSupabase();
    if (!sb) return;
    console.log('🗑️ deleteManualLog:', { logId, minutes, taskId });
    const { error } = await sb.from('manual_hours_log').delete().eq('id', logId);
    if (error) { showToast('Eroare la ștergere: ' + error.message, 'error'); return; }
    // Recalculează minutes_worked din zero pentru acuratețe maximă
    await this._recalcAndSaveTaskMinutes(taskId);
    showToast('✅ Consum manual șters', 'success');
    // Redeschide modalul cu datele actualizate (nu închide fereastra)
    await this.openManualConsumeModal(taskId);
  },
  openEditTaskModal(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;
    const nameEsc = (task.name || '').replace(/"/g, '&quot;');

    openModal('Editează sarcină', `
      <div style="display:grid;gap:12px">
        <div>
          <label class="form-label">Nume sarcină *</label>
          <input id="edit-task-name" class="form-input" value="${nameEsc}">
        </div>
      </div>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
      <button class="btn-primary" onclick="Proiecte.saveEditTask(${taskId})">Salvează</button>
    `);
  },

  async saveEditTask(taskId) {
    const name = document.getElementById('edit-task-name')?.value?.trim();
    if (!name) { showToast('Completează numele sarcinii', 'error'); return; }
    const oldTask = this.tasks.find(t => t.id === taskId);
    const oldName = oldTask?.name || null;
    const result = await dbQuery('project_tasks', q => q.update({ name }).eq('id', taskId), null);
    if (result && result.error) { showToast('Eroare: ' + result.error.message, 'error'); return; }
    if (oldName && oldName !== name) {
      this.logChange('rename', 'task', name, oldName, name, `Sarcină redenumită: "${oldName}" → "${name}"`);
    }
    closeModalForce();
    showToast('Sarcină actualizată!', 'success');
    await this._refreshEtapeOnly();  // Fix 2: fără scroll-reset
  },

  async deleteTask(taskId) {
    if (!confirm('Sigur vrei să ștergi această sarcină? Aceasta va șterge și toate înregistrările de timp asociate.')) return;
    const result = await dbQuery('project_tasks', q => q.delete().eq('id', taskId), null);
    if (result && result.error) { showToast('Eroare: ' + result.error.message, 'error'); return; }
    showToast('Sarcină ștearsă!', 'success');
    await this._refreshEtapeOnly();  // Fix 2: fără scroll-reset
  },

  openAddPhaseModal() {
    // Determină etapele prestabilite care lipsesc din proiect
    const existingCodes = new Set(this.phases.map(p => p.code).filter(Boolean));
    const missingPresets = PRESET_PHASES.filter(ph => !existingCodes.has(ph.code));

    const presetSection = missingPresets.length > 0 ? `
      <div style="margin-bottom:16px">
        <div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Etape prestabilite disponibile</div>
        <div style="display:grid;gap:6px;max-height:220px;overflow-y:auto">
          ${missingPresets.map(ph => `
            <label style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;cursor:pointer;transition:border-color 0.15s" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'">
              <input type="radio" name="preset-phase" value="${ph.code}" style="accent-color:var(--primary)">
              <div style="width:12px;height:12px;border-radius:50%;background:${ph.color};flex-shrink:0"></div>
              <div>
                <div style="font-weight:600;font-size:13px">${ph.code}. ${ph.name}</div>
                <div style="font-size:11px;color:var(--text-muted)">${ph.tasks.length} sarcini prestabilite</div>
              </div>
            </label>
          `).join('')}
          <label style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;cursor:pointer;transition:border-color 0.15s" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'">
            <input type="radio" name="preset-phase" value="__custom__" style="accent-color:var(--primary)">
            <div style="width:12px;height:12px;border-radius:50%;background:var(--text-muted);flex-shrink:0"></div>
            <div style="font-weight:600;font-size:13px">+ Etapă personalizată</div>
          </label>
        </div>
      </div>
      <div id="custom-phase-fields" style="display:none;border-top:1px solid var(--border);padding-top:14px;display:grid;gap:12px">
    ` : `<div id="custom-phase-fields" style="display:grid;gap:12px">`;

    const customFields = `
        <div>
          <label class="form-label">Nume etapă *</label>
          <input id="new-phase-name" class="form-input" placeholder="Ex: Proiectare Structură">
        </div>
        <div>
          <label class="form-label">Buget ore</label>
          <input id="new-phase-budget" type="number" class="form-input" value="0" min="0">
        </div>
        <div>
          <label class="form-label">Culoare</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            ${['#3B82F6','#8B5CF6','#EC4899','#F59E0B','#EF4444','#10B981','#0EA5E9','#F97316','#6366F1','#14B8A6'].map((c,i) =>
              `<div onclick="document.querySelectorAll('.phase-color-opt').forEach(el=>el.style.outline='none');this.style.outline='3px solid #000';this.style.outlineOffset='2px';document.getElementById('new-phase-color').value='${c}'" class="phase-color-opt" style="width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;transition:outline 0.1s;${i===0?'outline:3px solid #000;outline-offset:2px':''}"></div>`
            ).join('')}
            <input type="hidden" id="new-phase-color" value="#3B82F6">
          </div>
        </div>
      </div>
    `;

    const toggleScript = missingPresets.length > 0 ? `
      <script>
        document.querySelectorAll('input[name="preset-phase"]').forEach(function(r) {
          r.addEventListener('change', function() {
            var cf = document.getElementById('custom-phase-fields');
            if (cf) cf.style.display = this.value === '__custom__' ? 'grid' : 'none';
          });
        });
      <\/script>
    ` : '';

    openModal('Adaugă etapă', presetSection + customFields + toggleScript, `
      <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
      <button class="btn-primary" onclick="Proiecte.saveNewPhase()">Adaugă etapă</button>
    `);
  },

  async saveNewPhase() {
    const maxOrder = this.phases.reduce((m, p) => Math.max(m, p.display_order || 0), 0);
    // Verifică dacă s-a selectat o etapă prestabilită
    const selectedRadio = document.querySelector('input[name="preset-phase"]:checked');
    const selectedCode = selectedRadio ? selectedRadio.value : null;

    if (selectedCode && selectedCode !== '__custom__') {
      // Adaugă etapa prestabilită cu toate task-urile ei
      const preset = PRESET_PHASES.find(ph => ph.code === selectedCode);
      if (!preset) { showToast('Etapă prestabilită negasită', 'error'); return; }
      const phaseResult = await dbQuery('project_phases', q => q.insert({
        project_id: this.currentProject.id,
        name: preset.name,
        code: preset.code,
        color: preset.color,
        budget_hours: 0,
        display_order: maxOrder + 1,
        status: 'activ',
        is_preset: true,
      }).select(), null);
      if (phaseResult && phaseResult.error) { showToast('Eroare: ' + phaseResult.error.message, 'error'); return; }
      const newPhase = phaseResult?.data?.[0];
      if (newPhase && preset.tasks.length > 0) {
        const tasksToInsert = preset.tasks.map((taskName, idx) => ({
          project_id: this.currentProject.id,
          phase_id: newPhase.id,
          name: taskName,
          display_order: idx + 1,
          budget_hours: 0,
          minutes_worked: 0,
          status: 'todo',
          is_preset: true,
        }));
        await dbQuery('project_tasks', q => q.insert(tasksToInsert), []);
      }
      closeModalForce();
      this.logChange('insert', 'etapă', preset.code + '. ' + preset.name, null, null, 'Etapă prestabilită adăugată cu ' + preset.tasks.length + ' sarcini');
      showToast('Etapă ' + preset.code + '. ' + preset.name + ' adăugată cu ' + preset.tasks.length + ' sarcini!', 'success');
    } else {
      // Etapă personalizată
      const name = document.getElementById('new-phase-name')?.value?.trim();
      if (!name) { showToast('Completează numele etapei', 'error'); return; }
      const budgetH = parseFloat(document.getElementById('new-phase-budget')?.value) || 0;
      const color = document.getElementById('new-phase-color')?.value || '#3B82F6';
      const result = await dbQuery('project_phases', q => q.insert({
        project_id: this.currentProject.id,
        name,
        color,
        budget_hours: budgetH,
        display_order: maxOrder + 1,
        status: 'activ',
        is_preset: false,
      }).select(), null);
      if (result && result.error) { showToast('Eroare: ' + result.error.message, 'error'); return; }
      closeModalForce();
      this.logChange('insert', 'etapă', name, null, budgetH > 0 ? budgetH + 'h' : null, 'Etapă personalizată adăugată');
      showToast('Etapă adăugată!', 'success');
    }
    await this._refreshEtapeOnly();  // Fix 2: fără scroll-reset
  },

  openAddTaskModal(phaseId) {
    const phase = this.phases.find(p => p.id === phaseId);
    const phaseName = phase ? phase.name : 'etapă';
    const phaseBudget = phase ? (phase.budget_hours || 0) : 0;
    const allocated = this.tasks.filter(t => t.phase_id === phaseId).reduce((s, t) => s + (t.budget_hours || 0), 0);
    const remaining = Math.max(0, phaseBudget - allocated);
    // Găsim task-urile prestabilite pentru etapa curentă (după cod)
    const phaseCode = phase ? (phase.code || '') : '';
    const presetPhase = PRESET_PHASES.find(pp => pp.code === phaseCode);
    const presetTasks = presetPhase ? presetPhase.tasks : [];
    // Excludem task-urile deja existente în etapă
    const existingNames = new Set(this.tasks.filter(t => t.phase_id === phaseId).map(t => t.name.toLowerCase()));
    const availablePresets = presetTasks.filter(t => !existingNames.has(t.toLowerCase()));
    const presetSection = availablePresets.length > 0 ? `
      <div>
        <label class="form-label">Sarcini prestabilite pentru etapa ${phaseCode ? '"' + phaseCode + ' — ' + (presetPhase ? presetPhase.name : '') + '"' : phaseName}</label>
        <select id="new-task-preset" class="form-input" onchange="const v=this.value; if(v){document.getElementById('new-task-name').value=v;}">
          <option value="">— Selectează o sarcină prestabilită —</option>
          ${availablePresets.map(t => `<option value="${t.replace(/"/g,'&quot;')}">${t}</option>`).join('')}
        </select>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Sau scrie un nume personalizat mai jos.</div>
      </div>` : '';
    openModal('Adaugă sarcină în ' + phaseName, `
      <div style="display:grid;gap:12px">
        ${presetSection}
        <div>
          <label class="form-label">Nume sarcină *</label>
          <input id="new-task-name" class="form-input" placeholder="Ex: Modelare 3D Draft 1" autofocus>
        </div>
        <div>
          <label class="form-label">Buget ore ${phaseBudget > 0 ? '(max ' + remaining + 'h disponibil)' : ''}</label>
          <input id="new-task-budget" type="number" class="form-input" value="0" min="0">
        </div>
      </div>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
      <button class="btn-primary" onclick="Proiecte.saveNewTask(${phaseId},${phaseBudget},${allocated})">Adaugă sarcină</button>
    `);
  },

  async saveNewTask(phaseId, phaseBudget, allocated) {
    const name = document.getElementById('new-task-name')?.value?.trim();
    if (!name) { showToast('Completează numele sarcinii', 'error'); return; }
    const budgetH = parseFloat(document.getElementById('new-task-budget')?.value) || 0;
    // Allow 0 hours budget - it doesn't count towards phase budget
    if (budgetH > 0 && phaseBudget > 0 && (allocated + budgetH) > phaseBudget) {
      showToast('Depășești bugetul etapei! Disponibil: ' + Math.max(0, phaseBudget - allocated) + 'h', 'error');
      return;
    }
    const maxOrder = this.tasks.filter(t => t.phase_id === phaseId).reduce((m, t) => Math.max(m, t.display_order || 0), 0);
    const result = await dbQuery('project_tasks', q => q.insert({
      project_id: this.currentProject.id,
      phase_id: phaseId,
      name,
      budget_hours: budgetH,
      display_order: maxOrder + 1,
      minutes_worked: 0,
      status: 'todo',
      is_preset: false,
    }), null);
    if (result && result.error) { showToast('Eroare: ' + result.error.message, 'error'); return; }
    closeModalForce();
    this.logChange('insert', 'task', name, null, budgetH > 0 ? budgetH + 'h' : null, 'Sarcină nouă adăugată');
    showToast('Sarcină adăugată!', 'success');
    // Recalculează bugetul etapei din suma task-urilor
    await this.recalcPhaseBudget(phaseId);
    await this._refreshEtapeOnly();  // Fix 2: fără scroll-reset
  },
  openAddMemberModal(role) {
    const existingIds = this.members.map(m => m.user_id);
    const available = this.allUsers.filter(u => !existingIds.includes(u.id));
    const label = role === 'coordonator' ? 'coordonatori' : 'angajați';

    openModal('Adaugă ' + label, `
      <div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Selectează una sau mai multe persoane:</div>
        <div style="max-height:320px;overflow-y:auto;border:1px solid var(--border);border-radius:8px">
          ${available.length === 0
            ? '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">Toți angajații sunt deja în echipă</div>'
            : available.map(u => {
                const initials = u.employee_code || (u.full_name || 'IC').split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
                const avatarEl = u.avatar_url
                  ? `<img src="${u.avatar_url}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0">`
                  : `<div style="width:32px;height:32px;border-radius:50%;background:var(--brand-dark);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">${initials}</div>`;
                return `
                  <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--border);transition:background 0.15s" onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
                    <input type="checkbox" name="member-cb" value="${u.id}" style="width:16px;height:16px;accent-color:var(--brand-dark);flex-shrink:0" />
                    ${avatarEl}
                    <div style="flex:1;min-width:0">
                      <div style="font-weight:600;font-size:13px">${u.full_name || u.name || u.email}</div>
                      <div style="font-size:11px;color:var(--text-muted)">${u.department || ''} ${u.job_title || u.position ? '· ' + (u.job_title || u.position) : ''}</div>
                    </div>
                  </label>
                `;
              }).join('')
          }
        </div>
      </div>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
      <button class="btn-primary" onclick="Proiecte.addMember('${role}')">Adaugă selecția</button>
    `);
  },

  async addMember(role) {
    const checkboxes = document.querySelectorAll('input[name="member-cb"]:checked');
    const userIds = Array.from(checkboxes).map(cb => cb.value);
    if (userIds.length === 0) { showToast('Selectează cel puțin un angajat', 'error'); return; }

    const inserts = userIds.map(userId => ({
      project_id: this.currentProject.id,
      user_id: userId,
      role,
      added_by: Auth.currentProfile ? Auth.currentProfile.id : null,
    }));

    const result = await dbQuery('project_members', q => q.insert(inserts), null);
    if (result && result.error) { showToast('Eroare: ' + result.error.message, 'error'); return; }
    closeModalForce();
    const addedNames = userIds.map(uid => this.getUserName(uid)).join(', ');
    this.logChange('assign', 'echipă', addedNames, null, role, `${userIds.length} ${role === 'coordonator' ? 'coordonator(i)' : 'angajat(i)'} adăugat(i) în proiect`);
    showToast(`${userIds.length} ${userIds.length === 1 ? 'membru adăugat' : 'membri adăugați'}!`, 'success');
    await this.loadProjectDetails(this.currentProject.id);
    this.switchTab('echipa');
  },

  async removeMember(memberId) {
    if (!confirm('Elimini acest membru din proiect?')) return;
    const member = this.members.find(m => m.id === memberId);
    const memberName = member ? this.getUserName(member.user_id) : 'Necunoscut';
    const sb = getSupabase();
    if (!sb) { showToast('Eroare: conexiune indisponibilă', 'error'); return; }
    console.log('[removeMember] Șterg membrul cu id:', memberId, 'din project_members');
    const { error } = await sb.from('project_members').delete().eq('id', memberId);
    if (error) {
      console.error('[removeMember] Eroare Supabase:', error);
      showToast('Eroare la ștergere: ' + error.message, 'error');
      return;
    }
    console.log('[removeMember] Succes — membrul a fost eliminat');
    this.logChange('delete', 'echipă', memberName, null, null, 'Membru eliminat din proiect');
    showToast('Membru eliminat', 'success');
    await this.loadProjectDetails(this.currentProject.id);
    this.switchTab('echipa');
  },

  openAddCollaboratorModal() {
    openModal('Invită colaborator extern', `
      <div style="display:grid;gap:14px">
        <div style="padding:12px;background:#78350f15;border:1px solid #F59E0B40;border-radius:8px;font-size:12px;color:#F59E0B">
          🔒 Colaboratorul extern va putea să se autentifice pe hub.ingineriecreativa.ro cu adresa de email introdusă și va vedea <strong>doar proiectul curent</strong> și task-urile asignate lui.
        </div>
        <div>
          <label class="form-label">Adresă email colaborator *</label>
          <input id="collab-email" class="form-input" type="email" placeholder="exemplu@domeniu.ro">
        </div>
        <div>
          <label class="form-label">Nume complet (opțional)</label>
          <input id="collab-name" class="form-input" type="text" placeholder="Prenume Nume">
        </div>
        <div style="font-size:11px;color:var(--text-muted)">
          ℹ️ Colaboratorul nu trebuie să aibă adresă @ingineriecreativa.ro. După invitare, poate fi asignat la task-uri din proiect. Orele nu sunt contorizate automat.
        </div>
      </div>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
      <button class="btn-primary" onclick="Proiecte.addCollaborator()" style="background:#F59E0B;border-color:#F59E0B;color:#000">🤝 Invită colaborator</button>
    `);
  },
  async addCollaborator() {
    const email = document.getElementById('collab-email')?.value?.trim().toLowerCase();
    const name = document.getElementById('collab-name')?.value?.trim();
    if (!email || !email.includes('@')) { showToast('Introdu o adresă de email validă', 'error'); return; }
    const sb = getSupabase();
    if (!sb) { showToast('Eroare: conexiune indisponibilă', 'error'); return; }
    // Verifică dacă există deja un profil cu acest email
    let userId = null;
    const { data: existingProfiles } = await sb.from('profiles').select('id,email,full_name').eq('email', email).limit(1);
    if (existingProfiles && existingProfiles.length > 0) {
      userId = existingProfiles[0].id;
    } else {
      // Creează un profil minimal pentru colaboratorul extern (fără cont Supabase Auth)
      // Folosim un UUID generat local ca placeholder
      // Generează UUID explicit (profiles.id este NOT NULL)
      const tempId = crypto.randomUUID ? crypto.randomUUID() : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
      const { data: newProfile, error: profileErr } = await sb.from('profiles').insert({
        id: tempId,
        email,
        full_name: name || email.split('@')[0],
        role: 'colaborator_extern',
        employee_code: 'EXT',
        is_pre_created: true,
      }).select('id').single();
      if (profileErr) {
        // Dacă profilul există deja (conflict), încercă să-l găsim din nou
        const { data: retry } = await sb.from('profiles').select('id').eq('email', email).limit(1);
        if (retry && retry.length > 0) { userId = retry[0].id; }
        else { showToast('Eroare la creare profil: ' + profileErr.message, 'error'); return; }
      } else {
        userId = newProfile.id;
      }
    }
    // Verifică dacă este deja în proiect
    const alreadyIn = this.members.some(m => String(m.user_id) === String(userId));
    if (alreadyIn) { showToast('Acest colaborator este deja în proiect', 'error'); return; }
    // Adaugă în project_members cu rol colaborator_extern
    const { error: insertErr } = await sb.from('project_members').insert({
      project_id: this.currentProject.id,
      user_id: userId,
      role: 'colaborator_extern',
      added_by: Auth.currentProfile?.id || null,
    });
    if (insertErr) { showToast('Eroare la invitare: ' + insertErr.message, 'error'); return; }
    closeModalForce();
    this.logChange('assign', 'echipă', email, null, 'colaborator_extern', `Colaborator extern invitat: ${email}`);
    showToast(`✅ Colaborator invitat: ${email}`, 'success');
    await this.loadProjectDetails(this.currentProject.id);
    this.switchTab('echipa');
  },

  openAssignModal(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    const currentAssigned = task?.assigned_users || (task?.assigned_user_id ? [task.assigned_user_id] : []);
    dbQuery('project_task_assignments', q =>
      q.select('user_id,start_date,end_date').eq('task_id', taskId), []
    ).then(res => {
      const existingMap = {};
      (res.data || []).forEach(a => { existingMap[a.user_id] = a; });
      const membersHtml = this.members.length === 0
        ? '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">Niciun membru în echipa proiectului</div>'
        : this.members.map(m => {
            const u = m.profiles || {};
            const name = u.full_name || u.name || u.email || 'Utilizator';
            const initials = u.employee_code || name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
            const avatarEl = u.avatar_url
              ? '<img src="' + u.avatar_url + '" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0">'
              : '<div style="width:32px;height:32px;border-radius:50%;background:var(--brand-dark);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">' + initials + '</div>';
            // Bifat dacă există în project_task_assignments SAU în assigned_users
            const isInAssignments = !!existingMap[m.user_id];
            const isInAssigned = currentAssigned.some(id => String(id) === String(m.user_id));
            const isChecked = isInAssignments || isInAssigned;
            const checked = isChecked ? 'checked' : '';
            const ex = existingMap[m.user_id] || {};
            const startVal = ex.start_date || '';
            const endVal = ex.end_date || '';
            const datesDisplay = isChecked ? 'flex' : 'none';
            return '<div style="border-bottom:1px solid var(--border);padding:10px 12px">'
              + '<label style="display:flex;align-items:center;gap:10px;cursor:pointer">'
              + '<input type="checkbox" name="assign-cb" value="' + m.user_id + '" ' + checked
              + ' style="width:16px;height:16px;accent-color:var(--brand-dark);flex-shrink:0"'
              + ' onchange="this.closest(&quot;div&quot;).querySelector(&quot;.assign-dates-row&quot;).style.display=this.checked?&quot;flex&quot;:&quot;none&quot;" />'
              + avatarEl
              + '<div style="flex:1;min-width:0">'
              + '<div style="font-weight:600;font-size:13px">' + name + '</div>'
              + '<div style="font-size:11px;color:var(--text-muted)">' + (u.department || '') + (u.job_title || u.position ? ' · ' + (u.job_title || u.position) : '') + '</div>'
              + '</div></label>'
              + '<div class="assign-dates-row" style="display:' + datesDisplay + ';gap:8px;margin-top:8px;margin-left:42px">'
              + '<div style="flex:1"><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:2px">Data start</label>'
              + '<input type="date" name="assign-start" data-uid="' + m.user_id + '" class="form-input" style="font-size:12px;padding:4px 8px" value="' + startVal + '"></div>'
              + '<div style="flex:1"><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:2px">Data final</label>'
              + '<input type="date" name="assign-end" data-uid="' + m.user_id + '" class="form-input" style="font-size:12px;padding:4px 8px" value="' + endVal + '"></div>'
              + '</div></div>';
          }).join('');
      openModal('Asignează responsabili',
        '<div>'
        + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Selectează persoanele și perioada în care lucrează la această sarcină:</div>'
        + '<div style="max-height:360px;overflow-y:auto;border:1px solid var(--border);border-radius:8px">' + membersHtml + '</div>'
        + '<div style="font-size:11px;color:var(--text-muted);margin-top:8px">💡 Perioada apare în Process Overview ca bară Gantt per angajat.</div>'
        + '</div>',
        '<button class="btn-secondary" onclick="closeModalForce()">Anulează</button>'
        + '<button class="btn-primary" onclick="Proiecte.assignTask(' + taskId + ')">Salvează</button>'
      );
    });
  },

  async assignTask(taskId) {
    const sb = getSupabase();
    if (!sb) { showToast('Eroare: conexiune indisponibilă', 'error'); return; }

    const checkboxes = document.querySelectorAll('input[name="assign-cb"]:checked');
    const userIds = Array.from(checkboxes).map(cb => cb.value);
    const primaryUserId = userIds[0] || null;
    const projectId = this.currentProject?.id;

    console.log('[assignTask] taskId:', taskId, 'userIds:', userIds, 'projectId:', projectId);

    // Actualizează project_tasks (assigned_user_id + assigned_users)
    const { error: taskErr } = await sb.from('project_tasks').update({
      assigned_user_id: primaryUserId,
      assigned_users: userIds.length > 0 ? userIds : null,
    }).eq('id', taskId);
    if (taskErr) { console.error('[assignTask] Eroare update project_tasks:', taskErr); showToast('Eroare la salvare: ' + taskErr.message, 'error'); return; }

    // Șterge assignment-urile vechi
    const { error: delErr } = await sb.from('project_task_assignments').delete().eq('task_id', taskId);
    if (delErr) { console.error('[assignTask] Eroare delete project_task_assignments:', delErr); showToast('Eroare la ștergere alocari vechi: ' + delErr.message, 'error'); return; }

    // Inserează noile assignment-uri cu perioadă
    if (userIds.length > 0 && projectId) {
      const rows = userIds.map(uid => {
        const startInput = document.querySelector(`input[name="assign-start"][data-uid="${uid}"]`);
        const endInput = document.querySelector(`input[name="assign-end"][data-uid="${uid}"]`);
        const row = {
          task_id: taskId,
          project_id: projectId,
          user_id: uid,
          start_date: startInput?.value || null,
          end_date: endInput?.value || null,
        };
        console.log('[assignTask] Row de inserat:', row);
        return row;
      });
      const { error: insErr } = await sb.from('project_task_assignments').insert(rows);
      if (insErr) { console.error('[assignTask] Eroare insert project_task_assignments:', insErr); showToast('Eroare la salvare perioadă: ' + insErr.message, 'error'); return; }
      console.log('[assignTask] Insert reusit pentru', rows.length, 'randuri');
    }

    closeModalForce();
    showToast(userIds.length > 0 ? `${userIds.length} responsabil${userIds.length !== 1 ? 'i asignați' : ' asignat'}` : 'Sarcină neasignată', 'success');
    await this._refreshEtapeOnly();  // Fix 2: fără scroll-reset
  },

  openEditProject() {
    const p = this.currentProject;
    if (!p) return;
    openModal('Setări proiect', `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="grid-column:1/-1">
          <label class="form-label">Nume proiect</label>
          <input id="ep-name" class="form-input" value="${(p.name || '').replace(/"/g,'&quot;')}">
        </div>
        <div>
          <label class="form-label">Cod</label>
          <input id="ep-code" class="form-input" value="${p.code || ''}">
        </div>
        <div>
          <label class="form-label">Client</label>
          <input id="ep-client" class="form-input" value="${(p.client_name || '').replace(/"/g,'&quot;')}">
        </div>
        <div>
          <label class="form-label">Data start</label>
          <input id="ep-start" type="date" class="form-input" value="${p.start_date || ''}">
        </div>
        <div>
          <label class="form-label">Data final</label>
          <input id="ep-end" type="date" class="form-input" value="${p.end_date || ''}">
        </div>
        <div>
          <label class="form-label">Status</label>
          <select id="ep-status" class="form-input">
            <option value="activ" ${p.status==='activ'?'selected':''}>Activ</option>
            <option value="suspendat" ${p.status==='suspendat'?'selected':''}>Suspendat</option>
            <option value="finalizat" ${p.status==='finalizat'?'selected':''}>Finalizat</option>
            <option value="intern" ${p.status==='intern'?'selected':''}>Intern</option>
          </select>
        </div>
        <div>
          <label class="form-label">Culoare proiect</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
            ${['#FFCB08','#1A1A1A','#FFFFFF','#E63946','#2A9D8F','#457B9D','#6D6875'].map(c => `<button type="button" onclick="document.getElementById('ep-color').value='${c}';document.querySelectorAll('.color-swatch-ep').forEach(s=>s.style.outline='none');this.style.outline='3px solid var(--primary)'" class="color-swatch-ep" style="width:28px;height:28px;border-radius:6px;background:${c};border:2px solid var(--border);cursor:pointer;outline:${(p.color||'#FFCB08')===c?'3px solid var(--primary)':'none'};outline-offset:2px"></button>`).join('')}
            <input id="ep-color" type="hidden" value="${p.color || '#FFCB08'}">
          </div>
        </div>
        <div style="grid-column:1/-1">
          <label class="form-label">Link Google Drive</label>
          <input id="ep-drive" class="form-input" value="${(p.drive_url || '').replace(/"/g,'&quot;')}">
        </div>
      </div>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
      <button style="background:#EF4444;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500" onclick="Proiecte.confirmDeleteProject()">🗑 Șterge proiect</button>
      <button class="btn-primary" onclick="Proiecte.saveEditProject()">Salvează</button>
    `);
  },

  async saveEditProject() {
    const updates = {
      name: document.getElementById('ep-name') ? document.getElementById('ep-name').value.trim() : '',
      code: document.getElementById('ep-code') ? document.getElementById('ep-code').value.trim() : '',
      client_name: document.getElementById('ep-client') ? document.getElementById('ep-client').value.trim() || null : null,
      start_date: document.getElementById('ep-start') ? document.getElementById('ep-start').value || null : null,
      end_date: document.getElementById('ep-end') ? document.getElementById('ep-end').value || null : null,
      status: document.getElementById('ep-status') ? document.getElementById('ep-status').value : 'activ',
      color: document.getElementById('ep-color') ? document.getElementById('ep-color').value : '#3B82F6',
      drive_url: document.getElementById('ep-drive') ? document.getElementById('ep-drive').value.trim() || null : null,
    };
    const result = await dbQuery('projects', q => q.update(updates).eq('id', this.currentProject.id), null);
    if (result && result.error) { showToast('Eroare: ' + result.error.message, 'error'); return; }
    Object.assign(this.currentProject, updates);
    closeModalForce();
    showToast('Proiect actualizat!', 'success');
    await this.loadData();
    this.renderProjectDetail();
  },

    openCreateModal() {
    const phaseCheckboxes = PRESET_PHASES.map(ph => `
      <label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer">
        <input type="checkbox" name="preset-phase" value="${ph.code}" checked style="width:16px;height:16px">
        <span style="font-size:13px"><strong>${ph.code}.</strong> ${ph.name}</span>
      </label>
    `).join('');
    openModal('Proiect nou', `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="grid-column:1/-1">
          <label class="form-label">Nume proiect *</label>
          <input id="p-name" class="form-input" placeholder="ex: Modul Găzduire Via Transilvanica">
        </div>
        <div>
          <label class="form-label">Cod proiect *</label>
          <input id="p-code" class="form-input" placeholder="ex: 222" maxlength="10">
        </div>
        <div>
          <label class="form-label">Client</label>
          <input id="p-client" class="form-input" placeholder="Numele clientului">
        </div>
        <div>
          <label class="form-label">Data start</label>
          <input id="p-start" type="date" class="form-input">
        </div>
        <div>
          <label class="form-label">Data final</label>
          <input id="p-end" type="date" class="form-input">
        </div>
        <div>
          <label class="form-label">Status</label>
          <select id="p-status" class="form-input">
            <option value="activ">Activ</option>
            <option value="suspendat">Suspendat</option>
            <option value="finalizat">Finalizat</option>
            <option value="intern">Intern</option>
          </select>
        </div>
        <div style="grid-column:1/-1">
          <label class="form-label">Culoare proiect</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
            ${['#FFCB08','#1A1A1A','#FFFFFF','#E63946','#2A9D8F','#457B9D','#6D6875'].map(c => `<button type="button" onclick="document.getElementById('p-color').value='${c}';document.querySelectorAll('.color-swatch-p').forEach(s=>s.style.outline='none');this.style.outline='3px solid #333'" class="color-swatch-p" style="width:32px;height:32px;border-radius:8px;background:${c};border:2px solid var(--border);cursor:pointer;outline:${c==='#FFCB08'?'3px solid #333':'none'};outline-offset:2px"></button>`).join('')}
            <input id="p-color" type="hidden" value="#FFCB08">
          </div>
        </div>
        <div style="grid-column:1/-1">
          <label class="form-label">Link Google Drive</label>
          <input id="p-drive" class="form-input" placeholder="https://drive.google.com/...">
        </div>
        <div style="grid-column:1/-1">
          <label class="form-label" style="margin-bottom:8px">Etape prestabilite de inclus</label>
          <div style="background:var(--bg-secondary);padding:12px;border-radius:8px;border:1px solid var(--border)">
            ${phaseCheckboxes}
          </div>
        </div>
      </div>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
      <button class="btn-primary" onclick="Proiecte.createProject()">Creează proiect</button>
    `);
  },

  async createProject() {
    const name = document.getElementById('p-name') ? document.getElementById('p-name').value.trim() : '';
    const code = document.getElementById('p-code') ? document.getElementById('p-code').value.trim() : '';
    if (!name || !code) { showToast('Completează numele și codul proiectului', 'error'); return; }
    const selectedPhases = Array.from(document.querySelectorAll('input[name="preset-phase"]:checked')).map(cb => cb.value);
    const project = {
      name,
      code,
      client_name: document.getElementById('p-client') ? document.getElementById('p-client').value.trim() || null : null,
      start_date: document.getElementById('p-start') ? document.getElementById('p-start').value || null : null,
      end_date: document.getElementById('p-end') ? document.getElementById('p-end').value || null : null,
      status: document.getElementById('p-status') ? document.getElementById('p-status').value : 'activ',
      color: document.getElementById('p-color') ? document.getElementById('p-color').value : '#3B82F6',
      drive_url: document.getElementById('p-drive') ? document.getElementById('p-drive').value.trim() || null : null,
      manager_id: Auth.currentProfile ? Auth.currentProfile.id : null,
      budget_hours: 0,
      consumed_hours: 0,
    };
    const createResult = await dbQuery('projects', q => q.insert(project).select().single(), null);
    if (!createResult || createResult.error) {
      showToast('Eroare la creare: ' + (createResult ? createResult.error.message : 'necunoscut'), 'error');
      return;
    }
    const newProject = createResult.data;
    if (selectedPhases.length > 0 && newProject) {
      const phasesToInsert = PRESET_PHASES
        .filter(ph => selectedPhases.includes(ph.code))
        .map((ph, idx) => ({
          project_id: newProject.id,
          name: ph.name,
          code: ph.code,
          color: ph.color,
          display_order: idx + 1,
          budget_hours: 0,
          status: 'activ',
          is_preset: true,
        }));
      const phasesResult = await dbQuery('project_phases', q => q.insert(phasesToInsert).select(), []);
      const insertedPhases = phasesResult ? (phasesResult.data || []) : [];
      if (insertedPhases.length > 0) {
        const tasksToInsert = [];
        insertedPhases.forEach(phase => {
          const presetPhase = PRESET_PHASES.find(p => p.code === phase.code);
          if (presetPhase) {
            presetPhase.tasks.forEach((taskName, tidx) => {
              tasksToInsert.push({
                project_id: newProject.id,
                phase_id: phase.id,
                name: taskName,
                display_order: tidx + 1,
                budget_hours: 0,
                minutes_worked: 0,
                status: 'todo',
                is_preset: true,
              });
            });
          }
        });
        if (tasksToInsert.length > 0) {
          await dbQuery('project_tasks', q => q.insert(tasksToInsert), []);
        }
      }
    }
    // Adaugă creatorul ca coordonator
    if (Auth.currentProfile) {
      await dbQuery('project_members', q => q.insert({
        project_id: newProject.id,
        user_id: Auth.currentProfile.id,
        role: 'coordonator',
        added_by: Auth.currentProfile.id,
      }), null);
    }
    closeModalForce();
    showToast('Proiect creat cu succes!', 'success');
    await this.loadData();
    this.renderList();
  },

  confirmDeleteProject() {
    const p = this.currentProject;
    if (!p) return;
    closeModalForce();
    openModal('Confirmare ștergere', `
      <div style="text-align:center;padding:8px 0">
        <div style="font-size:40px;margin-bottom:12px">⚠️</div>
        <p style="font-size:15px;font-weight:600;margin:0 0 8px">Ești sigur că vrei să ștergi proiectul?</p>
        <p style="font-size:13px;color:var(--text-muted);margin:0 0 4px"><strong>${p.name}</strong></p>
        <p style="font-size:12px;color:#EF4444;margin:8px 0 0">Această acțiune este ireversibilă. Se vor șterge și toate etapele și sarcinile asociate.</p>
      </div>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
      <button style="background:#EF4444;color:#fff;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600" onclick="Proiecte.deleteProject(${p.id})">Da, șterge definitiv</button>
    `);
  },

  async deleteProject(projectId) {
    closeModalForce();
    try {
      const sb = getSupabase();
      if (!sb) { showToast('Nu ești conectat la baza de date', 'error'); return; }
      // Șterge înregistrările de timp asociate proiectului (FK time_entries_project_id_fkey)
      await sb.from('time_entries').delete().eq('project_id', projectId);
      // Șterge manual_hours_log pentru sarcinile proiectului
      const taskIds = (await sb.from('project_tasks').select('id').eq('project_id', projectId)).data?.map(t => t.id) || [];
      if (taskIds.length > 0) {
        await sb.from('manual_hours_log').delete().in('task_id', taskIds);
        // Șterge și asignările de task-uri
        await sb.from('project_task_assignments').delete().in('task_id', taskIds);
      }
      // Șterge sarcinile proiectului
      await sb.from('project_tasks').delete().eq('project_id', projectId);
      // Șterge etapele proiectului
      await sb.from('project_phases').delete().eq('project_id', projectId);
      // Șterge membrii proiectului
      await sb.from('project_members').delete().eq('project_id', projectId);
      // Șterge proiectul
      const { error } = await sb.from('projects').delete().eq('id', projectId);
      if (error) { showToast('Eroare la ștergere: ' + error.message, 'error'); return; }
      showToast('Proiect șters cu succes', 'success');
      this.currentProject = null;
      await this.loadData();
      this.renderList();
    } catch(e) {
      showToast('Eroare la ștergere: ' + e.message, 'error');
    }
  },

  renderPage() {
    if (this.currentProject) {
      this.renderProjectDetail();
    } else {
      this.renderList();
    }
  },
  async render() {
    await this.init();
  },
};
window.Proiecte = Proiecte;
