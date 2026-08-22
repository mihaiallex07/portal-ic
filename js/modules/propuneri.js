/*
 * Stil: Portal IC — interfață administrativă luminoasă, structurată pe carduri,
 * cu galbenul de brand pentru acțiuni și statusuri clare, fără zgomot vizual.
 * Flux: propuneri proprii pentru toți; propuneri primite separat pentru admin/coordonator.
 */
const Propuneri = {
  items: [],
  users: [],
  projects: [],
  memberships: [],
  activeTab: 'mine',

  async render() {
    const currentId = this.currentId();
    const [proposalResult, usersResult, projectsResult, membershipsResult] = await Promise.all([
      DB.getProposals(),
      DB.getUsers(),
      DB.getProjects(),
      typeof DB.getProposalProjectMemberships === 'function' && currentId
        ? DB.getProposalProjectMemberships(currentId)
        : Promise.resolve({ data: [] }),
    ]);

    this.items = (proposalResult?.data || []).map(p => this.normalizeProposal(p));
    this.users = usersResult?.data || [];
    this.memberships = membershipsResult?.data || [];
    const allowedProjectIds = new Set(this.memberships.map(m => String(m.project_id)));
    this.projects = (projectsResult?.data || []).filter(p =>
      this.isActiveProject(p) && (this.isAdmin() || allowedProjectIds.has(String(p.id)))
    );
    this.ensureTab();
    this.renderPage();
  },

  normalizeProposal(p) {
    return {
      ...p,
      author_name: p.author_name || p.author?.full_name || p.profiles?.full_name || 'Anonim',
      manager_name: p.manager_name || p.manager?.full_name || '',
      votes_for: Number(p.votes_for || 0),
      votes_against: Number(p.votes_against || 0),
      status: p.status || 'in_review',
    };
  },

  currentId() {
    return Auth.currentUser?.id || Auth.currentProfile?.id || null;
  },

  currentProfile() {
    return Auth.currentProfile || {};
  },

  isAdmin() {
    return this.currentProfile().role === 'admin';
  },

  isCoordinator() {
    return ['coordonator', 'coordinator', 'coord'].includes(this.currentProfile().role);
  },

  canReview() {
    return this.isAdmin() || this.isCoordinator();
  },

  isActiveProject(project) {
    return ['activ', 'active', 'in_progress'].includes(String(project?.status || '').toLowerCase());
  },

  ensureTab() {
    if (!this.canReview()) this.activeTab = 'mine';
  },

  visibleItems() {
    const id = this.currentId();
    if (!id) return [];
    if (this.activeTab === 'received' && this.canReview()) {
      return this.items.filter(p => this.isReceived(p, id));
    }
    return this.items.filter(p => String(p.author_id) === String(id));
  },

  isReceived(proposal, userId = this.currentId()) {
    if (!proposal || String(proposal.author_id) === String(userId)) return false;
    if (this.isAdmin()) return proposal.manager_id == null;
    if (this.isCoordinator()) return String(proposal.manager_id) === String(userId);
    return false;
  },

  countMine() {
    const id = this.currentId();
    return this.items.filter(p => String(p.author_id) === String(id)).length;
  },

  countReceived() {
    const id = this.currentId();
    return this.items.filter(p => this.isReceived(p, id)).length;
  },

  setTab(tab) {
    this.activeTab = tab === 'received' && this.canReview() ? 'received' : 'mine';
    this.renderPage();
  },

  renderPage() {
    const visible = this.visibleItems();
    const tabs = this.canReview() ? `
      <div style="display:flex;gap:4px;border-bottom:1px solid var(--border);margin:0 0 16px">
        <button onclick="Propuneri.setTab('mine')" style="border:0;border-bottom:2px solid ${this.activeTab === 'mine' ? 'var(--primary)' : 'transparent'};background:none;color:${this.activeTab === 'mine' ? 'var(--primary)' : 'var(--text-muted)'};padding:10px 14px;cursor:pointer;font-weight:700;font-size:13px">
          Propunerile mele <span style="font-size:11px;color:var(--text-muted)">(${this.countMine()})</span>
        </button>
        <button onclick="Propuneri.setTab('received')" style="border:0;border-bottom:2px solid ${this.activeTab === 'received' ? 'var(--primary)' : 'transparent'};background:none;color:${this.activeTab === 'received' ? 'var(--primary)' : 'var(--text-muted)'};padding:10px 14px;cursor:pointer;font-weight:700;font-size:13px">
          Propuneri primite <span style="font-size:11px;color:var(--text-muted)">(${this.countReceived()})</span>
        </button>
      </div>
    ` : '';

    const sectionTitle = this.activeTab === 'received' ? 'Propuneri primite spre analiză' : 'Propunerile mele';
    const sectionDescription = this.activeTab === 'received'
      ? 'Propuneri direcționate către responsabilitatea ta. Poți actualiza statusul, iar autorul va fi notificat.'
      : 'Ideile trimise de tine și starea lor de procesare.';

    document.getElementById('page-content').innerHTML = `
      <div style="width:100%">
        <div class="page-header">
          <div>
            <h1 class="page-title">Propuneri</h1>
            <p class="page-subtitle">Idei și sugestii din echipă</p>
          </div>
          <button class="btn-brand" onclick="Propuneri.openNewModal()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Propunere nouă
          </button>
        </div>
        ${tabs}
        <div style="margin-bottom:14px">
          <div style="font-size:16px;font-weight:750">${sectionTitle}</div>
          <div class="text-sm text-muted" style="margin-top:3px">${sectionDescription}</div>
        </div>
        <div class="space-y-3">
          ${visible.length === 0 ? this.emptyState(this.activeTab === 'received' ? 'Nu există propuneri primite' : 'Nu ai trimis încă nicio propunere') : visible.map(p => this.renderCard(p)).join('')}
        </div>
      </div>
    `;
  },

  emptyState(message) {
    if (typeof emptyState === 'function') return emptyState(message);
    return `<div class="card" style="padding:28px;text-align:center;color:var(--text-muted)">${message}</div>`;
  },

  escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;',
    }[char]));
  },

  jsArg(value) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && String(value).trim() !== '' ? String(numberValue) : JSON.stringify(String(value));
  },

  statusMeta(status) {
    const map = {
      in_review: { label: 'În analiză', color: '#B7791F', bg: '#FFF8E1' },
      pending: { label: 'În așteptare', color: '#B7791F', bg: '#FFF8E1' },
      approved: { label: 'Aprobată', color: '#16805C', bg: '#E7F7EF' },
      aprobat: { label: 'Aprobată', color: '#16805C', bg: '#E7F7EF' },
      rejected: { label: 'Respinsă', color: '#B42318', bg: '#FDECEC' },
      respins: { label: 'Respinsă', color: '#B42318', bg: '#FDECEC' },
      implemented: { label: 'Implementată', color: '#1769AA', bg: '#EAF4FF' },
      implementata: { label: 'Implementată', color: '#1769AA', bg: '#EAF4FF' },
    };
    return map[status] || { label: status || 'În analiză', color: '#64748B', bg: '#F1F5F9' };
  },

  statusBadge(status) {
    const meta = this.statusMeta(status);
    return `<span style="display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;background:${meta.bg};color:${meta.color};font-size:11px;font-weight:700">${this.escapeHtml(meta.label)}</span>`;
  },

  recipientLabel(proposal) {
    if (proposal.manager_id) return `Coordonator: ${this.escapeHtml(proposal.manager_name || 'coordonatorul proiectului')}`;
    return 'Destinatar: echipa de admini';
  },

  renderCard(proposal) {
    const total = proposal.votes_for + proposal.votes_against;
    const forPct = total > 0 ? Math.round(proposal.votes_for / total * 100) : 0;
    const isReceived = this.activeTab === 'received' && this.isReceived(proposal);
    const canChangeStatus = isReceived && this.canReview();
    const id = this.jsArg(proposal.id);
    const created = typeof timeAgo === 'function' ? timeAgo(proposal.created_at) : '';
    const description = this.escapeHtml(proposal.description || '').replace(/\n/g, '<br>');

    return `
      <div class="card p-4">
        <div class="flex items-start gap-3">
          <div style="flex:1;min-width:0">
            <div class="flex items-center gap-2 mb-1" style="flex-wrap:wrap">
              ${this.statusBadge(proposal.status)}
              <span style="font-size:11px;color:var(--text-muted);font-weight:700">${this.escapeHtml(proposal.reference_number || 'Fără număr')}</span>
              <span class="text-xs text-muted">${this.escapeHtml(proposal.author_name)} · ${this.escapeHtml(created)}</span>
            </div>
            <div style="font-size:15px;font-weight:700;margin-bottom:5px">${this.escapeHtml(proposal.title)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">${this.recipientLabel(proposal)}</div>
            <div class="text-sm text-muted mb-3" style="line-height:1.55">${description}</div>
            <div class="flex items-center gap-3">
              <button class="vote-btn for ${proposal.user_voted === 'for' ? 'voted' : ''}" onclick="Propuneri.vote(${id}, 'for')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
                <span>${proposal.votes_for}</span>
              </button>
              <div style="flex:1">
                <div class="progress-bar"><div class="progress-fill" style="width:${forPct}%;background:var(--success)"></div></div>
                <div class="text-xs text-muted text-center mt-1">${total} voturi · ${forPct}% pentru</div>
              </div>
              <button class="vote-btn against ${proposal.user_voted === 'against' ? 'voted' : ''}" onclick="Propuneri.vote(${id}, 'against')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                <span>${proposal.votes_against}</span>
              </button>
            </div>
          </div>
          ${canChangeStatus ? `<button onclick="Propuneri.openStatusModal(${id})" style="flex:0 0 auto;border:1px solid var(--border);background:var(--bg);color:var(--text);border-radius:5px;padding:5px 8px;font-size:11px;font-weight:700;cursor:pointer" title="Actualizează statusul">Status</button>` : ''}
        </div>
      </div>
    `;
  },

  async vote(id, vote) {
    const { error } = await DB.voteProposal(id, vote);
    if (error) { showToast('Eroare la vot: ' + error.message, 'error'); return; }
    await this.render();
  },

  coordinatorOptions() {
    const managers = new Map();
    this.projects.forEach(project => {
      if (project.manager_id) {
        const user = this.users.find(u => String(u.id) === String(project.manager_id));
        if (user) managers.set(String(user.id), { ...user, projectIds: [...(managers.get(String(user.id))?.projectIds || []), project.id] });
      }
    });
    return [...managers.values()].map(user => `<option value="coord:${this.escapeHtml(user.id)}">Coordonator — ${this.escapeHtml(user.full_name || user.name || user.email)}</option>`).join('');
  },

  projectOptions() {
    return this.projects.filter(project => project.manager_id).map(project => `<option value="${this.escapeHtml(project.id)}">${this.escapeHtml(project.name || project.title || 'Proiect')} — ${this.escapeHtml(this.managerName(project.manager_id))}</option>`).join('');
  },

  managerName(id) {
    const user = this.users.find(u => String(u.id) === String(id));
    return user?.full_name || user?.name || user?.email || 'coordonator';
  },

  openNewModal() {
    const coordinatorOptions = this.coordinatorOptions();
    const projectOptions = this.projectOptions();
    openModal('Propunere nouă', `
      <div class="space-y-3">
        <div>
          <label class="label">Titlu *</label>
          <input type="text" id="prop-title" class="input" placeholder="Titlul propunerii" />
        </div>
        <div>
          <label class="label">Trimite către *</label>
          <select id="prop-target" class="input" onchange="Propuneri.updateRecipientFields()">
            <option value="admin_team">Echipa de admini</option>
            ${coordinatorOptions || '<option value="" disabled>Niciun coordonator de proiect disponibil</option>'}
          </select>
          <div class="text-xs text-muted" style="margin-top:5px">Pentru coordonator, selectează și proiectul activ de mai jos.</div>
        </div>
        <div id="prop-project-wrap" style="display:${coordinatorOptions ? 'block' : 'none'}">
          <label class="label">Proiect activ *</label>
          <select id="prop-project" class="input">
            <option value="">Selectează proiectul</option>
            ${projectOptions}
          </select>
        </div>
        <div>
          <label class="label">Descriere detaliată *</label>
          <textarea id="prop-desc" class="textarea" placeholder="Descrie propunerea, problema și beneficiul așteptat..."></textarea>
        </div>
      </div>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
      <button class="btn-brand" onclick="Propuneri.saveNew()">Trimite propunerea</button>
    `);
    this.updateRecipientFields();
  },

  updateRecipientFields() {
    const target = document.getElementById('prop-target')?.value || 'admin_team';
    const wrap = document.getElementById('prop-project-wrap');
    if (wrap) wrap.style.display = target === 'admin_team' ? 'none' : 'block';
  },

  makeReference() {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const suffix = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
    return `PROP-${date}-${suffix}`;
  },

  async saveNew() {
    const title = document.getElementById('prop-title')?.value?.trim();
    const desc = document.getElementById('prop-desc')?.value?.trim();
    const target = document.getElementById('prop-target')?.value || 'admin_team';
    if (!title || !desc) { showToast('Completează titlul și descrierea propunerii', 'error'); return; }

    let managerId = null;
    let projectName = '';
    if (target.startsWith('coord:')) {
      managerId = target.slice(6);
      const projectId = document.getElementById('prop-project')?.value;
      const project = this.projects.find(p => String(p.id) === String(projectId));
      if (!project) { showToast('Selectează proiectul activ pentru coordonator', 'error'); return; }
      if (String(project.manager_id) !== String(managerId)) {
        showToast('Proiectul selectat nu corespunde coordonatorului', 'error');
        return;
      }
      projectName = project.name || project.title || 'Proiect activ';
    }

    const authorId = this.currentId();
    if (!authorId) { showToast('Sesiunea nu este disponibilă. Reautentifică-te.', 'error'); return; }
    const description = projectName ? `Proiect vizat: ${projectName}\n\n${desc}` : desc;
    const payload = {
      reference_number: this.makeReference(),
      title,
      description,
      author_id: authorId,
      manager_id: managerId,
      status: 'in_review',
    };
    const { data, error } = await DB.createProposal(payload);
    if (error) { showToast('Eroare la trimitere: ' + error.message, 'error'); return; }

    await this.notifyNewProposal(data || payload, target, managerId);
    closeModalForce();
    showToast('Propunere trimisă cu succes', 'success');
    await this.render();
  },

  async notifyNewProposal(proposal, target, managerId) {
    if (typeof DB.createNotifications !== 'function') return;
    const currentId = this.currentId();
    const recipients = target === 'admin_team'
      ? this.users.filter(u => u.role === 'admin' && String(u.id) !== String(currentId))
      : this.users.filter(u => String(u.id) === String(managerId));
    if (!recipients.length) return;
    const ref = proposal.reference_number || 'nouă';
    await DB.createNotifications(recipients.map(user => ({
      user_id: user.id,
      type: 'info',
      title: 'Propunere nouă',
      message: `${this.currentProfile().full_name || 'Un coleg'} a trimis propunerea ${ref} către responsabilitatea ta.`,
      link: 'propuneri',
      is_read: false,
    })));
  },

  openStatusModal(id) {
    const proposal = this.items.find(p => String(p.id) === String(id));
    if (!proposal || !this.isReceived(proposal) || !this.canReview()) return;
    const options = [
      ['in_review', 'În analiză'],
      ['approved', 'Aprobată'],
      ['rejected', 'Respinsă'],
      ['implemented', 'Implementată'],
    ].map(([value, label]) => `<option value="${value}" ${proposal.status === value ? 'selected' : ''}>${label}</option>`).join('');
    openModal(`Status propunere ${this.escapeHtml(proposal.reference_number || '')}`, `
      <div class="space-y-3">
        <div class="text-sm text-muted">Actualizează statusul propunerii. Autorul va primi automat o notificare.</div>
        <div>
          <label class="label">Status *</label>
          <select id="prop-status" class="input">${options}</select>
        </div>
      </div>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
      <button class="btn-brand" onclick="Propuneri.saveStatus(${this.jsArg(id)})">Salvează statusul</button>
    `);
  },

  async saveStatus(id) {
    const proposal = this.items.find(p => String(p.id) === String(id));
    const status = document.getElementById('prop-status')?.value;
    if (!proposal || !status) return;
    const { error } = await DB.updateProposalStatus(id, status);
    if (error) { showToast('Nu s-a putut actualiza statusul: ' + error.message, 'error'); return; }
    if (typeof DB.createNotifications === 'function' && proposal.author_id && String(proposal.author_id) !== String(this.currentId())) {
      await DB.createNotifications([{
        user_id: proposal.author_id,
        type: 'info',
        title: 'Status propunere actualizat',
        message: `Propunerea ${proposal.reference_number || ''} are acum statusul „${this.statusMeta(status).label}”.`,
        link: 'propuneri',
        is_read: false,
      }]);
    }
    closeModalForce();
    showToast('Status actualizat', 'success');
    await this.render();
  },
};
