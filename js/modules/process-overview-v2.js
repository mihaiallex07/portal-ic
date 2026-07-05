/**
 * Process Overview v2
 * Gantt chart cu scaling uniform - fiecare persoană = 1 rând fix
 * 
 * Principii:
 * - Uniform: fiecare persoană ocupă exact 1 rând
 * - Responsive: timeline se scalează după zoom
 * - Interactive: hover și click pentru detalii
 */

const ProcessOverviewV2 = {
  data: null,
  zoomLevel: 1, // 1 = week, 2 = 2 weeks, 4 = month
  selectedPerson: null,

  // ── INIT ───────────────────────────────────────────────────────────────
  async init() {
    console.log('[ProcessOverviewV2] Init');
    await this.loadData();
    this.render();
    this.setupEventListeners();
  },

  // ── LOAD DATA ──────────────────────────────────────────────────────────
  async loadData() {
    const sb = getSupabase();
    if (!sb) return;

    try {
      // Obțin toți membrii echipei
      const { data: members, error: membersError } = await sb
        .from('project_members')
        .select('user_id, profiles(id, name, email), project_id')
        .eq('project_id', Auth.currentProjectId);

      if (membersError) throw membersError;

      // Obțin toate task-urile cu asignări
      const { data: tasks, error: tasksError } = await sb
        .from('project_tasks')
        .select(`
          id,
          name,
          project_id,
          phase_id,
          project_phases(name),
          budget_hours,
          minutes_worked,
          project_task_assignments(
            user_id,
            start_date,
            end_date,
            profiles(name, email)
          )
        `)
        .eq('project_id', Auth.currentProjectId);

      if (tasksError) throw tasksError;

      // Structurez datele
      const peopleMap = {};
      members.forEach(m => {
        if (m.profiles) {
          peopleMap[m.profiles.id] = {
            id: m.profiles.id,
            name: m.profiles.name,
            email: m.profiles.email,
            tasks: []
          };
        }
      });

      // Adaug task-urile la fiecare persoană
      tasks.forEach(task => {
        if (task.project_task_assignments) {
          task.project_task_assignments.forEach(assignment => {
            if (peopleMap[assignment.user_id]) {
              peopleMap[assignment.user_id].tasks.push({
                taskId: task.id,
                taskName: task.name,
                phaseName: task.project_phases?.name,
                startDate: new Date(assignment.start_date),
                endDate: new Date(assignment.end_date),
                budgetHours: task.budget_hours,
                consumedHours: (task.minutes_worked || 0) / 60
              });
            }
          });
        }
      });

      this.data = {
        people: Object.values(peopleMap),
        tasks: tasks
      };

      console.log('[ProcessOverviewV2] Date încărcate:', this.data);
    } catch (err) {
      console.error('[ProcessOverviewV2] Eroare load data:', err);
    }
  },

  // ── RENDER PAGE ────────────────────────────────────────────────────────
  render() {
    if (!this.data) {
      document.getElementById('main-content').innerHTML = '<div style="padding: 20px">Eroare la încărcarea datelor</div>';
      return;
    }

    const html = `
      <div style="padding: 20px; overflow-x: auto">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px">
          <h1 style="margin: 0; font-size: 24px; font-weight: 700">Vizualizare Proiecte</h1>
          
          <div style="display: flex; gap: 8px">
            <button onclick="ProcessOverviewV2.setZoom(1)" style="${this.getZoomButtonStyle(1)}">Săptămână</button>
            <button onclick="ProcessOverviewV2.setZoom(2)" style="${this.getZoomButtonStyle(2)}">2 Săptămâni</button>
            <button onclick="ProcessOverviewV2.setZoom(4)" style="${this.getZoomButtonStyle(4)}">Lună</button>
          </div>
        </div>

        ${this.renderGanttChart()}
      </div>
    `;

    document.getElementById('main-content').innerHTML = html;
  },

  // ── RENDER GANTT CHART ─────────────────────────────────────────────────
  renderGanttChart() {
    const rowHeight = 50; // Fiecare persoană = 50px fix
    const cellWidth = 30 * this.zoomLevel; // Lățime per zi
    const timelineStart = this.getTimelineStart();
    const timelineEnd = this.getTimelineEnd();
    const daysCount = Math.ceil((timelineEnd - timelineStart) / (1000 * 60 * 60 * 24));

    // Header cu zile
    const headerHtml = this.renderTimelineHeader(timelineStart, daysCount, cellWidth);

    // Rânduri pentru fiecare persoană
    const rowsHtml = this.data.people.map((person, idx) => {
      return this.renderPersonRow(person, idx, timelineStart, daysCount, cellWidth, rowHeight);
    }).join('');

    return `
      <div style="
        border: 1px solid var(--border);
        border-radius: 8px;
        overflow: auto;
        background: var(--bg);
      ">
        <!-- HEADER -->
        <div style="
          display: flex;
          border-bottom: 2px solid var(--border);
          position: sticky;
          top: 0;
          background: var(--bg);
          z-index: 10;
        ">
          <div style="
            width: 200px;
            padding: 12px;
            border-right: 1px solid var(--border);
            font-weight: 700;
            font-size: 13px;
            flex-shrink: 0;
          ">
            Persoană
          </div>
          <div style="display: flex; flex-shrink: 0">
            ${headerHtml}
          </div>
        </div>

        <!-- ROWS -->
        <div style="display: flex; flex-direction: column">
          ${rowsHtml}
        </div>
      </div>
    `;
  },

  // ── RENDER TIMELINE HEADER ─────────────────────────────────────────────
  renderTimelineHeader(start, daysCount, cellWidth) {
    let html = '';
    for (let i = 0; i < daysCount; i++) {
      const date = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const dayName = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sa'][date.getDay()];
      const dayNum = date.getDate();

      html += `
        <div style="
          width: ${cellWidth}px;
          padding: 8px 4px;
          text-align: center;
          border-right: 1px solid var(--border);
          background: ${isWeekend ? 'var(--primary)05' : 'transparent'};
          font-size: 11px;
          flex-shrink: 0;
        ">
          <div style="font-weight: 600">${dayName}</div>
          <div style="color: var(--text-muted); font-size: 10px">${dayNum}</div>
        </div>
      `;
    }
    return html;
  },

  // ── RENDER PERSON ROW ──────────────────────────────────────────────────
  renderPersonRow(person, idx, timelineStart, daysCount, cellWidth, rowHeight) {
    const bgColor = idx % 2 === 0 ? 'transparent' : 'var(--primary)02';

    // Construiesc timeline cu task-uri
    let timelineHtml = '';
    for (let i = 0; i < daysCount; i++) {
      const dayStart = new Date(timelineStart.getTime() + i * 24 * 60 * 60 * 1000);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

      // Caut task-uri care se suprapun cu această zi
      const dayTasks = person.tasks.filter(t => 
        t.startDate < dayEnd && t.endDate > dayStart
      );

      timelineHtml += `
        <div style="
          width: ${cellWidth}px;
          height: ${rowHeight}px;
          border-right: 1px solid var(--border);
          background: ${bgColor};
          position: relative;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          padding: 4px;
          box-sizing: border-box;
        ">
          ${dayTasks.map(task => this.renderTaskBar(task, dayStart, dayEnd, cellWidth)).join('')}
        </div>
      `;
    }

    return `
      <div style="
        display: flex;
        border-bottom: 1px solid var(--border);
        height: ${rowHeight}px;
      ">
        <div style="
          width: 200px;
          padding: 12px;
          border-right: 1px solid var(--border);
          font-size: 13px;
          font-weight: 600;
          color: var(--text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex-shrink: 0;
          display: flex;
          align-items: center;
        ">
          ${person.name}
        </div>
        <div style="display: flex; flex-shrink: 0">
          ${timelineHtml}
        </div>
      </div>
    `;
  },

  // ── RENDER TASK BAR ────────────────────────────────────────────────────
  renderTaskBar(task, dayStart, dayEnd, cellWidth) {
    // Calculez procentul din zi ocupat de task
    const taskStart = Math.max(task.startDate, dayStart);
    const taskEnd = Math.min(task.endDate, dayEnd);
    const dayDuration = dayEnd - dayStart;
    const taskDuration = taskEnd - taskStart;
    const percentage = (taskDuration / dayDuration) * 100;

    const progressPercent = task.budgetHours > 0 
      ? Math.round((task.consumedHours / task.budgetHours) * 100)
      : 0;

    const barColor = progressPercent >= 100 ? '#10b981' : '#3b82f6';

    return `
      <div 
        style="
          width: ${percentage}%;
          height: 100%;
          background: ${barColor};
          border-radius: 3px;
          cursor: pointer;
          opacity: 0.8;
          transition: opacity 0.2s;
          position: relative;
          min-width: 2px;
        "
        onmouseover="this.style.opacity='1'; this.title='${task.taskName} - ${task.phaseName}'"
        onmouseout="this.style.opacity='0.8'"
        onclick="ProcessOverviewV2.openTaskDetails('${task.taskId}')"
      ></div>
    `;
  },

  // ── GET TIMELINE START/END ─────────────────────────────────────────────
  getTimelineStart() {
    const now = new Date();
    now.setDate(now.getDate() - 7); // Incepe cu 7 zile în urmă
    now.setHours(0, 0, 0, 0);
    return now;
  },

  getTimelineEnd() {
    const now = new Date();
    now.setDate(now.getDate() + 60); // Până la 60 zile în viitor
    now.setHours(23, 59, 59, 999);
    return now;
  },

  // ── SET ZOOM ───────────────────────────────────────────────────────────
  setZoom(level) {
    this.zoomLevel = level;
    this.render();
  },

  getZoomButtonStyle(level) {
    const isActive = this.zoomLevel === level;
    return `
      padding: 8px 16px;
      border: 1px solid var(--border);
      background: ${isActive ? 'var(--primary)' : 'transparent'};
      color: ${isActive ? 'white' : 'var(--text)'};
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
      transition: all 0.2s;
    `;
  },

  // ── OPEN TASK DETAILS ──────────────────────────────────────────────────
  openTaskDetails(taskId) {
    console.log('[ProcessOverviewV2] Deschid task:', taskId);
    // Navighez la pagina proiectelor cu task-ul selectat
    Proiecte.openTaskModal(taskId);
  },

  // ── SETUP EVENT LISTENERS ──────────────────────────────────────────────
  setupEventListeners() {
    // Realtime updates
    const sb = getSupabase();
    if (sb) {
      sb.channel(`process-overview-${Auth.currentProjectId}`)
        .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'project_task_assignments' },
          () => {
            console.log('[ProcessOverviewV2] Update detectat, reîncarcă...');
            this.init();
          }
        )
        .subscribe();
    }
  }
};

// Export
window.ProcessOverviewV2 = ProcessOverviewV2;
