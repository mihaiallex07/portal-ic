// ============================================================
// GoogleCalendarImport — Import evenimente din Google Calendar
// în Time-Tracking cu alocare pe proiect/etapă/task
// Folosește Google Identity Services (GIS) — același pattern ca DriveViewer
// ============================================================
const GoogleCalendarImport = {
  CLIENT_ID: '1079754177727-89qmga68d5r0utsdclspd0tfqldil0og.apps.googleusercontent.com',
  SCOPE: 'https://www.googleapis.com/auth/calendar.readonly',
  _tokenClient: null,
  _accessToken: null,
  _tokenExpiry: 0,
  _pendingResolve: null,

  // ── Inițializare GIS ─────────────────────────────────────────────────────
  async init() {
    return new Promise((resolve) => {
      if (typeof google !== 'undefined' && google.accounts) {
        this._setupTokenClient();
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = () => { this._setupTokenClient(); resolve(); };
      script.onerror = () => resolve();
      document.head.appendChild(script);
    });
  },

  _setupTokenClient() {
    if (!google?.accounts?.oauth2) return;
    this._tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: this.CLIENT_ID,
      scope: this.SCOPE,
      callback: (resp) => {
        if (resp.error) {
          console.error('GIS calendar error:', resp.error);
          if (this._pendingResolve) { this._pendingResolve(null); this._pendingResolve = null; }
          return;
        }
        this._accessToken = resp.access_token;
        this._tokenExpiry = Date.now() + (resp.expires_in - 60) * 1000;
        if (this._pendingResolve) { this._pendingResolve(this._accessToken); this._pendingResolve = null; }
      }
    });
  },

  async getToken(forcePrompt = false) {
    if (!forcePrompt && this._accessToken && Date.now() < this._tokenExpiry) {
      return this._accessToken;
    }
    await this.init();
    if (!this._tokenClient) return null;
    return new Promise((resolve) => {
      this._pendingResolve = resolve;
      this._tokenClient.requestAccessToken({ prompt: forcePrompt ? 'consent' : '' });
    });
  },

  // ── Deschide modalul de import ───────────────────────────────────────────
  async openImportModal() {
    // Încarcă proiectele direct din Supabase (independent de starea TimeTracking)
    const sb = getSupabase();
    let projects = [];
    let allTasks = [];
    let allPhases = [];
    if (sb) {
      const userId = typeof TimeTracking !== 'undefined' ? TimeTracking.getNumericUserId() : (Auth.currentProfile?.id || null);
      const isAdmin = Auth.currentProfile?.role === 'admin';
      const [projRes, memberRes] = await Promise.all([
        sb.from('projects').select('id,name,color,emoji').eq('status', 'activ'),
        userId ? sb.from('project_members').select('project_id,role').eq('user_id', userId) : Promise.resolve({ data: [] }),
      ]);
      const allProjects = projRes.data || [];
      const memberships = memberRes.data || [];
      if (isAdmin) {
        projects = allProjects;
      } else {
        const enrolledIds = new Set(memberships.map(m => m.project_id));
        projects = allProjects.filter(p => enrolledIds.has(p.id));
      }
      if (projects.length > 0) {
        const projectIds = projects.map(p => p.id);
        const [tasksRes, phasesRes] = await Promise.all([
          sb.from('project_tasks').select('id,name,project_id,phase_id,budget_hours,minutes_worked').in('project_id', projectIds).order('display_order'),
          sb.from('project_phases').select('id,name,project_id').in('project_id', projectIds).order('display_order'),
        ]);
        allTasks = tasksRes.data || [];
        allPhases = phasesRes.data || [];
      }
    }

    openModal('Import din Google Calendar', `
      <div style="display:grid;gap:14px">
        <div style="background:var(--bg-secondary);border-radius:8px;padding:12px;font-size:13px;color:var(--text-muted)">
          📅 Importă evenimente din trecutul calendarului tău Google și alocă-le pe proiecte și task-uri.
          Evenimentele importate nu vor suprascrie activitățile existente.
        </div>
        <div class="flex gap-3">
          <div style="flex:1">
            <label class="label">De la data *</label>
            <input type="date" id="gcal-from" class="input" value="${this._defaultFrom()}">
          </div>
          <div style="flex:1">
            <label class="label">Până la data *</label>
            <input type="date" id="gcal-to" class="input" value="${this._defaultTo()}">
          </div>
        </div>
        <div id="gcal-events-container" style="display:none">
          <div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">
            Evenimente găsite — selectează ce vrei să imporți
          </div>
          <div id="gcal-events-list" style="max-height:340px;overflow-y:auto;border:1px solid var(--border);border-radius:8px"></div>
          <div style="margin-top:8px;display:flex;gap:8px">
            <button onclick="GoogleCalendarImport.selectAll(true)" style="background:none;border:none;cursor:pointer;color:var(--primary);font-size:12px;padding:0">Selectează toate</button>
            <span style="color:var(--text-muted)">·</span>
            <button onclick="GoogleCalendarImport.selectAll(false)" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:12px;padding:0">Deselectează toate</button>
          </div>
        </div>
        <div id="gcal-loading" style="display:none;text-align:center;padding:20px;color:var(--text-muted)">
          <div style="font-size:24px;margin-bottom:8px">⏳</div>
          Se încarcă evenimentele...
        </div>
        <div id="gcal-empty" style="display:none;text-align:center;padding:20px;color:var(--text-muted)">
          <div style="font-size:24px;margin-bottom:8px">📭</div>
          Niciun eveniment găsit în intervalul selectat.
        </div>
      </div>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
      <button id="gcal-fetch-btn" class="btn-secondary" onclick="GoogleCalendarImport.fetchEvents()">🔍 Caută evenimente</button>
      <button id="gcal-import-btn" class="btn-brand" style="display:none" onclick="GoogleCalendarImport.importSelected()">⬇ Importă selectate</button>
    `);
    // Stochează proiectele pentru utilizare ulterioară
    this._projects = projects;
    this._tasks = allTasks;
    this._phases = allPhases;
    this._fetchedEvents = [];
  },

  _defaultFrom() {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  },

  _defaultTo() {
    return new Date().toISOString().split('T')[0];
  },

  // ── Fetch evenimente din Google Calendar API ─────────────────────────────
  async fetchEvents() {
    const fromVal = document.getElementById('gcal-from')?.value;
    const toVal = document.getElementById('gcal-to')?.value;
    if (!fromVal || !toVal) { showToast('Selectează intervalul de date', 'error'); return; }
    if (fromVal > toVal) { showToast('Data de start trebuie să fie înainte de data de final', 'error'); return; }

    // Ascunde rezultate anterioare
    const container = document.getElementById('gcal-events-container');
    const loading = document.getElementById('gcal-loading');
    const empty = document.getElementById('gcal-empty');
    const importBtn = document.getElementById('gcal-import-btn');
    if (container) container.style.display = 'none';
    if (loading) loading.style.display = 'block';
    if (empty) empty.style.display = 'none';
    if (importBtn) importBtn.style.display = 'none';

    const token = await this.getToken();
    if (!token) {
      if (loading) loading.style.display = 'none';
      showToast('Nu s-a putut obține accesul la Google Calendar. Încearcă din nou.', 'error');
      return;
    }

    try {
      const timeMin = new Date(fromVal + 'T00:00:00').toISOString();
      const toDate = new Date(toVal + 'T23:59:59');
      const timeMax = toDate.toISOString();

      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}` +
        `&singleEvents=true&orderBy=startTime&maxResults=250`;

      const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (resp.status === 401) {
        this._accessToken = null;
        const newToken = await this.getToken(false);
        if (!newToken) { if (loading) loading.style.display = 'none'; showToast('Eroare autentificare Google', 'error'); return; }
        const resp2 = await fetch(url, { headers: { 'Authorization': `Bearer ${newToken}` } });
        if (!resp2.ok) { if (loading) loading.style.display = 'none'; showToast('Eroare API Google Calendar', 'error'); return; }
        const data2 = await resp2.json();
        this._fetchedEvents = this._parseEvents(data2.items || []);
      } else if (!resp.ok) {
        if (loading) loading.style.display = 'none';
        showToast('Eroare Google Calendar API: ' + resp.status, 'error');
        return;
      } else {
        const data = await resp.json();
        this._fetchedEvents = this._parseEvents(data.items || []);
      }

      if (loading) loading.style.display = 'none';

      if (this._fetchedEvents.length === 0) {
        if (empty) empty.style.display = 'block';
        return;
      }

      this._renderEventsList();
      if (container) container.style.display = 'block';
      if (importBtn) importBtn.style.display = 'inline-flex';

    } catch(e) {
      if (loading) loading.style.display = 'none';
      showToast('Eroare la conectarea cu Google Calendar: ' + e.message, 'error');
    }
  },

  // ── Parsare evenimente ────────────────────────────────────────────────────
  _parseEvents(items) {
    return items
      .filter(ev => ev.status !== 'cancelled' && (ev.start?.dateTime || ev.start?.date))
      .map(ev => {
        const isAllDay = !ev.start?.dateTime;
        const startDt = isAllDay ? new Date(ev.start.date + 'T09:00:00') : new Date(ev.start.dateTime);
        const endDt = isAllDay ? new Date(ev.start.date + 'T10:00:00') : (ev.end?.dateTime ? new Date(ev.end.dateTime) : null);
        const durationMin = endDt ? Math.max(15, Math.round((endDt - startDt) / 60000)) : 60;
        const roundedDuration = Math.round(durationMin / 15) * 15 || 15;
        return {
          id: ev.id,
          title: ev.summary || 'Eveniment fără titlu',
          date: startDt.toISOString().split('T')[0],
          startH: startDt.getHours(),
          startM: startDt.getMinutes(),
          durationMin: roundedDuration,
          isAllDay,
          description: ev.description || '',
          location: ev.location || '',
        };
      });
  },

  // ── Randare lista de evenimente cu checkbox-uri ───────────────────────────
  _renderEventsList() {
    const list = document.getElementById('gcal-events-list');
    if (!list) return;

    const projectOptions = (this._projects || []).map(p =>
      `<option value="${p.id}">${p.emoji || '📁'} ${p.name}</option>`
    ).join('');

    list.innerHTML = this._fetchedEvents.map((ev, idx) => {
      const dateFormatted = ev.date.split('-').reverse().join('/');
      const startStr = String(ev.startH).padStart(2,'0') + ':' + String(ev.startM).padStart(2,'0');
      const h = Math.floor(ev.durationMin / 60);
      const m = ev.durationMin % 60;
      const durStr = h > 0 ? (m > 0 ? `${h}h ${m}min` : `${h}h`) : `${m}min`;

      return `
        <div id="gcal-ev-${idx}" style="padding:10px 12px;border-bottom:1px solid var(--border);transition:background 0.1s"
          onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background=''">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <input type="checkbox" id="gcal-cb-${idx}" checked
              style="width:16px;height:16px;accent-color:var(--brand-dark);flex-shrink:0;margin-top:2px"
              onchange="GoogleCalendarImport.toggleEventRow(${idx}, this.checked)">
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:13px;margin-bottom:2px">${ev.title}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">
                📅 ${dateFormatted} · ⏰ ${startStr} · ⏱ ${durStr}
              </div>
              <div id="gcal-alloc-${idx}" style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
                <select id="gcal-proj-${idx}" class="select" style="font-size:12px"
                  onchange="GoogleCalendarImport.onProjectChange(${idx}, this.value)">
                  <option value="">— Fără proiect —</option>
                  ${projectOptions}
                </select>
                <select id="gcal-task-${idx}" class="select" style="font-size:12px">
                  <option value="">— Selectează task —</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  onProjectChange(idx, projectId) {
    const taskSelect = document.getElementById(`gcal-task-${idx}`);
    if (!taskSelect) return;
    const pid = parseInt(projectId);
    const tasks = (this._tasks || []).filter(t => t.project_id === pid);
    taskSelect.innerHTML = `<option value="">— Selectează task —</option>` +
      tasks.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  },

  toggleEventRow(idx, checked) {
    const alloc = document.getElementById(`gcal-alloc-${idx}`);
    if (alloc) alloc.style.opacity = checked ? '1' : '0.4';
  },

  selectAll(checked) {
    this._fetchedEvents.forEach((_, idx) => {
      const cb = document.getElementById(`gcal-cb-${idx}`);
      if (cb) { cb.checked = checked; this.toggleEventRow(idx, checked); }
    });
  },

  // ── Import evenimente selectate ───────────────────────────────────────────
  async importSelected() {
    const sb = getSupabase();
    if (!sb) { showToast('Eroare: conexiune Supabase indisponibilă', 'error'); return; }
    const userId = typeof TimeTracking !== 'undefined' ? TimeTracking.getNumericUserId() : null;
    if (!userId) { showToast('Utilizator neidentificat', 'error'); return; }

    // Colectează evenimentele selectate
    const toImport = [];
    this._fetchedEvents.forEach((ev, idx) => {
      const cb = document.getElementById(`gcal-cb-${idx}`);
      if (!cb?.checked) return;
      const projectId = document.getElementById(`gcal-proj-${idx}`)?.value || null;
      const taskId = document.getElementById(`gcal-task-${idx}`)?.value || null;
      toImport.push({ ev, projectId, taskId });
    });

    if (toImport.length === 0) { showToast('Selectează cel puțin un eveniment', 'error'); return; }

    // Verifică existența pentru a nu suprascrie
    const btn = document.getElementById('gcal-import-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Se importă...'; }

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const { ev, projectId, taskId } of toImport) {
      try {
        // Verifică dacă există deja o activitate cu același gcal_event_id
        const { data: existing } = await sb.from('time_entries')
          .select('id')
          .eq('user_id', userId)
          .eq('date', ev.date)
          .eq('task_name', ev.title)
          .limit(1);

        if (existing && existing.length > 0) {
          skipped++;
          continue;
        }

        const startTimeStr = String(ev.startH).padStart(2,'0') + ':' + String(ev.startM).padStart(2,'0') + ':00';
        const endTotalMin = ev.startH * 60 + ev.startM + ev.durationMin;
        const endH = Math.floor(endTotalMin / 60) % 24;
        const endM = endTotalMin % 60;
        const endTimeStr = String(endH).padStart(2,'0') + ':' + String(endM).padStart(2,'0') + ':00';

        const entry = {
          user_id: userId,
          date: ev.date,
          start_time: startTimeStr,
          end_time: endTimeStr,
          duration_minutes: ev.durationMin,
          task_name: ev.title,
          project_id: projectId ? parseInt(projectId) : null,
          project_task_id: taskId ? parseInt(taskId) : null,
          source: 'google_calendar',
          gcal_event_id: ev.id,
        };

        const { error } = await sb.from('time_entries').insert(entry);
        if (error) {
          console.error('Import error for event', ev.id, error);
          errors++;
        } else {
          imported++;
          // Actualizează minutes_worked pe task
          if (taskId) {
            const task = (this._tasks || []).find(t => String(t.id) === String(taskId));
            if (task) {
              const newMin = (task.minutes_worked || 0) + ev.durationMin;
              await sb.from('project_tasks').update({ minutes_worked: newMin }).eq('id', parseInt(taskId));
              task.minutes_worked = newMin;
            }
          }
        }
      } catch(e) {
        console.error('Import exception:', e);
        errors++;
      }
    }

    closeModalForce();

    let msg = `✅ ${imported} eveniment${imported !== 1 ? 'e' : ''} importat${imported !== 1 ? 'e' : ''}`;
    if (skipped > 0) msg += ` · ${skipped} omis${skipped !== 1 ? 'e' : ''} (deja există)`;
    if (errors > 0) msg += ` · ${errors} erori`;
    showToast(msg, imported > 0 ? 'success' : 'warning');

    // Reîncarcă time-tracking
    if (typeof TimeTracking !== 'undefined') {
      await TimeTracking.loadData();
      TimeTracking.renderPage();
    }
  },
};
