// Time Tracking Module — Portal Inginerie Creativă
// Schema REALĂ Supabase time_entries (snake_case):
//   id, user_id(int), project_id(int), project_task_id(int),
//   date(date), start_time(timestamp), end_time(timestamp),
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
  phases: [],

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

  // Extrage ora și minutul dintr-un câmp start_time (timestamp sau "HH:MM:SS")
  parseStartTime(entry) {
    if (entry.start_time) {
      const d = new Date(entry.start_time);
      if (!isNaN(d)) return { h: d.getHours(), m: d.getMinutes() };
      // fallback: "HH:MM:SS"
      const parts = String(entry.start_time).split(':');
      return { h: parseInt(parts[0]) || 0, m: parseInt(parts[1]) || 0 };
    }
    return { h: 0, m: 0 };
  },

  parseEndTime(entry) {
    if (entry.end_time) {
      const d = new Date(entry.end_time);
      if (!isNaN(d)) return { h: d.getHours(), m: d.getMinutes() };
      const parts = String(entry.end_time).split(':');
      return { h: parseInt(parts[0]) || 0, m: parseInt(parts[1]) || 0 };
    }
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
      sb.from('projects').select('id,name,color,emoji').eq('status', 'activ'),
      sb.from('project_members').select('project_id,role').eq('user_id', userId),
    ]);

    this.entries = entriesRes.data || [];
    const allProjects = projectsRes.data || [];
    const memberships = membershipsRes.data || [];

    // Toți utilizatorii (inclusiv admin/coordonator) văd DOAR proiectele la care sunt membri
    const enrolledIds = new Set(memberships.map(m => m.project_id));
    this.projects = allProjects.filter(p => enrolledIds.has(p.id));

    if (this.projects.length > 0) {
      const projectIds = this.projects.map(p => p.id);
      const tasksRes = await sb.from('project_tasks')
        .select('id,name,project_id,phase_id,assigned_user_id,budget_hours,minutes_worked')
        .in('project_id', projectIds)
        .order('display_order');
      const allTasks = tasksRes.data || [];
      // Toți utilizatorii (inclusiv admin) văd doar task-urile alocate lor
      const coordProjectIds = new Set(memberships.filter(m => m.role === 'coordonator').map(m => m.project_id));
      this.tasks = allTasks.filter(t =>
        coordProjectIds.has(t.project_id) || t.assigned_user_id === userId
      );
    } else {
      this.tasks = [];
    }
    // Încărcă etapele pentru proiectele la care utilizatorul este membru
    if (this.projects.length > 0) {
      const projectIds = this.projects.map(p => p.id);
      const phasesRes = await sb.from('project_phases')
        .select('id,name,project_id,display_order,color')
        .in('project_id', projectIds)
        .order('display_order');
      this.phases = phasesRes.data || [];
    } else {
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
        const blocks = dayEntries.map(e => {
          const proj = this.projects.find(p => p.id === e.project_id);
          const color = proj?.color || '#3B82F6';
          const emoji = proj?.emoji || '';
          return `<div onclick="TimeTracking.viewEntry(${e.id})"
            title="${e.task_name || ''} · ${this.fmtDuration(e.duration_minutes)}"
            style="background:${color}22;border-left:3px solid ${color};border-radius:3px;padding:2px 5px;
              margin:1px 0;cursor:pointer;font-size:10px;line-height:1.4;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">
            <span style="font-weight:600;color:${color}">${emoji} ${e.task_name || 'Activitate'}</span>
            <span style="color:var(--text-muted);margin-left:4px">${this.fmtDuration(e.duration_minutes)}</span>
          </div>`;
        }).join('');
        const clickHandler = dayEntries.length === 0
          ? `onclick="TimeTracking.openAddModal('${dStr}', ${hour})"`
          : '';
        return `<td ${clickHandler} style="border:1px solid var(--border);padding:2px;vertical-align:top;height:44px;
          ${dayEntries.length === 0 ? 'cursor:pointer' : ''}"
          ${dayEntries.length === 0 ? `onmouseenter="this.style.background='rgba(255,203,9,0.08)'"` : ''}
          ${dayEntries.length === 0 ? `onmouseleave="this.style.background=''"` : ''}>
          ${blocks}
        </td>`;
      }).join('');
      return `<tr>
        <td style="padding:4px 8px;font-size:11px;color:var(--text-muted);white-space:nowrap;border-right:1px solid var(--border);width:50px">
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
            <select id="tt-duration" class="select">
              <option value="15">15min</option>
              <option value="30">30min</option>
              <option value="45">45min</option>
              <option value="60" selected>1h</option>
              <option value="75">1h 15min</option>
              <option value="90">1h 30min</option>
              <option value="105">1h 45min</option>
              <option value="120">2h</option>
              <option value="135">2h 15min</option>
              <option value="150">2h 30min</option>
              <option value="165">2h 45min</option>
              <option value="180">3h</option>
              <option value="195">3h 15min</option>
              <option value="210">3h 30min</option>
              <option value="225">3h 45min</option>
              <option value="240">4h</option>
              <option value="255">4h 15min</option>
              <option value="270">4h 30min</option>
              <option value="285">4h 45min</option>
              <option value="300">5h</option>
              <option value="315">5h 15min</option>
              <option value="330">5h 30min</option>
              <option value="345">5h 45min</option>
              <option value="360">6h</option>
              <option value="375">6h 15min</option>
              <option value="390">6h 30min</option>
              <option value="405">6h 45min</option>
              <option value="420">7h</option>
              <option value="435">7h 15min</option>
              <option value="450">7h 30min</option>
              <option value="465">7h 45min</option>
              <option value="480">8h</option>
              <option value="540">9h</option>
              <option value="600">10h</option>
              <option value="660">11h</option>
              <option value="720">12h</option>
            </select>
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

    // Construiește timestamp-uri pentru start_time și end_time
    const startDt = new Date(`${dateVal}T${String(startHour).padStart(2,'0')}:${String(startMin).padStart(2,'0')}:00`);
    const endDt = new Date(startDt.getTime() + durationMinutes * 60000);

    // Câmpuri EXACTE din schema Supabase reală (snake_case)
    const entry = {
      user_id: userId,
      date: dateVal,
      start_time: startDt.toISOString(),
      end_time: endDt.toISOString(),
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
      <button class="btn-danger" onclick="TimeTracking.deleteEntry(${id});closeModalForce()">🗑 Șterge</button>
    `);
  },

  async deleteEntry(id) {
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from('time_entries').delete().eq('id', id);
    if (error) { showToast('Eroare la ștergere: ' + error.message, 'error'); return; }
    showToast('Activitate ștearsă', 'success');
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

    // Câmpuri EXACTE din schema Supabase reală (snake_case)
    const entry = {
      user_id: userId,
      date: localDate,
      start_time: startDt.toISOString(),
      end_time: now.toISOString(),
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
