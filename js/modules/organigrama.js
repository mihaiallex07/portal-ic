// ============================================================
// Organigramă Module — Portal Inginerie Creativă
// Design: hartă ierarhică fluidă, compactă, fără scroll orizontal.
// Ierarhie dinamică din DB (manager_id pe profiles)
// Admin: click pe nod în edit mode → popover inline cu dropdown manager
// Card echipă de jos → click deschide profilul angajatului
// ============================================================

const Organigrama = {
  users: [],
  editMode: false,

  async render() {
    const { data: users } = await DB.getUsers();
    const isAdmin = Auth.currentProfile?.role === 'admin';
    // Toți utilizatorii autentificați văd toți colegii (pre-creați sau nu)
    this.users = users || [];
    this.editMode = false;

    document.getElementById('page-content').innerHTML = `
      <div style="width:100%">
        <div class="page-header">
          <div>
            <h1 class="page-title">Organigramă</h1>
            <p class="page-subtitle">Structura organizatorică Inginerie Creativă</p>
          </div>
          ${isAdmin ? `
            <div style="display:flex;gap:8px;align-items:center">
              <button id="org-edit-btn" class="btn-secondary" onclick="Organigrama.toggleEdit()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Editează ierarhia
              </button>
            </div>
          ` : ''}
        </div>

        <!-- Org chart vizual -->
        <div class="card mb-4" style="padding:24px;position:relative;overflow:hidden">
          <div id="org-chart-container" style="width:100%;min-width:0">
            ${this.renderOrgChart()}
          </div>
        </div>

        <!-- Lista echipă -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">Echipa (${this.users.length} angajați)</span>
          </div>
          <div style="padding:12px 16px 0">
            <div style="position:relative">
              <svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-muted)" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" id="org-team-search" class="input" style="padding-left:32px;font-size:13px"
                placeholder="Caută după nume, funcție sau departament..."
                oninput="Organigrama.filterTeam(this.value)" />
            </div>
          </div>
          <div id="org-team-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;padding:12px 16px 16px">
            ${this.users.map(u => this.renderTeamCard(u)).join('')}
          </div>
        </div>
      </div>

      <!-- Popover editor (ascuns implicit) -->
      <div id="org-popover" style="display:none;position:fixed;z-index:9999;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.18);padding:16px;min-width:260px;max-width:320px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div id="org-popover-name" style="font-size:13px;font-weight:700"></div>
          <button onclick="Organigrama.closePopover()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:18px;line-height:1;padding:0 2px">&times;</button>
        </div>
        <label class="text-xs text-muted" style="display:block;margin-bottom:6px">Raportează la:</label>
        <select id="org-popover-select" class="select" style="font-size:13px;width:100%"></select>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn-brand" style="flex:1;font-size:12px" onclick="Organigrama.saveNodeManager()">Salvează</button>
          <button class="btn-secondary" style="font-size:12px" onclick="Organigrama.closePopover()">Anulează</button>
        </div>
      </div>
    `;

    setTimeout(() => this.fitTreeToContainer(), 0);

    // Închide popover la click în afara lui
    document.addEventListener('click', this._outsideClick = (e) => {
      const pop = document.getElementById('org-popover');
      if (pop && pop.style.display !== 'none' && !pop.contains(e.target) && !e.target.closest('.org-node-editable')) {
        this.closePopover();
      }
    });
  },

  // ── CONSTRUIEȘTE ARBORELE IERARHIC ────────────────────────────
  buildTree() {
    const map = {};
    const roots = [];

    for (const u of this.users) {
      map[u.id] = { ...u, children: [] };
    }

    for (const u of this.users) {
      if (u.manager_id && map[u.manager_id]) {
        map[u.manager_id].children.push(map[u.id]);
      } else {
        roots.push(map[u.id]);
      }
    }

    if (roots.length === this.users.length) {
      return this.buildDeptTree();
    }

    if (roots.length > 1) {
      return [{
        id: '__company__',
        full_name: 'Inginerie Creativă',
        job_title: 'SRL',
        department: null,
        avatar_url: null,
        employee_code: 'IC',
        children: roots,
        isCompany: true,
      }];
    }

    return roots;
  },

  buildDeptTree() {
    const depts = {};
    for (const u of this.users) {
      const dept = u.department || 'General';
      if (!depts[dept]) depts[dept] = [];
      depts[dept].push({ ...u, children: [] });
    }

    return [{
      id: '__company__',
      full_name: 'Inginerie Creativă',
      job_title: 'SRL',
      department: null,
      avatar_url: null,
      employee_code: 'IC',
      isCompany: true,
      children: Object.entries(depts).map(([dept, members]) => ({
        id: '__dept__' + dept,
        full_name: dept,
        job_title: 'Departament',
        department: dept,
        isDept: true,
        children: members,
      })),
    }];
  },

  escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  hierarchyGroups(users) {
    const userById = new Map(users.map(user => [String(user.id), user]));
    const hasHierarchy = users.some(user => user.manager_id && userById.has(String(user.manager_id)));

    if (!hasHierarchy) {
      const departments = new Map();
      users.forEach(user => {
        const department = user.department || 'General';
        if (!departments.has(department)) departments.set(department, []);
        departments.get(department).push(user);
      });
      return [...departments.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'ro'))
        .map(([label, members]) => ({ label, description: 'Departament', users: members }));
    }

    const levelFor = (user, ancestry = new Set()) => {
      const managerId = user.manager_id ? String(user.manager_id) : null;
      if (!managerId || !userById.has(managerId) || ancestry.has(String(user.id))) return 0;
      const next = new Set(ancestry);
      next.add(String(user.id));
      return levelFor(userById.get(managerId), next) + 1;
    };

    const levels = new Map();
    users.forEach(user => {
      const level = levelFor(user);
      if (!levels.has(level)) levels.set(level, []);
      levels.get(level).push(user);
    });
    return [...levels.entries()]
      .sort(([a], [b]) => a - b)
      .map(([level, members]) => ({
        label: level === 0 ? 'Conducere și coordonare' : `Nivel organizațional ${level + 1}`,
        description: level === 0 ? 'Puncte de coordonare' : 'Raportare directă',
        users: members,
      }));
  },

  renderCompactNode(user) {
    const isEditable = this.editMode;
    const initials = user.employee_code || (user.full_name || user.name || 'IC').split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 3);
    const manager = user.manager_id ? this.users.find(item => String(item.id) === String(user.manager_id)) : null;
    const clickHandler = isEditable
      ? `onclick="Organigrama.openNodeEditor('${user.id}', event)"`
      : `onclick="Echipa.viewProfile('${user.id}')"`;
    const personName = this.escapeHtml(user.full_name || user.name || 'Angajat');
    const position = this.escapeHtml(user.job_title || user.position || 'Funcție necompletată');
    const department = this.escapeHtml(user.department || 'General');
    const reportsTo = manager ? `Raportează: ${this.escapeHtml(manager.full_name || manager.name || 'Manager')}` : 'Nivel de coordonare';
    const avatar = user.avatar_url
      ? `<img src="${this.escapeHtml(user.avatar_url)}" alt="" style="width:38px;height:38px;border-radius:50%;object-fit:cover;border:2px solid var(--brand-dark);flex:0 0 auto">`
      : `<div style="width:38px;height:38px;border-radius:50%;background:var(--brand-dark);color:#000;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex:0 0 auto">${this.escapeHtml(initials)}</div>`;

    return `<article class="org-compact-node${isEditable ? ' org-node-editable' : ''}" ${clickHandler}
      style="min-width:0;display:flex;gap:10px;align-items:center;padding:11px 12px;background:var(--surface);border:1px solid ${isEditable ? '#fbbf24' : 'var(--border)'};border-radius:10px;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.04);transition:transform .16s ease,box-shadow .16s ease"
      onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 18px rgba(0,0,0,.10)'"
      onmouseleave="this.style.transform='';this.style.boxShadow='0 1px 2px rgba(0,0,0,.04)'">
      <div style="position:relative;flex:0 0 auto">${avatar}${isEditable ? '<span style="position:absolute;right:-5px;bottom:-4px;width:16px;height:16px;border-radius:50%;background:#fbbf24;border:2px solid var(--surface);display:flex;align-items:center;justify-content:center;font-size:9px">✎</span>' : ''}</div>
      <div style="min-width:0;flex:1">
        <div style="font-size:12px;font-weight:800;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${personName}</div>
        <div style="font-size:10px;color:var(--text-muted);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">${position}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:6px;min-width:0"><span style="display:inline-block;min-width:0;max-width:52%;padding:2px 5px;border-radius:4px;background:rgba(255,203,9,.18);color:var(--text);font-size:9px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${department}</span><span style="min-width:0;color:var(--text-muted);font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${reportsTo}</span></div>
      </div>
    </article>`;
  },

  renderOrgChart() {
    const tree = this.buildTree();
    if (!tree.length) return `<div style="text-align:center;color:var(--text-muted);padding:40px">Niciun angajat în organigramă</div>`;

    const hasHierarchy = this.users.some(user => user.manager_id);
    const isAdmin = Auth.currentProfile?.role === 'admin';
    const hint = this.editMode
      ? `<div style="margin:0 0 14px;padding:9px 12px;background:#fef9c3;border:1px solid #fbbf24;border-radius:8px;font-size:12px;color:#92400e">✏️ <strong>Mod editare activ</strong> — apasă pe o persoană pentru a-i actualiza managerul direct.</div>`
      : !hasHierarchy && isAdmin
      ? `<div style="margin:0 0 14px;padding:9px 12px;background:var(--surface-2);border-radius:8px;font-size:12px;color:var(--text-muted)">💡 Ierarhia este grupată pe departamente. Folosește <strong>Editează ierarhia</strong> pentru a stabili relațiile de raportare.</div>`
      : `<div style="margin:0 0 14px;padding:9px 12px;background:var(--surface-2);border-radius:8px;font-size:12px;color:var(--text-muted)">Structură organizațională — selectează o persoană pentru a deschide profilul complet.</div>`;

    return `${hint}<div id="org-tree-viewport" style="width:100%;overflow:hidden;position:relative">
      <div id="org-tree-scale-stage" style="transform-origin:top center;display:inline-block;position:relative;left:50%;transform:translateX(-50%)">
        <div id="org-tree-graphic" style="display:inline-flex;justify-content:center;align-items:flex-start;white-space:normal;padding:4px 2px">
          ${tree.map(node => this.renderNode(node, true)).join('')}
        </div>
      </div>
    </div>`;
  },

  fitTreeToContainer() {
    const viewport = document.getElementById('org-tree-viewport');
    const stage = document.getElementById('org-tree-scale-stage');
    const graphic = document.getElementById('org-tree-graphic');
    if (!viewport || !stage || !graphic) return;

    stage.style.transform = 'translateX(-50%) scale(1)';
    stage.style.height = 'auto';
    const naturalWidth = graphic.scrollWidth || graphic.offsetWidth;
    const naturalHeight = graphic.offsetHeight;
    const availableWidth = Math.max(1, viewport.clientWidth - 2);
    const scale = Math.min(1, availableWidth / Math.max(1, naturalWidth));
    stage.style.transform = `translateX(-50%) scale(${scale})`;
    stage.style.height = `${Math.ceil(naturalHeight * scale)}px`;
  },

  renderNode(node, isRoot = false) {
    const hasChildren = node.children && node.children.length > 0;
    const isClickable = !node.isCompany && !node.isDept;
    const isEditable = this.editMode && isClickable;
    const initials = node.employee_code || (node.full_name || 'IC').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);

    const avatarEl = node.isCompany
      ? `<div style="width:34px;height:34px;border-radius:50%;background:var(--brand-dark);color:#000;font-size:13px;font-weight:900;display:flex;align-items:center;justify-content:center;margin:0 auto 5px">IC</div>`
      : node.isDept
      ? `<div style="width:28px;height:28px;border-radius:7px;background:var(--surface-2);color:var(--text-muted);font-size:14px;display:flex;align-items:center;justify-content:center;margin:0 auto 4px">🏢</div>`
      : node.avatar_url
      ? `<img src="${node.avatar_url}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid var(--brand-dark);margin:0 auto 5px;display:block" />`
      : `<div style="width:32px;height:32px;border-radius:50%;background:var(--brand-dark);color:#000;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;margin:0 auto 5px">${initials}</div>`;

    const nodeStyle = node.isCompany
      ? 'background:var(--brand-dark);color:#000;border:none'
      : node.isDept
      ? 'background:var(--surface-2);border:1px dashed var(--border)'
      : isEditable
      ? 'background:var(--surface);border:2px solid #fbbf24;cursor:pointer'
      : 'background:var(--surface);border:1px solid var(--border)';

    const nameColor = node.isCompany ? 'color:#000' : 'color:var(--text)';
    const subtitleColor = node.isCompany ? 'color:rgba(0,0,0,0.6)' : 'color:var(--text-muted)';

    const editBadge = isEditable
      ? `<div style="position:absolute;top:-6px;right:-6px;background:#fbbf24;border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:9px">✏️</div>`
      : '';

    const clickHandler = isEditable
      ? `onclick="Organigrama.openNodeEditor('${node.id}', event)"`
      : isClickable
      ? `onclick="Echipa.viewProfile('${node.id}')"`
      : '';

    const hoverHandler = (isClickable || isEditable)
      ? `onmouseenter="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.15)'" onmouseleave="this.style.boxShadow=''"`
      : '';

    return `
      <div class="org-node-wrap" style="display:inline-flex;flex-direction:column;align-items:center;margin:0 5px">
        <div class="org-node${isEditable ? ' org-node-editable' : ''}" style="position:relative;padding:8px 9px;border-radius:8px;min-width:96px;max-width:116px;text-align:center;${nodeStyle};transition:box-shadow 0.15s"
          ${clickHandler} ${hoverHandler}>
          ${editBadge}
          ${avatarEl}
          <div style="font-size:10px;font-weight:700;${nameColor};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${node.full_name || node.name || ''}</div>
          ${(node.job_title || node.position) ? `<div style="font-size:8px;${subtitleColor};margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${node.job_title || node.position}</div>` : ''}
          ${node.department && !node.isDept ? `<div style="font-size:8px;color:var(--brand-dark);font-weight:600;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${node.department}</div>` : ''}
        </div>
        ${hasChildren ? `
          <div style="width:2px;height:10px;background:var(--border)"></div>
          <div style="display:flex;align-items:flex-start;position:relative">
            ${node.children.length > 1 ? `<div style="position:absolute;top:0;left:50%;transform:translateX(-50%);height:2px;background:var(--border);width:calc(100% - 20px)"></div>` : ''}
            ${node.children.map(child => `
              <div style="display:inline-flex;flex-direction:column;align-items:center">
                <div style="width:2px;height:10px;background:var(--border)"></div>
                ${this.renderNode(child)}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  },

  // ── TOGGLE EDIT MODE ─────────────────────────────────────────
  toggleEdit() {
    this.editMode = !this.editMode;
    const btn = document.getElementById('org-edit-btn');
    if (btn) {
      if (this.editMode) {
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Ieși din editare`;
        btn.style.background = '#fef9c3';
        btn.style.borderColor = '#fbbf24';
        btn.style.color = '#92400e';
      } else {
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Editează ierarhia`;
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.style.color = '';
      }
    }
    // Re-render org chart cu/fără edit mode
    const container = document.getElementById('org-chart-container');
    if (container) container.innerHTML = this.renderOrgChart();
    setTimeout(() => this.fitTreeToContainer(), 0);
    this.closePopover();
  },

  // ── POPOVER EDITOR ───────────────────────────────────────────
  _currentEditUserId: null,

  openNodeEditor(userId, event) {
    event.stopPropagation();
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    this._currentEditUserId = userId;

    const pop = document.getElementById('org-popover');
    const nameEl = document.getElementById('org-popover-name');
    const sel = document.getElementById('org-popover-select');
    if (!pop || !nameEl || !sel) return;

    nameEl.textContent = user.full_name || 'Angajat';

    // Populează dropdown cu toți ceilalți angajați
    const others = this.users.filter(u => u.id !== userId);
    sel.innerHTML = `<option value="">— fără manager (root) —</option>` +
      others.map(m => `<option value="${m.id}" ${user.manager_id === m.id ? 'selected' : ''}>${m.full_name}${m.job_title ? ' · ' + m.job_title : ''}</option>`).join('');

    // Poziționează popover lângă nodul clickat
    const rect = event.currentTarget.getBoundingClientRect();
    const popWidth = 300;
    let left = rect.right + 8;
    let top = rect.top;

    // Ajustează dacă iese din viewport
    if (left + popWidth > window.innerWidth) left = rect.left - popWidth - 8;
    if (top + 200 > window.innerHeight) top = window.innerHeight - 220;
    if (top < 8) top = 8;

    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    pop.style.display = 'block';
  },

  closePopover() {
    const pop = document.getElementById('org-popover');
    if (pop) pop.style.display = 'none';
    this._currentEditUserId = null;
  },

  async saveNodeManager() {
    const userId = this._currentEditUserId;
    if (!userId) return;

    const sel = document.getElementById('org-popover-select');
    const newManagerId = sel?.value || null;

    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    // Verifică ciclu
    const tempMap = {};
    for (const u of this.users) tempMap[u.id] = u.manager_id;
    tempMap[userId] = newManagerId;
    if (newManagerId && this.hasCycle(userId, tempMap)) {
      showToast('Ciclu detectat! Nu poți seta acest manager.', 'error');
      return;
    }

    const sb = getSupabase();
    if (!sb) { showToast('Supabase nu e conectat', 'error'); return; }

    const { error } = await sb.from('profiles').update({ manager_id: newManagerId }).eq('id', userId);
    if (error) {
      showToast('Eroare la salvare: ' + error.message, 'error');
    } else {
      user.manager_id = newManagerId;
      const managerName = newManagerId ? (this.users.find(m => m.id === newManagerId)?.full_name || 'manager') : 'niciun manager';
      showToast(`${user.full_name} → ${managerName}`, 'success');
      this.closePopover();
      // Re-render org chart
      const container = document.getElementById('org-chart-container');
      if (container) container.innerHTML = this.renderOrgChart();
      setTimeout(() => this.fitTreeToContainer(), 0);
    }
  },

  hasCycle(userId, managerMap, visited = new Set()) {
    if (visited.has(userId)) return true;
    visited.add(userId);
    const managerId = managerMap[userId];
    if (!managerId) return false;
    return this.hasCycle(managerId, managerMap, visited);
  },

  // ── SEARCH ECHIPĂ ───────────────────────────────────────────
  filterTeam(query) {
    const q = (query || '').toLowerCase().trim();
    const filtered = q
      ? this.users.filter(u =>
          (u.full_name || '').toLowerCase().includes(q) ||
          (u.job_title || u.position || '').toLowerCase().includes(q) ||
          (u.department || '').toLowerCase().includes(q) ||
          (u.employee_code || '').toLowerCase().includes(q)
        )
      : this.users;

    const grid = document.getElementById('org-team-grid');
    if (!grid) return;
    if (filtered.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--text-muted);font-size:13px">Niciun angajat găsit</div>`;
    } else {
      grid.innerHTML = filtered.map(u => this.renderTeamCard(u)).join('');
    }
  },

  // ── CARD ECHIPĂ ───────────────────────────────────────────────
  renderTeamCard(u) {
    const isSelf = u.id === Auth.currentUser?.id;
    const initials = u.employee_code || (u.full_name || 'IC').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
    const avatarEl = u.avatar_url
      ? `<img src="${u.avatar_url}" alt="${u.full_name}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid var(--brand-dark);flex-shrink:0" />`
      : `<div style="width:48px;height:48px;border-radius:50%;background:var(--brand-dark);color:#000;font-size:15px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">${initials}</div>`;

    const manager = u.manager_id ? this.users.find(m => m.id === u.manager_id) : null;

    return `
      <div class="flex items-center gap-3 p-3 rounded cursor-pointer"
        style="background:var(--surface-2);transition:background 0.15s"
        onclick="Echipa.viewProfile('${u.id}')"
        onmouseenter="this.style.background='var(--surface-3,var(--border))'"
        onmouseleave="this.style.background='var(--surface-2)'">
        <div style="position:relative">
          ${avatarEl}
          ${isSelf ? `<span style="position:absolute;bottom:-2px;right:-2px;background:var(--brand-dark);color:#000;font-size:8px;font-weight:700;padding:1px 4px;border-radius:3px">TU</span>` : ''}
        </div>
        <div style="min-width:0;flex:1">
          <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.full_name || 'Angajat'}</div>
          <div class="text-xs text-muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.job_title || u.position || ''}</div>
          ${u.department ? `<div style="font-size:10px;color:var(--brand-dark);font-weight:600">${u.department}</div>` : ''}
          ${manager ? `<div class="text-xs text-muted" style="font-size:10px">↑ ${manager.full_name}</div>` : ''}
        </div>
      </div>
    `;
  },
};
