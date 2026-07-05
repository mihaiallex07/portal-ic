// ============================================================
// Beneficiari Module — Portal Inginerie Creativă
// Management invitații beneficiari + pagina publică progres proiect
// ============================================================
const Beneficiari = {
  projectId: null,

  // Deschide panoul de management beneficiari pentru un proiect
  async openPanel(projectId, projectName) {
    this.projectId = projectId;
    const existing = document.getElementById('beneficiari-panel');
    if (existing) existing.remove();

    const { data: list } = await DB.getProjectBeneficiaries(projectId);
    const beneficiari = list || [];

    const panel = document.createElement('div');
    panel.id = 'beneficiari-panel';
    panel.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center';
    panel.innerHTML = `
      <div class="card" style="width:100%;max-width:560px;padding:28px 32px;border-radius:16px;max-height:90vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <div>
            <h2 style="font-size:18px;font-weight:700;margin-bottom:2px">Beneficiari proiect</h2>
            <p style="font-size:13px;color:var(--text-muted)">${projectName}</p>
          </div>
          <button onclick="document.getElementById('beneficiari-panel').remove()" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--text-muted)">✕</button>
        </div>

        <!-- Invitație nouă -->
        <div class="card" style="background:var(--bg-secondary);padding:16px;margin-bottom:20px">
          <h3 style="font-size:13px;font-weight:600;margin-bottom:12px">Invită beneficiar nou</h3>
          <div style="display:flex;gap-8px;gap:8px">
            <input type="email" id="benef-email" placeholder="email@beneficiar.ro" class="input-field" style="flex:1" />
            <input type="text" id="benef-name" placeholder="Nume (opțional)" class="input-field" style="flex:1" />
          </div>
          <button class="btn-primary" style="margin-top:10px;width:100%" onclick="Beneficiari.invite()">
            📧 Trimite invitație
          </button>
        </div>

        <!-- Lista beneficiari -->
        <div>
          <h3 style="font-size:13px;font-weight:600;margin-bottom:12px">Beneficiari invitați (${beneficiari.length})</h3>
          ${beneficiari.length === 0 ? `<p style="font-size:13px;color:var(--text-muted);text-align:center;padding:20px">Niciun beneficiar invitat încă</p>` :
            beneficiari.map(b => {
              const statusColor = b.status === 'accepted' ? 'green' : b.status === 'expired' ? 'red' : 'yellow';
              const statusLabel = b.status === 'accepted' ? 'Activ' : b.status === 'expired' ? 'Expirat' : 'Invitat';
              const link = `${window.location.origin}/beneficiar.html?token=${b.access_token}`;
              return `
              <div class="card" style="padding:12px 16px;margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <div>
                    <div style="font-weight:600;font-size:13px">${b.name || b.email}</div>
                    <div style="font-size:12px;color:var(--text-muted)">${b.email}</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
                      Invitat: ${formatDate(b.invited_at)}
                      ${b.last_accessed_at ? ` · Ultima accesare: ${timeAgo(b.last_accessed_at)}` : ''}
                    </div>
                  </div>
                  <div style="display:flex;align-items:center;gap:8px">
                    ${badge(statusLabel, statusColor)}
                    <button title="Copiază link" onclick="navigator.clipboard.writeText('${link}').then(()=>showToast('Link copiat!','success'))" style="background:none;border:none;cursor:pointer;font-size:16px">🔗</button>
                  </div>
                </div>
              </div>
            `}).join('')
          }
        </div>
      </div>
    `;
    document.body.appendChild(panel);
  },

  async invite() {
    const email = document.getElementById('benef-email')?.value?.trim();
    const name = document.getElementById('benef-name')?.value?.trim();
    if (!email || !email.includes('@')) { showToast('Email invalid', 'error'); return; }

    // Generează UUID pentru access_token
    const access_token = crypto.randomUUID ? crypto.randomUUID() :
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
    const token_expires_at = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await DB.inviteBeneficiary({
      project_id: this.projectId,
      email,
      name: name || null,
      invited_by: Auth.currentUser?.id,
      access_token,
      token_expires_at,
      status: 'pending',
      invited_at: new Date().toISOString(),
    });
    if (error) { showToast('Eroare: ' + error.message, 'error'); return; }

    showToast('Invitație trimisă! Copiază link-ul pentru a-l trimite beneficiarului.', 'success');
    // Reîncarcă panoul
    const proj = await DB.getProjectById(this.projectId);
    await this.openPanel(this.projectId, proj?.name || '');
  },
};

// ============================================================
// Pagina publică beneficiar (beneficiar.html)
// Stil inspirat din Passive House Buildings Database
// ============================================================
const BeneficiarPublic = {
  async init() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) { this.renderError('Link invalid sau expirat.'); return; }

    const { data: benef, error } = await DB.getBeneficiaryByToken(token);
    if (error || !benef) { this.renderError('Link invalid sau expirat.'); return; }
    if (benef.status === 'expired' || (benef.token_expires_at && new Date(benef.token_expires_at) < new Date())) {
      this.renderError('Acest link a expirat. Contactați echipa de proiect pentru un nou link.'); return;
    }

    // Actualizează last_accessed_at
    await DB.updateBeneficiaryAccess(token);

    // Încarcă datele proiectului
    const project = benef.projects;
    if (!project) { this.renderError('Proiectul nu a fost găsit.'); return; }

    // Încarcă etapele și sarcinile
    const { data: phases } = await this.getProjectPhases(project.id);
    this.renderDashboard(project, phases || [], benef);
  },

  async getProjectPhases(projectId) {
    const sb = getSupabase();
    const { data, error } = await sb.from('project_phases')
      .select('*, project_tasks(*)')
      .eq('project_id', projectId)
      .order('order_index');
    return { data, error };
  },

  renderError(msg) {
    document.getElementById('benef-root').innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8f9fa;font-family:'Inter',sans-serif">
        <div style="text-align:center;padding:40px">
          <div style="font-size:48px;margin-bottom:16px">⚠️</div>
          <h2 style="font-size:20px;font-weight:600;color:#1a1a2e;margin-bottom:8px">Acces indisponibil</h2>
          <p style="color:#6b7280;font-size:14px">${msg}</p>
        </div>
      </div>
    `;
  },

  renderDashboard(project, phases, benef) {
    // Calculează progres total
    const allTasks = phases.flatMap(p => p.project_tasks || []);
    const totalBudget = allTasks.reduce((s, t) => s + (t.budget_hours || 0), 0);
    const totalWorked = allTasks.reduce((s, t) => s + Math.round((t.minutes_worked || 0) / 60 * 10) / 10, 0);
    const totalPct = totalBudget > 0 ? Math.round((totalWorked / totalBudget) * 100) : 0;
    const doneTasks = allTasks.filter(t => t.status === 'done').length;
    const inProgressTasks = allTasks.filter(t => t.status === 'in_progress').length;

    const statusColor = project.status === 'activ' ? '#10b981' : project.status === 'finalizat' ? '#6b7280' : '#f59e0b';
    const statusLabel = project.status === 'activ' ? 'În desfășurare' : project.status === 'finalizat' ? 'Finalizat' : 'Planificat';

    document.getElementById('benef-root').innerHTML = `
      <div style="min-height:100vh;background:#f4f6f9;font-family:'Inter',sans-serif">
        <!-- HEADER -->
        <header style="background:#1a1a2e;color:white;padding:0">
          <div style="max-width:1100px;margin:0 auto;padding:20px 32px;display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:16px">
              <div style="width:40px;height:40px;background:${project.color || '#FFCB09'};border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#1a1a2e">${(project.abbreviation || project.name?.substring(0,3) || 'IC').toUpperCase()}</div>
              <div>
                <div style="font-size:11px;opacity:0.6;letter-spacing:0.1em;text-transform:uppercase">Portal Progres Proiect</div>
                <div style="font-size:18px;font-weight:700">${project.name}</div>
              </div>
            </div>
            <div style="text-align:right">
              <div style="font-size:11px;opacity:0.6">Cod proiect</div>
              <div style="font-size:14px;font-weight:600">${project.code || '—'}</div>
            </div>
          </div>
        </header>

        <!-- HERO STATS -->
        <div style="background:#1a1a2e;padding-bottom:40px">
          <div style="max-width:1100px;margin:0 auto;padding:0 32px">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px">
              ${this.statCard('Progres total', totalPct + '%', 'Ore lucrate din buget', '#FFCB09')}
              ${this.statCard('Ore lucrate', totalWorked + 'h', 'din ' + totalBudget + 'h bugetate', '#10b981')}
              ${this.statCard('Sarcini finalizate', doneTasks + '/' + allTasks.length, inProgressTasks + ' în lucru', '#3b82f6')}
              ${this.statCard('Status', statusLabel, project.client_name || 'Client', statusColor)}
            </div>
          </div>
        </div>

        <!-- PROGRESS BAR -->
        <div style="max-width:1100px;margin:-20px auto 0;padding:0 32px;position:relative;z-index:10">
          <div class="card" style="border-radius:12px;padding:20px 24px;margin-bottom:24px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <span style="font-size:13px;font-weight:600">Progres general proiect</span>
              <span style="font-size:20px;font-weight:700;color:${totalPct >= 90 ? '#ef4444' : totalPct >= 75 ? '#f59e0b' : '#10b981'}">${totalPct}%</span>
            </div>
            <div style="height:10px;background:#e5e7eb;border-radius:5px;overflow:hidden">
              <div style="height:100%;width:${Math.min(100,totalPct)}%;background:linear-gradient(90deg,${project.color || '#FFCB09'},${totalPct >= 90 ? '#ef4444' : '#10b981'});border-radius:5px;transition:width 1s ease"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#6b7280;margin-top:6px">
              <span>Început: ${formatDate(project.start_date) || '—'}</span>
              <span>Termen: ${formatDate(project.end_date) || '—'}</span>
            </div>
          </div>
        </div>

        <!-- ETAPE -->
        <div style="max-width:1100px;margin:0 auto;padding:0 32px 48px">
          <h2 style="font-size:16px;font-weight:700;margin-bottom:16px;color:#1a1a2e">Etape proiect</h2>
          ${phases.map(phase => {
            const tasks = phase.project_tasks || [];
            const pBudget = tasks.reduce((s,t) => s + (t.budget_hours||0), 0);
            const pWorked = tasks.reduce((s,t) => s + Math.round((t.minutes_worked||0)/60*10)/10, 0);
            const pPct = pBudget > 0 ? Math.round((pWorked/pBudget)*100) : 0;
            const doneCnt = tasks.filter(t=>t.status==='done').length;
            return `
            <div class="card" style="border-radius:12px;padding:20px 24px;margin-bottom:16px">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
                <div style="display:flex;align-items:center;gap:10px">
                  <div style="width:32px;height:32px;background:${phase.color||'#3b82f6'}22;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px">${phase.icon||'📋'}</div>
                  <div>
                    <div style="font-weight:700;font-size:14px">${phase.name}</div>
                    <div style="font-size:12px;color:#6b7280">${tasks.length} sarcini · ${doneCnt} finalizate</div>
                  </div>
                </div>
                <div style="text-align:right">
                  <div style="font-size:18px;font-weight:700;color:${pPct>=90?'#ef4444':pPct>=75?'#f59e0b':'#10b981'}">${pPct}%</div>
                  <div style="font-size:11px;color:#6b7280">${pWorked}h / ${pBudget}h</div>
                </div>
              </div>
              <div style="height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;margin-bottom:12px">
                <div style="height:100%;width:${Math.min(100,pPct)}%;background:${phase.color||'#3b82f6'};border-radius:3px"></div>
              </div>
              ${tasks.length > 0 ? `
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px">
                ${tasks.map(t => {
                  const tPct = t.budget_hours > 0 ? Math.round(((t.minutes_worked||0)/60/t.budget_hours)*100) : 0;
                  const tStatus = t.status === 'done' ? '✅' : t.status === 'in_progress' ? '🔄' : '⏳';
                  return `
                  <div style="background:#f8f9fa;border-radius:8px;padding:10px 12px">
                    <div style="font-size:12px;font-weight:600;margin-bottom:4px">${tStatus} ${t.name}</div>
                    ${t.budget_hours > 0 ? `
                    <div style="height:4px;background:#e5e7eb;border-radius:2px;overflow:hidden;margin-bottom:4px">
                      <div style="height:100%;width:${Math.min(100,tPct)}%;background:${tPct>=90?'#ef4444':tPct>=75?'#f59e0b':'#10b981'};border-radius:2px"></div>
                    </div>
                    <div style="font-size:10px;color:#6b7280">${Math.round((t.minutes_worked||0)/60*10)/10}h / ${t.budget_hours}h (${tPct}%)</div>
                    ` : ''}
                  </div>
                `}).join('')}
              </div>
              ` : ''}
            </div>
          `}).join('')}
        </div>

        <!-- FOOTER -->
        <footer style="background:#1a1a2e;color:rgba(255,255,255,0.5);text-align:center;padding:20px;font-size:12px">
          Portal Inginerie Creativă · Acces beneficiar · ${benef.name || benef.email}
        </footer>
      </div>
    `;
  },

  statCard(label, value, sub, color) {
    return `
      <div style="background:rgba(255,255,255,0.05);border-radius:12px;padding:20px;border:1px solid rgba(255,255,255,0.1)">
        <div style="font-size:11px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">${label}</div>
        <div style="font-size:28px;font-weight:700;color:${color}">${value}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px">${sub}</div>
      </div>
    `;
  },
};
