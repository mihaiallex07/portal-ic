// ============================================================
// Formulare & Cereri — Portal Inginerie Creativă
// Design: flux clar de cereri cu destinatar, responsabilitate și urmărire.
// Administrator: acces la toate cererile și ștergere definitivă.
// ============================================================
const Formulare = {
  cereriAll: [],
  cereriMele: [],
  cereriPrimite: [],
  requestProjects: [],
  requestCoordinators: {},
  activeTab: 'mele',
  filterStatus: 'all',
  filterTip: 'all',
  isSubmitting: false,

  availabilityTypes: {
    concediu_odihna: { label: '🌴 Concediu de odihnă', shortLabel: 'Concediu de odihnă', defaultTitle: 'Cerere concediu de odihnă' },
    concediu_medical: { label: '🩺 Concediu medical', shortLabel: 'Concediu', defaultTitle: 'Cerere concediu medical' },
    absenta: { label: '📅 Altă absență', shortLabel: 'Absență aprobată', defaultTitle: 'Cerere absență' },
    telemunca: { label: '🏠 Telemuncă', shortLabel: 'Telemuncă', defaultTitle: 'Cerere telemuncă' },
  },

  isAvailabilityRequest(type) {
    return Object.prototype.hasOwnProperty.call(this.availabilityTypes, type);
  },

  availabilityPeriodText(request) {
    if (!request?.period_start || !request?.period_end) return '';
    const format = date => new Date(`${date}T12:00:00`).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return request.period_start === request.period_end
      ? format(request.period_start)
      : `${format(request.period_start)} – ${format(request.period_end)}`;
  },

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  },

  async render() {
    document.getElementById('page-content').innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>Se încarcă cererile...</p></div>`;
    await this.loadCereri();
    this.renderPage();
  },

  async loadCereri() {
    const sb = getSupabase();
    const userId = Auth.currentUser?.id;
    const isAdmin = Auth.currentProfile?.role === 'admin';
    if (!userId) return;

    const [{ data: mele, error: errMele }, { data: primite, error: errPrimite }] = await Promise.all([
      sb.from('formulare_cereri').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      sb.from('formulare_cereri').select('*').eq('recipient_id', userId).order('created_at', { ascending: false }),
    ]);
    if (errMele) console.error('[Formulare] loadCereri mele:', errMele);
    if (errPrimite) console.error('[Formulare] loadCereri primite:', errPrimite);
    this.cereriMele = mele || [];
    this.cereriPrimite = primite || [];

    if (isAdmin) {
      const { data: all, error } = await sb.from('formulare_cereri').select('*').order('created_at', { ascending: false });
      if (error) console.error('[Formulare] loadCereri toate:', error);
      this.cereriAll = all || [];
    } else {
      this.cereriAll = [];
    }

    const unique = [...new Map([...this.cereriMele, ...this.cereriPrimite, ...this.cereriAll].map(item => [String(item.id), item])).values()];
    const profileIds = [...new Set(unique.flatMap(item => [item.user_id, item.recipient_id, item.rezolvat_de]).filter(Boolean))];
    const projectIds = [...new Set(unique.map(item => item.project_id).filter(Boolean))];
    const [profilesResult, projectsResult] = await Promise.all([
      profileIds.length ? sb.from('profiles').select('id,full_name,name,email,employee_code,department').in('id', profileIds) : Promise.resolve({ data: [] }),
      projectIds.length ? sb.from('projects').select('id,name,code,abbreviation,manager_id').in('id', projectIds) : Promise.resolve({ data: [] }),
    ]);
    const profileMap = Object.fromEntries((profilesResult.data || []).map(profile => [profile.id, profile]));
    const projectMap = Object.fromEntries((projectsResult.data || []).map(project => [String(project.id), project]));
    const enrich = request => ({ ...request, _profile: profileMap[request.user_id] || null, _recipient: profileMap[request.recipient_id] || null, _resolvedBy: profileMap[request.rezolvat_de] || null, _project: projectMap[String(request.project_id)] || null });
    this.cereriMele = this.cereriMele.map(enrich);
    this.cereriPrimite = this.cereriPrimite.map(enrich);
    this.cereriAll = this.cereriAll.map(enrich);
  },

  recipientText(request) {
    if (request.recipient_type === 'office') return 'Office Manager';
    if (request.recipient_type === 'coordonator_proiect') {
      const project = request._project;
      const recipient = request._recipient;
      const projectLabel = project ? `${project.code || project.abbreviation || ''}${project.code || project.abbreviation ? ' · ' : ''}${project.name}` : 'proiect selectat';
      return `Coordonator de proiect · ${projectLabel}${recipient ? ` · ${recipient.full_name || recipient.name || 'Coordonator'}` : ''}`;
    }
    return 'Administrator';
  },

  renderPage() {
    const profile = Auth.currentProfile || {};
    const isAdmin = profile.role === 'admin';
    const isCoord = profile.role === 'coordonator';
    const isOffice = String(profile.email || '').toLowerCase() === 'office@ingineriecreativa.ro';
    const userId = Auth.currentUser?.id;
    const hasInbox = isAdmin || isCoord || isOffice || this.cereriPrimite.length > 0;
    const tab = isAdmin && this.activeTab === 'toate' ? 'toate' : (!isAdmin && this.activeTab === 'primite' && hasInbox ? 'primite' : this.activeTab === 'primite' && hasInbox ? 'primite' : 'mele');
    const tipLabels = {
      echipament: '💻 Echipament IT/Birou', consumabile: '📦 Consumabile', extindere_ore: '⏱ Extindere ore', altele: '📝 Altele',
      ...Object.fromEntries(Object.entries(this.availabilityTypes).map(([type, details]) => [type, details.label])),
    };
    const statusColors = {
      trimis: { bg: '#fef3c7', color: '#d97706', label: 'În așteptare' },
      aprobat: { bg: '#d1fae5', color: '#059669', label: 'Aprobată' },
      respins: { bg: '#fee2e2', color: '#dc2626', label: 'Respinsă' },
      rezolvat: { bg: '#dbeafe', color: '#1d4ed8', label: 'Rezolvată' },
    };
    let lista = tab === 'toate' ? [...this.cereriAll] : tab === 'primite' ? [...this.cereriPrimite] : [...this.cereriMele];
    if (this.filterStatus !== 'all') lista = lista.filter(request => request.status === this.filterStatus);
    if (this.filterTip !== 'all') lista = lista.filter(request => request.tip_cerere === this.filterTip);
    const statsFor = rows => ({ total: rows.length, trimis: rows.filter(r => r.status === 'trimis').length, aprobat: rows.filter(r => r.status === 'aprobat').length, respins: rows.filter(r => r.status === 'respins').length, rezolvat: rows.filter(r => r.status === 'rezolvat').length });
    const stats = statsFor(tab === 'toate' ? this.cereriAll : tab === 'primite' ? this.cereriPrimite : this.cereriMele);

    const renderCard = request => {
      const status = statusColors[request.status] || statusColors.trimis;
      const canResolve = request.status === 'trimis' && (isAdmin || request.recipient_id === userId);
      const canMarkResolved = request.status === 'aprobat' && !this.isAvailabilityRequest(request.tip_cerere) && (isAdmin || request.recipient_id === userId);
      const requester = request._profile?.full_name || request._profile?.name || 'Angajat';
      const date = request.created_at ? new Date(request.created_at).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
      const completionLabel = request.status === 'aprobat' ? 'Aprobată' : request.status === 'respins' ? 'Respinsă' : 'Rezolvată';
      const completionDate = request.status === 'rezolvat' ? request.rezolvat_la : request.aprobat_la;
      const resolvedByName = request._resolvedBy?.full_name || request._resolvedBy?.name || request._resolvedBy?.email || '';
      return `<article style="background:var(--card-bg);border:1px solid var(--border);border-left:4px solid ${status.color};border-radius:10px;padding:14px 18px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:5px">
            <span style="font-size:14px;font-weight:700;color:var(--text)">${this.escapeHtml(request.titlu || '(fără titlu)')}</span>
            <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:8px;background:${status.bg};color:${status.color}">${status.label}</span>
            <span style="font-size:11px;color:var(--text-muted);background:var(--bg);padding:2px 8px;border-radius:8px;border:1px solid var(--border)">${tipLabels[request.tip_cerere] || this.escapeHtml(request.tip_cerere)}</span>
          </div>
          ${tab !== 'mele' ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">👤 Solicitant: ${this.escapeHtml(requester)}${request._profile?.employee_code ? ` · ${this.escapeHtml(request._profile.employee_code)}` : ''}</div>` : ''}
          <div style="font-size:12px;color:var(--brand-dark);font-weight:700;margin-bottom:5px">📬 Către: ${this.escapeHtml(this.recipientText(request))}</div>
          ${this.availabilityPeriodText(request) ? `<div style="font-size:12px;color:#0f766e;font-weight:700;margin:0 0 5px">📅 Perioadă: ${this.escapeHtml(this.availabilityPeriodText(request))}</div>` : ''}
          ${request.descriere ? `<div style="font-size:13px;color:var(--text-muted);line-height:1.5;margin-bottom:4px">${this.escapeHtml(request.descriere)}</div>` : ''}
          ${request.detalii?.proiect || request.detalii?.ore_solicitate ? `<div style="font-size:12px;color:var(--text-muted)">📁 ${this.escapeHtml(request.detalii.proiect || '')}${request.detalii.ore_solicitate ? ` · ⏱ ${request.detalii.ore_solicitate}h solicitate` : ''}</div>` : ''}
          ${request.motiv_respingere ? `<div style="font-size:12px;color:#dc2626;margin-top:4px">❌ Motiv: ${this.escapeHtml(request.motiv_respingere)}</div>` : ''}
          ${request.status !== 'trimis' ? `<div style="font-size:11px;color:var(--text-muted);margin-top:3px">✍️ ${completionLabel}${completionDate ? ` · ${new Date(completionDate).toLocaleDateString('ro-RO')}` : ''}${request.status === 'rezolvat' && resolvedByName ? ` · de ${this.escapeHtml(resolvedByName)}` : ''}</div>` : ''}
          <div style="font-size:11px;color:var(--text-muted);margin-top:5px">📅 ${date}</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;align-items:flex-start;flex-wrap:wrap">
          ${canResolve ? `<button onclick="Formulare.approveRequest('${request.id}')" style="font-size:12px;padding:5px 12px;border-radius:6px;background:#d1fae5;color:#059669;border:none;cursor:pointer;font-weight:600">✓ Aprobă</button><button onclick="Formulare.rejectRequest('${request.id}')" style="font-size:12px;padding:5px 12px;border-radius:6px;background:#fee2e2;color:#dc2626;border:none;cursor:pointer;font-weight:600">✗ Respinge</button>` : ''}
          ${canMarkResolved ? `<button onclick="Formulare.resolveRequest('${request.id}')" style="font-size:12px;padding:5px 12px;border-radius:6px;background:#dbeafe;color:#1d4ed8;border:none;cursor:pointer;font-weight:600">✓ Rezolvat</button>` : ''}
          ${isAdmin ? `<button onclick="Formulare.deleteRequest('${request.id}')" style="font-size:12px;padding:5px 10px;border-radius:6px;background:transparent;color:#dc2626;border:1px solid #fecaca;cursor:pointer" title="Șterge definitiv (doar administrator)">🗑 Șterge</button>` : ''}
        </div>
      </article>`;
    };

    document.getElementById('page-content').innerHTML = `<div style="max-width:1120px;margin:0 auto;padding:0 8px">
      <div class="page-header" style="margin-bottom:16px"><div><h1 class="page-title">Formulare & Cereri</h1><p class="page-subtitle">Trimite cererea direct persoanei responsabile și urmărește răspunsul în portal.</p></div><button class="btn-primary" onclick="Formulare.openCreateModal()">+ Cerere nouă</button></div>
      <section style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:20px">
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px"><strong style="font-size:12px;color:#92400e">Administrator</strong><div style="font-size:11px;color:#92400e;margin-top:4px">1-to-1, cereri de concediu, telemuncă, decizii interne și solicitări generale.</div></div>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px"><strong style="font-size:12px;color:#1d4ed8">Coordonator proiect</strong><div style="font-size:11px;color:#1d4ed8;margin-top:4px">Extindere de buget, ore sau solicitări legate de proiect.</div></div>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px"><strong style="font-size:12px;color:#166534">Office</strong><div style="font-size:11px;color:#166534;margin-top:4px">Hârtie, pixuri, căști, mouse, toner și alte necesități de birou.</div></div>
      </section>
      <div style="display:flex;gap:0;margin-bottom:18px;border-bottom:2px solid var(--border)">
        <button onclick="Formulare.setTab('mele')" style="padding:9px 20px;border:none;background:none;cursor:pointer;font-size:14px;font-weight:600;color:${tab === 'mele' ? 'var(--brand-dark)' : 'var(--text-muted)'};border-bottom:${tab === 'mele' ? '2px solid var(--brand)' : '2px solid transparent'};margin-bottom:-2px">Cererile mele <span style="margin-left:6px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:1px 7px;font-size:11px">${this.cereriMele.length}</span></button>
        ${hasInbox && !isAdmin ? `<button onclick="Formulare.setTab('primite')" style="padding:9px 20px;border:none;background:none;cursor:pointer;font-size:14px;font-weight:600;color:${tab === 'primite' ? 'var(--brand-dark)' : 'var(--text-muted)'};border-bottom:${tab === 'primite' ? '2px solid var(--brand)' : '2px solid transparent'};margin-bottom:-2px">Cereri primite <span style="margin-left:6px;background:${this.cereriPrimite.some(r => r.status === 'trimis') ? '#fef3c7' : 'var(--bg)'};border:1px solid var(--border);border-radius:10px;padding:1px 7px;font-size:11px">${this.cereriPrimite.length}</span></button>` : ''}
        ${isAdmin ? `<button onclick="Formulare.setTab('toate')" style="padding:9px 20px;border:none;background:none;cursor:pointer;font-size:14px;font-weight:600;color:${tab === 'toate' ? 'var(--brand-dark)' : 'var(--text-muted)'};border-bottom:${tab === 'toate' ? '2px solid var(--brand)' : '2px solid transparent'};margin-bottom:-2px">Toate cererile <span style="margin-left:6px;background:${this.cereriAll.some(r => r.status === 'trimis') ? '#fef3c7' : 'var(--bg)'};border:1px solid var(--border);border-radius:10px;padding:1px 7px;font-size:11px">${this.cereriAll.length}</span></button>` : ''}
      </div>
      <section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:18px">${[{ label: 'Total', val: stats.total, color: '#6366f1', icon: '📋' }, { label: 'În așteptare', val: stats.trimis, color: '#d97706', icon: '⏳' }, { label: 'Aprobate', val: stats.aprobat, color: '#059669', icon: '✅' }, { label: 'Respinse', val: stats.respins, color: '#dc2626', icon: '❌' }, { label: 'Rezolvate', val: stats.rezolvat, color: '#1d4ed8', icon: '✓' }].map(stat => `<div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center"><div style="font-size:18px">${stat.icon}</div><div style="font-size:20px;font-weight:800;color:${stat.color}">${stat.val}</div><div style="font-size:11px;color:var(--text-muted)">${stat.label}</div></div>`).join('')}</section>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center"><select onchange="Formulare.setFilterStatus(this.value)" style="padding:7px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:var(--bg);color:var(--text)"><option value="all">Toate statusurile</option><option value="trimis" ${this.filterStatus === 'trimis' ? 'selected' : ''}>⏳ În așteptare</option><option value="aprobat" ${this.filterStatus === 'aprobat' ? 'selected' : ''}>✅ Aprobate</option><option value="respins" ${this.filterStatus === 'respins' ? 'selected' : ''}>❌ Respinse</option><option value="rezolvat" ${this.filterStatus === 'rezolvat' ? 'selected' : ''}>✓ Rezolvate</option></select><select onchange="Formulare.setFilterTip(this.value)" style="padding:7px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:var(--bg);color:var(--text)"><option value="all">Toate tipurile</option><option value="echipament" ${this.filterTip === 'echipament' ? 'selected' : ''}>💻 Echipament</option><option value="consumabile" ${this.filterTip === 'consumabile' ? 'selected' : ''}>📦 Consumabile</option><option value="extindere_ore" ${this.filterTip === 'extindere_ore' ? 'selected' : ''}>⏱ Extindere ore</option><option value="concediu_odihna" ${this.filterTip === 'concediu_odihna' ? 'selected' : ''}>🌴 Concediu de odihnă</option><option value="concediu_medical" ${this.filterTip === 'concediu_medical' ? 'selected' : ''}>🩺 Concediu medical</option><option value="absenta" ${this.filterTip === 'absenta' ? 'selected' : ''}>📅 Altă absență</option><option value="telemunca" ${this.filterTip === 'telemunca' ? 'selected' : ''}>🏠 Telemuncă</option><option value="altele" ${this.filterTip === 'altele' ? 'selected' : ''}>📝 Altele</option></select><span style="font-size:12px;color:var(--text-muted)">${lista.length} cereri afișate</span></div>
      <div style="display:flex;flex-direction:column;gap:8px">${lista.length ? lista.map(renderCard).join('') : `<div style="text-align:center;padding:48px 20px;color:var(--text-muted)"><div style="font-size:40px;margin-bottom:12px">📋</div><div style="font-size:15px;font-weight:600">Nicio cerere${this.filterStatus !== 'all' || this.filterTip !== 'all' ? ' pentru filtrele selectate' : ''}</div><div style="font-size:13px;margin-top:8px">Apasă „Cerere nouă” pentru a trimite o solicitare responsabilului potrivit.</div></div>`}</div>
    </div>`;
  },

  setTab(tab) { this.activeTab = tab; this.filterStatus = 'all'; this.filterTip = 'all'; this.renderPage(); },
  setFilterStatus(status) { this.filterStatus = status; this.renderPage(); },
  setFilterTip(type) { this.filterTip = type; this.renderPage(); },

  async openCreateModal() {
    const sb = getSupabase();
    const userId = Auth.currentUser?.id;
    const { data: memberships, error: membershipError } = await sb.from('project_members').select('project_id').eq('user_id', userId);
    if (membershipError) console.error('[Formulare] apartenențe proiecte pentru cerere:', membershipError);
    const memberProjectIds = [...new Set((memberships || []).map(item => item.project_id).filter(Boolean))];
    const { data: projects, error: projectsError } = memberProjectIds.length
      ? await sb.from('projects').select('id,name,code,abbreviation').eq('status', 'activ').in('id', memberProjectIds).order('name')
      : { data: [], error: null };
    if (projectsError) console.error('[Formulare] proiecte pentru cerere:', projectsError);
    this.requestProjects = projects || [];
    const projectIds = this.requestProjects.map(project => project.id);
    const { data: coordinatorMemberships, error: coordinatorsError } = projectIds.length
      ? await sb.from('project_members').select('project_id,user_id').in('project_id', projectIds).eq('role', 'coordonator')
      : { data: [], error: null };
    if (coordinatorsError) console.error('[Formulare] coordonatori proiecte pentru cerere:', coordinatorsError);
    const coordinatorIds = [...new Set((coordinatorMemberships || []).map(item => item.user_id).filter(Boolean))];
    const { data: coordinatorProfiles, error: coordinatorProfilesError } = coordinatorIds.length
      ? await sb.from('profiles').select('id,full_name,name,email,is_active').in('id', coordinatorIds).eq('is_active', true)
      : { data: [], error: null };
    if (coordinatorProfilesError) console.error('[Formulare] profiluri coordonatori pentru cerere:', coordinatorProfilesError);
    const profileMap = Object.fromEntries((coordinatorProfiles || []).map(profile => [profile.id, profile]));
    this.requestCoordinators = (coordinatorMemberships || []).reduce((map, membership) => {
      const profile = profileMap[membership.user_id];
      if (!profile) return map;
      if (!map[membership.project_id]) map[membership.project_id] = [];
      map[membership.project_id].push(profile);
      return map;
    }, {});
    this.requestProjects = this.requestProjects.filter(project => (this.requestCoordinators[project.id] || []).length > 0);
    const projectOptions = this.requestProjects.map(project => `<option value="${project.id}">${this.escapeHtml(`${project.code || project.abbreviation || 'PRJ'} · ${project.name}`)}</option>`).join('');
    const modal = document.createElement('div');
    modal.id = 'cerere-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';
    modal.innerHTML = `<div style="background:var(--card-bg);border-radius:16px;padding:28px 32px;width:100%;max-width:600px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px"><h2 style="font-size:18px;font-weight:700;margin:0">Cerere nouă</h2><button onclick="document.getElementById('cerere-modal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted)">✕</button></div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div><label style="font-size:12px;font-weight:700;color:var(--text-muted);display:block;margin-bottom:5px">Către cine trimiți cererea? *</label><select id="cerere-destinatar" onchange="Formulare.updateRecipientFields()" style="width:100%;padding:10px 12px;border:1.5px solid var(--brand);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text)"><option value="administrator">Administrator</option><option value="coordonator_proiect">Coordonator de proiect</option><option value="office">Office Manager</option></select><div id="cerere-destinatar-hint" style="font-size:12px;line-height:1.4;color:var(--text-muted);margin-top:6px">Cererea va fi trimisă administratorilor.</div></div>
        <div id="cerere-project-recipient" style="display:none">${this.requestProjects.length ? `<div style="display:flex;flex-direction:column;gap:10px"><div><label style="font-size:12px;font-weight:700;color:var(--text-muted);display:block;margin-bottom:5px">Proiect *</label><select id="cerere-destinatar-proiect" onchange="Formulare.updateCoordinatorOptions()" style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text)"><option value="">Selectează proiectul</option>${projectOptions}</select><div style="font-size:11px;color:var(--text-muted);margin-top:4px">Sunt afișate doar proiectele în care ești înrolat.</div></div><div><label style="font-size:12px;font-weight:700;color:var(--text-muted);display:block;margin-bottom:5px">Coordonator *</label><select id="cerere-destinatar-coordonator" disabled style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text)"><option value="">Alege mai întâi proiectul</option></select></div></div>` : `<div style="padding:10px 12px;border-radius:8px;background:#fff7ed;color:#9a3412;font-size:12px">Nu ești înrolat în niciun proiect activ cu coordonator configurat.</div>`}</div>
        <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Tip cerere *</label><select id="cerere-tip" onchange="Formulare.updateRequestTypeFields()" style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text)"><option value="echipament">💻 Echipament IT/Birou</option><option value="consumabile">📦 Consumabile (hârtie, toner etc.)</option><option value="extindere_ore">⏱ Extindere buget ore proiect/task</option><optgroup label="Disponibilitate & program"><option value="concediu_odihna">🌴 Concediu de odihnă</option><option value="concediu_medical">🩺 Concediu medical</option><option value="absenta">📅 Altă absență</option><option value="telemunca">🏠 Telemuncă</option></optgroup><option value="altele">📝 Altele</option></select></div>
        <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Titlu / Subiect *</label><input id="cerere-titlu" type="text" oninput="this.dataset.autoTitle='false'" placeholder="Ex.: Mouse wireless, hârtie A4 sau extindere buget task" style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);box-sizing:border-box"></div>
        <div><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Descriere / Motivație</label><textarea id="cerere-desc" rows="4" placeholder="Descrie necesitatea, cantitatea, urgența sau contextul proiectului." style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);box-sizing:border-box;resize:vertical"></textarea></div>
        <div id="cerere-extra-ore" style="display:none"><label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Detalii extindere ore</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><input id="cerere-proiect" type="text" placeholder="Proiect / Task" style="padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);box-sizing:border-box"><input id="cerere-ore" type="number" min="1" max="200" placeholder="Ore solicitate" style="padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);box-sizing:border-box"></div></div>
        <div id="cerere-availability-period" style="display:none;padding:12px;border-radius:9px;border:1px solid #99f6e4;background:#f0fdfa"><label style="font-size:12px;font-weight:700;color:#0f766e;display:block;margin-bottom:7px">Perioada solicitată *</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><label style="font-size:11px;color:#0f766e;display:block;margin-bottom:4px">Data început</label><input id="cerere-period-start" type="date" style="width:100%;padding:9px 10px;border:1.5px solid #99f6e4;border-radius:8px;font-size:13px;background:#fff;color:var(--text);box-sizing:border-box"></div><div><label style="font-size:11px;color:#0f766e;display:block;margin-bottom:4px">Data finală</label><input id="cerere-period-end" type="date" style="width:100%;padding:9px 10px;border:1.5px solid #99f6e4;border-radius:8px;font-size:13px;background:#fff;color:var(--text);box-sizing:border-box"></div></div><div id="cerere-availability-hint" style="font-size:11px;line-height:1.4;color:#0f766e;margin-top:7px"></div></div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px"><button onclick="document.getElementById('cerere-modal').remove()" style="padding:9px 20px;border:1.5px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:14px">Anulează</button><button id="cerere-submit" onclick="Formulare.submitRequest()" class="btn-primary" style="padding:9px 20px">Trimite cererea</button></div>
    </div>`;
    this.isSubmitting = false;
    document.body.appendChild(modal);
    modal.addEventListener('click', event => { if (event.target === modal) modal.remove(); });
    this.updateRequestTypeFields();
  },

  updateCoordinatorOptions() {
    const projectId = Number(document.getElementById('cerere-destinatar-proiect')?.value) || null;
    const select = document.getElementById('cerere-destinatar-coordonator');
    if (!select) return;
    const coordinators = projectId ? (this.requestCoordinators[projectId] || []) : [];
    select.disabled = coordinators.length === 0;
    select.innerHTML = coordinators.length
      ? `<option value="">Selectează coordonatorul</option>${coordinators.map(person => `<option value="${person.id}">${this.escapeHtml(person.full_name || person.name || person.email || 'Coordonator')}</option>`).join('')}`
      : '<option value="">Alege mai întâi proiectul</option>';
  },

  updateRecipientFields() {
    const type = document.getElementById('cerere-destinatar')?.value;
    const projectBlock = document.getElementById('cerere-project-recipient');
    const hint = document.getElementById('cerere-destinatar-hint');
    if (projectBlock) projectBlock.style.display = type === 'coordonator_proiect' ? 'block' : 'none';
    if (hint) hint.textContent = type === 'office'
      ? 'Cererea va ajunge la Office pentru necesități de birou.'
      : type === 'coordonator_proiect'
        ? 'Alege proiectul, apoi coordonatorul acelui proiect.'
        : 'Cererea va fi notificată administratorilor, care pot vedea toate cererile adresate lor.';
  },

  updateRequestTypeFields() {
    const type = document.getElementById('cerere-tip')?.value;
    const extra = document.getElementById('cerere-extra-ore');
    const periodBlock = document.getElementById('cerere-availability-period');
    const recipient = document.getElementById('cerere-destinatar');
    const title = document.getElementById('cerere-titlu');
    const description = document.getElementById('cerere-desc');
    const periodHint = document.getElementById('cerere-availability-hint');
    const isAvailability = this.isAvailabilityRequest(type);
    if (extra) extra.style.display = type === 'extindere_ore' ? 'block' : 'none';
    if (periodBlock) periodBlock.style.display = isAvailability ? 'block' : 'none';

    if (recipient) {
      recipient.disabled = isAvailability;
      if (isAvailability) recipient.value = 'administrator';
    }

    if (isAvailability) {
      const details = this.availabilityTypes[type];
      if (title && (!title.value.trim() || title.dataset.autoTitle === 'true')) {
        title.value = details.defaultTitle;
        title.dataset.autoTitle = 'true';
      }
      if (description) description.placeholder = type === 'concediu_medical'
        ? 'Opțional. Nu este necesar să incluzi informații medicale sau diagnostice.'
        : 'Opțional: orice informație utilă pentru planificare.';
      if (periodHint) periodHint.textContent = type === 'telemunca'
        ? 'După aprobare, task-urile rămân vizibile în Process Overview și apare marcajul „Telemuncă”.'
        : 'După aprobare, perioada apare în Process Overview ca indisponibilitate și înlocuiește task-urile suprapuse.';
      this.updateRecipientFields();
      return;
    }

    if (recipient) recipient.disabled = false;
    if (title && title.dataset.autoTitle === 'true') {
      title.value = '';
      delete title.dataset.autoTitle;
    }
    if (description) description.placeholder = 'Descrie necesitatea, cantitatea, urgența sau contextul proiectului.';
    if (type === 'extindere_ore' && document.getElementById('cerere-destinatar')) {
      document.getElementById('cerere-destinatar').value = 'coordonator_proiect';
    }
    this.updateRecipientFields();
  },

  async submitRequest() {
    // Singura operație care inserează cererea. Schimbarea destinatarului doar actualizează UI-ul.
    if (this.isSubmitting) return;
    const submitButton = document.getElementById('cerere-submit');
    this.isSubmitting = true;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Se trimite…';
      submitButton.style.opacity = '0.65';
      submitButton.style.cursor = 'wait';
    }

    try {
      const recipientType = document.getElementById('cerere-destinatar')?.value;
      const type = document.getElementById('cerere-tip')?.value;
      const title = document.getElementById('cerere-titlu')?.value?.trim();
      const description = document.getElementById('cerere-desc')?.value?.trim();
      const isAvailability = this.isAvailabilityRequest(type);
      const periodStart = isAvailability ? document.getElementById('cerere-period-start')?.value || null : null;
      const periodEnd = isAvailability ? document.getElementById('cerere-period-end')?.value || null : null;
      const projectId = recipientType === 'coordonator_proiect' ? Number(document.getElementById('cerere-destinatar-proiect')?.value) || null : null;
      const recipientId = recipientType === 'coordonator_proiect' ? document.getElementById('cerere-destinatar-coordonator')?.value || null : null;
      if (!title) { showToast('Completează titlul cererii.', 'error'); return; }
      if (!recipientType) { showToast('Selectează destinatarul cererii.', 'error'); return; }
      if (recipientType === 'coordonator_proiect' && !projectId) { showToast('Selectează proiectul.', 'error'); return; }
      if (recipientType === 'coordonator_proiect' && !recipientId) { showToast('Selectează coordonatorul proiectului.', 'error'); return; }
      if (isAvailability && (!periodStart || !periodEnd)) { showToast('Selectează data de început și data finală.', 'error'); return; }
      if (isAvailability && periodEnd < periodStart) { showToast('Data finală nu poate fi înaintea datei de început.', 'error'); return; }

      const details = {};
      if (type === 'extindere_ore') {
        details.proiect = document.getElementById('cerere-proiect')?.value?.trim() || null;
        details.ore_solicitate = parseInt(document.getElementById('cerere-ore')?.value, 10) || null;
      }
      if (isAvailability) details.disponibilitate = true;

      const { error } = await getSupabase().from('formulare_cereri').insert({
        user_id: Auth.currentUser?.id,
        tip_cerere: type,
        titlu: title,
        descriere: description || null,
        detalii: details,
        status: 'trimis',
        recipient_type: recipientType,
        recipient_id: recipientId,
        project_id: projectId,
        period_start: periodStart,
        period_end: periodEnd,
      });
      if (error) { showToast(`Eroare la trimitere: ${error.message}`, 'error'); return; }
      document.getElementById('cerere-modal')?.remove();
      showToast('✅ Cererea a fost trimisă și destinatarul a fost notificat.', 'success');
      await this.loadCereri();
      this.activeTab = 'mele';
      this.renderPage();
    } finally {
      this.isSubmitting = false;
      const currentButton = document.getElementById('cerere-submit');
      if (currentButton) {
        currentButton.disabled = false;
        currentButton.textContent = 'Trimite cererea';
        currentButton.style.opacity = '';
        currentButton.style.cursor = '';
      }
    }
  },

  async approveRequest(id) {
    const request = [...this.cereriAll, ...this.cereriPrimite].find(item => String(item.id) === String(id));
    const userId = Auth.currentUser?.id;
    if (!request || !(Auth.currentProfile?.role === 'admin' || request.recipient_id === userId)) { showToast('Nu ai dreptul să soluționezi această cerere.', 'error'); return; }
    const { error } = await getSupabase().from('formulare_cereri').update({ status: 'aprobat', aprobat_de: userId, aprobat_la: new Date().toISOString(), motiv_respingere: null, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { showToast(`Eroare: ${error.message}`, 'error'); return; }
    await this.notifyRequester(request, 'aprobat');
    showToast('✅ Cerere aprobată.', 'success');
    await this.loadCereri(); this.renderPage();
  },

  async rejectRequest(id) {
    const request = [...this.cereriAll, ...this.cereriPrimite].find(item => String(item.id) === String(id));
    const userId = Auth.currentUser?.id;
    if (!request || !(Auth.currentProfile?.role === 'admin' || request.recipient_id === userId)) { showToast('Nu ai dreptul să soluționezi această cerere.', 'error'); return; }
    const reason = prompt('Motiv respingere (opțional):');
    if (reason === null) return;
    const { error } = await getSupabase().from('formulare_cereri').update({ status: 'respins', aprobat_de: userId, aprobat_la: new Date().toISOString(), motiv_respingere: reason.trim() || null, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { showToast(`Eroare: ${error.message}`, 'error'); return; }
    await this.notifyRequester(request, 'respins', reason.trim());
    showToast('Cerere respinsă.', 'success');
    await this.loadCereri(); this.renderPage();
  },

  async resolveRequest(id) {
    const request = [...this.cereriAll, ...this.cereriPrimite].find(item => String(item.id) === String(id));
    const userId = Auth.currentUser?.id;
    if (!request || request.status !== 'aprobat' || !(Auth.currentProfile?.role === 'admin' || request.recipient_id === userId)) {
      showToast('Nu ai dreptul să marchezi această cerere ca rezolvată.', 'error');
      return;
    }
    if (!confirm('Marchezi această cerere ca rezolvată?')) return;
    const { error } = await getSupabase().from('formulare_cereri').update({
      status: 'rezolvat',
      rezolvat_de: userId,
      rezolvat_la: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) { showToast(`Eroare: ${error.message}`, 'error'); return; }
    await this.notifyRequester(request, 'rezolvat');
    showToast('✓ Cerere marcată ca rezolvată.', 'success');
    await this.loadCereri(); this.renderPage();
  },

  async notifyRequester(request, status, reason = '') {
    if (!request.user_id || request.user_id === Auth.currentUser?.id) return;
    const notification = {
      aprobat: { title: '✅ Cererea ta a fost aprobată', verb: 'aprobată' },
      respins: { title: '❌ Cererea ta a fost respinsă', verb: 'respinsă' },
      rezolvat: { title: '✓ Cererea ta a fost rezolvată', verb: 'marcată ca rezolvată' },
    }[status] || { title: 'Actualizare cerere', verb: 'actualizată' };
    const title = notification.title;
    const message = `„${request.titlu}” a fost ${notification.verb}${reason ? ` — ${reason}` : ''}.`;
    try {
      await getSupabase().from('notifications').insert({ user_id: request.user_id, type: 'cerere', title, message, link: '#formulare', is_read: false });
      if (typeof updateNotifBadge === 'function') updateNotifBadge();
    } catch (error) { console.warn('[Formulare] notificare solicitant:', error); }
  },

  async deleteRequest(id) {
    if (Auth.currentProfile?.role !== 'admin') { showToast('Doar administratorul poate șterge cereri.', 'error'); return; }
    if (!confirm('Ștergi definitiv această cerere? Acțiunea nu poate fi anulată.')) return;
    const { error } = await getSupabase().from('formulare_cereri').delete().eq('id', id);
    if (error) { showToast(`Eroare: ${error.message}`, 'error'); return; }
    showToast('Cererea a fost ștearsă definitiv.', 'success');
    await this.loadCereri(); this.renderPage();
  },
};
