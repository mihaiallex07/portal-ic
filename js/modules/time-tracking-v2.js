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
    const isAdmin = Auth.currentProfile?.role === 'admin';

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
      sb.from('projects').select('id,name,color,emoji,status'),
      sb.from('project_members').select('project_id,role').eq('user_id', userId),
    ]);

    this.entries = entriesRes.data || [];
    const allProjects = projectsRes.data || [];
    const memberships = membershipsRes.data || [];

    if (isAdmin) {
      this.projects = allProjects;
    } else {
      const enrolledIds = new Set(memberships.map(m => m.project_id));
      this.projects = allProjects.filter(p => enrolledIds.has(p.id));
    }

    // Sortare: proiecte active primele, apoi celelalte
    this.projects.sort((a, b) => {
      const aActive = a.status === 'activ' ? 0 : 1;
      const bActive = b.status === 'activ' ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return (a.name || '').localeCompare(b.name || '');
    });

    if (this.projects.length > 0) {
      const projectIds = this.projects.map(p => p.id);
      // Includem și project_task_assignments pentru a găsi task-urile la care user-ul a fost vreodată alocat
      const [tasksRes, assignRes] = await Promise.all([
        sb.from('project_tasks')
          .select('id,name,project_id,phase_id,assigned_user_id,assigned_users,budget_hours,minutes_worked')
          .in('project_id', projectIds)
          .order('display_order'),
        sb.from('project_task_assignments')
          .select('task_id')
          .eq('user_id', userId)
          .in('project_id', projectIds),
      ]);
      const allTasks = tasksRes.data || [];
      const assignedTaskIds = new Set((assignRes.data || []).map(a => a.task_id));
      const coordProjectIds = new Set(memberships.filter(m => m.role === 'coordonator').map(m => m.project_id));
      // Task-urile vizibile: alocate explicit (assigned_user_id, assigned_users array sau project_task_assignments)
      // SAU dacă user-ul e admin/coordonator pe proiect
      this.tasks = allTasks.filter(t => {
        if (isAdmin) return true;
        if (coordProjectIds.has(t.project_id)) return true;
        if (t.assigned_user_id === userId) return true;
        if (Array.isArray(t.assigned_users) && t.assigned_users.includes(userId)) return true;
        if (assignedTaskIds.has(t.id)) return true;
        return false;
      });
    } else {
      this.tasks = [];
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

  openAddModal(prefillDate, prefillHour) {
    const today = prefillDate || this.localDateStr();
    const now = new Date();
    const hour = prefillHour !== undefined ? prefillHour : now.getHours();

    const projectOptions = this.projects.map(p =>
      `<option value="${p.id}">${p.emoji || ''} ${p.name}</option>`
    ).join('');

    openModal('Adaugă activitate', `
      <div class="space-y-3">
        <div class="flex gap-3">
          <div style="flex:1">
            <label class="label">Data *</label>
            <input type="date" id="tt-date" class="input" value="${today}">
          </div>
          <div style="flex:1">
            <label class="label">Durată *</label>
            <select id="tt-duration" class="select">${this._buildDurationOptions(60)}</select>
          </div>
        </div>
        <div class="flex gap-3">
          <div style="flex:1">
            <label class="label">Ora start</label>
            <input type="number" id="tt-hour" class="input" value="${hour}" min="0" max="23">
          </div>
          <div style="flex:1">
            <label class="label">Minut start</label>
            <input type="number" id="tt-min" class="input" value="0" min="0" max="59">
          </div>
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
  },

  onProjectChange(projectId) {
    const taskSelect = document.getElementById('tt-task-id');
    if (!taskSelect) return;
    const pid = parseInt(projectId);
    const tasks = this.tasks.filter(t => t.project_id === pid);
    taskSelect.innerHTML = `<option value="">— Selectează task —</option>` +
      tasks.map(t => {
        const budgetH = Math.round((t.budget_hours || 0) * 10) / 10;
        const workedH = Math.round((t.minutes_worked || 0) / 60 * 10) / 10;
        return `<option value="${t.id}">${t.name} (${workedH}h / ${budgetH}h buget)</option>`;
      }).join('');
  },

  async saveEntry() {
    const taskName = document.getElementById('tt-task')?.value?.trim();
    if (!taskName) { showToast('Completează descrierea activității', 'error'); return; }

    const dateVal = document.getElementById('tt-date')?.value;
    if (!dateVal) { showToast('Selectează data', 'error'); return; }

    const startHour = parseInt(document.getElementById('tt-hour')?.value) || 0;
    const startMin = parseInt(document.getElementById('tt-min')?.value) || 0;
    const durationMinutes = parseInt(document.getElementById('tt-duration')?.value) || 60;
    const projectId = document.getElementById('tt-project')?.value || null;
    const taskId = document.getElementById('tt-task-id')?.value || null;
    const userId = this.getNumericUserId();

    if (!userId) { showToast('Eroare: utilizator neidentificat', 'error'); return; }

    // Construiește valorile HH:MM:SS pentru start_time și end_time (tip TIME în Supabase, nu TIMESTAMP)
    const startTimeStr = String(startHour).padStart(2,'0') + ':' + String(startMin).padStart(2,'0') + ':00';
    const endTotalMin = startHour * 60 + startMin + durationMinutes;
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

    // Actualizează minutes_worked pe task (consumă bugetul de ore)
    if (taskId && durationMinutes) {
      const task = this.tasks.find(t => String(t.id) === String(taskId));
      if (task) {
        const newMinutes = (task.minutes_worked || 0) + durationMinutes;
        await sb.from('project_tasks').update({ minutes_worked: newMinutes }).eq('id', parseInt(taskId));
        task.minutes_worked = newMinutes;
      }
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
    openModal('Editează activitate', `
      <div class="space-y-3">
        <div class="flex gap-3">
          <div style="flex:1">
            <label class="label">Data *</label>
            <input type="date" id="tt-edit-date" class="input" value="${e.date}">
          </div>
          <div style="flex:1">
            <label class="label">Durată *</label>
            <select id="tt-edit-duration" class="select">${this._buildDurationOptions(e.duration_minutes)}</select>
          </div>
        </div>
        <div class="flex gap-3">
          <div style="flex:1">
            <label class="label">Ora start</label>
            <input type="number" id="tt-edit-hour" class="input" value="${st.h}" min="0" max="23">
          </div>
          <div style="flex:1">
            <label class="label">Minut start</label>
            <input type="number" id="tt-edit-min" class="input" value="${st.m}" min="0" max="59">
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
    const durationMinutes = parseInt(document.getElementById('tt-edit-duration')?.value) || 60;
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
    // Ajustează minutes_worked: scade de pe task-ul vechi, adaugă pe cel nou
    if (oldEntry?.project_task_id && String(oldEntry.project_task_id) !== String(taskId)) {
      const oldTask = this.tasks.find(t => t.id === oldEntry.project_task_id);
      if (oldTask) {
        const newMin = Math.max(0, (oldTask.minutes_worked || 0) - (oldEntry.duration_minutes || 0));
        await sb.from('project_tasks').update({ minutes_worked: newMin }).eq('id', oldTask.id);
      }
    }
    if (taskId) {
      const task = this.tasks.find(t => String(t.id) === String(taskId));
      if (task) {
        const oldMin = (oldEntry?.project_task_id && String(oldEntry.project_task_id) === String(taskId))
          ? (oldEntry.duration_minutes || 0) : 0;
        const newMin = Math.max(0, (task.minutes_worked || 0) - oldMin + durationMinutes);
        await sb.from('project_tasks').update({ minutes_worked: newMin }).eq('id', parseInt(taskId));
      }
    }
    closeModalForce();
    showToast('✅ Activitate actualizată', 'success');
    await this.loadData();
    this.renderPage();
  },

  async deleteEntry(id) {
    if (!confirm('Ești sigur că vrei să ștergi această activitate?')) return;
    const sb = getSupabase();
    if (!sb) return;
    // Găsim înregistrarea pentru a scădea minutes_worked din task
    const entry = this.entries.find(e => e.id === id);
    const { error } = await sb.from('time_entries').delete().eq('id', id);
    if (error) { showToast('Eroare la ștergere: ' + error.message, 'error'); return; }
    // Scade ore din project_task dacă există
    if (entry?.project_task_id && entry?.duration_minutes) {
      const task = this.tasks.find(t => t.id === entry.project_task_id);
      if (task) {
        const newMin = Math.max(0, (task.minutes_worked || 0) - entry.duration_minutes);
        await sb.from('project_tasks').update({ minutes_worked: newMin }).eq('id', task.id);
      }
    }
    closeModalForce();
    showToast('✅ Activitate ștearsă', 'success');
    await this.loadData();
    this.renderPage();
  },

  // ── Integrare cu timer din Proiecte / Start Task ──────────────────────────
  // Apelat din proiecte.js (stopTask) și app.js (stopActiveTimer)

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
