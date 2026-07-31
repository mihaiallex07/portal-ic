// ============================================================
// Evenimente Firmă — Portal Inginerie Creativă
// CRUD complet, recurentă, participanți, ore lucrate, notificări
// ============================================================
const Evenimente = {
  events: [],
  currentView: 'list', // 'list' | 'calendar'
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  filterStatus: 'upcoming', // 'upcoming' | 'past' | 'all'

  async render() {
    const content = document.getElementById('page-content');
    content.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>Se încarcă evenimentele...</p></div>`;
    await this.loadEvents();
    this.renderPage();
  },

  async loadEvents() {
    // Încarcă evenimentele din ultimele 3 luni până în viitor (6 luni)
    const from = new Date();
    from.setMonth(from.getMonth() - 1);
    const to = new Date();
    to.setMonth(to.getMonth() + 6);
    const { data, error } = await DB.getCompanyEvents(
      from.toISOString().split('T')[0],
      to.toISOString().split('T')[0]
    );
    this.events = data || [];
  },

  renderPage() {
    const profile = Auth.currentProfile;
    const isAdmin = profile?.role === 'admin';
    const isCoord = profile?.role === 'coordonator';
    const canManage = isAdmin || isCoord;
    const userId = Auth.currentUser?.id;
    const today = new Date().toISOString().split('T')[0];

    let filtered = [...this.events];
    if (this.filterStatus === 'upcoming') filtered = filtered.filter(e => e.event_date >= today);
    else if (this.filterStatus === 'past') filtered = filtered.filter(e => e.event_date < today);

    // Hide recurring event instances - show only parent events
    const displayEvents = filtered.filter(e => !e.parent_event_id);

    // Grupează pe luni
    const grouped = {};
    for (const ev of displayEvents) {
      const d = new Date(ev.event_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(ev);
    }

    const monthNames = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'];

    const groupedHtml = Object.keys(grouped).sort().map(key => {
      const [yr, mo] = key.split('-');
      const label = `${monthNames[parseInt(mo) - 1]} ${yr}`;
      const evHtml = grouped[key].map(ev => this._renderEventCard(ev, userId, canManage)).join('');
      return `
        <div style="margin-bottom:32px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:12px;padding-left:4px">${label}</div>
          <div style="display:flex;flex-direction:column;gap:10px">${evHtml}</div>
        </div>
      `;
    }).join('');

    document.getElementById('page-content').innerHTML = `
      <div style="max-width:900px;margin:0 auto;padding:0 8px">
        <div class="page-header" style="margin-bottom:24px">
          <div>
            <h1 class="page-title">Evenimente Firmă</h1>
            <p class="page-subtitle">Calendarul evenimentelor interne Inginerie Creativă</p>
          </div>
          <div class="flex gap-2 items-center flex-wrap">
            ${isAdmin ? `<button class="btn-secondary" onclick="Evenimente.openBulkDeleteModal()" style="background:#fee2e2;color:#dc2626;border:1.5px solid #fca5a5">🗑️ Ștergere în masă</button>` : ''}
            ${canManage ? `<button class="btn-primary" onclick="Evenimente.openCreateModal()">+ Eveniment nou</button>` : ''}
          </div>
        </div>

        <!-- Filtre -->
        <div style="display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap">
          ${['upcoming','past','all'].map(f => `
            <button onclick="Evenimente.setFilter('${f}')" style="padding:6px 16px;border-radius:20px;font-size:13px;font-weight:500;border:1.5px solid ${this.filterStatus === f ? 'var(--brand)' : 'var(--border)'};background:${this.filterStatus === f ? 'var(--brand)' : 'transparent'};color:${this.filterStatus === f ? '#000' : 'var(--text)'};cursor:pointer;transition:all .15s">
              ${{ upcoming: 'Viitoare', past: 'Trecute', all: 'Toate' }[f]}
            </button>
          `).join('')}
        </div>

        <!-- Lista evenimente -->
        <div id="events-list">
          ${displayEvents.length === 0 ? `
            <div style="text-align:center;padding:60px 20px;color:var(--text-muted)">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin:0 auto 16px;display:block;opacity:.4"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <p style="font-size:15px;font-weight:500">Niciun eveniment ${this.filterStatus === 'upcoming' ? 'viitor' : this.filterStatus === 'past' ? 'trecut' : ''}</p>
              ${canManage ? `<button class="btn-primary" style="margin-top:16px" onclick="Evenimente.openCreateModal()">Creează primul eveniment</button>` : ''}
            </div>
          ` : groupedHtml}
        </div>
      </div>
    `;
  },

  _renderEventCard(ev, userId, canManage) {
    const today = new Date().toISOString().split('T')[0];
    const isPast = ev.event_date < today;
    const isToday = ev.event_date === today;
    const d = new Date(ev.event_date + 'T00:00:00');
    const dayNames = ['Duminică','Luni','Marți','Miercuri','Joi','Vineri','Sâmbătă'];
    const dayName = dayNames[d.getDay()];
    const dayNum = d.getDate();
    const monthShort = ['Ian','Feb','Mar','Apr','Mai','Iun','Iul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];

    const myParticipation = ev.event_participants?.find(p => p.user_id === userId);
    const statusBadge = {
      pending: { label: 'Neconfirmat', color: '#f59e0b', bg: '#fef3c7' },
      accepted: { label: 'Particip', color: '#10b981', bg: '#d1fae5' },
      declined: { label: 'Nu particip', color: '#ef4444', bg: '#fee2e2' },
      attended: { label: 'Prezent', color: '#6366f1', bg: '#e0e7ff' },
    };
    const myStatus = myParticipation ? (statusBadge[myParticipation.status] || statusBadge.pending) : null;

    const audienceLabel = {
      all: 'Toată echipa',
      department: `Dep: ${(ev.audience_departments || []).join(', ')}`,
      role: `Rol: ${(ev.audience_roles || []).join(', ')}`,
      custom: 'Persoane selectate',
    }[ev.audience_type] || 'Toată echipa';

    const participantCount = ev.event_participants?.length || 0;

    return `
      <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:16px 20px;display:flex;gap:16px;align-items:flex-start;transition:box-shadow .15s;${isPast ? 'opacity:.7' : ''}${isToday ? 'border-left:3px solid var(--brand)' : ''}" onmouseenter="this.style.boxShadow='0 4px 16px rgba(0,0,0,.08)'" onmouseleave="this.style.boxShadow='none'">
        <!-- Data -->
        <div style="flex-shrink:0;width:52px;text-align:center;background:${isToday ? 'var(--brand)' : 'var(--bg-secondary)'};border-radius:10px;padding:8px 4px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:${isToday ? '#000' : 'var(--text-muted)'};letter-spacing:.5px">${monthShort}</div>
          <div style="font-size:22px;font-weight:800;color:${isToday ? '#000' : 'var(--text)'};line-height:1.1">${dayNum}</div>
          <div style="font-size:10px;color:${isToday ? '#000' : 'var(--text-muted)'}">${dayName.slice(0,3)}</div>
        </div>

        <!-- Conținut -->
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;margin-bottom:6px">
            <span style="font-size:15px;font-weight:700;color:var(--text)">${ev.title}</span>
            ${ev.is_recurring ? `<span style="font-size:11px;background:#e0e7ff;color:#6366f1;padding:2px 8px;border-radius:10px;font-weight:600">↻ Recurent</span>` : ''}
            ${ev.is_mandatory ? `<span style="font-size:11px;background:#fee2e2;color:#ef4444;padding:2px 8px;border-radius:10px;font-weight:600">Obligatoriu</span>` : ''}
            ${isToday ? `<span style="font-size:11px;background:var(--brand);color:#000;padding:2px 8px;border-radius:10px;font-weight:700">AZI</span>` : ''}
          </div>

          <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px">
            <span style="font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:4px">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              ${ev.start_time ? new Date(ev.start_time).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit',hour12:false}) : ''} – ${ev.end_time ? new Date(ev.end_time).toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit',hour12:false}) : ''}
            </span>
            ${ev.location ? `<span style="font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:4px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${ev.location}</span>` : ''}
            <span style="font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:4px">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              ${audienceLabel} ${participantCount > 0 ? `(${participantCount})` : ''}
            </span>
          </div>

          ${ev.description ? `<p style="font-size:13px;color:var(--text-muted);margin:0 0 8px;line-height:1.5">${ev.description}</p>` : ''}

          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            ${ev.meeting_link ? `<a href="${ev.meeting_link}" target="_blank" style="font-size:12px;font-weight:600;color:var(--brand-dark);text-decoration:none;display:flex;align-items:center;gap:4px;padding:4px 10px;border:1px solid var(--brand);border-radius:6px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.82v6.36a1 1 0 0 1-1.447.89L15 14M3 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z"/></svg>Intră în meeting</a>` : ''}
            ${myStatus ? `<span style="font-size:12px;font-weight:600;padding:4px 10px;border-radius:6px;background:${myStatus.bg};color:${myStatus.color}">${myStatus.label}</span>` : ''}
            ${myParticipation && myParticipation.status === 'pending' && !isPast ? `
              <button onclick="Evenimente.respondToEvent(${ev.id}, 'accepted')" style="font-size:12px;padding:4px 10px;border-radius:6px;background:#d1fae5;color:#10b981;border:none;cursor:pointer;font-weight:600">✓ Confirm</button>
              <button onclick="Evenimente.openDeclineModal(${ev.id})" style="font-size:12px;padding:4px 10px;border-radius:6px;background:#fee2e2;color:#ef4444;border:none;cursor:pointer;font-weight:600">✗ Nu pot</button>
            ` : ''}
            ${canManage ? `
              <button onclick="Evenimente.openEditModal(Number('${ev.id}'))" style="font-size:12px;padding:4px 10px;border-radius:6px;background:var(--bg-secondary);color:var(--text-muted);border:1px solid var(--border);cursor:pointer;margin-left:auto">Editează</button>
              <button onclick="Evenimente.openParticipantsModal(${ev.id})" style="font-size:12px;padding:4px 10px;border-radius:6px;background:var(--bg-secondary);color:var(--text-muted);border:1px solid var(--border);cursor:pointer">Participanți</button>
              <button onclick="Evenimente.confirmCancel(${ev.id})" style="font-size:12px;padding:4px 10px;border-radius:6px;background:#fee2e2;color:#ef4444;border:1px solid #fca5a5;cursor:pointer">Anulează</button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  },

  setFilter(f) {
    this.filterStatus = f;
    this.renderPage();
  },

  // ── MODAL CREARE / EDITARE ─────────────────────────────────
  openCreateModal() {
    this._openEventModal(null);
  },
  async openEditModal(id) {
    const { data, error } = await DB.getCompanyEventById(id);
    if (error) { showToast('Eroare la încărcare: ' + error.message, 'error'); return; }
    if (!data) { showToast('Evenimentul nu a fost găsit', 'error'); return; }
    this._openEventModal(data);
  },

  _openEventModal(ev) {
    const isEdit = !!ev;
    const today = new Date().toISOString().split('T')[0];
    const profile = Auth.currentProfile;
    const isAdmin = profile?.role === 'admin';

    const modal = document.createElement('div');
    modal.id = 'event-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';

    // Calculăm orele ÎNAINTE de template pentru a evita nested template literals
    const _stRaw = ev && ev.start_time ? new Date(ev.start_time).toLocaleTimeString('ro-RO', {hour:'2-digit',minute:'2-digit',hour12:false}) : '09:00';
    const _etRaw = ev && ev.end_time ? new Date(ev.end_time).toLocaleTimeString('ro-RO', {hour:'2-digit',minute:'2-digit',hour12:false}) : '10:00';
    const _sH = (_stRaw.split(':')[0] || '09').padStart(2,'0');
    const _sM = (_stRaw.split(':')[1] || '00').padStart(2,'0');
    const _eH = (_etRaw.split(':')[0] || '10').padStart(2,'0');
    const _eM = (_etRaw.split(':')[1] || '00').padStart(2,'0');
    const _sHOpts = Array.from({length:24},(_,h)=>{ const v=String(h).padStart(2,'0'); return '<option value="'+v+'"'+(_sH===v?' selected':'')+'>'+v+'</option>'; }).join('');
    const _sMOpts = [0,5,10,15,20,25,30,35,40,45,50,55].map(m=>{ const v=String(m).padStart(2,'0'); return '<option value="'+v+'"'+(_sM===v?' selected':'')+'>'+v+'</option>'; }).join('');
    const _eHOpts = Array.from({length:24},(_,h)=>{ const v=String(h).padStart(2,'0'); return '<option value="'+v+'"'+(_eH===v?' selected':'')+'>'+v+'</option>'; }).join('');
    const _eMOpts = [0,5,10,15,20,25,30,35,40,45,50,55].map(m=>{ const v=String(m).padStart(2,'0'); return '<option value="'+v+'"'+(_eM===v?' selected':'')+'>'+v+'</option>'; }).join('');
    modal.innerHTML = `
      <div style="background:var(--card-bg);border-radius:16px;padding:28px;width:100%;max-width:600px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <h2 style="font-size:18px;font-weight:700;margin:0">${isEdit ? 'Editează eveniment' : 'Eveniment nou'}</h2>
          <button onclick="document.getElementById('event-modal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted)">✕</button>
        </div>

        <div style="display:flex;flex-direction:column;gap:14px">
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Titlu eveniment *</label>
            <input id="ev-title" type="text" placeholder="ex: Ședință săptămânală" value="${ev?.title || ''}" style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);box-sizing:border-box">
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Data *</label>
              <input id="ev-date" type="date" value="${ev?.event_date || today}" min="${today}" style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);box-sizing:border-box">
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Ora start *</label>
              <div style="display:flex;gap:4px;align-items:center">
                <select id="ev-start-h" style="flex:1;padding:10px 8px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);cursor:pointer">${_sHOpts}</select>
                <span style="font-weight:700;color:var(--text-muted)">:</span>
                <select id="ev-start-m" style="flex:1;padding:10px 8px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);cursor:pointer">${_sMOpts}</select>
              </div>
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Ora final *</label>
              <div style="display:flex;gap:4px;align-items:center">
                <select id="ev-end-h" style="flex:1;padding:10px 8px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);cursor:pointer">${_eHOpts}</select>
                <span style="font-weight:700;color:var(--text-muted)">:</span>
                <select id="ev-end-m" style="flex:1;padding:10px 8px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);cursor:pointer">${_eMOpts}</select>
              </div>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Locație</label>
              <input id="ev-location" type="text" placeholder="ex: Sala de ședințe, Online" value="${ev?.location || ''}" style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);box-sizing:border-box">
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Link meeting (Zoom/Meet/Teams)</label>
              <input id="ev-link" type="url" placeholder="https://..." value="${ev?.meeting_link || ''}" style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);box-sizing:border-box">
            </div>
          </div>

          <div>
            <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Descriere</label>
            <textarea id="ev-desc" rows="3" placeholder="Detalii despre eveniment..." style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);box-sizing:border-box;resize:vertical">${ev?.description || ''}</textarea>
          </div>

          <!-- Audiență -->
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:8px">Participanți</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${['all','role','custom'].map(t => `
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:6px 12px;border:1.5px solid ${(ev?.audience_type || 'all') === t ? 'var(--brand)' : 'var(--border)'};border-radius:8px;font-size:13px;font-weight:500">
                  <input type="radio" name="ev-audience" value="${t}" ${(ev?.audience_type || 'all') === t ? 'checked' : ''} onchange="Evenimente._toggleAudienceOptions(this.value)" style="accent-color:var(--brand)">
                  ${{ all: 'Toată echipa', role: 'După rol', custom: 'Persoane specifice' }[t]}
                </label>
              `).join('')}
            </div>
            <div id="ev-audience-options" style="margin-top:10px"></div>
          </div>

          <!-- Opțiuni -->
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:500">
              <input type="checkbox" id="ev-mandatory" ${ev?.is_mandatory !== false ? 'checked' : ''} style="accent-color:var(--brand);width:16px;height:16px">
              Eveniment obligatoriu
            </label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:500">
              <input type="checkbox" id="ev-work-hours" ${ev?.count_as_work_hours !== false ? 'checked' : ''} style="accent-color:var(--brand);width:16px;height:16px">
              Contorizează în ore lucrate
            </label>
          </div>

          <!-- Recurentă -->
          <div style="border:1.5px solid var(--border);border-radius:10px;padding:14px">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:600;margin-bottom:0">
              <input type="checkbox" id="ev-recurring" ${ev?.is_recurring ? 'checked' : ''} onchange="Evenimente._toggleRecurrence(this.checked)" style="accent-color:var(--brand);width:16px;height:16px">
              Eveniment recurent
            </label>
            <div id="ev-recurrence-options" style="display:${ev?.is_recurring ? 'block' : 'none'};margin-top:12px">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div>
                  <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Frecvență</label>
                  <select id="ev-rec-type" style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text)">
                    <option value="daily" ${ev?.recurrence_type === 'daily' ? 'selected' : ''}>Zilnic</option>
                    <option value="weekly" ${ev?.recurrence_type === 'weekly' ? 'selected' : ''}>Săptămânal</option>
                    <option value="monthly" ${ev?.recurrence_type === 'monthly' ? 'selected' : ''}>Lunar</option>
                  </select>
                </div>
                <div>
                  <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Data de final</label>
                  <input id="ev-rec-end" type="date" value="${ev?.recurrence_end_date || ''}" style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);box-sizing:border-box">
                </div>
              </div>
              <div style="margin-top:10px">
                <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px">Zile (pentru recurentă săptămânală)</label>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  ${['Lu','Ma','Mi','Jo','Vi','Sâ','Du'].map((d, i) => `
                    <label style="display:flex;align-items:center;gap:4px;cursor:pointer;padding:4px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:12px;font-weight:600">
                      <input type="checkbox" name="ev-rec-day" value="${i + 1}" ${(ev?.recurrence_days || []).includes(i + 1) ? 'checked' : ''} style="accent-color:var(--brand)">
                      ${d}
                    </label>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- Reminder email -->
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:500">
              <input type="checkbox" id="ev-reminder" checked style="accent-color:var(--brand);width:16px;height:16px">
              Trimite notificare participanților
            </label>
          </div>
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
          <button onclick="document.getElementById('event-modal').remove()" style="padding:10px 20px;border:1.5px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:14px;font-weight:500">Anulează</button>
          <button onclick="Evenimente.saveEvent(${ev?.id || 'null'})" style="padding:10px 24px;border:none;border-radius:8px;background:var(--brand);color:#000;cursor:pointer;font-size:14px;font-weight:700">${isEdit ? 'Salvează' : 'Creează eveniment'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    // Inițializează opțiunile de audiență
    this._toggleAudienceOptions(ev?.audience_type || 'all', ev);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  },

  _toggleRecurrence(checked) {
    const opts = document.getElementById('ev-recurrence-options');
    if (opts) opts.style.display = checked ? 'block' : 'none';
  },

  async _toggleAudienceOptions(type, ev) {
    const container = document.getElementById('ev-audience-options');
    if (!container) return;
    if (type === 'all') {
      container.innerHTML = '';
      return;
    }
    if (type === 'role') {
      container.innerHTML = `
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${['admin','coordonator','angajat'].map(r => `
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;padding:5px 12px;border:1.5px solid var(--border);border-radius:6px">
              <input type="checkbox" name="ev-role" value="${r}" ${(ev?.audience_roles || []).includes(r) ? 'checked' : ''} style="accent-color:var(--brand)">
              ${r.charAt(0).toUpperCase() + r.slice(1)}
            </label>
          `).join('')}
        </div>
      `;
      return;
    }
    if (type === 'custom') {
      const { data: users } = await DB.getUsers();
      const allUsers = users || [];
      container.innerHTML = `
        <div style="max-height:180px;overflow-y:auto;border:1.5px solid var(--border);border-radius:8px;padding:8px">
          ${allUsers.map(u => `
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 8px;border-radius:6px;font-size:13px" onmouseenter="this.style.background='var(--bg-secondary)'" onmouseleave="this.style.background='transparent'">
              <input type="checkbox" name="ev-user" value="${u.id}" ${(ev?.audience_user_ids || []).includes(u.id) ? 'checked' : ''} style="accent-color:var(--brand)">
              <span style="font-weight:500">${u.full_name || u.email}</span>
              <span style="color:var(--text-muted);font-size:11px">${u.department || ''}</span>
            </label>
          `).join('')}
        </div>
      `;
    }
  },

  async saveEvent(editId) {
    const title = document.getElementById('ev-title')?.value?.trim();
    const eventDate = document.getElementById('ev-date')?.value;
    const _sh = document.getElementById('ev-start-h')?.value || '09';
    const _sm = document.getElementById('ev-start-m')?.value || '00';
    const startTime = _sh + ':' + _sm;
    const _eh = document.getElementById('ev-end-h')?.value || '10';
    const _em = document.getElementById('ev-end-m')?.value || '00';
    const endTime = _eh + ':' + _em;
    if (!title || !eventDate || !startTime || !endTime) {
      showToast('Completează câmpurile obligatorii: titlu, dată, ore', 'error');
      return;
    }
    if (startTime >= endTime) {
      showToast('Ora de final trebuie să fie după ora de start', 'error');
      return;
    }

    const audienceType = document.querySelector('input[name="ev-audience"]:checked')?.value || 'all';
    const audienceRoles = [...document.querySelectorAll('input[name="ev-role"]:checked')].map(i => i.value);
    const audienceUserIds = [...document.querySelectorAll('input[name="ev-user"]:checked')].map(i => i.value);
    const isRecurring = document.getElementById('ev-recurring')?.checked || false;
    const recurrenceType = document.getElementById('ev-rec-type')?.value || null;
    const recurrenceEndDate = document.getElementById('ev-rec-end')?.value || null;
    const recurrenceDays = [...document.querySelectorAll('input[name="ev-rec-day"]:checked')].map(i => parseInt(i.value));
    const sendNotif = document.getElementById('ev-reminder')?.checked !== false;

    const payload = {
      title,
      event_date: eventDate,
      start_time: `${eventDate}T${startTime}:00+03:00`,
      end_time: `${eventDate}T${endTime}:00+03:00`,
      location: document.getElementById('ev-location')?.value?.trim() || null,
      meeting_link: document.getElementById('ev-link')?.value?.trim() || null,
      description: document.getElementById('ev-desc')?.value?.trim() || null,
      is_mandatory: document.getElementById('ev-mandatory')?.checked !== false,
      count_as_work_hours: document.getElementById('ev-work-hours')?.checked !== false,
      audience_type: audienceType,
      audience_roles: audienceRoles.length > 0 ? audienceRoles : null,
      audience_user_ids: audienceUserIds.length > 0 ? audienceUserIds : null,
      is_recurring: isRecurring,
      recurrence_type: isRecurring ? recurrenceType : null,
      recurrence_end_date: isRecurring && recurrenceEndDate ? recurrenceEndDate : null,
      recurrence_days: isRecurring && recurrenceDays.length > 0 ? recurrenceDays : null,
      created_by: Auth.currentUser?.id,
      status: 'active',
    };

    let savedEventId = editId;
    if (editId) {
      const { error } = await DB.updateCompanyEvent(editId, payload);
      if (error) { showToast('Eroare la salvare: ' + error.message, 'error'); return; }
    } else {
      const { data, error } = await DB.createCompanyEvent(payload);
      if (error) { showToast('Eroare la creare: ' + error.message, 'error'); return; }
      savedEventId = data?.id;
    }

    document.getElementById('event-modal')?.remove();

    // Adaugă participanți și trimite notificări
    if (savedEventId) {
      await this._setupParticipantsAndNotify(savedEventId, payload, sendNotif, !editId);
      // Dacă e recurent, generează instanțele
      if (!editId && isRecurring && recurrenceEndDate) {
        await this._generateRecurringInstances(savedEventId, payload);
      }
    }

    showToast(editId ? 'Eveniment actualizat!' : 'Eveniment creat cu succes!', 'success');
    await this.loadEvents();
    this.renderPage();
  },

  async _setupParticipantsAndNotify(eventId, payload, sendNotif, isNew) {
    try {
      const { data: users } = await DB.getUsers();
      const allUsers = users || [];
      let targetUsers = [];

      if (payload.audience_type === 'all') {
        targetUsers = allUsers;
      } else if (payload.audience_type === 'role' && payload.audience_roles?.length) {
        targetUsers = allUsers.filter(u => payload.audience_roles.includes(u.role));
      } else if (payload.audience_type === 'custom' && payload.audience_user_ids?.length) {
        targetUsers = allUsers.filter(u => payload.audience_user_ids.includes(u.id));
      }

      if (targetUsers.length > 0) {
        const userIds = targetUsers.map(u => u.id);
        await DB.addEventParticipants(eventId, userIds);

        // Notificări în portal
        if (sendNotif && isNew) {
          const sb = getSupabase();
          const currentUserId = Auth.currentUser?.id;
          const notifRows = targetUsers
            .filter(u => u.id !== currentUserId)
            .map(u => ({
              user_id: u.id,
              type: 'event',
              title: `📅 Eveniment nou: ${payload.title}`,
              message: `${payload.event_date} • ${payload.start_time?.slice(0,5)}–${payload.end_time?.slice(0,5)}${payload.location ? ' • ' + payload.location : ''}`,
              link: '#evenimente',
              is_read: false,
            }));
          if (notifRows.length > 0) {
            await sb.from('notifications').insert(notifRows);
            // Actualizează badge notificări
            if (typeof updateNotifBadge === 'function') updateNotifBadge();
          }
        }
      }
    } catch(e) { console.warn('Setup participants error:', e); }
  },

    async _generateRecurringInstances(parentId, payload) {
    try {
      const startDate = new Date(payload.event_date + 'T00:00:00');
      const endDate = new Date(payload.recurrence_end_date + 'T00:00:00');
      const instances = [];
      let current = new Date(startDate);
      let count = 0;

      // Funcție de avansare în funcție de tip
      const advance = () => {
        if (payload.recurrence_type === 'daily') {
          current.setDate(current.getDate() + 1);
        } else if (payload.recurrence_type === 'weekly') {
          // Pentru weekly avansăm zi cu zi și verificăm ziua
          current.setDate(current.getDate() + 1);
        } else if (payload.recurrence_type === 'monthly') {
          current.setMonth(current.getMonth() + 1);
        }
      };

      // Avansează prima dată pentru a nu duplica evenimentul principal
      advance();

      while (current <= endDate && count < 500) {
        count++;
        const dateStr = current.toISOString().split('T')[0];

        // Pentru weekly: verifică dacă ziua curentă e în lista de zile selectate
        if (payload.recurrence_type === 'weekly') {
          const dayOfWeek = current.getDay() === 0 ? 7 : current.getDay(); // 1=Lu..7=Du
          if (!payload.recurrence_days?.length || payload.recurrence_days.includes(dayOfWeek)) {
            instances.push({
              ...payload,
              event_date: dateStr,
              recurrence_parent_id: parentId,
              is_instance: true,
              is_recurring: false,
            });
          }
          advance();
          continue;
        }

        instances.push({
          ...payload,
          event_date: dateStr,
          recurrence_parent_id: parentId,
          is_instance: true,
          is_recurring: false,
        });
        advance();
      }

      // Inserează în batch-uri de 50
      const sb = getSupabase();
      for (let i = 0; i < instances.length; i += 50) {
        await sb.from('company_events').insert(instances.slice(i, i + 50));
      }
    } catch(e) { console.warn('Recurring instances error:', e); }
  },

  // ── RĂSPUNS PARTICIPARE ────────────────────────────────────
  async respondToEvent(eventId, status, declineReason) {
    const userId = Auth.currentUser?.id;
    if (!userId) return;
    const { error } = await DB.upsertEventParticipant(eventId, userId, status, declineReason);
    if (error) { showToast('Eroare la confirmare: ' + error.message, 'error'); return; }

    // Dacă confirm participarea la un eveniment cu count_as_work_hours=true, înregistrează ore
    if (status === 'accepted') {
      try {
        const ev = this.events.find(e => e.id === eventId);
        if (ev && ev.count_as_work_hours && ev.start_time && ev.end_time) {
          const startDt = new Date(ev.start_time);
          const endDt = new Date(ev.end_time);
          const durationMin = Math.round((endDt - startDt) / 60000);
          if (durationMin > 0) {
            const sb = getSupabase();
            // Verifică dacă nu există deja o intrare pentru acest eveniment
            const { data: existing } = await sb.from('time_entries')
              .select('id')
              .eq('user_id', userId)
              .eq('date', ev.event_date)
              .eq('task_name', ev.title)
              .eq('activity_type', 'meeting')
              .limit(1);
            if (!existing || existing.length === 0) {
              await DB.createTimeEntry({
                user_id: userId,
                date: ev.event_date,
                task_name: ev.title,
                activity_type: 'meeting',
                duration_minutes: durationMin,
                start_time: ev.start_time,
                end_time: ev.end_time,
                description: `Eveniment firmă: ${ev.title}`,
                is_billable: false,
                status: 'approved',
              });
            }
          }
        }
      } catch(e) { console.warn('Time entry event error:', e); }
    }

    showToast(status === 'accepted' ? '✓ Participare confirmată! Orele au fost înregistrate automat.' : '✗ Răspuns înregistrat', 'success');
    await this.loadEvents();
    this.renderPage();
  },

  openDeclineModal(eventId) {
    const modal = document.createElement('div');
    modal.id = 'decline-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';
    modal.innerHTML = `
      <div style="background:var(--card-bg);border-radius:12px;padding:24px;width:100%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,.2)">
        <h3 style="margin:0 0 12px;font-size:16px;font-weight:700">Motiv absență</h3>
        <textarea id="decline-reason" rows="3" placeholder="Motivul pentru care nu poți participa (opțional)..." style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);box-sizing:border-box;resize:vertical"></textarea>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
          <button onclick="document.getElementById('decline-modal').remove()" style="padding:8px 16px;border:1.5px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:13px">Anulează</button>
          <button onclick="Events_declineConfirm(${eventId})" style="padding:8px 16px;border:none;border-radius:8px;background:#ef4444;color:#fff;cursor:pointer;font-size:13px;font-weight:600">Confirmă absența</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  },

  // ── MODAL PARTICIPANȚI ─────────────────────────────────────
  async openParticipantsModal(eventId) {
    const { data: participants } = await DB.getEventParticipants(eventId);
    const ev = this.events.find(e => e.id === eventId);
    const statusLabels = { pending: 'Neconfirmat', accepted: 'Participă', declined: 'Absent', attended: 'Prezent' };
    const statusColors = { pending: '#f59e0b', accepted: '#10b981', declined: '#ef4444', attended: '#6366f1' };

    const modal = document.createElement('div');
    modal.id = 'participants-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';
    modal.innerHTML = `
      <div style="background:var(--card-bg);border-radius:16px;padding:24px;width:100%;max-width:500px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="margin:0;font-size:16px;font-weight:700">Participanți — ${ev?.title || ''}</h3>
          <button onclick="document.getElementById('participants-modal').remove()" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--text-muted)">✕</button>
        </div>
        ${(participants || []).length === 0 ? '<p style="color:var(--text-muted);text-align:center;padding:20px">Niciun participant înregistrat</p>' : `
          <div style="display:flex;flex-direction:column;gap:8px">
            ${(participants || []).map(p => `
              <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--border);border-radius:8px">
                <div style="width:36px;height:36px;border-radius:50%;background:var(--brand);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0">${(p.profiles?.full_name || 'U').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;font-weight:600">${p.profiles?.full_name || 'Utilizator'}</div>
                  ${p.decline_reason ? `<div style="font-size:11px;color:var(--text-muted)">${p.decline_reason}</div>` : ''}
                </div>
                <span style="font-size:11px;font-weight:600;padding:3px 8px;border-radius:10px;background:${statusColors[p.status] || '#f59e0b'}20;color:${statusColors[p.status] || '#f59e0b'}">${statusLabels[p.status] || 'Neconfirmat'}</span>
              </div>
            `).join('')}
          </div>
        `}
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end">
          <button onclick="document.getElementById('participants-modal').remove()" style="padding:8px 16px;border:1.5px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:13px">Închide</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  },

  // ── ANULARE EVENIMENT ──────────────────────────────────────
  confirmCancel(id) {
    if (!confirm('Ești sigur că vrei să anulezi acest eveniment? Participanții vor fi notificați.')) return;
    this.cancelEvent(id);
  },
  async cancelEvent(id) {
    const { error } = await DB.cancelCompanyEvent(id);
    if (error) { showToast('Eroare: ' + error.message, 'error'); return; }
    // Notifică participanții
    try {
      const ev = this.events.find(e => e.id === id);
      const { data: parts } = await DB.getEventParticipants(id);
      if (parts?.length) {
        const sb = getSupabase();
        const currentUserId = Auth.currentUser?.id;
        const notifRows = parts
          .filter(p => p.user_id !== currentUserId)
          .map(p => ({
            user_id: p.user_id,
            type: 'event',
            title: `❌ Eveniment anulat: ${ev?.title || ''}`,
            message: `Evenimentul din ${ev?.event_date || ''} a fost anulat.`,
            link: '#evenimente',
            is_read: false,
          }));
        if (notifRows.length > 0) await sb.from('notifications').insert(notifRows);
      }
    } catch(e) {}
    showToast('Eveniment anulat', 'success');
    await this.loadEvents();
    this.renderPage();
  },

  openBulkDeleteModal() {
    const isAdmin = Auth.currentProfile?.role === 'admin';
    if (!isAdmin) { showToast('Doar adminii pot șterge în masă', 'error'); return; }
    
    const modal = document.createElement('div');
    modal.id = 'bulk-delete-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto';
    
    const allEvents = this.events.sort((a, b) => new Date(b.event_date) - new Date(a.event_date));
    
    modal.innerHTML = `
      <div style="background:var(--card-bg);border-radius:16px;padding:24px;width:100%;max-width:600px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.2)">
        <h3 style="margin:0 0 16px;font-size:18px;font-weight:700">Ștergere în masă — Evenimente</h3>
        
        <!-- Search box -->
        <input type="text" id="bulk-delete-search" placeholder="Caută după titlu..." style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--card-bg);color:var(--text-primary);margin-bottom:12px;box-sizing:border-box" onkeyup="Evenimente._filterBulkDeleteEvents()">
        
        <!-- Select all / None buttons -->
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <button onclick="Evenimente._selectAllBulkDelete(true)" style="flex:1;padding:8px 12px;border:1.5px solid var(--border);border-radius:6px;background:transparent;color:var(--text);cursor:pointer;font-size:13px;font-weight:600">✓ Selectează tot</button>
          <button onclick="Evenimente._selectAllBulkDelete(false)" style="flex:1;padding:8px 12px;border:1.5px solid var(--border);border-radius:6px;background:transparent;color:var(--text);cursor:pointer;font-size:13px;font-weight:600">✕ Deselectează tot</button>
        </div>
        
        <!-- Events list -->
        <div id="bulk-delete-events" style="flex:1;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:16px">
          ${allEvents.map(e => `
            <label class="bulk-delete-event-item" data-title="${e.title.toLowerCase()}" style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--border);border-radius:6px;cursor:pointer;margin-bottom:8px;background:var(--bg-primary)">
              <input type="checkbox" class="bulk-delete-checkbox" value="${e.id}" style="width:18px;height:18px;cursor:pointer;accent-color:var(--brand)">
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:13px;color:var(--text-primary)">${e.title}</div>
                <div style="font-size:11px;color:var(--text-muted)">${e.event_date} • ${e.start_time?.slice(0,5) || '—'} ${e.is_recurring ? '(↻ Recurent)' : ''}</div>
              </div>
            </label>
          `).join('')}
        </div>
        
        <!-- Action buttons -->
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button onclick="document.getElementById('bulk-delete-modal').remove()" style="padding:10px 20px;border:1.5px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:14px;font-weight:600">Anulează</button>
          <button onclick="Evenimente.confirmBulkDelete()" style="padding:10px 20px;border:none;border-radius:8px;background:#dc2626;color:#fff;cursor:pointer;font-size:14px;font-weight:600">🗑️ Șterge selectate</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  },

  _filterBulkDeleteEvents() {
    const searchVal = document.getElementById('bulk-delete-search')?.value?.toLowerCase() || '';
    const items = document.querySelectorAll('.bulk-delete-event-item');
    items.forEach(item => {
      const title = item.dataset.title || '';
      item.style.display = title.includes(searchVal) ? 'flex' : 'none';
    });
  },

  _selectAllBulkDelete(selectAll) {
    const checkboxes = document.querySelectorAll('.bulk-delete-event-item:not([style*="display: none"]) .bulk-delete-checkbox');
    checkboxes.forEach(cb => cb.checked = selectAll);
  },
  async confirmBulkDelete() {
    const checkboxes = document.querySelectorAll('.bulk-delete-checkbox:checked');
    const selectedIds = Array.from(checkboxes).map(cb => cb.value);
    
    if (selectedIds.length === 0) {
      showToast('Selectează cel puțin un eveniment', 'error');
      return;
    }
    
    if (!confirm(`Sigur vrei să ștergi ${selectedIds.length} eveniment(e) recurent(e) și toate instanțele lor?`)) {
      return;
    }
    
    try {
      for (const eventId of selectedIds) {
        const { error } = await DB.deleteCompanyEventHard(eventId);
        if (error) {
          showToast('Eroare la ștergere: ' + error.message, 'error');
          return;
        }
      }
      
      document.getElementById('bulk-delete-modal').remove();
      showToast(`✓ ${selectedIds.length} eveniment(e) șters(e) cu succes!`, 'success');
      await this.loadEvents();
      this.renderPage();
    } catch(e) {
      showToast('Eroare: ' + e.message, 'error');
    }
  },

};

// Helper global pentru decline confirm
function Events_declineConfirm(eventId) {
  const reason = document.getElementById('decline-reason')?.value?.trim();
  document.getElementById('decline-modal')?.remove();
  Evenimente.respondToEvent(eventId, 'declined', reason);
}
