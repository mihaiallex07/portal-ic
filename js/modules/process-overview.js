// ============================================================
// Process Overview — Portal Inginerie Creativă
// Gantt-style timeline: angajați × task-uri alocate cu perioadă
// Afișează Proiect → Etapă → Task per angajat
// ============================================================
const ProcessOverview = {
  ZOOM_PX: 28,
  LABEL_W: 240,
  ROW_H: 40,
  BAR_H: 22,
  DEPT_H: 32,
  DAYS: 90,
  offsetDays: 0,
  projects: [],
  users: [],
  memberships: [],
  taskAssignments: [],
  tasks: [],
  phases: [],

  async render() {
    const content = document.getElementById('page-content');
    content.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>Se încarcă...</p></div>`;

    const [projRes, userRes] = await Promise.all([DB.getProjects(), DB.getUsers()]);
    this.projects = (projRes.data || []).filter(p => p.status !== 'arhivat');
    this.users = userRes.data || [];

    const activeProjects = this.projects.filter(p => p.status === 'activ' || p.status === 'in_progress');

    if (activeProjects.length > 0) {
      const projIds = activeProjects.map(p => p.id);
      const [membRes, tasksRes, phasesRes, assignRes] = await Promise.all([
        dbQuery('project_members', q =>
          q.select('project_id,user_id,role').in('project_id', projIds), []),
        dbQuery('project_tasks', q =>
          q.select('id,name,phase_id,project_id,assigned_user_id,assigned_users').in('project_id', projIds), []),
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

    // Map: userId → lista de bare
    const userBarsMap = {};

    // Bare din project_task_assignments (cu perioadă explicită per task)
    this.taskAssignments.forEach(a => {
      if (!a.start_date || !a.end_date) return;
      const task = this.tasks.find(t => t.id === a.task_id);
      const proj = this.projects.find(p => p.id === a.project_id);
      if (!task || !proj) return;
      const phase = this.phases.find(ph => ph.id === task.phase_id);
      if (!userBarsMap[a.user_id]) userBarsMap[a.user_id] = [];
      userBarsMap[a.user_id].push({
        taskName: task.name,
        phaseName: phase ? phase.name : '',
        projName: proj.name,
        projCode: proj.abbreviation || proj.code,
        projColor: proj.color || '#FFCB09',
        start_date: a.start_date,
        end_date: a.end_date,
        hasExplicitPeriod: true,
      });
    });

    // Fallback: membrii fără task assignments → bara proiectului (semitransparentă)
    this.memberships.forEach(m => {
      const proj = this.projects.find(p => p.id === m.project_id);
      if (!proj || !proj.start_date || !proj.end_date) return;
      const hasExplicit = (userBarsMap[m.user_id] || []).some(b =>
        b.projCode === (proj.abbreviation || proj.code) && b.hasExplicitPeriod
      );
      if (hasExplicit) return;
      if (!userBarsMap[m.user_id]) userBarsMap[m.user_id] = [];
      userBarsMap[m.user_id].push({
        taskName: '',
        phaseName: '',
        projName: proj.name,
        projCode: proj.abbreviation || proj.code,
        projColor: proj.color || '#FFCB09',
        start_date: proj.start_date,
        end_date: proj.end_date,
        hasExplicitPeriod: false,
        memberRole: m.role,
      });
    });

    // Grupează angajații pe departamente
    const deptMap = {};
    this.users.forEach(u => {
      const dept = u.department || 'General';
      if (!deptMap[dept]) deptMap[dept] = [];
      deptMap[dept].push(u);
    });

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

    // Rows
    let rowsHtml = '';
    let totalRows = 0;

    if (Object.keys(deptMap).length === 0) {
      rowsHtml = `<div style="padding:48px;text-align:center;color:var(--text-muted)">Nu există angajați.</div>`;
    } else {
      Object.entries(deptMap).forEach(([dept, members]) => {
        rowsHtml += `
          <div class="gantt-row dept-row">
            <div class="gantt-label dept-label" style="width:${LW}px">${dept}</div>
            <div class="gantt-cells" style="width:${totalW}px">
              ${this._weekendCells(startDate, days)}
            </div>
          </div>
        `;

        members.forEach(user => {
          const bars = userBarsMap[user.id] || [];
          let barsHtml = '';

          bars.forEach((bar, idx) => {
            const ps = new Date(bar.start_date);
            const pe = new Date(bar.end_date);
            const gs = new Date(startDate);
            const ge = new Date(startDate);
            ge.setDate(ge.getDate() + days - 1);
            const barStart = ps < gs ? gs : ps;
            const barEnd = pe > ge ? ge : pe;
            if (barStart > barEnd) return;

            const left = Math.round((barStart - gs) / 86400000) * this.ZOOM_PX;
            const width = Math.max(this.ZOOM_PX, Math.round((barEnd - barStart) / 86400000 + 1) * this.ZOOM_PX);
            const top = idx * (this.BAR_H + 4);
            const color = bar.projColor;
            const textColor = this.isLightColor(color) ? '#221F1F' : '#fff';

            let tooltipParts = [bar.projName];
            if (bar.phaseName) tooltipParts.push(bar.phaseName);
            if (bar.taskName) tooltipParts.push(bar.taskName);
            const tooltip = tooltipParts.join(' \u2192 ');

            const barLabel = bar.taskName
              ? `${bar.projCode}: ${bar.taskName}`
              : `${bar.projCode}${bar.memberRole === 'coordonator' ? ' \u2605' : ''}`;

            const opacity = bar.hasExplicitPeriod ? '1' : '0.6';
            const border = bar.hasExplicitPeriod ? '' : 'border:1px dashed rgba(0,0,0,0.25);';

            barsHtml += `
              <div class="gantt-bar"
                   style="left:${left}px;top:${top}px;width:${width}px;background:${color};color:${textColor};opacity:${opacity};${border}"
                   title="${tooltip}">
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${barLabel}</span>
              </div>
            `;
          });

          const rowHeight = Math.max(this.ROW_H, bars.length * (this.BAR_H + 4) + 12);
          rowsHtml += `
            <div class="gantt-row" style="height:${rowHeight}px">
              <div class="gantt-label" style="width:${LW}px;height:${rowHeight}px">
                <div class="gantt-user-avatar">${Auth.getInitials(user.full_name)}</div>
                <div class="gantt-user-info">
                  <div class="gantt-user-name">${user.full_name}</div>
                  <div class="gantt-user-pos">${user.position || user.job_title || ''}</div>
                </div>
              </div>
              <div class="gantt-cells" style="width:${totalW}px;position:relative;height:${rowHeight}px">
                ${this._weekendCells(startDate, days)}
                ${this._todayLine(startDate, days)}
                ${barsHtml}
              </div>
            </div>
          `;
          totalRows++;
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
              <span>Perioad\u0103 proiect (f\u0103r\u0103 task alocat explicit)</span>
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
    `;
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
