// ============================================================
// Backup Module — Portal Inginerie Creativă
// Export date proiecte (JSON/CSV) + management backup-uri
// ============================================================
const Backup = {
  async render() {
    const profile = Auth.currentProfile;
    if (profile?.role !== 'admin') {
      document.getElementById('page-content').innerHTML = `
        <div style="width:100%;max-width:860px;margin:0 auto">
          <div class="page-header"><h1 class="page-title">Backup Date</h1></div>
          <div class="card" style="text-align:center;padding:40px">
            <div style="font-size:48px;margin-bottom:16px">🔒</div>
            <p>Această secțiune este accesibilă doar administratorilor.</p>
          </div>
        </div>
      `;
      return;
    }

    const { data: logs } = await DB.getBackupLogs();
    this.renderPage(logs || []);
  },

  renderPage(logs) {
    document.getElementById('page-content').innerHTML = `
      <div style="width:100%;max-width:860px;margin:0 auto">
        <div class="page-header">
          <div>
            <h1 class="page-title">Backup Date</h1>
            <p class="page-subtitle">Exportă și protejează datele portalului</p>
          </div>
        </div>

        <!-- EXPORT RAPID -->
        <div class="card" style="margin-bottom:20px;border-left:4px solid var(--brand)">
          <h2 style="font-size:15px;font-weight:700;margin-bottom:16px">📦 Export date</h2>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">
            Exportă toate datele din portal într-un fișier JSON sau CSV. Fișierul conține proiecte, etape, sarcini, ore înregistrate și membrii echipei.
          </p>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <button class="btn-primary" onclick="Backup.exportJSON()" style="display:flex;align-items:center;gap:8px">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Export JSON complet
            </button>
            <button class="btn-secondary" onclick="Backup.exportCSV()" style="display:flex;align-items:center;gap:8px">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
              Export CSV ore
            </button>
            <button class="btn-secondary" onclick="Backup.exportProjectsCSV()" style="display:flex;align-items:center;gap:8px">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
              Export CSV proiecte
            </button>
          </div>
        </div>

        <!-- INFO BACKUP SUPABASE -->
        <div class="card" style="margin-bottom:20px;background:rgba(59,130,246,0.05);border-left:4px solid #3b82f6">
          <div style="display:flex;gap:12px;align-items:flex-start">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" style="flex-shrink:0;margin-top:2px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <div>
              <div style="font-weight:600;font-size:13px;margin-bottom:4px">Backup automat Supabase</div>
              <p style="font-size:13px;color:var(--text-muted)">
                Supabase face backup automat zilnic al bazei de date. Poți restaura datele din 
                <a href="https://supabase.com/dashboard/project/ofknvxwcqwgnthnvslfl/database/backups" target="_blank" style="color:#3b82f6">Supabase Dashboard → Database → Backups</a>.
                Backup-urile sunt păstrate 7 zile (plan gratuit) sau 30 zile (plan Pro).
              </p>
            </div>
          </div>
        </div>

        <!-- ISTORIC EXPORTURI -->
        <div class="card">
          <h2 style="font-size:15px;font-weight:700;margin-bottom:16px">📋 Istoric exporturi</h2>
          ${logs.length === 0 ? `<p style="font-size:13px;color:var(--text-muted);text-align:center;padding:20px">Niciun export efectuat încă</p>` :
            `<table style="width:100%;border-collapse:collapse;font-size:13px">
              <thead>
                <tr style="border-bottom:2px solid var(--border)">
                  <th style="text-align:left;padding:8px 12px;font-weight:600">Tip</th>
                  <th style="text-align:left;padding:8px 12px;font-weight:600">Data</th>
                  <th style="text-align:left;padding:8px 12px;font-weight:600">Status</th>
                  <th style="text-align:left;padding:8px 12px;font-weight:600">Dimensiune</th>
                </tr>
              </thead>
              <tbody>
                ${logs.map(l => `
                  <tr style="border-bottom:1px solid var(--border)">
                    <td style="padding:8px 12px">${l.backup_type || 'full'}</td>
                    <td style="padding:8px 12px">${formatDate(l.created_at)} ${new Date(l.created_at).toLocaleTimeString('ro-RO', {hour:'2-digit',minute:'2-digit'})}</td>
                    <td style="padding:8px 12px">${badge(l.status, l.status === 'completed' ? 'green' : 'red')}</td>
                    <td style="padding:8px 12px">${l.file_size_bytes ? Math.round(l.file_size_bytes/1024) + ' KB' : '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>`
          }
        </div>
      </div>
    `;
  },

  async exportJSON() {
    showToast('Se pregătește exportul...', 'info');
    try {
      const sb = getSupabase();
      const [projRes, phasesRes, tasksRes, membersRes, timeRes] = await Promise.all([
        sb.from('projects').select('*'),
        sb.from('project_phases').select('*'),
        sb.from('project_tasks').select('*'),
        sb.from('project_members').select('*, profiles(full_name, email)'),
        sb.from('time_entries').select('*, profiles(full_name)').order('date', { ascending: false }).limit(5000),
      ]);

      const exportData = {
        exported_at: new Date().toISOString(),
        exported_by: Auth.currentProfile?.full_name || Auth.currentUser?.email,
        version: '1.0',
        data: {
          projects: projRes.data || [],
          phases: phasesRes.data || [],
          tasks: tasksRes.data || [],
          members: membersRes.data || [],
          time_entries: timeRes.data || [],
        },
        summary: {
          projects_count: (projRes.data || []).length,
          tasks_count: (tasksRes.data || []).length,
          time_entries_count: (timeRes.data || []).length,
        }
      };

      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portal-ic-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      // Log backup
      await DB.createBackupLog({
        backup_type: 'json-export',
        status: 'completed',
        file_size_bytes: json.length,
        created_by: Auth.currentUser?.id,
        completed_at: new Date().toISOString(),
      });

      showToast('Export JSON descărcat cu succes!', 'success');
      this.render();
    } catch (e) {
      showToast('Eroare la export: ' + e.message, 'error');
    }
  },

  async exportCSV() {
    showToast('Se pregătește exportul ore...', 'info');
    try {
      const sb = getSupabase();
      const { data: entries } = await sb.from('time_entries')
        .select('*, profiles(full_name), projects(name, code)')
        .order('date', { ascending: false })
        .limit(10000);

      const rows = [['Data', 'Angajat', 'Proiect', 'Cod proiect', 'Task', 'Tip activitate', 'Ore', 'Minute', 'Contorizat']];
      (entries || []).forEach(e => {
        rows.push([
          e.date,
          e.profiles?.full_name || '',
          e.projects?.name || '',
          e.projects?.code || '',
          e.task_name || '',
          e.activity_type || '',
          Math.floor((e.duration_minutes || 0) / 60),
          (e.duration_minutes || 0) % 60,
          e.count_in_time ? 'Da' : 'Nu',
        ]);
      });

      const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portal-ic-ore-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      await DB.createBackupLog({
        backup_type: 'csv-ore',
        status: 'completed',
        file_size_bytes: csv.length,
        created_by: Auth.currentUser?.id,
        completed_at: new Date().toISOString(),
      });

      showToast('Export CSV ore descărcat!', 'success');
      this.render();
    } catch (e) {
      showToast('Eroare la export: ' + e.message, 'error');
    }
  },

  async exportProjectsCSV() {
    showToast('Se pregătește exportul proiecte...', 'info');
    try {
      const sb = getSupabase();
      const { data: tasks } = await sb.from('project_tasks')
        .select('*, project_phases(name, project_id, projects(name, code, client_name, status))')
        .order('project_id');

      const rows = [['Proiect', 'Cod', 'Client', 'Status proiect', 'Etapă', 'Sarcină', 'Buget (h)', 'Lucrat (h)', 'Rămas (h)', 'Progres %']];
      (tasks || []).forEach(t => {
        const workedH = Math.round((t.minutes_worked || 0) / 60 * 10) / 10;
        const budgetH = t.budget_hours || 0;
        const pct = budgetH > 0 ? Math.round((workedH / budgetH) * 100) : 0;
        rows.push([
          t.project_phases?.projects?.name || '',
          t.project_phases?.projects?.code || '',
          t.project_phases?.projects?.client_name || '',
          t.project_phases?.projects?.status || '',
          t.project_phases?.name || '',
          t.name || '',
          budgetH,
          workedH,
          Math.max(0, budgetH - workedH),
          pct + '%',
        ]);
      });

      const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portal-ic-proiecte-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      await DB.createBackupLog({
        backup_type: 'csv-proiecte',
        status: 'completed',
        file_size_bytes: csv.length,
        created_by: Auth.currentUser?.id,
        completed_at: new Date().toISOString(),
      });

      showToast('Export CSV proiecte descărcat!', 'success');
      this.render();
    } catch (e) {
      showToast('Eroare la export: ' + e.message, 'error');
    }
  },
};
