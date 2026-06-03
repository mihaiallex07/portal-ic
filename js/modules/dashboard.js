// ============================================================
// Dashboard Module — Portal Inginerie Creativă
// ============================================================

const Dashboard = {
  async render() {
    const userId = Auth.currentUser?.id;
    const isAdmin = Auth.currentProfile?.role === 'admin';
    const [projectsRes, timeRes, newsRes, notifRes, profilesRes, tasksRes, membershipsRes] = await Promise.all([
      DB.getProjects(),
      DB.getTimeEntries(userId, getDateStr(-7), getTodayStr()),
      DB.getNews(),
      DB.getNotifications(userId),
      DB.getUsers(),
      // Toate task-urile pentru a calcula ore lucrate per proiect din minutes_worked
      APP_CONFIG.demoMode ? Promise.resolve({ data: [] }) :
        (async () => { try { const sb = getSupabase(); const { data } = await sb.from('project_tasks').select('project_id,minutes_worked,budget_hours'); return { data: data || [] }; } catch(e) { return { data: [] }; } })(),
      // Memberships pentru a filtra proiectele după înrolare
      APP_CONFIG.demoMode ? Promise.resolve({ data: [] }) :
        (async () => { try { const sb = getSupabase(); const { data } = await sb.from('project_members').select('project_id').eq('user_id', userId); return { data: data || [] }; } catch(e) { return { data: [] }; } })()
    ]);

    const allProjects = projectsRes.data || [];
    // Filtrează proiectele după înrolare (non-admini văd doar proiectele lor)
    const enrolledIds = new Set((membershipsRes.data || []).map(m => String(m.project_id)));
    const projects = isAdmin ? allProjects : allProjects.filter(p => enrolledIds.has(String(p.id)));
    const timeEntries = timeRes.data || [];
    // Calculează ore lucrate și bugetate per proiect din project_tasks (date reale)
    const allTasks = tasksRes.data || [];
    const workedByProject = {};
    const budgetByProject = {};
    allTasks.forEach(t => {
      const pid = t.project_id;
      if (!pid) return;
      workedByProject[pid] = (workedByProject[pid] || 0) + Math.round((t.minutes_worked || 0) / 60 * 10) / 10;
      budgetByProject[pid] = (budgetByProject[pid] || 0) + (t.budget_hours || 0);
    });
    // Injectăm valorile calculate în proiecte
    projects.forEach(p => {
      if (allTasks.length > 0) {
        p.used_hours = workedByProject[p.id] || 0;
        if (budgetByProject[p.id] > 0) p.budget_hours = budgetByProject[p.id];
      }
    });
    const news = (newsRes.data || []).slice(0, 3);
    const notifications = (notifRes.data || []).filter(n => !n.read).slice(0, 5);
    const allProfiles = profilesRes.data || [];

    // Calculează evenimentele (zile de naștere + aniversări angajare) pentru luna curentă și viitoare
    MiniCalendar.setEvents(allProfiles);

    const activeProjects = projects.filter(p => p.status === 'activ');
    const todayEntries = timeEntries.filter(e => e.date === getTodayStr());
    const todayMinutes = todayEntries.reduce((s, e) => s + (e.duration_minutes || 0), 0);
    const weekMinutes = timeEntries.reduce((s, e) => s + (e.duration_minutes || 0), 0);
    const unreadNotifs = notifications.length;

    const profile = Auth.currentProfile;
    const greeting = getGreeting();

    document.getElementById('page-content').innerHTML = `
      <div style="width:100%">
        <!-- Greeting -->
        <div class="mb-4" style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <h1 style="font-size:20px;font-weight:700;color:var(--text)">${greeting}, ${profile?.full_name?.split(' ')[0] || 'bun venit'}!</h1>
            <p class="text-sm text-muted">${formatDate(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
          <a href="https://app.hriflow.ro/#/dashboard" target="_blank" rel="noopener noreferrer"
             style="display:inline-flex;align-items:center;gap:8px;background:var(--brand);color:#000;font-weight:700;font-size:13px;padding:9px 18px;border-radius:8px;text-decoration:none;white-space:nowrap;box-shadow:0 2px 8px rgba(255,203,8,0.3);transition:opacity 0.15s"
             onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Pontaj HRiFlow
          </a>
        </div>

        <!-- Metric cards -->
        <div class="dashboard-grid mb-4">
          <div class="metric-card">
            <div class="metric-label">Proiecte active</div>
            <div class="metric-value">${activeProjects.length}</div>
            <div class="metric-sub">${projects.length} total</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Ore azi</div>
            <div class="metric-value">${(todayMinutes / 60).toFixed(1)}h</div>
            <div class="metric-sub">${todayEntries.length} activități</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Ore săptămâna</div>
            <div class="metric-value">${(weekMinutes / 60).toFixed(1)}h</div>
            <div class="metric-sub">ultimele 7 zile</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Notificări noi</div>
            <div class="metric-value" style="color:${unreadNotifs > 0 ? 'var(--brand-dark)' : 'var(--text)'}">${unreadNotifs}</div>
            <div class="metric-sub">necitite</div>
          </div>
        </div>

        <!-- Main grid -->
        <div class="dashboard-main">
          <div class="dashboard-left">
            <!-- Activitate azi -->
            <div class="card">
              <div class="card-header">
                <span class="card-title">Activitate azi</span>
                <button class="btn-brand" style="font-size:12px;padding:5px 12px" onclick="navigate('time-tracking', null)">
                  + Adaugă activitate
                </button>
              </div>
              <div class="card-body" style="padding:0">
                ${todayEntries.length === 0
                  ? emptyState('Nu ai înregistrat activități azi')
                  : todayEntries.map(e => `
                    <div class="flex items-center gap-3 p-3" style="border-bottom:1px solid var(--border)">
                      <div style="width:3px;height:36px;border-radius:2px;background:${getActivityColor(e.activity_type)};flex-shrink:0"></div>
                      <div style="flex:1;min-width:0">
                        <div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.task_name}</div>
                        <div class="text-xs text-muted">${formatHours(e.duration_minutes)} · ${getActivityLabel(e.activity_type)}</div>
                      </div>
                      <div class="text-xs text-muted">${(e.start_time || (String(e.start_hour||0).padStart(2,'0')+':'+String(e.start_min||0).padStart(2,'0'))).substring(0,5)}</div>
                    </div>
                  `).join('')
                }
              </div>
            </div>

            <!-- Proiecte active -->
            <div class="card">
              <div class="card-header">
                <span class="card-title">Proiecte active</span>
                <button class="btn-secondary" style="font-size:12px;padding:5px 12px" onclick="navigate('proiecte', null)">
                  Vezi toate
                </button>
              </div>
              <div class="card-body" style="padding:0">
                ${activeProjects.length === 0
                  ? emptyState('Nu există proiecte active')
                  : activeProjects.slice(0, 4).map(p => {
                    const pct = p.budget_hours > 0 ? Math.min(100, Math.round(p.used_hours / p.budget_hours * 100)) : 0;
                    const colorClass = pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : '';
                    return `
                      <div class="flex items-center gap-3 p-3 cursor-pointer" style="border-bottom:1px solid var(--border)" onclick="navigate('proiecte', null); setTimeout(() => Proiecte && Proiecte.openProject(${p.id}), 200)">
                        <div style="font-size:20px">${p.emoji || '📁'}</div>
                        <div style="flex:1;min-width:0">
                          <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
                          <div class="text-xs text-muted mb-1">${p.client_name || ''}</div>
                          <div class="progress-bar"><div class="progress-fill ${colorClass}" style="width:${pct}%"></div></div>
                        </div>
                        <div class="text-xs text-muted" style="text-align:right;flex-shrink:0">
                          <div style="font-weight:600">${pct}%</div>
                          <div>${p.used_hours}h / ${p.budget_hours}h</div>
                        </div>
                      </div>
                    `;
                  }).join('')
                }
              </div>
            </div>
          </div>

          <div class="dashboard-right">
            <!-- Mini calendar -->
            ${MiniCalendar.render()}

            <!-- Evenimente viitoare -->
            ${MiniCalendar.renderUpcomingEvents()}

            <!-- Știri recente -->
            <div class="card">
              <div class="card-header">
                <span class="card-title">Știri recente</span>
                <button class="btn-secondary" style="font-size:11px;padding:4px 10px" onclick="navigate('stiri', null)">Toate</button>
              </div>
              <div style="padding:0">
                ${news.length === 0
                  ? `<div style="padding:16px">${emptyState('Nu există știri')}</div>`
                  : news.map(n => `
                    <div class="p-3 cursor-pointer" style="border-bottom:1px solid var(--border)" onclick="navigate('stiri', null)">
                      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                        ${n.is_pinned ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="var(--brand-dark)" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' : ''}
                        ${categoryBadge(n.category)}
                      </div>
                      <div style="font-size:13px;font-weight:600;color:var(--text);line-height:1.4;margin-bottom:4px">${n.title}</div>
                      <div class="text-xs text-muted">${timeAgo(n.created_at)}</div>
                    </div>
                  `).join('')
                }
              </div>
            </div>

            <!-- Notificări recente -->
            ${unreadNotifs > 0 ? `
              <div class="card">
                <div class="card-header">
                  <span class="card-title">Notificări</span>
                  <button class="btn-secondary" style="font-size:11px;padding:4px 10px" onclick="navigate('notificari', null)">Toate</button>
                </div>
                <div style="padding:0">
                  ${notifications.map(n => `
                    <div class="flex items-center gap-3 p-3" style="border-bottom:1px solid var(--border)">
                      <div style="width:7px;height:7px;border-radius:50%;background:var(--brand);flex-shrink:0"></div>
                      <div style="flex:1;min-width:0">
                        <div style="font-size:12px;font-weight:600">${n.title}</div>
                        <div class="text-xs text-muted truncate">${n.message}</div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;

    MiniCalendar.init();
  }
};

// ── MINI CALENDAR ─────────────────────────────────────────────
const MiniCalendar = {
  currentDate: new Date(),
  events: [], // { day, month (0-indexed), type: 'birthday'|'anniversary', name, years }

  setEvents(profiles) {
    this.events = [];
    const today = new Date();
    const currentYear = today.getFullYear();
    for (const p of profiles) {
      const displayName = p.full_name || p.name || 'Angajat';
      const code = p.employee_code || (displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3));
      if (p.birth_date) {
        const bd = new Date(p.birth_date);
        this.events.push({ day: bd.getDate(), month: bd.getMonth(), type: 'birthday', name: displayName, code });
      }
      if (p.hire_date) {
        const hd = new Date(p.hire_date);
        const years = currentYear - hd.getFullYear();
        if (years > 0) {
          this.events.push({ day: hd.getDate(), month: hd.getMonth(), type: 'anniversary', name: displayName, code, years });
        }
      }
    }
  },

  getEventsForDay(day, month) {
    return this.events.filter(e => e.day === day && e.month === month);
  },

  render() {
    const d = this.currentDate;
    const year = d.getFullYear();
    const month = d.getMonth();
    const monthNames = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'];
    const dayNames = ['Lu','Ma','Mi','Jo','Vi','Sâ','Du'];

    const firstDay = new Date(year, month, 1).getDay();
    const startOffset = firstDay === 0 ? 6 : firstDay - 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    let cells = '';
    for (let i = 0; i < startOffset; i++) {
      cells += `<div class="mini-cal-day other-month"></div>`;
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
      const dayEvents = this.getEventsForDay(day, month);
      const hasBirthday = dayEvents.some(e => e.type === 'birthday');
      const hasAnniversary = dayEvents.some(e => e.type === 'anniversary');
      const dots = dayEvents.length > 0 ? `<div style="display:flex;gap:2px;justify-content:center;margin-top:1px">${hasBirthday ? '<span style="width:4px;height:4px;border-radius:50%;background:#e91e63;display:inline-block"></span>' : ''}${hasAnniversary ? '<span style="width:4px;height:4px;border-radius:50%;background:var(--brand-dark);display:inline-block"></span>' : ''}</div>` : '';
       const clickHandler = dayEvents.length > 0
        ? `onclick="MiniCalendar.showDayPopup(this, ${day}, ${month})" style="cursor:pointer;position:relative;padding-bottom:2px"`
        : `style="cursor:default;position:relative;padding-bottom:2px"`;
      cells += `<div class="mini-cal-day ${isToday ? 'today' : ''} ${dayEvents.length > 0 ? 'has-event' : ''}" ${clickHandler}>${day}${dots}</div>`;
    }

    return `
      <div class="mini-cal" id="mini-calendar">
        <div class="mini-cal-header">
          <button class="mini-cal-nav" onclick="MiniCalendar.prevMonth()">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span class="mini-cal-title">${monthNames[month]} ${year}</span>
          <button class="mini-cal-nav" onclick="MiniCalendar.nextMonth()">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        <div class="mini-cal-grid">
          ${dayNames.map(d => `<div class="mini-cal-day-name">${d}</div>`).join('')}
          ${cells}
        </div>
        <div style="display:flex;gap:12px;padding:8px 4px 2px;font-size:10px;color:var(--text-muted)">
          <span><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#e91e63;margin-right:3px;vertical-align:middle"></span>Zi de naștere</span>
          <span><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--brand-dark);margin-right:3px;vertical-align:middle"></span>Aniversare angajare</span>
        </div>
      </div>
    `;
  },

  renderUpcomingEvents() {
    const today = new Date();
    const upcoming = [];
    // Caută evenimente în următoarele 30 de zile
    for (let i = 0; i <= 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dayEvents = this.getEventsForDay(d.getDate(), d.getMonth());
      for (const ev of dayEvents) {
        upcoming.push({ ...ev, date: new Date(d), daysUntil: i });
      }
    }
    if (upcoming.length === 0) return '';
    const monthNames = ['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec'];
    return `
      <div class="card">
        <div class="card-header">
          <span class="card-title">Evenimente viitoare</span>
        </div>
        <div style="padding:0">
          ${upcoming.slice(0, 6).map(ev => `
            <div class="flex items-center gap-3 p-3" style="border-bottom:1px solid var(--border)">
              <div style="width:36px;height:36px;border-radius:8px;background:${ev.type === 'birthday' ? '#fce4ec' : '#fff9e6'};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${ev.type === 'birthday' ? '🎂' : '🎉'}</div>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600;color:var(--text)">${ev.name}</div>
                <div class="text-xs text-muted">${ev.type === 'birthday' ? 'Zi de naștere' : `Aniversare angajare (${ev.years} an${ev.years > 1 ? 'i' : ''})`}</div>
              </div>
              <div style="text-align:right;flex-shrink:0">
                <div style="font-size:12px;font-weight:700;color:${ev.daysUntil === 0 ? '#e91e63' : 'var(--brand-dark)'}">${ev.daysUntil === 0 ? 'Azi!' : ev.daysUntil === 1 ? 'Mâine' : `${ev.date.getDate()} ${monthNames[ev.date.getMonth()]}`}</div>
                ${ev.daysUntil > 1 ? `<div class="text-xs text-muted">în ${ev.daysUntil} zile</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  init() {},

  showDayPopup(el, day, month) {
    // Elimină orice popup existent
    const existing = document.getElementById('cal-day-popup');
    if (existing) { existing.remove(); return; }

    const dayEvents = this.getEventsForDay(day, month);
    if (!dayEvents.length) return;

    const monthNames = ['Ianuarie','Februarie','Martie','Aprilie','Mai','Iunie','Iulie','August','Septembrie','Octombrie','Noiembrie','Decembrie'];
    const rows = dayEvents.map(ev => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f0f0f0">
        <div style="font-size:20px;flex-shrink:0">${ev.type === 'birthday' ? '🎂' : '🎉'}</div>
        <div>
          <div style="font-size:13px;font-weight:700;color:#111">${ev.name}</div>
          <div style="font-size:11px;color:#888">${ev.type === 'birthday' ? 'Zi de naștere' : `Aniversare angajare — ${ev.years} an${ev.years > 1 ? 'i' : ''}`}</div>
        </div>
      </div>
    `).join('');

    const popup = document.createElement('div');
    popup.id = 'cal-day-popup';
    popup.innerHTML = `
      <div style="font-size:12px;font-weight:700;color:#888;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">${day} ${monthNames[month]}</div>
      ${rows}
    `;
    Object.assign(popup.style, {
      position: 'absolute',
      zIndex: '9999',
      background: '#fff',
      border: '1px solid #e0e0e0',
      borderRadius: '10px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
      padding: '12px 16px',
      minWidth: '220px',
      maxWidth: '300px',
    });

    // Poziționare relativă la celula calendarului
    const rect = el.getBoundingClientRect();
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    popup.style.top = (rect.bottom + scrollY + 6) + 'px';
    popup.style.left = Math.max(8, rect.left + scrollX - 80) + 'px';

    document.body.appendChild(popup);

    // Închide la click în afara popupului
    setTimeout(() => {
      const close = (e) => {
        if (!popup.contains(e.target) && e.target !== el) {
          popup.remove();
          document.removeEventListener('click', close);
        }
      };
      document.addEventListener('click', close);
    }, 10);
  },

  prevMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() - 1);
    const cal = document.getElementById('mini-calendar');
    if (cal) cal.outerHTML = this.render();
  },

  nextMonth() {
    this.currentDate.setMonth(this.currentDate.getMonth() + 1);
    const cal = document.getElementById('mini-calendar');
    if (cal) cal.outerHTML = this.render();
  },
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bună dimineața';
  if (h < 18) return 'Bună ziua';
  return 'Bună seara';
}
