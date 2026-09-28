// Time Tracking Module — Portal Inginerie Creativă
// Flux UI: același formular pentru adăugare și editare; intervalul orar și durata manuală se sincronizează bidirecțional.
// Schema REALĂ Supabase time_entries (snake_case):
//   id, user_id(uuid), project_id(int), project_task_id(int),
//   date(date), start_time(time = "HH:MM:SS"), end_time(time = "HH:MM:SS"),
//   duration_minutes(int), activity_type(enum), task_name(varchar),
//   description(text), is_billable(bool), is_running(bool),
//   status(enum), approved_by(int), timer_started_at(timestamp),
//   phase_id(int), created_at, updated_at
// ============================================================

const TimeTracking = {
  currentWeekStart: null,
  entries: [],
  projects: [],
  allocatedProjects: [],
  tasks: [],
  currentTimeIndicatorTimer: null,
  timePickerDismissHandler: null,

  // ── Helpers ──────────────────────────────────────────────────────────────

  localDateStr(d) {
    const dt = d || new Date();
    return dt.getFullYear() + '-' +
      String(dt.getMonth() + 1).padStart(2, '0') + '-' +
      String(dt.getDate()).padStart(2, '0');
  },

  weekStart(d) {
    const dt = new Date(d);
    const day = dt.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    dt.setDate(dt.getDate() + diff);
    dt.setHours(0, 0, 0, 0);
    return dt;
  },

  fmtDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = String(dateStr).split('T')[0].split('-');
    return `${d}/${m}/${y}`;
  },

  fmtDuration(mins) {
    if (!mins) return '0h';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  },

  fmtTime(h, m) {
    return String(h || 0).padStart(2, '0') + ':' + String(m || 0).padStart(2, '0');
  },

  // Extrage ora și minutul dintr-un câmp start_time (format "HH:MM:SS" sau ISO timestamp)
  parseStartTime(entry) {
    if (!entry.start_time) return { h: 0, m: 0 };
    const s = String(entry.start_time);
    // Format "HH:MM:SS" sau "HH:MM:SS.ffffff"
    if (/^\d{1,2}:\d{2}/.test(s)) {
      const parts = s.split(':');
      return { h: parseInt(parts[0]) || 0, m: parseInt(parts[1]) || 0 };
    }
    // Format ISO timestamp
    const d = new Date(s);
    if (!isNaN(d)) return { h: d.getHours(), m: d.getMinutes() };
    return { h: 0, m: 0 };
  },

  parseEndTime(entry) {
    if (!entry.end_time) return null;
    const s = String(entry.end_time);
    // Format "HH:MM:SS" sau "HH:MM:SS.ffffff"
    if (/^\d{1,2}:\d{2}/.test(s)) {
      const parts = s.split(':');
      return { h: parseInt(parts[0]) || 0, m: parseInt(parts[1]) || 0 };
    }
    // Format ISO timestamp
    const d = new Date(s);
    if (!isNaN(d)) return { h: d.getHours(), m: d.getMinutes() };
    return null;
  },

  getNumericUserId() {
    return Auth.currentProfile?.id || null;
  },

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async render() {
    this.currentWeekStart = this.weekStart(new Date());
    await this.loadData();
    this.renderPage();
  },

  async loadData() {
    const weekEnd = new Date(this.currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const userId = this.getNumericUserId();
    const sb = getSupabase();
    if (!sb) { this.entries = []; this.projects = []; this.allocatedProjects = []; this.tasks = []; return; }

    const dateFrom = this.localDateStr(this.currentWeekStart);
    const dateTo = this.localDateStr(weekEnd);

    const [entriesRes, projectsRes, membershipsRes] = await Promise.all([
      sb.from('time_entries')
        .select('*')
        .eq('user_id', userId)
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true }),
      // INCLUDEM TOATE proiectele (activ/arhivat/finalizat) ca să se poată loga ore pe zile din trecut
      sb.from('projects').select('id,name,color,status'),
      sb.from('project_members').select('project_id,role').eq('user_id', userId),
    ]);

    this.entries = entriesRes.data || [];
    const allProjects = projectsRes.data || [];
    const memberships = membershipsRes.data || [];

    // Toți utilizatorii văd DOAR proiectele la care sunt membri (indiferent de rol)
    const enrolledIds = new Set(memberships.map(m => String(m.project_id)));
    this.projects = allProjects.filter(p => enrolledIds.has(String(p.id)));

    console.log('[TT] this.projects after filter:', this.projects.length);

    // Sortare: proiecte active primele, apoi celelalte
    this.projects.sort((a, b) => {
      const aActive = a.status === 'activ' ? 0 : 1;
      const bActive = b.status === 'activ' ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return (a.name || '').localeCompare(b.name || '');
    });

    if (this.projects.length > 0) {
      const projectIds = this.projects.map(p => p.id);
      // Includem și project_task_assignments și project_phases pentru dropdown etapă
      const [tasksRes, assignRes, phasesRes] = await Promise.all([
        sb.from('project_tasks')
          .select('id,name,project_id,phase_id,assigned_user_id,assigned_users,budget_hours,minutes_worked')
          .in('project_id', projectIds)
          .order('display_order'),
        sb.from('project_task_assignments')
          .select('task_id')
          .eq('user_id', userId)
          .in('project_id', projectIds),
        sb.from('project_phases')
          .select('id,name,project_id,code,color,display_order')
          .in('project_id', projectIds)
          .order('display_order'),
      ]);
      const allTasks = tasksRes.data || [];
      const assignedTaskIds = new Set((assignRes.data || []).map(a => String(a.task_id)));
      const userIdStr = String(userId);
      // Task-urile vizibile sunt numai cele alocate explicit utilizatorului curent,
      // indiferent de rol: assigned_user_id, assigned_users sau project_task_assignments.
      this.tasks = allTasks.filter(t => {
        if (String(t.assigned_user_id) === userIdStr) return true;
        if (Array.isArray(t.assigned_users) && t.assigned_users.map(String).includes(userIdStr)) return true;
        if (assignedTaskIds.has(String(t.id))) return true;
        return false;
      });
      // Dropdown-urile din activitate urmează exact alocările la task, nu simpla
      // apartenență la proiect: proiectele fără task alocat și etapele fără task alocat
      // nu pot fi selectate.
      const allocatedProjectIds = new Set(this.tasks.map(task => String(task.project_id)));
      const allocatedPhaseIds = new Set(this.tasks.map(task => String(task.phase_id)).filter(id => id && id !== 'null' && id !== 'undefined'));
      this.allocatedProjects = this.projects.filter(project => allocatedProjectIds.has(String(project.id)));
      this.phases = (phasesRes.data || []).filter(phase => allocatedPhaseIds.has(String(phase.id)));
      console.log('[TT] allocated projects/tasks/phases:', this.allocatedProjects.length, this.tasks.length, this.phases.length);
    } else {
      this.allocatedProjects = [];
      this.tasks = [];
      this.phases = [];
    }
  },

  // Datele de alocare sunt încărcate explicit pentru modalurile accesate din afara paginii Time-Tracking.
  async ensureAllocationData() {
    if (!this.currentWeekStart) this.currentWeekStart = this.weekStart(new Date());
    if (!this.projects?.length || !this.tasks?.length) await this.loadData();
    return { projects: this.allocatedProjects || [], tasks: this.tasks || [], phases: this.phases || [] };
  },

  // ── Navigare săptămână ───────────────────────────────────────────────────

  async prevWeek() {
    this.currentWeekStart.setDate(this.currentWeekStart.getDate() - 7);
    await this.loadData();
    this.renderPage();
  },

  async nextWeek() {
    this.currentWeekStart.setDate(this.currentWeekStart.getDate() + 7);
    await this.loadData();
    this.renderPage();
  },

  async thisWeek() {
    this.currentWeekStart = this.weekStart(new Date());
    await this.loadData();
    this.renderPage();
  },

  // ── Render ───────────────────────────────────────────────────────────────

  renderPage() {
    const days = this.getWeekDays();
    const totalMins = this.entries.reduce((s, e) => s + (e.duration_minutes || 0), 0);
    const todayStr = this.localDateStr();

    const DAY_LABELS = ['LU', 'MA', 'MI', 'JO', 'VI', 'SÂ', 'DU'];
    const dayHeaders = days.map((d, i) => {
      const dStr = this.localDateStr(d);
      const isToday = dStr === todayStr;
      const dayNum = d.getDate();
      return `<th style="text-align:center;padding:6px 4px;font-weight:600;font-size:12px;color:var(--text-muted);min-width:100px">
        <div>${DAY_LABELS[i]}</div>
        <div style="width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-top:2px;
          ${isToday ? 'background:var(--primary);color:#fff;font-weight:700' : 'color:var(--text)'}">
          ${dayNum}
        </div>
      </th>`;
    }).join('');

    const ALL_HOURS = Array.from({length: 24}, (_, i) => i);

    const rows = ALL_HOURS.map(hour => {
      const cells = days.map((d) => {
        const dStr = this.localDateStr(d);
        const dayEntries = this.entries.filter(e => {
          const st = this.parseStartTime(e);
          return e.date === dStr && st.h === hour;
        });
        // Înălțime celulă: 60px per oră = 1px per minut
        const CELL_H = 60;
        const blocks = dayEntries.map(e => {
          const proj = this.projects.find(p => p.id === e.project_id);
          const color = proj?.color || '#3B82F6';
          const emoji = proj?.emoji || '';
          const st = this.parseStartTime(e);
          // Un pixel reprezintă un minut. Fără înălțime minimă: o activitate
          // de 15 minute se oprește exact la minutul 15, fără să acopere
          // activitatea următoare. box-sizing păstrează border-ul și padding-ul
          // în interiorul duratei reale.
          const durationMinutes = Math.max(1, Number(e.duration_minutes) || 30);
          const isCompactBlock = durationMinutes < 30;
          const blockH = durationMinutes;
          const topOffset = Math.max(0, Math.min(CELL_H - 1, st.m));
          return `<div onclick="event.stopPropagation();TimeTracking.viewEntry(${e.id})"
            title="${e.task_name || ''} · ${this.fmtDuration(e.duration_minutes)}"
            style="position:absolute;left:2px;right:2px;top:${topOffset}px;height:${blockH}px;
              box-sizing:border-box;background:${color}1A;border-left:3px solid ${color};border-radius:3px;
              padding:${isCompactBlock ? '0 4px' : '2px 5px'};cursor:pointer;font-size:${isCompactBlock ? '9px' : '10px'};
              line-height:1;overflow:hidden;z-index:1;display:flex;align-items:center;gap:4px;
              box-shadow:inset 0 1px 0 rgba(255,255,255,.72),inset 0 -1px 0 rgba(15,23,42,.28),0 1px 2px ${color}18">
            <span style="min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-weight:700;color:${color}">${emoji} ${e.task_name || 'Activitate'}</span>
            ${isCompactBlock ? '' : `<span style="flex:0 0 auto;white-space:nowrap;color:var(--text-muted);font-size:9px">${this.fmtDuration(e.duration_minutes)}</span>`}
          </div>`;
        }).join('');
        return `<td onclick="TimeTracking.openAddModalFromCalendar(event,'${dStr}',${hour},this)" style="border:1px solid var(--border);padding:0;vertical-align:top;height:60px;position:relative;cursor:pointer"
          onmouseenter="this.style.background='rgba(255,203,9,0.08)'"
          onmouseleave="this.style.background=''">
          ${blocks}
        </td>`;
      }).join('');
      return `<tr>
        <td style="padding:4px 8px;font-size:11px;color:var(--text-muted);white-space:nowrap;border-right:1px solid var(--border);width:50px;height:60px;vertical-align:top">
          ${String(hour).padStart(2,'0')}:00
        </td>
        ${cells}
      </tr>`;
    }).join('');

    // Tabel activități
    const tableRows = this.entries.length === 0
      ? `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">
          <div style="font-size:32px;margin-bottom:8px">⏱</div>
          Nu există activități înregistrate pentru această săptămână
        </td></tr>`
      : this.entries.map(e => {
          const proj = this.projects.find(p => p.id === e.project_id);
          const st = this.parseStartTime(e);
          const et = this.parseEndTime(e);
          return `<tr style="border-bottom:1px solid var(--border)">
            <td style="padding:8px 12px">${this.fmtDate(e.date)}</td>
            <td style="padding:8px 12px;font-weight:500">${e.task_name || '—'}</td>
            <td style="padding:8px 12px;color:var(--text-muted)">${proj ? `${proj.emoji || ''} ${proj.name}` : '—'}</td>
            <td style="padding:8px 12px">${this.fmtTime(st.h, st.m)}${et ? ' → ' + this.fmtTime(et.h, et.m) : ''}</td>
            <td style="padding:8px 12px"><span class="badge badge-blue">${this.fmtDuration(e.duration_minutes)}</span></td>
            <td style="padding:8px 12px">
              <button onclick="TimeTracking.openEditModal(${e.id})" title="Editează"
                style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:14px;padding:2px 6px">✏️</button>
              <button onclick="TimeTracking.deleteEntry(${e.id})" title="Șterge"
                style="background:none;border:none;cursor:pointer;color:#EF4444;font-size:14px;padding:2px 6px">🗑</button>
            </td>
          </tr>`;
        }).join('');

    document.getElementById('page-content').innerHTML = `
      <div style="width:100%">
        <div class="page-header">
          <div>
            <h1 class="page-title">Time-Tracking</h1>
            <p class="page-subtitle">Total săptămână: <strong>${this.fmtDuration(totalMins)}</strong></p>
          </div>
          <div class="flex gap-2">
            <button class="btn-secondary" onclick="TimeTracking.prevWeek()">‹ Anterioară</button>
            <button class="btn-secondary" onclick="TimeTracking.thisWeek()">Curentă</button>
            <button class="btn-secondary" onclick="TimeTracking.nextWeek()">Următoare ›</button>
            <button class="btn-secondary" onclick="GoogleCalendarImport.openImportModal()" title="Import din Google Calendar" style="display:inline-flex;align-items:center;gap:6px">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Import Calendar
            </button>
            <button class="btn-brand" onclick="TimeTracking.openAddModal()">+ Adaugă activitate</button>
          </div>
        </div>

        <!-- Calendar săptămânal — scroll vertical, 7-18 vizibil -->
        <div class="card mb-3" style="overflow-x:auto">
          <div style="overflow-y:auto;max-height:580px;position:relative">
            <div id="tt-calendar-grid" style="position:relative;min-width:700px">
              <table style="width:100%;border-collapse:collapse" id="tt-calendar-table">
                <thead style="position:sticky;top:0;z-index:10;background:var(--bg)">
                  <tr>
                    <th style="width:50px;border-right:1px solid var(--border);background:var(--bg)"></th>
                    ${dayHeaders}
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
              <div id="tt-calendar-now-indicator" aria-label="Ora curentă" style="display:none;position:absolute;left:0;width:0;height:0;border-top:2px solid #EF4444;pointer-events:none;z-index:8;box-shadow:0 1px 0 rgba(255,255,255,.75)">
                <span style="position:absolute;left:-6px;top:-6px;width:10px;height:10px;border-radius:50%;background:#EF4444;box-shadow:0 0 0 2px var(--card-bg)"></span>
              </div>
            </div>
          </div>
        </div>

        <!-- Tabel activități -->
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border)">
            <h3 style="margin:0;font-size:14px;font-weight:600">Activități săptămâna aceasta</h3>
            <span style="font-size:12px;color:var(--text-muted)">${this.entries.length} înregistrări</span>
          </div>
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:var(--bg-secondary,#f8f9fa)">
                <th style="padding:8px 12px;text-align:left;font-size:12px;color:var(--text-muted)">Data</th>
                <th style="padding:8px 12px;text-align:left;font-size:12px;color:var(--text-muted)">Activitate</th>
                <th style="padding:8px 12px;text-align:left;font-size:12px;color:var(--text-muted)">Proiect</th>
                <th style="padding:8px 12px;text-align:left;font-size:12px;color:var(--text-muted)">Interval</th>
                <th style="padding:8px 12px;text-align:left;font-size:12px;color:var(--text-muted)">Durată</th>
                <th style="padding:8px 12px;width:50px"></th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>
    `;

    // Scroll automat la ora 7
    setTimeout(() => {
      const table = document.getElementById('tt-calendar-table');
      if (!table) return;
      const trows = table.querySelectorAll('tbody tr');
      if (trows[7]) {
        const container = table.closest('[style*="overflow-y"]');
        if (container) container.scrollTop = trows[7].offsetTop;
      }
      this.startCurrentTimeIndicator();
    }, 50);
  },

  stopCurrentTimeIndicator() {
    if (this.currentTimeIndicatorTimer) {
      window.clearTimeout(this.currentTimeIndicatorTimer);
      this.currentTimeIndicatorTimer = null;
    }
  },

  startCurrentTimeIndicator() {
    this.stopCurrentTimeIndicator();
    const tick = () => {
      const indicator = document.getElementById('tt-calendar-now-indicator');
      const grid = document.getElementById('tt-calendar-grid');
      const table = document.getElementById('tt-calendar-table');
      if (!indicator || !grid || !table) {
        this.stopCurrentTimeIndicator();
        return;
      }

      const now = new Date();
      const today = this.localDateStr(now);
      const weekDays = this.getWeekDays();
      const currentDayIndex = weekDays.findIndex(day => this.localDateStr(day) === today);
      if (currentDayIndex === -1) {
        indicator.style.display = 'none';
        this.stopCurrentTimeIndicator();
        return;
      }

      const targetRow = table.querySelectorAll('tbody tr')[now.getHours()];
      const targetDayCell = targetRow?.children[currentDayIndex + 1];
      if (!targetRow || !targetDayCell) {
        indicator.style.display = 'none';
        this.stopCurrentTimeIndicator();
        return;
      }

      const gridRect = grid.getBoundingClientRect();
      const rowTop = targetRow.getBoundingClientRect().top;
      const dayCellRect = targetDayCell.getBoundingClientRect();
      indicator.style.left = `${Math.round(dayCellRect.left - gridRect.left)}px`;
      indicator.style.width = `${Math.round(dayCellRect.width)}px`;
      indicator.style.top = `${Math.round(rowTop - gridRect.top + now.getMinutes())}px`;
      indicator.style.display = 'block';

      const millisecondsToNextMinute = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50;
      this.currentTimeIndicatorTimer = window.setTimeout(tick, millisecondsToNextMinute);
    };
    tick();
  },

  getWeekDays() {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(this.currentWeekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  },


  // ── Helper: generează opțiuni dropdown durată (15min intervale) ───────────
  _buildDurationOptions(selectedMinutes) {
    const opts = [];
    const sel = Math.round((selectedMinutes || 60) / 15) * 15 || 15;
    for (let m = 15; m <= 720; m += 15) {
      const h = Math.floor(m / 60);
      const min = m % 60;
      const label = h > 0 ? (min > 0 ? `${h}h ${min}min` : `${h}h`) : `${min}min`;
      opts.push(`<option value="${m}"${m === sel ? ' selected' : ''}>${label}</option>`);
    }
    return opts.join('');
  },

  // ── Modal adăugare activitate ─────────────────────────────────────────────

  // Construiește valori HH:MM la pas de 5 minute; o valoare existentă cu minut exact rămâne selectabilă.
  _buildTimeValues(fromTotalMin, toTotalMin, selectedTotalMin) {
    const values = [];
    for (let m = fromTotalMin; m <= toTotalMin; m += 5) {
      values.push(m);
    }
    if (Number.isFinite(selectedTotalMin) && selectedTotalMin >= fromTotalMin && selectedTotalMin <= toTotalMin && !values.includes(selectedTotalMin)) {
      values.push(selectedTotalMin);
      values.sort((a, b) => a - b);
    }
    return values;
  },

  _formatTimeInputValue(totalMinutes) {
    const value = Math.max(0, Math.min(24 * 60, Number(totalMinutes) || 0));
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  },

  _readTimeInput(inputEl, allowMidnight = false) {
    const raw = String(inputEl?.value || '').trim();
    const separated = raw.match(/^(\d{1,2})\s*[:.]\s*(\d{1,2})$/);
    const compact = raw.match(/^(\d{3,4})$/);
    const hourOnly = raw.match(/^(\d{1,2})$/);
    let hours;
    let minutes;
    if (separated) {
      hours = Number(separated[1]);
      minutes = Number(separated[2]);
    } else if (compact) {
      const value = compact[1].padStart(4, '0');
      hours = Number(value.slice(0, 2));
      minutes = Number(value.slice(2));
    } else if (hourOnly) {
      hours = Number(hourOnly[1]);
      minutes = 0;
    } else {
      return null;
    }
    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) return null;
    if (hours < 0 || hours > 23) {
      if (!(allowMidnight && hours === 24 && minutes === 0)) return null;
    }
    return hours * 60 + minutes;
  },

  _setTimeInputValue(inputEl, totalMinutes) {
    if (!inputEl) return;
    inputEl.value = this._formatTimeInputValue(totalMinutes);
  },

  _normalizeTimeInput(inputId, allowMidnight = false) {
    const inputEl = document.getElementById(inputId);
    const value = this._readTimeInput(inputEl, allowMidnight);
    if (value !== null) this._setTimeInputValue(inputEl, value);
    this._onTimeChange();
  },

  _getTimePickerValues(inputId) {
    const inputEl = document.getElementById(inputId);
    const selected = this._readTimeInput(inputEl, inputId === 'tt-end');
    const values = this._buildTimeValues(0, inputId === 'tt-end' ? 24 * 60 : 23 * 60 + 45, selected);
    if (inputId !== 'tt-start') return values;

    const date = document.getElementById('tt-date')?.value;
    const manualH = Math.max(0, Number(document.getElementById('tt-manual-h')?.value) || 0);
    const manualM = Math.max(0, Math.min(59, Number(document.getElementById('tt-manual-m')?.value) || 0));
    const duration = manualH * 60 + manualM;
    const editingEntryId = document.getElementById('tt-entry-id')?.value || null;
    if (!date || duration <= 0) return values;
    const busyIntervals = this.getBusyIntervals(date, editingEntryId || null);
    return values.filter(minute =>
      minute + duration <= 24 * 60 && !busyIntervals.some(interval => interval.start < minute + duration && minute < interval.end)
    );
  },

  _closeTimePickers(exceptId = null) {
    ['tt-start', 'tt-end'].forEach(inputId => {
      if (inputId === exceptId) return;
      const menu = document.getElementById(`${inputId}-picker-menu`);
      if (menu) menu.style.display = 'none';
    });
  },

  _renderTimePickerOptions(inputId) {
    const inputEl = document.getElementById(inputId);
    const menu = document.getElementById(`${inputId}-picker-menu`);
    if (!inputEl || !menu) return;
    const query = inputEl.dataset.ttPickerFilter === 'true'
      ? String(inputEl.value || '').replace(/[^0-9]/g, '')
      : '';
    const matchingValues = this._getTimePickerValues(inputId).filter(minute => {
      const compact = this._formatTimeInputValue(minute).replace(':', '');
      return !query || compact.startsWith(query);
    });
    menu.innerHTML = matchingValues.length
      ? matchingValues.map(minute => `
          <button type="button" role="option" onmousedown="event.preventDefault()" onclick="TimeTracking.selectTimePickerOption('${inputId}', ${minute})"
            style="display:block;width:100%;padding:9px 12px;border:0;border-bottom:1px solid var(--border);background:var(--surface);color:var(--text);text-align:left;font:inherit;font-size:13px;font-weight:600;cursor:pointer"
            onmouseenter="this.style.background='var(--bg-secondary)'" onmouseleave="this.style.background='var(--surface)'">${this._formatTimeInputValue(minute)}</button>`).join('')
      : '<div style="padding:10px 12px;color:var(--text-muted);font-size:12px">Nu există ore disponibile pentru durata aleasă.</div>';
    menu.style.display = 'block';
  },

  openTimePicker(inputId) {
    const inputEl = document.getElementById(inputId);
    if (inputEl) inputEl.dataset.ttPickerFilter = 'false';
    this._closeTimePickers(inputId);
    this._renderTimePickerOptions(inputId);
  },

  toggleTimePicker(inputId) {
    const menu = document.getElementById(`${inputId}-picker-menu`);
    if (!menu || menu.style.display === 'none') this.openTimePicker(inputId);
    else menu.style.display = 'none';
  },

  onTimePickerInput(inputId) {
    const inputEl = document.getElementById(inputId);
    if (inputEl) inputEl.dataset.ttPickerFilter = 'true';
    this._closeTimePickers(inputId);
    this._renderTimePickerOptions(inputId);
    this._updateScheduleAvailability();
  },

  selectTimePickerOption(inputId, totalMinutes) {
    const inputEl = document.getElementById(inputId);
    if (inputEl) inputEl.dataset.ttPickerFilter = 'false';
    this._setTimeInputValue(inputEl, totalMinutes);
    this._closeTimePickers();
    this._onTimeChange();
  },

  onTimePickerBlur(inputId, allowMidnight = false) {
    window.setTimeout(() => {
      this._normalizeTimeInput(inputId, allowMidnight);
      this._closeTimePickers();
    }, 120);
  },

  _installTimePickerDismissHandler() {
    if (this.timePickerDismissHandler) return;
    this.timePickerDismissHandler = event => {
      if (!event.target.closest('.tt-time-picker')) this._closeTimePickers();
    };
    document.addEventListener('pointerdown', this.timePickerDismissHandler);
  },

  openAddModal(prefillDate, prefillHour, prefillMinute) {
    this.openActivityModal({ prefillDate, prefillHour, prefillMinute });
  },

  openAddModalFromCalendar(event, prefillDate, prefillHour, cell) {
    const rect = cell?.getBoundingClientRect();
    const minute = rect
      ? Math.max(0, Math.min(59, Math.floor(event.clientY - rect.top)))
      : 0;
    this.openAddModal(prefillDate, prefillHour, minute);
  },

  _entryInterval(entry) {
    const start = this.parseStartTime(entry);
    const startTotal = start.h * 60 + start.m;
    const parsedEnd = this.parseEndTime(entry);
    const derivedDuration = parsedEnd ? (parsedEnd.h * 60 + parsedEnd.m) - startTotal : 0;
    const duration = Math.max(0, Number(entry?.duration_minutes) || derivedDuration);
    return { start: startTotal, end: startTotal + duration };
  },

  findScheduleConflicts(date, startTotal, durationMinutes, excludeEntryId = null) {
    const start = Number(startTotal);
    const end = start + Number(durationMinutes);
    if (!date || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    return (this.entries || []).filter(entry => {
      if (String(entry.date) !== String(date)) return false;
      if (excludeEntryId !== null && Number(entry.id) === Number(excludeEntryId)) return false;
      const interval = this._entryInterval(entry);
      return interval.start < end && start < interval.end;
    });
  },

  _formatEntryInterval(entry) {
    const interval = this._entryInterval(entry);
    return `${this.fmtTime(Math.floor(interval.start / 60), interval.start % 60)}–${this.fmtTime(Math.floor(interval.end / 60), interval.end % 60)}`;
  },

  getBusyIntervals(date, excludeEntryId = null) {
    const intervals = (this.entries || [])
      .filter(entry => String(entry.date) === String(date) && (excludeEntryId === null || Number(entry.id) !== Number(excludeEntryId)))
      .map(entry => this._entryInterval(entry))
      .map(interval => ({ start: Math.max(0, interval.start), end: Math.min(24 * 60, interval.end) }))
      .filter(interval => interval.end > interval.start)
      .sort((a, b) => a.start - b.start);

    return intervals.reduce((merged, interval) => {
      const previous = merged[merged.length - 1];
      if (previous && interval.start <= previous.end) {
        previous.end = Math.max(previous.end, interval.end);
      } else {
        merged.push({ ...interval });
      }
      return merged;
    }, []);
  },

  _formatBusyIntervals(intervals) {
    return intervals.map(interval =>
      `${this.fmtTime(Math.floor(interval.start / 60), interval.start % 60)}–${this.fmtTime(Math.floor(interval.end / 60), interval.end % 60)}`
    ).join(' · ');
  },

  _updateScheduleAvailability() {
    const hint = document.getElementById('tt-schedule-hint');
    const date = document.getElementById('tt-date')?.value;
    const start = this._readTimeInput(document.getElementById('tt-start'));
    const manualH = Math.max(0, Number(document.getElementById('tt-manual-h')?.value) || 0);
    const manualM = Math.max(0, Math.min(59, Number(document.getElementById('tt-manual-m')?.value) || 0));
    const duration = manualH * 60 + manualM;
    const editingEntryId = document.getElementById('tt-entry-id')?.value || null;
    if (!hint || !date || duration <= 0) return;
    if (start === null) {
      hint.textContent = '⚠ Introdu o oră de start validă, între 00:00 și 23:59.';
      hint.style.color = '#B91C1C';
      hint.style.display = 'block';
      return;
    }
    const end = start + duration;
    if (end > 24 * 60) {
      hint.textContent = '⚠ Intervalul depășește ora 24:00. Alege o durată mai mică.';
      hint.style.color = '#B91C1C';
      hint.style.display = 'block';
      return;
    }
    const conflicts = this.findScheduleConflicts(date, start, duration, editingEntryId || null);
    if (conflicts.length > 0) {
      const first = conflicts[0];
      hint.textContent = `⚠ Interval indisponibil: se suprapune cu „${first.task_name || 'Activitate'}” (${this._formatEntryInterval(first)}).`;
      hint.style.color = '#B91C1C';
      hint.style.display = 'block';
      return;
    }
    hint.textContent = `✓ Interval disponibil: ${this.fmtTime(Math.floor(start / 60), start % 60)}–${this.fmtTime(Math.floor(end / 60), end % 60)}.`;
    hint.style.color = '#047857';
    hint.style.display = 'block';
  },

  _refreshAvailableStartTimes() {
    const startEl = document.getElementById('tt-start');
    const date = document.getElementById('tt-date')?.value;
    if (!startEl || !date) return;
    const selected = this._readTimeInput(startEl);
    const manualH = Math.max(0, Number(document.getElementById('tt-manual-h')?.value) || 0);
    const manualM = Math.max(0, Math.min(59, Number(document.getElementById('tt-manual-m')?.value) || 0));
    const duration = manualH * 60 + manualM;
    const editingEntryId = document.getElementById('tt-entry-id')?.value || null;
    if (duration <= 0 || selected === null) return;

    const busyIntervals = this.getBusyIntervals(date, editingEntryId || null);
    const summary = document.getElementById('tt-occupied-summary');
    if (summary) {
      summary.textContent = busyIntervals.length > 0
        ? `Ocupat: ${this._formatBusyIntervals(busyIntervals)}`
        : 'Nu există intervale ocupate în această zi.';
      summary.style.display = 'block';
    }

    const startMenu = document.getElementById('tt-start-picker-menu');
    if (startMenu?.style.display !== 'none') this._renderTimePickerOptions('tt-start');
    const endMenu = document.getElementById('tt-end-picker-menu');
    if (endMenu?.style.display !== 'none') this._renderTimePickerOptions('tt-end');
  },

  openActivityModal({ entry = null, prefillDate, prefillHour, prefillMinute } = {}) {
    const now = new Date();
    const parsedStart = entry ? this.parseStartTime(entry) : null;
    const parsedEnd = entry ? this.parseEndTime(entry) : null;
    const startHour = parsedStart ? parsedStart.h : (prefillHour !== undefined ? prefillHour : now.getHours());
    const startMin = parsedStart ? parsedStart.m : (prefillMinute !== undefined ? prefillMinute : 0);
    // La editare, păstrăm minutul exact salvat (ex. 10:20), nu îl rotunjim la 00/15/30/45.
    // Selectorul intern adaugă automat această valoare atunci când nu este pe pasul de 5 minute.
    const startTotal = startHour * 60 + startMin;
    // Pentru o activitate nouă propunem doar 10 minute. Activitățile existente
    // păstrează strict durata salvată.
    const storedDuration = entry ? Number(entry.duration_minutes || 0) : 10;
    const storedEnd = parsedEnd ? parsedEnd.h * 60 + parsedEnd.m : null;
    const endTotal = storedEnd && storedEnd > startTotal ? storedEnd : Math.min(startTotal + storedDuration, 24 * 60);
    const selectedProjectId = entry?.project_id || null;
    const selectedTaskId = entry?.project_task_id || null;
    const selectedTask = selectedTaskId ? this.tasks.find(t => Number(t.id) === Number(selectedTaskId)) : null;
    const selectedPhaseId = selectedTask?.phase_id || null;
    const projectOptions = (this.allocatedProjects || []).map(p =>
      `<option value="${p.id}"${Number(selectedProjectId) === Number(p.id) ? ' selected' : ''}>${p.emoji || ''} ${p.name}</option>`
    ).join('');
    const durationHours = Math.floor(storedDuration / 60);
    const durationMinutes = storedDuration % 60;
    const safeTaskName = String(entry?.task_name || '').replace(/"/g, '&quot;');

    openModal(entry ? 'Editează activitate' : 'Adaugă activitate', `
      <div class="space-y-3">
        <div>
          <label class="label">Data *</label>
          <input type="date" id="tt-date" class="input" value="${entry?.date || prefillDate || this.localDateStr()}" onchange="TimeTracking._refreshAvailableStartTimes();TimeTracking._updateScheduleAvailability()">
        </div>
        <div class="flex gap-3">
          <div style="flex:1">
            <label class="label">Oră start</label>
            <div class="tt-time-picker" style="position:relative">
              <input type="text" id="tt-start" class="input" inputmode="numeric" autocomplete="off" placeholder="HH:MM" value="${this._formatTimeInputValue(startTotal)}" style="padding-right:38px" onfocus="TimeTracking.openTimePicker('tt-start')" oninput="TimeTracking.onTimePickerInput('tt-start')" onblur="TimeTracking.onTimePickerBlur('tt-start')">
              <button type="button" aria-label="Alege ora de start" onmousedown="event.preventDefault()" onclick="TimeTracking.toggleTimePicker('tt-start')" style="position:absolute;right:1px;top:1px;bottom:1px;width:34px;border:0;border-left:1px solid var(--border);border-radius:0 var(--radius) var(--radius) 0;background:transparent;color:var(--text-muted);cursor:pointer;font-size:15px">⌄</button>
              <div id="tt-start-picker-menu" role="listbox" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:40;max-height:190px;overflow-y:auto;background:var(--surface);border:1px solid var(--border-strong);border-radius:8px;box-shadow:0 10px 24px rgba(15,23,42,.18)"></div>
            </div>
            <div id="tt-occupied-summary" style="display:none;font-size:10px;line-height:1.4;color:var(--text-muted);margin-top:4px"></div>
          </div>
          <div style="flex:1">
            <label class="label">Oră final</label>
            <div class="tt-time-picker" style="position:relative">
              <input type="text" id="tt-end" class="input" inputmode="numeric" autocomplete="off" placeholder="HH:MM" value="${this._formatTimeInputValue(endTotal)}" style="padding-right:38px" onfocus="TimeTracking.openTimePicker('tt-end')" oninput="TimeTracking.onTimePickerInput('tt-end')" onblur="TimeTracking.onTimePickerBlur('tt-end', true)">
              <button type="button" aria-label="Alege ora finală" onmousedown="event.preventDefault()" onclick="TimeTracking.toggleTimePicker('tt-end')" style="position:absolute;right:1px;top:1px;bottom:1px;width:34px;border:0;border-left:1px solid var(--border);border-radius:0 var(--radius) var(--radius) 0;background:transparent;color:var(--text-muted);cursor:pointer;font-size:15px">⌄</button>
              <div id="tt-end-picker-menu" role="listbox" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:40;max-height:190px;overflow-y:auto;background:var(--surface);border:1px solid var(--border-strong);border-radius:8px;box-shadow:0 10px 24px rgba(15,23,42,.18)"></div>
            </div>
          </div>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:-6px">Scrie direct <strong>0830</strong> sau <strong>08:30</strong>, ori alege o oră din listă.</div>
        <div>
          <label class="label">Timp lucrat *</label>
          <div class="flex gap-3" style="align-items:center">
            <div style="flex:1">
              <input type="number" id="tt-manual-h" class="input" min="0" max="23" step="1" value="${durationHours}" style="text-align:center" oninput="TimeTracking._onManualDurChange()">
              <div style="font-size:11px;color:var(--text-muted);text-align:center;margin-top:2px">Ore</div>
            </div>
            <div style="font-size:20px;font-weight:700;color:var(--text-muted);padding-bottom:16px">:</div>
            <div style="flex:1">
              <input type="number" id="tt-manual-m" class="input" min="0" max="59" step="1" value="${durationMinutes}" style="text-align:center" oninput="TimeTracking._onManualDurChange()">
              <div style="font-size:11px;color:var(--text-muted);text-align:center;margin-top:2px">Minute</div>
            </div>
            <div id="tt-duration-display" style="
              flex:0 0 auto;min-width:72px;
              padding:8px 10px;
              background:var(--bg-secondary);
              border:1px solid var(--border);
              border-radius:6px;
              font-weight:700;
              text-align:center;
              color:var(--text);
              font-size:15px;
              user-select:none;
            ">—</div>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">💡 Poți completa manual orele/minutele SAU selecta Oră start / Oră final — câmpurile se sincronizează automat.</div>
          <div id="tt-schedule-hint" role="status" style="display:none;font-size:11px;margin-top:5px;font-weight:600"></div>
        </div>
        <div>
          <label class="label">Descriere activitate *</label>
          <input type="text" id="tt-task" class="input" value="${safeTaskName}" placeholder="Ex: Planșe arhitectură etaj 2">
        </div>
        <div>
          <label class="label">Proiect</label>
          <select id="tt-project" class="select" onchange="TimeTracking.onProjectChange(this.value)">
            <option value="">— Fără proiect —</option>
            ${projectOptions}
          </select>
        </div>
        <div id="tt-phase-wrapper" style="display:none">
          <label class="label">Etapă</label>
          <select id="tt-phase" class="select" onchange="TimeTracking.onPhaseChange(this.value)">
            <option value="">— Toate etapele —</option>
          </select>
        </div>
        <div>
          <label class="label">Task proiect</label>
          <select id="tt-task-id" class="select">
            <option value="">— Selectează task —</option>
          </select>
        </div>
        <input type="hidden" id="tt-entry-id" value="${entry?.id || ''}">
      </div>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
      <button class="btn-brand" onclick="${entry ? `TimeTracking.saveEditEntry(${entry.id})` : 'TimeTracking.saveEntry()'}">Finalizează</button>
    `, { closeOnBackdrop: false, showClose: false });

    setTimeout(() => {
      this._installTimePickerDismissHandler();
      if (selectedProjectId) {
        const projectSelect = document.getElementById('tt-project');
        if (projectSelect) projectSelect.value = selectedProjectId;
        this.onProjectChange(selectedProjectId);
        if (selectedPhaseId) {
          const phaseSelect = document.getElementById('tt-phase');
          if (phaseSelect) phaseSelect.value = selectedPhaseId;
          this.onPhaseChange(selectedPhaseId);
        }
        const taskSelect = document.getElementById('tt-task-id');
        if (taskSelect && selectedTaskId) taskSelect.value = selectedTaskId;
      }
      this._onTimeChange();
    }, 0);
  },

  _onTimeChange() {
    const startEl = document.getElementById('tt-start');
    const endEl = document.getElementById('tt-end');
    const dispEl = document.getElementById('tt-duration-display');
    if (!startEl || !endEl) return;
    const startMin = this._readTimeInput(startEl);
    let endMin = this._readTimeInput(endEl, true);
    if (startMin === null || endMin === null) {
      if (dispEl) { dispEl.textContent = '—'; dispEl.style.color = '#dc2626'; }
      this._updateScheduleAvailability();
      return;
    }
    // Auto-corecție: dacă end <= start, setează end = start + 10 minute.
    if (endMin <= startMin) {
      endMin = Math.min(startMin + 10, 24 * 60);
      this._setTimeInputValue(endEl, endMin);
    }
    const dur = endMin - startMin;
    const h = Math.floor(dur / 60);
    const m = dur % 60;
    // Sincronizează câmpurile manuale Ore/Minute
    const hEl = document.getElementById('tt-manual-h');
    const mEl = document.getElementById('tt-manual-m');
    if (hEl) hEl.value = h;
    if (mEl) mEl.value = m;
    // Actualizează display
    if (dispEl) {
      let label;
      if (h > 0 && m > 0) label = `${h}h ${m}min`;
      else if (h > 0) label = `${h}h`;
      else label = `${m}min`;
      dispEl.textContent = label;
      dispEl.style.color = dur > 0 ? 'var(--text)' : '#dc2626';
    }
    this._refreshAvailableStartTimes();
    this._updateScheduleAvailability();
  },

  // Apelat când utilizatorul modifică manual câmpurile Ore/Minute
  _onManualDurChange() {
    const hEl = document.getElementById('tt-manual-h');
    const mEl = document.getElementById('tt-manual-m');
    const dispEl = document.getElementById('tt-duration-display');
    const h = Math.max(0, parseInt(hEl?.value) || 0);
    const m = Math.max(0, Math.min(59, parseInt(mEl?.value) || 0));
    const dur = h * 60 + m;
    // Actualizează display
    if (dispEl) {
      if (dur === 0) { dispEl.textContent = '—'; dispEl.style.color = 'var(--text-muted)'; }
      else {
        let label;
        if (h > 0 && m > 0) label = `${h}h ${m}min`;
        else if (h > 0) label = `${h}h`;
        else label = `${m}min`;
        dispEl.textContent = label;
        dispEl.style.color = 'var(--text)';
      }
    }
    // Sincronizează Ora final = Ora start + dur
    const startEl = document.getElementById('tt-start');
    const endEl = document.getElementById('tt-end');
    if (startEl && endEl && dur > 0) {
      const startMin = this._readTimeInput(startEl);
      if (startMin !== null) {
        const newEnd = Math.min(startMin + dur, 24 * 60);
        this._setTimeInputValue(endEl, newEnd);
      }
    }
    this._refreshAvailableStartTimes();
    this._updateScheduleAvailability();
  },

  onProjectChange(projectId) {
    const taskSelect = document.getElementById('tt-task-id');
    const phaseSelect = document.getElementById('tt-phase');
    const phaseWrapper = document.getElementById('tt-phase-wrapper');
    if (!taskSelect) return;
    const pid = parseInt(projectId);
    if (!pid) {
      // Niciun proiect selectat — ascunde etapa, golește task-urile
      if (phaseWrapper) phaseWrapper.style.display = 'none';
      taskSelect.innerHTML = `<option value="">— Selectează task —</option>`;
      return;
    }
    // Populează dropdown-ul de etapă
    const phases = (this.phases || []).filter(ph => ph.project_id === pid);
    if (phaseSelect && phaseWrapper) {
      if (phases.length > 0) {
        phaseWrapper.style.display = 'block';
        phaseSelect.innerHTML = `<option value="">— Toate etapele —</option>` +
          phases.map(ph => `<option value="${ph.id}">${ph.code ? ph.code + ' — ' : ''}${ph.name}</option>`).join('');
      } else {
        phaseWrapper.style.display = 'none';
      }
    }
    // Populează task-urile (toate etapele inițial)
    const tasks = this.tasks.filter(t => t.project_id === pid);
    taskSelect.innerHTML = `<option value="">— Selectează task —</option>` +
      tasks.map(t => {
        const phase = phases.find(ph => ph.id === t.phase_id);
        const phaseLabel = phase ? `[${phase.code || phase.name}] ` : '';
        const budgetH = Math.round((t.budget_hours || 0) * 10) / 10;
        const workedH = Math.round((t.minutes_worked || 0) / 60 * 10) / 10;
        return `<option value="${t.id}">${phaseLabel}${t.name} (${workedH}h / ${budgetH}h)</option>`;
      }).join('');
  },

  onPhaseChange(phaseId) {
    const taskSelect = document.getElementById('tt-task-id');
    if (!taskSelect) return;
    const pid = parseInt(document.getElementById('tt-project')?.value);
    if (!pid) return;
    const phases = (this.phases || []).filter(ph => ph.project_id === pid);
    const tasks = phaseId
      ? this.tasks.filter(t => t.project_id === pid && String(t.phase_id) === String(phaseId))
      : this.tasks.filter(t => t.project_id === pid);
    taskSelect.innerHTML = `<option value="">— Selectează task —</option>` +
      tasks.map(t => {
        const phase = phases.find(ph => ph.id === t.phase_id);
        const phaseLabel = !phaseId && phase ? `[${phase.code || phase.name}] ` : '';
        const budgetH = Math.round((t.budget_hours || 0) * 10) / 10;
        const workedH = Math.round((t.minutes_worked || 0) / 60 * 10) / 10;
        return `<option value="${t.id}">${phaseLabel}${t.name} (${workedH}h / ${budgetH}h)</option>`;
      }).join('');
  },

  async saveEntry() {
    const taskName = document.getElementById('tt-task')?.value?.trim();
    if (!taskName) { showToast('Completă descrierea activității', 'error'); return; }

    const dateVal = document.getElementById('tt-date')?.value;
    if (!dateVal) { showToast('Selectează data', 'error'); return; }

    // Citim durata din câmpurile manuale Ore + Minute (prioritar)
    const manualH = Math.max(0, parseInt(document.getElementById('tt-manual-h')?.value) || 0);
    const manualM = Math.max(0, Math.min(59, parseInt(document.getElementById('tt-manual-m')?.value) || 0));
    const manualDur = manualH * 60 + manualM;

    // Citim Ora start și Ora final, inclusiv valori introduse manual (ex. 08:30).
    const startTotalMin = this._readTimeInput(document.getElementById('tt-start'));
    const endTotalMin = this._readTimeInput(document.getElementById('tt-end'), true);
    if (startTotalMin === null) {
      showToast('Introdu o oră de start validă, de exemplu 08:30.', 'error');
      return;
    }
    if (endTotalMin === null) {
      showToast('Introdu o oră finală validă, de exemplu 08:40.', 'error');
      return;
    }
    const startEndDur = endTotalMin > startTotalMin ? endTotalMin - startTotalMin : 0;

    // Prioritate: câmpuri manuale dacă sunt completate, altfel start/end
    const durationMinutes = manualDur > 0 ? manualDur : startEndDur;
    if (durationMinutes <= 0) {
      showToast('Completează timpul lucrat (Ore/Minute) sau selectează Oră start și Oră final', 'error');
      return;
    }

    const finalTotalMin = startTotalMin + durationMinutes;
    if (finalTotalMin > 24 * 60) {
      showToast('Intervalul ales depășește ora 24:00. Redu durata activității.', 'error');
      return;
    }
    const scheduleConflicts = this.findScheduleConflicts(dateVal, startTotalMin, durationMinutes);
    if (scheduleConflicts.length > 0) {
      const conflict = scheduleConflicts[0];
      showToast(`Interval indisponibil: se suprapune cu „${conflict.task_name || 'Activitate'}” (${this._formatEntryInterval(conflict)}).`, 'error');
      return;
    }

    const startHour = Math.floor(startTotalMin / 60);
    const startMin = startTotalMin % 60;
    const projectId = document.getElementById('tt-project')?.value || null;
    const taskId = document.getElementById('tt-task-id')?.value || null;
    const userId = this.getNumericUserId();

    if (!userId) { showToast('Eroare: utilizator neidentificat', 'error'); return; }

    // Construiește valorile HH:MM:SS pentru start_time și end_time (tip TIME în Supabase, nu TIMESTAMP)
    const startTimeStr = String(startHour).padStart(2,'0') + ':' + String(startMin).padStart(2,'0') + ':00';
    const endH = Math.floor(finalTotalMin / 60) % 24;
    const endM = finalTotalMin % 60;
    const endTimeStr = String(endH).padStart(2,'0') + ':' + String(endM).padStart(2,'0') + ':00';

    // Câmpuri EXACTE din schema Supabase reală (snake_case)
    const entry = {
      user_id: userId,
      date: dateVal,
      start_time: startTimeStr,
      end_time: endTimeStr,
      duration_minutes: durationMinutes,
      task_name: taskName,
      project_id: projectId ? parseInt(projectId) : null,
      project_task_id: taskId ? parseInt(taskId) : null,
      is_billable: true,
      status: 'salvat',
    };

    const sb = getSupabase();
    if (!sb) { showToast('Eroare: conexiune Supabase indisponibilă', 'error'); return; }

    const { data, error } = await sb.from('time_entries').insert(entry).select().single();
    if (error) {
      console.error('[TT] saveEntry error:', error);
      showToast('Eroare la salvare: ' + error.message, 'error');
      return;
    }

    // Recalculează minutes_worked din zero (nu incremental) pentru acuratețe maximă
    if (taskId) {
      await this._recalcAndSaveTaskMinutes(parseInt(taskId));
    }

    closeModalForce();
    showToast('✅ Activitate salvată', 'success');
    await this.loadData();
    this.renderPage();
  },

  // ── Vizualizare / ștergere intrare ───────────────────────────────────────

  async viewEntry(id) {
    const e = this.entries.find(e => e.id === id);
    if (!e) return;
    const proj = this.projects.find(p => p.id === e.project_id);
    const st = this.parseStartTime(e);
    const et = this.parseEndTime(e);
    const eventMatch = String(e.gcal_event_id || '').match(/^company_event:(\d+):/);
    let event = null;
    if (eventMatch && typeof DB.getCompanyEventById === 'function') {
      const { data } = await DB.getCompanyEventById(Number(eventMatch[1]));
      event = data || null;
    }
    openModal('Detalii activitate', `
      <div class="space-y-3">
        <div style="font-size:16px;font-weight:600">${e.task_name || 'Activitate'}</div>
        <div style="color:var(--text-muted);font-size:13px">
          ${this.fmtDate(e.date)} · ${this.fmtTime(st.h, st.m)}
          ${et ? ' → ' + this.fmtTime(et.h, et.m) : ''}
          · ${this.fmtDuration(e.duration_minutes)}
        </div>
        ${proj ? `<div style="font-size:13px">Proiect: <strong>${proj.emoji || ''} ${proj.name}</strong></div>` : ''}
        ${e.description ? `<div style="font-size:13px;color:var(--text-muted)">${e.description}</div>` : ''}
        ${event ? `
          <div style="margin-top:14px;padding:14px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:10px">
            <div style="font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#2563eb;margin-bottom:8px">Eveniment firmă</div>
            <div style="font-size:14px;font-weight:700;color:#1e3a8a">${event.title}</div>
            <div style="font-size:13px;color:#334155;margin-top:5px">${this.fmtDate(event.event_date)} · ${this.fmtTime(st.h, st.m)}${et ? ' → ' + this.fmtTime(et.h, et.m) : ''}</div>
            ${event.location ? `<div style="font-size:13px;color:#334155;margin-top:4px">Locație: ${event.location}</div>` : ''}
            ${event.description ? `<div style="font-size:13px;color:#475569;line-height:1.5;margin-top:8px">${event.description}</div>` : ''}
            ${event.meeting_link ? `<a href="${event.meeting_link}" target="_blank" rel="noopener" style="display:inline-block;margin-top:10px;font-size:13px;font-weight:700;color:#1d4ed8">Deschide linkul întâlnirii ↗</a>` : ''}
          </div>
        ` : ''}
      </div>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Închide</button>
      ${eventMatch ? `<button class="btn-secondary" onclick="TimeTracking.openCompanyEvent(${eventMatch[1]})">Vezi evenimentul</button>` : ''}
      <button class="btn-secondary" onclick="TimeTracking.openEditModal(${id})">✏️ Editează</button>
      <button class="btn-danger" onclick="TimeTracking.deleteEntry(${id});closeModalForce()">🗑 Șterge</button>
    `);
  },

  async openCompanyEvent(eventId) {
    closeModalForce();
    await navigate('evenimente', null);
    setTimeout(() => Evenimente?.openDetailsModal?.(Number(eventId)), 250);
  },


  openEditModal(id) {
    const entry = this.entries.find(e => Number(e.id) === Number(id));
    if (entry) this.openActivityModal({ entry });
  },

  async saveEditEntry(id) {
    const taskName = document.getElementById('tt-task')?.value?.trim();
    if (!taskName) { showToast('Completează descrierea activității', 'error'); return; }
    const dateVal = document.getElementById('tt-date')?.value;
    if (!dateVal) { showToast('Selectează data', 'error'); return; }
    const startTotalMin = this._readTimeInput(document.getElementById('tt-start'));
    const endTotalMin = this._readTimeInput(document.getElementById('tt-end'), true);
    if (startTotalMin === null) {
      showToast('Introdu o oră de start validă, de exemplu 08:30.', 'error');
      return;
    }
    if (endTotalMin === null) {
      showToast('Introdu o oră finală validă, de exemplu 08:40.', 'error');
      return;
    }
    const manualH = Math.max(0, parseInt(document.getElementById('tt-manual-h')?.value) || 0);
    const manualM = Math.max(0, Math.min(59, parseInt(document.getElementById('tt-manual-m')?.value) || 0));
    const durationMinutes = manualH * 60 + manualM || Math.max(0, endTotalMin - startTotalMin);
    if (durationMinutes <= 0) { showToast('Completează timpul lucrat (Ore/Minute) sau selectează Oră start și Ora final', 'error'); return; }
    const finalTotalMin = startTotalMin + durationMinutes;
    if (finalTotalMin > 24 * 60) {
      showToast('Intervalul ales depășește ora 24:00. Redu durata activității.', 'error');
      return;
    }
    const scheduleConflicts = this.findScheduleConflicts(dateVal, startTotalMin, durationMinutes, id);
    if (scheduleConflicts.length > 0) {
      const conflict = scheduleConflicts[0];
      showToast(`Interval indisponibil: se suprapune cu „${conflict.task_name || 'Activitate'}” (${this._formatEntryInterval(conflict)}).`, 'error');
      return;
    }
    const projectId = document.getElementById('tt-project')?.value || null;
    const taskId = document.getElementById('tt-task-id')?.value || null;
    const startHour = Math.floor(startTotalMin / 60);
    const startMin = startTotalMin % 60;
    const startTimeStr = String(startHour).padStart(2,'0') + ':' + String(startMin).padStart(2,'0') + ':00';
    const endH = Math.floor(finalTotalMin / 60) % 24;
    const endM = finalTotalMin % 60;
    const endTimeStr = String(endH).padStart(2,'0') + ':' + String(endM).padStart(2,'0') + ':00';
    const sb = getSupabase();
    if (!sb) { showToast('Eroare: conexiune Supabase indisponibilă', 'error'); return; }
    const oldEntry = this.entries.find(e => e.id === id);
    const { error } = await sb.from('time_entries').update({
      date: dateVal,
      start_time: startTimeStr,
      end_time: endTimeStr,
      duration_minutes: durationMinutes,
      task_name: taskName,
      project_id: projectId ? parseInt(projectId) : null,
      project_task_id: taskId ? parseInt(taskId) : null,
    }).eq('id', id);
    if (error) { showToast('Eroare la salvare: ' + error.message, 'error'); return; }
    // Recalculează minutes_worked din zero pentru ambele task-uri afectate
    const affectedTaskIds = new Set();
    if (oldEntry?.project_task_id) affectedTaskIds.add(oldEntry.project_task_id);
    if (taskId) affectedTaskIds.add(parseInt(taskId));
    for (const tid of affectedTaskIds) {
      await this._recalcAndSaveTaskMinutes(tid);
    }
    closeModalForce();
    showToast('✅ Activitate actualizată', 'success');
    await this.loadData();
    this.renderPage();
  },

  async deleteEntry(id) {
    if (!confirm('Ești sigur că vrei să ștergi această activitate?')) return;
    const sb = getSupabase();
    if (!sb) { showToast('Nu ești conectat la baza de date.', 'error'); return; }
    // Găsim înregistrarea pentru a scădea minutes_worked din task
    const entryId = Number(id);
    const entry = this.entries.find(e => Number(e.id) === entryId);
    const { data: deletedEntries, error } = await sb
      .from('time_entries')
      .delete()
      .eq('id', entryId)
      .select('id');
    if (error) { showToast('Eroare la ștergere: ' + error.message, 'error'); return; }
    if (!deletedEntries || deletedEntries.length !== 1) {
      showToast('Activitatea nu a putut fi ștearsă. Încarcă pagina și încearcă din nou.', 'error');
      return;
    }
    // Elimină imediat blocul din calendar, apoi sincronizează din baza de date.
    this.entries = this.entries.filter(e => Number(e.id) !== entryId);
    this.renderPage();
    // Recalculează minutes_worked din zero pentru acuratețe maximă
    if (entry?.project_task_id) {
      await this._recalcAndSaveTaskMinutes(entry.project_task_id);
    }
    closeModalForce();
    try {
      await this.loadData();
      this.renderPage();
      showToast('✅ Activitate ștearsă', 'success');
    } catch (refreshError) {
      console.error('[TimeTracking] Reîncărcare după ștergere:', refreshError);
      showToast('Activitatea a fost ștearsă; calendarul se actualizează la reîncărcare.', 'success');
    }
  },

  // ── Integrare cu timer din Proiecte / Start Task ──────────────────────────
  // Apelat din proiecte.js (stopTask) și app.js (stopActiveTimer)

  // Recalcul centralizat minutes_worked pentru UN task (din zero, din DB)
  // Apelat după orice operație de scriere (stop timer, save entry, delete, edit)
  async _recalcAndSaveTaskMinutes(taskId) {
    const sb = getSupabase();
    if (!sb || !taskId) return 0;
    const [timeRes, manualRes] = await Promise.all([
      sb.from('time_entries').select('duration_minutes').eq('project_task_id', taskId),
      sb.from('manual_hours_log').select('minutes').eq('task_id', taskId),
    ]);
    const timeMin = (timeRes.data || []).reduce((s, r) => s + (r.duration_minutes || 0), 0);
    const manualMin = (manualRes.data || []).reduce((s, r) => s + (r.minutes || 0), 0);
    const realMinutes = timeMin + manualMin;
    await sb.from('project_tasks').update({ minutes_worked: realMinutes }).eq('id', taskId);
    // Actualizează și în memoria locală
    const task = this.tasks?.find(t => t.id === taskId || String(t.id) === String(taskId));
    if (task) task.minutes_worked = realMinutes;
    return realMinutes;
  },

  async saveFromTimer(timerData, minutes) {
    const userId = this.getNumericUserId();
    if (!userId) return { error: { message: 'Utilizator neidentificat' } };

    const sb = getSupabase();
    if (!sb) return { error: { message: 'Supabase indisponibil' } };

    const now = new Date();
    const startDt = timerData.startTime ? new Date(timerData.startTime) : new Date(now.getTime() - minutes * 60000);
    const localDate = this.localDateStr(startDt);
    // Format HH:MM:SS pentru start_time și end_time (tip TIME în Supabase)
    const startTimeStr = String(startDt.getHours()).padStart(2,'0') + ':' + String(startDt.getMinutes()).padStart(2,'0') + ':00';
    const endTimeStr = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0') + ':00';

    // Câmpuri EXACTE din schema Supabase reală (snake_case)
    const entry = {
      user_id: userId,
      date: localDate,
      start_time: startTimeStr,
      end_time: endTimeStr,
      duration_minutes: minutes,
      task_name: timerData.taskName || '',
      project_id: timerData.projectId ? parseInt(timerData.projectId) : null,
      project_task_id: timerData.taskId ? parseInt(timerData.taskId) : null,
      is_billable: true,
      status: 'salvat',
    };

    return await sb.from('time_entries').insert(entry).select().single();
  },
};
