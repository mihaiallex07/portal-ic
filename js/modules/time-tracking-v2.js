// Time Tracking Module — Portal Inginerie Creativă
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
  tasks: [],

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
    if (!sb) { this.entries = []; this.projects = []; this.tasks = []; return; }

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
      const coordProjectIds = new Set(memberships.filter(m => m.role === 'coordonator').map(m => String(m.project_id)));
      const userIdStr = String(userId);
      // Task-urile vizibile: alocate explicit (assigned_user_id, assigned_users array sau project_task_assignments)
      // SAU dacă user-ul e coordonator pe proiect (coordonatorii văd toate task-urile din proiectele lor)
      this.tasks = allTasks.filter(t => {
        if (coordProjectIds.has(String(t.project_id))) return true;
        if (String(t.assigned_user_id) === userIdStr) return true;
        if (Array.isArray(t.assigned_users) && t.assigned_users.map(String).includes(userIdStr)) return true;
        if (assignedTaskIds.has(String(t.id))) return true;
        return false;
      });
      // Stocăm etapele pentru dropdown
      this.phases = phasesRes.data || [];
      console.log('[TT] this.tasks after filter:', this.tasks.length, '/', allTasks.length, '| phases:', this.phases.length);
    } else {
      this.tasks = [];
      this.phases = [];
    }
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
          const blockH = Math.max(18, (e.duration_minutes || 30));
          const topOffset = st.m; // minute de la începutul orei
          return `<div onclick="TimeTracking.viewEntry(${e.id})"
            title="${e.task_name || ''} · ${this.fmtDuration(e.duration_minutes)}"
            style="position:absolute;left:2px;right:2px;top:${topOffset}px;height:${blockH}px;
              background:${color}22;border-left:3px solid ${color};border-radius:3px;padding:2px 5px;
              cursor:pointer;font-size:10px;line-height:1.4;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;z-index:1">
            <span style="font-weight:600;color:${color}">${emoji} ${e.task_name || 'Activitate'}</span>
            <span style="color:var(--text-muted);margin-left:4px">${this.fmtDuration(e.duration_minutes)}</span>
          </div>`;
        }).join('');
        const clickHandler = dayEntries.length === 0
          ? `onclick="TimeTracking.openAddModal('${dStr}', ${hour})"`
          : '';
        return `<td ${clickHandler} style="border:1px solid var(--border);padding:0;vertical-align:top;height:60px;position:relative;
          ${dayEntries.length === 0 ? 'cursor:pointer' : ''}"
          ${dayEntries.length === 0 ? `onmouseenter="this.style.background='rgba(255,203,9,0.08)'"` : ''}
          ${dayEntries.length === 0 ? `onmouseleave="this.style.background=''"` : ''}>
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
            <table style="width:100%;border-collapse:collapse;min-width:700px" id="tt-calendar-table">
              <thead style="position:sticky;top:0;z-index:10;background:var(--bg)">
                <tr>
                  <th style="width:50px;border-right:1px solid var(--border);background:var(--bg)"></th>
                  ${dayHeaders}
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
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
    }, 50);
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

  // Construiește opțiuni HH:MM la pas de 15min (fromMin..toMin inclusiv)
  _buildTimeOptions(fromTotalMin, toTotalMin, selectedTotalMin) {
    const opts = [];
    for (let m = fromTotalMin; m <= toTotalMin; m += 15) {
      const h = Math.floor(m / 60);
      const mm = m % 60;
      const label = String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
      const sel = m === selectedTotalMin ? ' selected' : '';
      opts.push(`<option value="${m}"${sel}>${label}</option>`);
    }
    return opts.join('');
  },

  openAddModal(prefillDate, prefillHour, prefillMinute) {
    const today = prefillDate || this.localDateStr();
    const now = new Date();
    const startHour = prefillHour !== undefined ? prefillHour : now.getHours();
    const startMin = prefillMinute !== undefined ? prefillMinute : 0;
    const startTotal = startHour * 60 + (Math.floor(startMin / 15) * 15);
    const endTotal = Math.min(startTotal + 60, 24 * 60);

    const projectOptions = this.projects.map(p =>
      `<option value="${p.id}">${p.emoji || ''} ${p.name}</option>`
    ).join('');

    // Opțiuni Ora start: 00:00 → 23:45 (la pas de 15 min)
    const startOptions = this._buildTimeOptions(0, 23 * 60 + 45, startTotal);
    // Opțiuni Ora final: 00:15 → 24:00
    const endOptions = this._buildTimeOptions(15, 24 * 60, endTotal);

    openModal('Adaugă activitate', `
      <div class="space-y-3">
        <div>
          <label class="label">Data *</label>
          <input type="date" id="tt-date" class="input" value="${today}">
        </div>
        <div class="flex gap-3">
          <div style="flex:1">
            <label class="label">Oră start</label>
            <select id="tt-start" class="select" onchange="TimeTracking._onTimeChange()">${startOptions}</select>
          </div>
          <div style="flex:1">
            <label class="label">Oră final</label>
            <select id="tt-end" class="select" onchange="TimeTracking._onTimeChange()">${endOptions}</select>
          </div>
        </div>
        <div>
          <label class="label">Timp lucrat *</label>
          <div class="flex gap-3" style="align-items:center">
            <div style="flex:1">
              <input type="number" id="tt-manual-h" class="input" min="0" max="23" step="1" placeholder="Ore" style="text-align:center" oninput="TimeTracking._onManualDurChange()">
              <div style="font-size:11px;color:var(--text-muted);text-align:center;margin-top:2px">Ore</div>
            </div>
            <div style="font-size:20px;font-weight:700;color:var(--text-muted);padding-bottom:16px">:</div>
            <div style="flex:1">
              <input type="number" id="tt-manual-m" class="input" min="0" max="59" step="1" placeholder="Min" style="text-align:center" oninput="TimeTracking._onManualDurChange()">
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
        </div>
        <div>
          <label class="label">Descriere activitate *</label>
          <input type="text" id="tt-task" class="input" placeholder="Ex: Planșe arhitectură etaj 2">
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
      </div>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
      <button class="btn-brand" onclick="TimeTracking.saveEntry()">Salvează</button>
    `);

    // Inițializează durata din start/end și sincronizează câmpurile manuale
    setTimeout(() => this._onTimeChange(), 0);
  },

  _onTimeChange() {
    const startEl = document.getElementById('tt-start');
    const endEl = document.getElementById('tt-end');
    const dispEl = document.getElementById('tt-duration-display');
    if (!startEl || !endEl) return;
    const startMin = parseInt(startEl.value);
    let endMin = parseInt(endEl.value);
    // Auto-corecție: dacă end <= start, setează end = start + 15
    if (endMin <= startMin) {
      endMin = Math.min(startMin + 15, 24 * 60);
      endEl.value = endMin;
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
      const startMin = parseInt(startEl.value) || 0;
      const newEnd = Math.min(startMin + dur, 24 * 60);
      endEl.value = newEnd;
    }
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

    // Citim Ora start și Ora final
    const startTotalMin = parseInt(document.getElementById('tt-start')?.value) || 0;
    const endTotalMin = parseInt(document.getElementById('tt-end')?.value) || 0;
    const startEndDur = endTotalMin > startTotalMin ? endTotalMin - startTotalMin : 0;

    // Prioritate: câmpuri manuale dacă sunt completate, altfel start/end
    const durationMinutes = manualDur > 0 ? manualDur : startEndDur;
    if (durationMinutes <= 0) {
      showToast('Completează timpul lucrat (Ore/Minute) sau selectează Oră start și Oră final', 'error');
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
    const endH = Math.floor(endTotalMin / 60) % 24;
    const endM = endTotalMin % 60;
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

  viewEntry(id) {
    const e = this.entries.find(e => e.id === id);
    if (!e) return;
    const proj = this.projects.find(p => p.id === e.project_id);
    const st = this.parseStartTime(e);
    const et = this.parseEndTime(e);
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
      </div>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Închide</button>
      <button class="btn-secondary" onclick="TimeTracking.openEditModal(${id})">✏️ Editează</button>
      <button class="btn-danger" onclick="TimeTracking.deleteEntry(${id});closeModalForce()">🗑 Șterge</button>
    `);
  },


  openEditModal(id) {
    const e = this.entries.find(e => e.id === id);
    if (!e) return;
    const st = this.parseStartTime(e);
    const projectOptions = this.projects.map(p =>
      `<option value="${p.id}"${e.project_id === p.id ? ' selected' : ''}>${p.emoji || ''} ${p.name}</option>`
    ).join('');
    const currentTasks = e.project_id
      ? this.tasks.filter(t => t.project_id === e.project_id)
      : [];
    const taskOptions = currentTasks.map(t =>
      `<option value="${t.id}"${e.project_task_id === t.id ? ' selected' : ''}>${t.name}</option>`
    ).join('');
    const editDurH = Math.floor((e.duration_minutes || 0) / 60);
    const editDurM = (e.duration_minutes || 0) % 60;
    openModal('Editează activitate', `
      <div class="space-y-3">
        <div class="flex gap-3">
          <div style="flex:1">
            <label class="label">Data *</label>
            <input type="date" id="tt-edit-date" class="input" value="${e.date}">
          </div>
          <div style="flex:1">
            <label class="label">Ora start</label>
            <div class="flex gap-2">
              <input type="number" id="tt-edit-hour" class="input" value="${st.h}" min="0" max="23" style="text-align:center">
              <span style="align-self:center;font-weight:700">:</span>
              <input type="number" id="tt-edit-min" class="input" value="${st.m}" min="0" max="59" style="text-align:center">
            </div>
          </div>
        </div>
        <div>
          <label class="label">Timp lucrat *</label>
          <div class="flex gap-3" style="align-items:center">
            <div style="flex:1">
              <input type="number" id="tt-edit-dur-h" class="input" min="0" max="99" step="1" value="${editDurH}" style="text-align:center">
              <div style="font-size:11px;color:var(--text-muted);text-align:center;margin-top:2px">Ore</div>
            </div>
            <div style="font-size:20px;font-weight:700;color:var(--text-muted);padding-bottom:16px">:</div>
            <div style="flex:1">
              <input type="number" id="tt-edit-dur-m" class="input" min="0" max="59" step="1" value="${editDurM}" style="text-align:center">
              <div style="font-size:11px;color:var(--text-muted);text-align:center;margin-top:2px">Minute</div>
            </div>
          </div>
        </div>
        <div>
          <label class="label">Descriere activitate *</label>
          <input type="text" id="tt-edit-task" class="input" value="${(e.task_name || '').replace(/"/g, '&quot;')}">
        </div>
        <div>
          <label class="label">Proiect</label>
          <select id="tt-edit-project" class="select" onchange="TimeTracking.onEditProjectChange(this.value, ${e.project_task_id || 'null'})">
            <option value="">— Fără proiect —</option>
            ${projectOptions}
          </select>
        </div>
        <div>
          <label class="label">Task proiect</label>
          <select id="tt-edit-task-id" class="select">
            <option value="">— Selectează task —</option>
            ${taskOptions}
          </select>
        </div>
      </div>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
      <button class="btn-brand" onclick="TimeTracking.saveEditEntry(${id})">Salvează</button>
    `);
  },

  onEditProjectChange(projectId, currentTaskId) {
    const taskSelect = document.getElementById('tt-edit-task-id');
    if (!taskSelect) return;
    const pid = parseInt(projectId);
    const tasks = this.tasks.filter(t => t.project_id === pid);
    taskSelect.innerHTML = `<option value="">— Selectează task —</option>` +
      tasks.map(t => `<option value="${t.id}"${t.id === currentTaskId ? ' selected' : ''}>${t.name}</option>`).join('');
  },

  async saveEditEntry(id) {
    const taskName = document.getElementById('tt-edit-task')?.value?.trim();
    if (!taskName) { showToast('Completează descrierea activității', 'error'); return; }
    const dateVal = document.getElementById('tt-edit-date')?.value;
    if (!dateVal) { showToast('Selectează data', 'error'); return; }
    const startHour = parseInt(document.getElementById('tt-edit-hour')?.value) || 0;
    const startMin = parseInt(document.getElementById('tt-edit-min')?.value) || 0;
    const durH = Math.max(0, parseInt(document.getElementById('tt-edit-dur-h')?.value) || 0);
    const durM = Math.max(0, Math.min(59, parseInt(document.getElementById('tt-edit-dur-m')?.value) || 0));
    const durationMinutes = durH * 60 + durM;
    if (durationMinutes <= 0) { showToast('Completează timpul lucrat (Ore/Minute)', 'error'); return; }
    const projectId = document.getElementById('tt-edit-project')?.value || null;
    const taskId = document.getElementById('tt-edit-task-id')?.value || null;
    const startTimeStr = String(startHour).padStart(2,'0') + ':' + String(startMin).padStart(2,'0') + ':00';
    const endTotalMin = startHour * 60 + startMin + durationMinutes;
    const endH = Math.floor(endTotalMin / 60) % 24;
    const endM = endTotalMin % 60;
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
