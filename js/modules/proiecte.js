// ============================================================
// MODUL PROIECTE — Portal Inginerie Creativă
// Etape prestabilite, buget ore, coordonatori, echipă, timer
// ============================================================

// Etape și task-uri prestabilite din PDF
const PRESET_PHASES = [
  {
    code: 'A', name: 'Contractare / Administrativ pe proiect', color: '#3B82F6',
    tasks: [
      'Cunoaștere beneficiar',
      'Discuții prezentare concept / design&build / contract concept',
      'Deviz estimativ',
      'Prezentare deviz estimativ către beneficiar',
      'Elaborare contract',
      'Facturi',
      'Verificare ore',
      'Comunicare pe mail',
      'Comunicare cu beneficiarul',
      'Livrare',
    ]
  },
  {
    code: 'B', name: 'Proiectare Structură', color: '#8B5CF6',
    tasks: [
      'Temă de proiectare',
      'Modelare 3D Draft 1 — Calcul structural',
      'Modelare 3D Draft 1 — Modelare',
      'Modelare 3D Draft 2',
      'Verificare de către coordonator',
      'Implementare feedback de la coordonator',
      'Prezentare model 3D',
      'Implementare feedback după prezentarea către beneficiar',
      'Redactare — Piese desenate (modelator)',
      'Redactare — Piese scrise (coordonator)',
      'Redactare — Liste de cantități',
      'Livrare electronică (coordonator)',
    ]
  },
  {
    code: 'C', name: 'Proiectare Arhitectură', color: '#EC4899',
    tasks: [
      'Temă de proiectare',
      'Modelare 3D Draft 1',
      'Modelare 3D Draft 2',
      'Verificare de către coordonator',
      'Implementare feedback de la coordonator',
      'Prezentare model 3D',
      'Implementare feedback după prezentarea către beneficiar',
      'Redactare — Piese desenate (modelator)',
      'Redactare — Piese scrise (coordonator)',
      'Redactare — Liste de cantități',
      'Livrare electronică (coordonator)',
    ]
  },
  {
    code: 'D', name: 'Proiectare Instalații', color: '#F59E0B',
    tasks: [
      'Temă de proiectare',
      'Modelare 3D Draft 1',
      'Modelare 3D Draft 2',
      'Verificare',
      'Implementare feedback',
      'Prezentare model 3D',
      'Implementare feedback după prezentarea către beneficiar',
      'Redactare — Piese desenate',
      'Redactare — Piese scrise',
      'Redactare — Liste de cantități',
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
];

const Proiecte = {
  projects: [],
  currentProject: null,
  currentTab: 'etape',
  members: [],
  phases: [],
  tasks: [],
  allUsers: [],

  async init() {
    await this.loadData();
    this.renderList();
  },

  async loadData() {
    const userId = Auth.currentUser?.id;
    const isAdmin = Auth.currentProfile?.role === 'admin';
    const [projRes, usersRes, membershipsRes] = await Promise.all([
      DB.getProjects(),
      DB.getUsers(),
      dbQuery('project_members', q => q.select('project_id,role').eq('user_id', userId), []),
    ]);
    const allProjects = projRes.data || [];
    this.allUsers = usersRes.data || [];
    this.userMemberships = membershipsRes.data || [];
    if (isAdmin) {
      this.projects = allProjects;
    } else {
      const enrolledIds = new Set(this.userMemberships.map(m => m.project_id));
      this.projects = allProjects.filter(p => enrolledIds.has(p.id));
    }
  },

  async loadProjectDetails(projectId) {
    const [membersRes, phasesRes, tasksRes] = await Promise.all([
      dbQuery('project_members', q => q.select('*, profiles!project_members_user_id_fkey(id,full_name,name,email,employee_code,role)').eq('project_id', projectId), []),
      dbQuery('project_phases', q => q.select('*').eq('project_id', projectId).order('display_order'), []),
      dbQuery('project_tasks', q => q.select('*').eq('project_id', projectId).order('display_order'), []),
    ]);
    this.members = membersRes.data || [];
    this.phases = phasesRes.data || [];
    this.tasks = tasksRes.data || [];
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
    this.renderProjectDetail();
  },

  renderProjectDetail() {
    const p = this.currentProject;
    if (!p) return;
    const profile = Auth.currentProfile;
    const isAdmin = profile && profile.role === 'admin';
    const isCoord = this.members.some(m => m.user_id === profile.id && m.role === 'coordonator');
    const canEdit = isAdmin || isCoord;

    const container = document.getElementById('page-content');
    if (!container) return;

    const consumed = p.consumed_hours || 0;
    const budget = p.budget_hours || 0;
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
          <div style="display:flex;gap:8px;align-items:center">
            ${p.drive_url ? `<a href="${p.drive_url}" target="_blank" rel="noopener" class="btn-secondary" style="display:flex;align-items:center;gap:6px;text-decoration:none"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> Drive</a>` : ''}
            ${canEdit ? `<button class="btn-secondary" onclick="Proiecte.openEditProject()">⚙ Setări</button>` : ''}
            ${canEdit ? `<button class="btn-primary" onclick="Proiecte.openAddPhaseModal()">+ Etapă</button>` : ''}
          </div>
        </div>

        <div style="margin-top:16px;padding:12px 16px;background:var(--card-bg);border:1px solid var(--border);border-radius:8px">
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
            <span style="color:var(--text-muted)">Progres total ore</span>
            <span style="font-weight:600;color:${barColor}">${consumed}h lucrate din ${budget}h bugetate (${pct}%)</span>
          </div>
          <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${barColor};border-radius:4px;transition:width 0.4s"></div>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:0;border-bottom:2px solid var(--border);margin-bottom:20px">
        ${['etape','echipa','rapoarte'].map(tab => `
          <button onclick="Proiecte.switchTab('${tab}')" id="tab-${tab}" style="padding:10px 20px;border:none;background:none;cursor:pointer;font-size:14px;font-weight:${this.currentTab===tab?'600':'400'};color:${this.currentTab===tab?'var(--primary)':'var(--text-muted)'};border-bottom:${this.currentTab===tab?'2px solid var(--primary)':'2px solid transparent'};margin-bottom:-2px;transition:all 0.2s">
            ${{etape:'Etape & Sarcini',echipa:'Echipă',rapoarte:'Rapoarte'}[tab]}
          </button>
        `).join('')}
      </div>

      <div id="tab-content">
        ${this.renderTab(this.currentTab, canEdit)}
      </div>
    `;
  },

  renderTab(tab, canEdit) {
    if (tab === 'etape') return this.renderEtapeTab(canEdit);
    if (tab === 'echipa') return this.renderEchipaTab(canEdit);
    if (tab === 'rapoarte') return this.renderRapoarteTab();
    return '';
  },

  renderEtapeTab(canEdit) {
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

        <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;overflow:hidden">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:var(--bg-secondary);font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">
                <th style="padding:10px 16px;text-align:left">Etapă / Sarcină</th>
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
    const isCoord = this.members.some(m => m.user_id === profile?.id && m.role === 'coordonator');
    // Admin și coordonatori văd toate task-urile; angajații văd doar task-urile asignate lor
    const allPhaseTasks = this.tasks.filter(t => t.phase_id === phase.id);
    const phaseTasks = (isAdmin || isCoord) ? allPhaseTasks : allPhaseTasks.filter(t => t.assigned_user_id === profile?.id);
    const budgetH = phase.budget_hours || 0;
    const workedMin = phaseTasks.reduce((sum, t) => sum + (t.minutes_worked || 0), 0);
    const workedH = Math.round(workedMin / 60 * 10) / 10;
    const remainH = Math.max(0, budgetH - workedH);
    const pct = budgetH > 0 ? Math.min(100, Math.round((workedH / budgetH) * 100)) : 0;
    const barColor = pct > 90 ? '#EF4444' : pct > 70 ? '#F59E0B' : '#10B981';
    const color = phase.color || '#3B82F6';
    const phaseBodyId = 'phasebody-' + phase.id;

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
          <td style="padding:10px 12px;text-align:center">
            ${canEdit ? `<input type="number" value="${budgetH}" min="0" style="width:70px;text-align:center;padding:4px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text)" onchange="Proiecte.updatePhaseBudget(${phase.id},this.value)">` : `<strong>${budgetH}h</strong>`}
          </td>
          <td style="padding:10px 12px;text-align:center;color:#3B82F6;font-weight:600">${workedH}h</td>
          <td style="padding:10px 12px;text-align:center;color:var(--text-muted)">${remainH}h</td>
          <td style="padding:10px 12px">
            <div style="display:flex;align-items:center;gap:6px">
              <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px"></div>
              </div>
              <span style="font-size:11px;color:var(--text-muted);width:30px">${pct}%</span>
            </div>
          </td>
          <td style="padding:10px 12px;font-size:12px;color:var(--text-muted)">—</td>
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
            <td colspan="7" style="padding:6px 16px 6px 52px">
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
    const remainH = Math.max(0, budgetH - workedH);
    const pct = budgetH > 0 ? Math.min(100, Math.round((workedH / budgetH) * 100)) : 0;
    const barColor = pct > 90 ? '#EF4444' : pct > 70 ? '#F59E0B' : '#10B981';
    const profile = Auth.currentProfile;

    // Suport multi-responsabil: assigned_users array sau fallback la assigned_user_id
    const assignedIds = Array.isArray(task.assigned_users) && task.assigned_users.length > 0
      ? task.assigned_users
      : (task.assigned_user_id ? [task.assigned_user_id] : []);
    const isAssigned = assignedIds.includes(profile.id);
    const canStart = isAssigned || canEdit;

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
          ${canEdit ? `<input type="number" value="${budgetH}" min="0" style="width:70px;text-align:center;padding:3px;border:1px solid var(--border);border-radius:4px;background:var(--bg);color:var(--text);font-size:12px" onchange="Proiecte.updateTaskBudget(${task.id},${task.phase_id},this.value,${phaseBudget})">` : `${budgetH}h`}
        </td>
        <td style="padding:8px 12px;text-align:center;color:#3B82F6">${workedH}h</td>
        <td style="padding:8px 12px;text-align:center;color:var(--text-muted)">${remainH}h</td>
        <td style="padding:8px 12px">
          <div style="display:flex;align-items:center;gap:6px">
            <div style="flex:1;height:4px;background:var(--border);border-radius:2px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${barColor};border-radius:2px"></div>
            </div>
            <span style="font-size:11px;color:var(--text-muted);width:30px">${pct}%</span>
          </div>
        </td>
        <td style="padding:8px 12px;font-size:12px">
          ${canEdit ? `
            <button onclick="Proiecte.openAssignModal(${task.id})" style="background:none;border:none;cursor:pointer;padding:0" title="Asignează responsabili">
              ${avatarsHtml}
            </button>
          ` : (assignedIds.length > 0 ? avatarsHtml : '—')}
        </td>
        <td style="padding:8px 12px;text-align:right;white-space:nowrap">
          ${canStart ? this.renderTimerBtn(task) : ''}
          ${canEdit ? `
            <button onclick="Proiecte.openEditTaskModal(${task.id})" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:13px;margin-left:4px;padding:2px 4px;border-radius:4px" title="Editează">✏️</button>
            <button onclick="Proiecte.deleteTask(${task.id})" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:13px;margin-left:2px;padding:2px 4px;border-radius:4px" title="Șterge">🗑</button>
          ` : ''}
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
    const angajati = this.members.filter(m => m.role === 'angajat');

    return `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
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
            <h3 style="font-size:15px;font-weight:600;margin:0">Angajați (${angajati.length})</h3>
            ${canEdit ? `<button class="btn-sm btn-secondary" onclick="Proiecte.openAddMemberModal('angajat')">+ Adaugă</button>` : ''}
          </div>
          ${angajati.length === 0 ? `<p style="color:var(--text-muted);font-size:13px">Niciun angajat asignat.</p>` : ''}
          ${angajati.map(m => this.renderMemberCard(m, canEdit)).join('')}
        </div>
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
    const isCoord = this.members.some(m => m.user_id === profile?.id && m.role === 'coordonator');
    const totalBudget = this.phases.reduce((s, p) => s + (p.budget_hours || 0), 0);
    const totalWorked = this.tasks.reduce((s, t) => s + Math.round((t.minutes_worked || 0) / 60 * 10) / 10, 0);
    const pct = totalBudget > 0 ? Math.min(100, Math.round((totalWorked / totalBudget) * 100)) : 0;

    return `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px">
        <div style="padding:20px;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;text-align:center">
          <div style="font-size:28px;font-weight:700;color:var(--primary)">${totalBudget}h</div>
          <div style="font-size:13px;color:var(--text-muted);margin-top:4px">Ore bugetate total</div>
        </div>
        <div style="padding:20px;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;text-align:center">
          <div style="font-size:28px;font-weight:700;color:#10B981">${totalWorked}h</div>
          <div style="font-size:13px;color:var(--text-muted);margin-top:4px">Ore lucrate</div>
        </div>
        <div style="padding:20px;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;text-align:center">
          <div style="font-size:28px;font-weight:700;color:${pct > 90 ? '#EF4444' : '#F59E0B'}">${pct}%</div>
          <div style="font-size:13px;color:var(--text-muted);margin-top:4px">Progres</div>
        </div>
      </div>

      <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:20px">
        <h3 style="font-size:15px;font-weight:600;margin:0 0 16px">Ore pe etapă</h3>
        ${this.phases.map(phase => {
          // Admin și coordonatori văd toate task-urile; angajații văd doar task-urile asignate lor
    const allPhaseTasks = this.tasks.filter(t => t.phase_id === phase.id);
    const phaseTasks = (isAdmin || isCoord) ? allPhaseTasks : allPhaseTasks.filter(t => t.assigned_user_id === profile?.id);
          const worked = phaseTasks.reduce((s, t) => s + Math.round((t.minutes_worked || 0) / 60 * 10) / 10, 0);
          const budget = phase.budget_hours || 0;
          const p = budget > 0 ? Math.min(100, Math.round((worked / budget) * 100)) : 0;
          const barColor = p > 90 ? '#EF4444' : p > 70 ? '#F59E0B' : '#10B981';
          return `
            <div style="margin-bottom:12px">
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
                <span>${phase.code ? phase.code + '. ' : ''}${phase.name}</span>
                <span style="color:var(--text-muted)">${worked}h / ${budget}h</span>
              </div>
              <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">
                <div style="height:100%;width:${p}%;background:${barColor};border-radius:4px"></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  switchTab(tab) {
    this.currentTab = tab;
    const profile = Auth.currentProfile;
    const isAdmin = profile && profile.role === 'admin';
    const isCoord = this.members.some(m => m.user_id === profile.id && m.role === 'coordonator');
    const canEdit = isAdmin || isCoord;

    ['etape', 'echipa', 'rapoarte'].forEach(t => {
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
        // Actualizează minutes_worked pe task
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
          const sb = getSupabase();
          if (sb) {
            const newMinutes = (task.minutes_worked || 0) + minutes;
            await sb.from('project_tasks').update({ minutes_worked: newMinutes }).eq('id', taskId);
            task.minutes_worked = newMinutes;
          }
        }
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        showToast('⏹ Task oprit. ' + (h > 0 ? h + 'h ' : '') + m + 'm înregistrate în Time-Tracking.', 'success');
      }
    } else {
      showToast('⏹ Task oprit (' + minutes + 'm)', 'success');
    }

    if (typeof _timerClear === 'function') _timerClear();
    this.renderProjectDetail();
  },

  openEditTaskModal(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;
    const phase = this.phases.find(p => p.id === task.phase_id);
    const phaseBudget = phase ? (phase.budget_hours || 0) : 0;
    const phaseAllocated = this.tasks.filter(t => t.phase_id === task.phase_id).reduce((s, t) => s + (t.budget_hours || 0), 0);
    const phaseRemain = Math.max(0, phaseBudget - phaseAllocated + (task.budget_hours || 0));
    const nameEsc = (task.name || '').replace(/"/g, '&quot;');

    openModal('Editează sarcină', `
      <div style="display:grid;gap:12px">
        <div>
          <label class="form-label">Nume sarcină *</label>
          <input id="edit-task-name" class="form-input" value="${nameEsc}">
        </div>
        <div>
          <label class="form-label">Buget ore ${phaseBudget > 0 ? '(max ' + phaseRemain + 'h disponibil)' : ''}</label>
          <input id="edit-task-budget" type="number" class="form-input" value="${task.budget_hours || 0}" min="0">
        </div>
      </div>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
      <button class="btn-primary" onclick="Proiecte.saveEditTask(${taskId},${phaseBudget},${phaseAllocated})">Salvează</button>
    `);
  },

  async saveEditTask(taskId, phaseBudget, phaseAllocated) {
    const name = document.getElementById('edit-task-name')?.value?.trim();
    if (!name) { showToast('Completează numele sarcinii', 'error'); return; }
    const budgetH = parseFloat(document.getElementById('edit-task-budget')?.value) || 0;
    const task = this.tasks.find(t => t.id === taskId);
    const oldBudget = task ? (task.budget_hours || 0) : 0;
    const otherBudget = phaseAllocated - oldBudget;
    if (phaseBudget > 0 && (otherBudget + budgetH) > phaseBudget) {
      showToast('Depășești bugetul etapei! Disponibil: ' + Math.max(0, phaseBudget - otherBudget) + 'h', 'error');
      return;
    }
    const result = await dbQuery('project_tasks', q => q.update({ name, budget_hours: budgetH }).eq('id', taskId), null);
    if (result && result.error) { showToast('Eroare: ' + result.error.message, 'error'); return; }
    closeModalForce();
    showToast('Sarcină actualizată!', 'success');
    await this.loadProjectDetails(this.currentProject.id);
    this.renderProjectDetail();
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
    showToast(`${userIds.length} ${userIds.length === 1 ? 'membru adăugat' : 'membri adăugați'}!`, 'success');
    await this.loadProjectDetails(this.currentProject.id);
    this.switchTab('echipa');
  },

  async removeMember(memberId) {
    if (!confirm('Elimini acest membru din proiect?')) return;
    await dbQuery('project_members', q => q.delete().eq('id', memberId), null);
    showToast('Membru eliminat', 'success');
    await this.loadProjectDetails(this.currentProject.id);
    this.switchTab('echipa');
  },

  openAssignModal(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    // assigned_users poate fi array de UUID-uri sau assigned_user_id (legacy)
    const currentAssigned = task?.assigned_users || (task?.assigned_user_id ? [task.assigned_user_id] : []);

    openModal('Asignează responsabili', `
      <div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Selectează una sau mai multe persoane din echipa proiectului:</div>
        <div style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:8px">
          ${this.members.length === 0
            ? '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">Niciun membru în echipa proiectului</div>'
            : this.members.map(m => {
                const u = m.profiles || {};
                const name = u.full_name || u.name || u.email || 'Utilizator';
                const initials = u.employee_code || (name).split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
                const avatarEl = u.avatar_url
                  ? `<img src="${u.avatar_url}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0">`
                  : `<div style="width:32px;height:32px;border-radius:50%;background:var(--brand-dark);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">${initials}</div>`;
                const checked = currentAssigned.includes(m.user_id) ? 'checked' : '';
                return `
                  <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--border);transition:background 0.15s" onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
                    <input type="checkbox" name="assign-cb" value="${m.user_id}" ${checked} style="width:16px;height:16px;accent-color:var(--brand-dark);flex-shrink:0" />
                    ${avatarEl}
                    <div style="flex:1;min-width:0">
                      <div style="font-weight:600;font-size:13px">${name}</div>
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
      <button class="btn-primary" onclick="Proiecte.assignTask(${taskId})">Salvează</button>
    `);
  },

  async assignTask(taskId) {
    const checkboxes = document.querySelectorAll('input[name="assign-cb"]:checked');
    const userIds = Array.from(checkboxes).map(cb => cb.value);
    // Salvăm primul user în assigned_user_id (compatibilitate) + toți în assigned_users
    const primaryUserId = userIds[0] || null;
    await dbQuery('project_tasks', q => q.update({
      assigned_user_id: primaryUserId,
      assigned_users: userIds.length > 0 ? userIds : null,
    }).eq('id', taskId), null);
    closeModalForce();
    showToast(userIds.length > 0 ? `${userIds.length} responsabil${userIds.length !== 1 ? 'i asignați' : ' asignat'}` : 'Sarcină neasignată', 'success');
    await this.loadProjectDetails(this.currentProject.id);
    this.renderProjectDetail();
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
