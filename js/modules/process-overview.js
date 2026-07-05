// ============================================================
// Process Overview — Portal Inginerie Creativă
// Gantt-style timeline: angajați × task-uri alocate cu perioadă
// Afișează Proiect → Etapă → Task per angajat
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
          q.select('id,name,phase_id,project_id,assigned_user_id,assigned_users,budget_hours,minutes_worked').in('project_id', projIds), []),
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
      const workedH = Math.round((task.minutes_worked || 0) / 60 * 10) / 10;
      const budgetH = task.budget_hours || 0;
      const pct = budgetH > 0 ? Math.min(100, Math.round((workedH / budgetH) * 100)) : 0;
      userBarsMap[a.user_id].push({
        assignmentId: a.id,
        taskId: task.id,
        taskName: task.name,
        phaseName: phase ? phase.name : '',
        phaseId: task.phase_id,
        projName: proj.name,
        projId: proj.id,
        projCode: proj.abbreviation || proj.code,
        projColor: proj.color || '#FFCB09',
        start_date: a.start_date,
        end_date: a.end_date,
        hasExplicitPeriod: true,
        budgetH,
        workedH,
        pct,
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
        taskId: null,
        taskName: '',
        phaseName: '',
        phaseId: null,
        projName: proj.name,
        projId: proj.id,
        projCode: proj.abbreviation || proj.code,
        projColor: proj.color || '#FFCB09',
        start_date: proj.start_date,
        end_date: proj.end_date,
        hasExplicitPeriod: false,
        memberRole: m.role,
        budgetH: 0,
        workedH: 0,
        pct: 0,
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

          // Bare stivuite pe piste verticale (3 piste în ROW_H=44px, BAR_H=12px)
          // Pistele: top=4, top=18, top=32
          const TRACK_TOPS = [4, 18, 32];
          const MAX_TRACKS = TRACK_TOPS.length;
          const sortedBars = [...bars].sort((a, b) => {
            if (b.hasExplicitPeriod !== a.hasExplicitPeriod) return (b.hasExplicitPeriod ? 1 : 0) - (a.hasExplicitPeriod ? 1 : 0);
            return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
          });
          // Algoritm greedy: aloca fiecare bară pe prima pistă liberă
          const trackEnds = new Array(MAX_TRACKS).fill(-Infinity);
          sortedBars.forEach((bar, idx) => {
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
            // Găsește prima pistă liberă
            let trackIdx = -1;
            for (let t = 0; t < MAX_TRACKS; t++) {
              if (trackEnds[t] <= left) { trackIdx = t; break; }
            }
            if (trackIdx === -1) trackIdx = trackEnds.indexOf(Math.min(...trackEnds));
            trackEnds[trackIdx] = left + width;
            const top = TRACK_TOPS[trackIdx];
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
            const safeTaskName = (bar.taskName || '').replace(/"/g, '&quot;');
            const safeProjName = (bar.projName || '').replace(/"/g, '&quot;');
            const safePhaseName = (bar.phaseName || '').replace(/"/g, '&quot;');

            // Drag handles vizibili doar pentru admin/coord pe bare cu task explicit
            const canDrag = isAdmin && bar.hasExplicitPeriod && bar.assignmentId;
            const dragHandles = canDrag ? `
                <div class="gantt-bar-handle gantt-bar-handle-left" onmousedown="ProcessOverview.startDrag(event,this.parentElement,'left')" style="position:absolute;left:0;top:0;width:6px;height:100%;cursor:ew-resize;background:rgba(0,0,0,0.15);border-radius:4px 0 0 4px"></div>
                <div class="gantt-bar-handle gantt-bar-handle-right" onmousedown="ProcessOverview.startDrag(event,this.parentElement,'right')" style="position:absolute;right:0;top:0;width:6px;height:100%;cursor:ew-resize;background:rgba(0,0,0,0.15);border-radius:0 4px 4px 0"></div>
              ` : '';
            barsHtml += `
              <div class="gantt-bar po-bar"
                   style="left:${left}px;top:${top}px;width:${width}px;background:${color};color:${textColor};opacity:${opacity};${border}cursor:pointer;position:absolute"
                   data-assignment-id="${bar.assignmentId || ''}"
                   data-task-id="${bar.taskId || ''}"
                   data-proj-id="${bar.projId || ''}"
                   data-is-admin="${isAdmin ? '1' : '0'}"
                   data-task-name="${safeTaskName}"
                   data-proj-name="${safeProjName}"
                   data-phase-name="${safePhaseName}"
                   data-start="${bar.start_date}"
                   data-end="${bar.end_date}"
                   data-budget="${bar.budgetH}"
                   data-worked="${bar.workedH}"
                   data-pct="${bar.pct}"
                   data-bar-color="${color}"
                   onmouseenter="ProcessOverview.showTooltip(event,this)"
                   onmouseleave="ProcessOverview.hideTooltip()"
                   onclick="ProcessOverview.handleBarClick(event,this)">
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none">${barLabel}</span>
                ${dragHandles}
              </div>
            `;
          });

          // Înălțime fixă pentru toți angajații - compact și uniform
          const FIXED_ROW_H = this.ROW_H;
          rowsHtml += `
            <div class="gantt-row" style="height:${FIXED_ROW_H}px">
              <div class="gantt-label" style="width:${LW}px;height:${FIXED_ROW_H}px">
                <div class="gantt-user-avatar">${Auth.getInitials(user.full_name)}</div>
                <div class="gantt-user-info">
                  <div class="gantt-user-name">${user.full_name}</div>
                  <div class="gantt-user-pos" style="font-size:10px">${user.position || user.job_title || ''}</div>
                </div>
              </div>
              <div class="gantt-cells" style="width:${totalW}px;position:relative;height:${FIXED_ROW_H}px">
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
    html += `<div style="display:flex;gap:16px;font-size:12px;color:var(--text-muted);margin-bottom:8px"><span>📅 ${fmtDate(start)}</span><span>→</span><span>${fmtDate(end)}</span></div>`;
    if (budget > 0) {
      html += `<div style="margin-bottom:6px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px"><span>Progres ore</span><span style="color:${barColor};font-weight:600">${worked}h / ${budget}h (${pct}%)</span></div><div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px"></div></div></div>`;
    }
    const projId = el.dataset.projId || '';
    if (projId) {
      html += `<div style="margin-top:8px;font-size:11px;color:var(--primary);font-weight:600">🖱 Click pentru a deschide proiectul${isAdmin ? ' • Trage marginea pentru perioadă' : ''}</div>`;
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
      // Admin/coordonator sau oricine: navighează direct la pagina proiectului
      navigate('proiecte', null);
      setTimeout(() => {
        if (typeof Proiecte !== 'undefined') {
          Proiecte.openProject(parseInt(projId));
        }
      }, 200);
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
