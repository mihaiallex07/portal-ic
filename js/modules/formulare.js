// ============================================================
// Formulare & Cereri — Portal Inginerie Creativă
// Tab "Cererile mele" (toți) + Tab "Toate cererile" (admin/coord)
// ============================================================
const Formulare = {
  cereriAll: [],
  cereriMele: [],
  activeTab: 'mele',
  filterStatus: 'all',
  filterTip: 'all',

  async render() {
    document.getElementById('page-content').innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>Se încarcă cererile...</p></div>`;
    await this.loadCereri();
    this.renderPage();
  },

  async loadCereri() {
    const sb = getSupabase();
    const userId = Auth.currentUser?.id;
    const isAdmin = Auth.currentProfile?.role === 'admin';
    const isCoord = Auth.currentProfile?.role === 'coordonator';
    // Citim cererile fără JOIN (foreign key user_id → auth.users, nu profiles)
    const { data: mele, error: errMele } = await sb.from('formulare_cereri')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (errMele) console.error('[Formulare] loadCereri mele error:', errMele);
    this.cereriMele = mele || [];
    if (isAdmin || isCoord) {
      const { data: all, error: errAll } = await sb.from('formulare_cereri')
        .select('*')
        .order('created_at', { ascending: false });
      if (errAll) console.error('[Formulare] loadCereri all error:', errAll);
      this.cereriAll = all || [];
      // Enrichment: adăugăm full_name din profiles pentru admin view
      if (this.cereriAll.length > 0) {
        const uids = [...new Set(this.cereriAll.map(c => c.user_id).filter(Boolean))];
        const { data: profs } = await sb.from('profiles').select('id,full_name,employee_code,department').in('id', uids);
        const profMap = {};
        (profs || []).forEach(p => { profMap[p.id] = p; });
        this.cereriAll = this.cereriAll.map(c => ({
          ...c,
          _profile: profMap[c.user_id] || null,
        }));
      }
    } else {
      this.cereriAll = [];
    }
  },

  renderPage() {
    const profile = Auth.currentProfile;
    const isAdmin = profile?.role === 'admin';
    const isCoord = profile?.role === 'coordonator';
    const canManageAll = isAdmin || isCoord;
    const userId = Auth.currentUser?.id;
    const isTabAll = canManageAll && this.activeTab === 'toate';

    const tipLabels = { echipament:'💻 Echipament IT/Birou', consumabile:'📦 Consumabile', extindere_ore:'⏱ Extindere ore', altele:'📝 Altele' };
    const statusColors = {
      trimis:  { bg:'#fef3c7', color:'#d97706', label:'Trimis' },
      aprobat: { bg:'#d1fae5', color:'#059669', label:'Aprobat' },
      respins: { bg:'#fee2e2', color:'#dc2626', label:'Respins' },
    };

    let lista = isTabAll ? [...this.cereriAll] : [...this.cereriMele];
    if (this.filterStatus !== 'all') lista = lista.filter(c => c.status === this.filterStatus);
    if (this.filterTip !== 'all') lista = lista.filter(c => c.tip_cerere === this.filterTip);

    const mkStats = arr => ({
      total: arr.length,
      trimis: arr.filter(c => c.status === 'trimis').length,
      aprobat: arr.filter(c => c.status === 'aprobat').length,
      respins: arr.filter(c => c.status === 'respins').length,
    });
    const stats = mkStats(isTabAll ? this.cereriAll : this.cereriMele);
    const statsAll = mkStats(this.cereriAll);

    const renderCard = c => {
      const sc = statusColors[c.status] || statusColors.trimis;
      const tip = tipLabels[c.tip_cerere] || c.tip_cerere;
      const dateStr = c.created_at ? new Date(c.created_at).toLocaleDateString('ro-RO',{day:'2-digit',month:'2-digit',year:'numeric'}) : '';
      return `
        <div style="background:var(--card-bg);border:1px solid var(--border);border-left:4px solid ${sc.color};border-radius:10px;padding:14px 18px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
              <span style="font-size:14px;font-weight:700;color:var(--text)">${c.titlu || '(fără titlu)'}</span>
              <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:8px;background:${sc.bg};color:${sc.color}">${sc.label}</span>
              <span style="font-size:11px;color:var(--text-muted);background:var(--bg);padding:2px 8px;border-radius:8px;border:1px solid var(--border)">${tip}</span>
            </div>
            ${isTabAll ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">👤 ${c._profile?.full_name || 'Angajat'}${c._profile?.employee_code ? ' · ' + c._profile.employee_code : ''}</div>` : ''}
            ${c.descriere ? `<div style="font-size:13px;color:var(--text-muted);line-height:1.5;margin-bottom:4px">${c.descriere}</div>` : ''}
            ${c.detalii?.proiect || c.detalii?.ore_solicitate ? `<div style="font-size:12px;color:var(--text-muted)">📁 ${c.detalii.proiect || ''}${c.detalii.ore_solicitate ? ' · ⏱ ' + c.detalii.ore_solicitate + 'h solicitate' : ''}</div>` : ''}
            ${c.motiv_respingere ? `<div style="font-size:12px;color:#dc2626;margin-top:4px">❌ Motiv: ${c.motiv_respingere}</div>` : ''}
            ${c.status !== 'trimis' ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">✍️ ${c.status === 'aprobat' ? 'Aprobat' : 'Respins'}</div>` : ''}
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">📅 ${dateStr}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;align-items:flex-start">
            ${canManageAll && c.status === 'trimis' ? `
              <button onclick="Formulare.approveRequest('${c.id}')" style="font-size:12px;padding:5px 12px;border-radius:6px;background:#d1fae5;color:#059669;border:none;cursor:pointer;font-weight:600">✓ Aprobă</button>
              <button onclick="Formulare.rejectRequest('${c.id}')" style="font-size:12px;padding:5px 12px;border-radius:6px;background:#fee2e2;color:#dc2626;border:none;cursor:pointer;font-weight:600">✗ Respinge</button>
            ` : ''}
            ${c.user_id === userId && c.status === 'trimis' ? `
              <button onclick="Formulare.deleteRequest('${c.id}')" style="font-size:12px;padding:5px 10px;border-radius:6px;background:transparent;color:var(--text-muted);border:1px solid var(--border);cursor:pointer" title="Șterge">🗑</button>
            ` : ''}
          </div>
        </div>`;
    };

    document.getElementById('page-content').innerHTML = `
      <div style="max-width:960px;margin:0 auto;padding:0 8px">
        <div class="page-header" style="margin-bottom:20px">
          <div>
            <h1 class="page-title">Formulare & Cereri</h1>
            <p class="page-subtitle">Cereri interne — echipamente, consumabile, extindere ore</p>
          </div>
          <button class="btn-primary" onclick="Formulare.openCreateModal()">+ Cerere nouă</button>
        </div>

        <!-- Tab-uri -->
        <div style="display:flex;gap:0;margin-bottom:20px;border-bottom:2px solid var(--border)">
          <button onclick="Formulare.setTab('mele')" style="padding:9px 20px;border:none;background:none;cursor:pointer;font-size:14px;font-weight:600;color:${!isTabAll?'var(--brand-dark)':'var(--text-muted)'};border-bottom:${!isTabAll?'2px solid var(--brand)':'2px solid transparent'};margin-bottom:-2px">
            Cererile mele
            <span style="margin-left:6px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:1px 7px;font-size:11px">${this.cereriMele.length}</span>
          </button>
          ${canManageAll ? `
            <button onclick="Formulare.setTab('toate')" style="padding:9px 20px;border:none;background:none;cursor:pointer;font-size:14px;font-weight:600;color:${isTabAll?'var(--brand-dark)':'var(--text-muted)'};border-bottom:${isTabAll?'2px solid var(--brand)':'2px solid transparent'};margin-bottom:-2px">
              Toate cererile
              <span style="margin-left:6px;background:${statsAll.trimis>0?'#fef3c7':'var(--bg)'};border:1px solid ${statsAll.trimis>0?'#d97706':'var(--border)'};color:${statsAll.trimis>0?'#d97706':'var(--text-muted)'};border-radius:10px;padding:1px 7px;font-size:11px">${this.cereriAll.length}${statsAll.trimis>0?' · '+statsAll.trimis+' noi':''}</span>
            </button>
          ` : ''}
        </div>

        <!-- Statistici -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px">
          ${[
            {label:'Total',val:stats.total,color:'#6366f1',icon:'📋'},
            {label:'În așteptare',val:stats.trimis,color:'#d97706',icon:'⏳'},
            {label:'Aprobate',val:stats.aprobat,color:'#059669',icon:'✅'},
            {label:'Respinse',val:stats.respins,color:'#dc2626',icon:'❌'},
          ].map(s=>`
            <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center">
              <div style="font-size:18px;margin-bottom:2px">${s.icon}</div>
              <div style="font-size:20px;font-weight:800;color:${s.color}">${s.val}</div>
              <div style="font-size:11px;color:var(--text-muted)">${s.label}</div>
            </div>
          `).join('')}
        </div>

        <!-- Filtre -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center">
          <select onchange="Formulare.setFilterStatus(this.value)" style="padding:7px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:var(--bg);color:var(--text);cursor:pointer">
            <option value="all" ${this.filterStatus==='all'?'selected':''}>Toate statusurile</option>
            <option value="trimis" ${this.filterStatus==='trimis'?'selected':''}>⏳ Trimis</option>
            <option value="aprobat" ${this.filterStatus==='aprobat'?'selected':''}>✅ Aprobat</option>
            <option value="respins" ${this.filterStatus==='respins'?'selected':''}>❌ Respins</option>
          </select>
          <select onchange="Formulare.setFilterTip(this.value)" style="padding:7px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:var(--bg);color:var(--text);cursor:pointer">
            <option value="all" ${this.filterTip==='all'?'selected':''}>Toate tipurile</option>
            <option value="echipament" ${this.filterTip==='echipament'?'selected':''}>💻 Echipament</option>
            <option value="consumabile" ${this.filterTip==='consumabile'?'selected':''}>📦 Consumabile</option>
            <option value="extindere_ore" ${this.filterTip==='extindere_ore'?'selected':''}>⏱ Extindere ore</option>
            <option value="altele" ${this.filterTip==='altele'?'selected':''}>📝 Altele</option>
          </select>
          <span style="font-size:12px;color:var(--text-muted)">${lista.length} cereri afișate</span>
        </div>

        <!-- Lista -->
        <div style="display:flex;flex-direction:column;gap:8px">
          ${lista.length === 0
            ? `<div style="text-align:center;padding:48px 20px;color:var(--text-muted)">
                <div style="font-size:40px;margin-bottom:12px">📋</div>
                <div style="font-size:15px;font-weight:600">Nicio cerere${this.filterStatus!=='all'||this.filterTip!=='all'?' pentru filtrele selectate':''}</div>
                ${!isTabAll?'<div style="font-size:13px;margin-top:8px">Apasă "+ Cerere nouă" pentru a trimite prima cerere</div>':''}
              </div>`
            : lista.map(c => renderCard(c)).join('')
          }
        </div>
      </div>
    `;
  },

  setTab(tab) { this.activeTab = tab; this.filterStatus = 'all'; this.filterTip = 'all'; this.renderPage(); },
  setFilterStatus(s) { this.filterStatus = s; this.renderPage(); },
  setFilterTip(t) { this.filterTip = t; this.renderPage(); },

  openCreateModal() {
    const tipLabels = {
      echipament: '💻 Echipament IT/Birou',
      consumabile: '📦 Consumabile (hârtie, toner etc.)',
      extindere_ore: '⏱ Extindere buget ore proiect/task',
      altele: '📝 Altele',
    };
    const modal = document.createElement('div');
    modal.id = 'cerere-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';
    modal.innerHTML = `
      <div style="background:var(--card-bg);border-radius:16px;padding:28px 32px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <h2 style="font-size:18px;font-weight:700;margin:0">Cerere nouă</h2>
          <button onclick="document.getElementById('cerere-modal').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted)">✕</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Tip cerere *</label>
            <select id="cerere-tip" onchange="document.getElementById('cerere-extra-ore').style.display=this.value==='extindere_ore'?'block':'none'" style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text)">
              ${Object.entries(tipLabels).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Titlu / Subiect *</label>
            <input id="cerere-titlu" type="text" placeholder="ex: Mouse wireless Logitech MX3, Hârtie A4 500 coli..." style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);box-sizing:border-box">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Descriere / Motivație</label>
            <textarea id="cerere-desc" rows="4" placeholder="Explică de ce ai nevoie de acest lucru, cantitate, urgență etc." style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);box-sizing:border-box;resize:vertical"></textarea>
          </div>
          <div id="cerere-extra-ore" style="display:none">
            <label style="font-size:12px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:4px">Detalii extindere ore</label>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <input id="cerere-proiect" type="text" placeholder="Proiect / Task" style="padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);box-sizing:border-box">
              <input id="cerere-ore" type="number" min="1" max="200" placeholder="Nr. ore solicitate" style="padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text);box-sizing:border-box">
            </div>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
          <button onclick="document.getElementById('cerere-modal').remove()" style="padding:9px 20px;border:1.5px solid var(--border);border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font-size:14px">Anulează</button>
          <button onclick="Formulare.submitRequest()" class="btn-primary" style="padding:9px 20px">Trimite cererea</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  },

  async submitRequest() {
    const tip = document.getElementById('cerere-tip')?.value;
    const titlu = document.getElementById('cerere-titlu')?.value?.trim();
    const desc = document.getElementById('cerere-desc')?.value?.trim();
    if (!titlu) { showToast('Completează titlul cererii', 'error'); return; }
    const detalii = {};
    if (tip === 'extindere_ore') {
      detalii.proiect = document.getElementById('cerere-proiect')?.value?.trim() || null;
      detalii.ore_solicitate = parseInt(document.getElementById('cerere-ore')?.value) || null;
    }
    const sb = getSupabase();
    const { error } = await sb.from('formulare_cereri').insert({
      user_id: Auth.currentUser?.id, tip_cerere: tip, titlu, descriere: desc || null, detalii, status: 'trimis',
    });
    if (error) { showToast('Eroare la trimitere: ' + error.message, 'error'); return; }
    document.getElementById('cerere-modal')?.remove();
    showToast('✅ Cererea a fost trimisă cu succes!', 'success');
    try {
      const { data: admins } = await sb.from('profiles').select('id').eq('role', 'admin');
      if (admins?.length) {
        const myName = Auth.currentProfile?.full_name || 'Un angajat';
        const tl = { echipament:'Echipament', consumabile:'Consumabile', extindere_ore:'Extindere ore', altele:'Altele' };
        const rows = admins.filter(a => a.id !== Auth.currentUser?.id).map(a => ({
          user_id: a.id, type: 'cerere',
          title: `📋 Cerere nouă: ${tl[tip]||tip}`,
          message: `${myName} a trimis o cerere: "${titlu}"`,
          link: '#formulare', is_read: false,
        }));
        if (rows.length) { await sb.from('notifications').insert(rows); if (typeof updateNotifBadge==='function') updateNotifBadge(); }
      }
    } catch(e) {}
    await this.loadCereri();
    this.activeTab = 'mele';
    this.renderPage();
  },

  async approveRequest(id) {
    const sb = getSupabase();
    const { error } = await sb.from('formulare_cereri').update({
      status:'aprobat', aprobat_de:Auth.currentUser?.id, aprobat_la:new Date().toISOString(), motiv_respingere:null, updated_at:new Date().toISOString(),
    }).eq('id', id);
    if (error) { showToast('Eroare: '+error.message,'error'); return; }
    try {
      const c = this.cereriAll.find(x=>x.id===id)||this.cereriMele.find(x=>x.id===id);
      if (c?.user_id && c.user_id !== Auth.currentUser?.id) {
        await getSupabase().from('notifications').insert({ user_id:c.user_id, type:'cerere', title:'✅ Cererea ta a fost aprobată', message:`"${c.titlu}" a fost aprobată.`, link:'#formulare', is_read:false });
        if (typeof updateNotifBadge==='function') updateNotifBadge();
      }
    } catch(e) {}
    showToast('✅ Cerere aprobată','success');
    await this.loadCereri(); this.renderPage();
  },

  async rejectRequest(id) {
    const motiv = prompt('Motiv respingere (opțional):');
    if (motiv === null) return;
    const sb = getSupabase();
    const { error } = await sb.from('formulare_cereri').update({
      status:'respins', aprobat_de:Auth.currentUser?.id, aprobat_la:new Date().toISOString(), motiv_respingere:motiv?.trim()||null, updated_at:new Date().toISOString(),
    }).eq('id', id);
    if (error) { showToast('Eroare: '+error.message,'error'); return; }
    try {
      const c = this.cereriAll.find(x=>x.id===id)||this.cereriMele.find(x=>x.id===id);
      if (c?.user_id && c.user_id !== Auth.currentUser?.id) {
        await getSupabase().from('notifications').insert({ user_id:c.user_id, type:'cerere', title:'❌ Cererea ta a fost respinsă', message:`"${c.titlu}"${motiv?.trim()?' — '+motiv.trim():''}`, link:'#formulare', is_read:false });
        if (typeof updateNotifBadge==='function') updateNotifBadge();
      }
    } catch(e) {}
    showToast('Cerere respinsă','success');
    await this.loadCereri(); this.renderPage();
  },

  async deleteRequest(id) {
    if (!confirm('Ești sigur că vrei să ștergi această cerere?')) return;
    const { error } = await getSupabase().from('formulare_cereri').delete().eq('id', id);
    if (error) { showToast('Eroare: '+error.message,'error'); return; }
    showToast('Cerere ștearsă','success');
    await this.loadCereri(); this.renderPage();
  },
};
