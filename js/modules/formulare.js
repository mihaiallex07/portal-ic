// ============================================================
// Formulare & Cereri — Portal Inginerie Creativă
// Angajații pot face cereri interne (echipament, consumabile, ore, altele)
// Admin poate vedea toate cererile și schimba statusul
// ============================================================
const Formulare = {
  cereri: [],
  filterStatus: 'all',
  filterTip: 'all',

  async render() {
    const content = document.getElementById('page-content');
    content.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>Se încarcă cererile...</p></div>`;
    await this.loadCereri();
    this.renderPage();
  },

  async loadCereri() {
    const sb = getSupabase();
    const userId = Auth.currentUser?.id;
    const isAdmin = Auth.currentProfile?.role === 'admin';
    const isCoord = Auth.currentProfile?.role === 'coordonator';

    let query = sb.from('formulare_cereri')
      .select(`*, profiles:user_id(full_name, employee_code, department), approver:aprobat_de(full_name)`)
      .order('created_at', { ascending: false });

    if (!isAdmin && !isCoord) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error) { console.error('Formulare load error:', error); this.cereri = []; return; }
    this.cereri = data || [];
  },

  renderPage() {
    const profile = Auth.currentProfile;
    const isAdmin = profile?.role === 'admin';
    const isCoord = profile?.role === 'coordonator';
    const canManageAll = isAdmin || isCoord;

    const tipLabels = {
      echipament: 'Echipament IT/Birou',
      consumabile: 'Consumabile',
      extindere_ore: 'Extindere buget ore',
      altele: 'Altele',
    };
    const statusColors = {
      trimis: { bg: '#fef3c7', color: '#d97706', label: 'Trimis' },
      aprobat: { bg: '#d1fae5', color: '#059669', label: 'Aprobat' },
      respins: { bg: '#fee2e2', color: '#dc2626', label: 'Respins' },
    };

    let filtered = [...this.cereri];
    if (this.filterStatus !== 'all') filtered = filtered.filter(c => c.status === this.filterStatus);
    if (this.filterTip !== 'all') filtered = filtered.filter(c => c.tip_cerere === this.filterTip);

    const stats = {
      total: this.cereri.length,
      trimis: this.cereri.filter(c => c.status === 'trimis').length,
      aprobat: this.cereri.filter(c => c.status === 'aprobat').length,
      respins: this.cereri.filter(c => c.status === 'respins').length,
    };

    document.getElementById('page-content').innerHTML = `
      <div style="max-width:960px;margin:0 auto;padding:0 8px">
        <div class="page-header" style="margin-bottom:24px">
          <div>
            <h1 class="page-title">Formulare & Cereri</h1>
            <p class="page-subtitle">Cereri interne — echipamente, consumabile, extindere ore</p>
          </div>
          <button class="btn-primary" onclick="Formulare.openCreateModal()">+ Cerere nouă</button>
        </div>

        <!-- Statistici rapide -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
          ${[
            { label: 'Total cereri', val: stats.total, color: '#6366f1', icon: '📋' },
            { label: 'În așteptare', val: stats.trimis, color: '#d97706', icon: '⏳' },
            { label: 'Aprobate', val: stats.aprobat, color: '#059669', icon: '✅' },
            { label: 'Respinse', val: stats.respins, color: '#dc2626', icon: '❌' },
          ].map(s => `
            <div class="card" style="padding:16px;text-align:center">
              <div style="font-size:22px;margin-bottom:4px">${s.icon}</div>
              <div style="font-size:24px;font-weight:800;color:${s.color}">${s.val}</div>
              <div style="font-size:12px;color:var(--text-muted)">${s.label}</div>
            </div>
          `).join('')}
        </div>

        <!-- Filtre -->
        <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;align-items:center">
          <div style="display:flex;gap:6px">
            ${['all','trimis','aprobat','respins'].map(s => `
              <button onclick="Formulare.setFilterStatus('${s}')"
                style="padding:5px 14px;border-radius:20px;font-size:12px;font-weight:600;border:1.5px solid ${this.filterStatus === s ? 'var(--brand)' : 'var(--border)'};background:${this.filterStatus === s ? 'var(--brand)' : 'transparent'};color:${this.filterStatus === s ? '#000' : 'var(--text)'};cursor:pointer">
                ${{ all: 'Toate', trimis: 'În așteptare', aprobat: 'Aprobate', respins: 'Respinse' }[s]}
              </button>
            `).join('')}
          </div>
          <select onchange="Formulare.setFilterTip(this.value)"
            style="padding:5px 12px;border-radius:8px;border:1.5px solid var(--border);background:var(--bg);color:var(--text);font-size:12px;cursor:pointer">
            <option value="all" ${this.filterTip === 'all' ? 'selected' : ''}>Toate tipurile</option>
            ${Object.entries(tipLabels).map(([v, l]) => `<option value="${v}" ${this.filterTip === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>

        <!-- Lista cereri -->
        <div id="cereri-list">
          ${filtered.length === 0 ? `
            <div style="text-align:center;padding:60px 20px;color:var(--text-muted)">
              <div style="font-size:48px;margin-bottom:16px;opacity:.4">📋</div>
              <p style="font-size:15px;font-weight:500">Nicio cerere ${this.filterStatus !== 'all' ? 'cu statusul selectat' : ''}</p>
              <button class="btn-primary" style="margin-top:16px" onclick="Formulare.openCreateModal()">Creează prima cerere</button>
            </div>
          ` : filtered.map(c => {
            const st = statusColors[c.status] || statusColors.trimis;
            const tip = tipLabels[c.tip_cerere] || c.tip_cerere;
            const createdAt = new Date(c.created_at).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const approvedAt = c.aprobat_la ? new Date(c.aprobat_la).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;
            return `
              <div class="card" style="padding:16px 20px;margin-bottom:10px;border-left:4px solid ${st.color}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
                  <div style="flex:1;min-width:0">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
                      <span style="font-size:15px;font-weight:700">${c.titlu}</span>
                      <span style="font-size:11px;background:#f3f4f6;color:#374151;padding:2px 8px;border-radius:10px;font-weight:600">${tip}</span>
                      <span style="font-size:11px;background:${st.bg};color:${st.color};padding:2px 8px;border-radius:10px;font-weight:700">${st.label}</span>
                    </div>
                    ${c.descriere ? `<p style="font-size:13px;color:var(--text-muted);margin:0 0 6px;line-height:1.5">${c.descriere}</p>` : ''}
                    <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--text-muted)">
                      ${canManageAll ? `<span>👤 ${c.profiles?.full_name || 'Angajat'}${c.profiles?.department ? ' · ' + c.profiles.department : ''}</span>` : ''}
                      <span>📅 ${createdAt}</span>
                      ${approvedAt ? `<span>✔ ${c.status === 'aprobat' ? 'Aprobat' : 'Respins'} la ${approvedAt} de ${c.approver?.full_name || 'Admin'}</span>` : ''}
                    </div>
                    ${c.motiv_respingere ? `<div style="margin-top:6px;padding:6px 10px;background:#fef2f2;border-radius:6px;font-size:12px;color:#dc2626">Motiv respingere: ${c.motiv_respingere}</div>` : ''}
                  </div>
                  <div style="display:flex;gap:6px;flex-shrink:0">
                    ${canManageAll && c.status === 'trimis' ? `
                      <button onclick="Formulare.approveRequest(${c.id})" style="font-size:12px;padding:5px 12px;border-radius:6px;background:#d1fae5;color:#059669;border:none;cursor:pointer;font-weight:600">✓ Aprobă</button>
                      <button onclick="Formulare.rejectRequest(${c.id})" style="font-size:12px;padding:5px 12px;border-radius:6px;background:#fee2e2;color:#dc2626;border:none;cursor:pointer;font-weight:600">✗ Respinge</button>
                    ` : ''}
                    ${(c.user_id === Auth.currentUser?.id && c.status === 'trimis') ? `
                      <button onclick="Formulare.deleteRequest(${c.id})" style="font-size:12px;padding:5px 10px;border-radius:6px;background:transparent;color:var(--text-muted);border:1px solid var(--border);cursor:pointer">🗑</button>
                    ` : ''}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  },

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
            <select id="cerere-tip" style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;background:var(--bg);color:var(--text)">
              ${Object.entries(tipLabels).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
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
    // Toggle câmpuri extra pentru extindere ore
    document.getElementById('cerere-tip').addEventListener('change', function() {
      document.getElementById('cerere-extra-ore').style.display = this.value === 'extindere_ore' ? 'block' : 'none';
    });
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
      user_id: Auth.currentUser?.id,
      tip_cerere: tip,
      titlu,
      descriere: desc || null,
      detalii,
      status: 'trimis',
    });
    if (error) { showToast('Eroare la trimitere: ' + error.message, 'error'); return; }

    document.getElementById('cerere-modal')?.remove();
    showToast('✅ Cererea a fost trimisă cu succes!', 'success');

    // Notifică adminii
    try {
      const { data: admins } = await sb.from('profiles').select('id').eq('role', 'admin');
      if (admins?.length) {
        const myName = Auth.currentProfile?.full_name || 'Un angajat';
        const tipLabels = { echipament: 'Echipament', consumabile: 'Consumabile', extindere_ore: 'Extindere ore', altele: 'Altele' };
        const notifRows = admins.map(a => ({
          user_id: a.id,
          type: 'cerere',
          title: `📋 Cerere nouă: ${tipLabels[tip] || tip}`,
          message: `${myName} a trimis o cerere: "${titlu}"`,
          link: '#formulare',
          is_read: false,
        }));
        await sb.from('notifications').insert(notifRows);
        if (typeof updateNotifBadge === 'function') updateNotifBadge();
      }
    } catch(e) { console.warn('Notif error:', e); }

    await this.loadCereri();
    this.renderPage();
  },

  async approveRequest(id) {
    const sb = getSupabase();
    const { error } = await sb.from('formulare_cereri').update({
      status: 'aprobat',
      aprobat_de: Auth.currentUser?.id,
      aprobat_la: new Date().toISOString(),
      motiv_respingere: null,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) { showToast('Eroare: ' + error.message, 'error'); return; }

    // Notifică angajatul
    try {
      const cerere = this.cereri.find(c => c.id === id);
      if (cerere?.user_id) {
        await getSupabase().from('notifications').insert({
          user_id: cerere.user_id,
          type: 'cerere',
          title: '✅ Cererea ta a fost aprobată',
          message: `"${cerere.titlu}" a fost aprobată.`,
          link: '#formulare',
          is_read: false,
        });
      }
    } catch(e) {}

    showToast('✅ Cerere aprobată', 'success');
    await this.loadCereri();
    this.renderPage();
  },

  async rejectRequest(id) {
    const motiv = prompt('Motiv respingere (opțional):');
    if (motiv === null) return; // user a dat Cancel

    const sb = getSupabase();
    const { error } = await sb.from('formulare_cereri').update({
      status: 'respins',
      aprobat_de: Auth.currentUser?.id,
      aprobat_la: new Date().toISOString(),
      motiv_respingere: motiv?.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) { showToast('Eroare: ' + error.message, 'error'); return; }

    // Notifică angajatul
    try {
      const cerere = this.cereri.find(c => c.id === id);
      if (cerere?.user_id) {
        await getSupabase().from('notifications').insert({
          user_id: cerere.user_id,
          type: 'cerere',
          title: '❌ Cererea ta a fost respinsă',
          message: `"${cerere.titlu}"${motiv?.trim() ? ' — ' + motiv.trim() : ''}`,
          link: '#formulare',
          is_read: false,
        });
      }
    } catch(e) {}

    showToast('Cerere respinsă', 'success');
    await this.loadCereri();
    this.renderPage();
  },

  async deleteRequest(id) {
    if (!confirm('Ești sigur că vrei să ștergi această cerere?')) return;
    const sb = getSupabase();
    const { error } = await sb.from('formulare_cereri').delete().eq('id', id);
    if (error) { showToast('Eroare: ' + error.message, 'error'); return; }
    showToast('Cerere ștearsă', 'success');
    await this.loadCereri();
    this.renderPage();
  },
};
