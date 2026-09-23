// ============================================================
// Backup Module — Portal Inginerie Creativă
// Export date proiecte (JSON/CSV) + management backup-uri
// ============================================================
const Backup = {
  driveConfig: null,

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

    const sb = getSupabase();
    const [logsResult, configResult] = await Promise.all([
      DB.getBackupLogs(),
      sb.from('app_settings')
        .select('value, updated_at')
        .eq('key', 'backup_drive_destination')
        .maybeSingle(),
    ]);
    this.driveConfig = this.parseDriveConfig(configResult?.data);
    this.renderPage(logsResult?.data || []);
  },

  parseDriveConfig(setting) {
    if (!setting?.value) return null;
    try {
      const parsed = typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value;
      if (!parsed || typeof parsed !== 'object' || !parsed.folder_id || !parsed.folder_url) return null;
      return { ...parsed, updated_at: setting.updated_at || parsed.updated_at || null };
    } catch (_) {
      return null;
    }
  },

  escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    }[char]));
  },

  extractDriveFolderId(folderUrl) {
    const raw = String(folderUrl || '').trim();
    const match = raw.match(/^https:\/\/drive\.google\.com\/drive\/folders\/([a-zA-Z0-9_-]+)(?:[/?#].*)?$/);
    return match?.[1] || null;
  },

  getIsoWeekData(date = new Date()) {
    const reference = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const isoDay = reference.getUTCDay() || 7;
    reference.setUTCDate(reference.getUTCDate() + 4 - isoDay);
    const isoYear = reference.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const week = Math.ceil((((reference - yearStart) / 86400000) + 1) / 7);
    const monday = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() || 7) - 1));
    const sunday = new Date(monday);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    return { week, isoYear, monday, sunday };
  },

  formatDriveBackupFileName(date = new Date()) {
    const { week, isoYear, monday, sunday } = this.getIsoWeekData(date);
    const formatDay = value => String(value.getUTCDate()).padStart(2, '0');
    const formatMonth = value => String(value.getUTCMonth() + 1).padStart(2, '0');
    return `Săpt. ${String(week).padStart(2, '0')} — ${formatDay(monday)}.${formatMonth(monday)}–${formatDay(sunday)}.${formatMonth(sunday)} — ${isoYear}.json`;
  },

  parseDriveStoragePath(storagePath) {
    if (!storagePath) return null;
    try {
      const parsed = JSON.parse(storagePath);
      if (parsed?.provider === 'google_drive' && parsed.file_id) return parsed;
    } catch (_) {}
    return null;
  },

  renderPage(logs) {
    const driveConfig = this.driveConfig;
    const driveDestinationCard = driveConfig ? `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div style="min-width:0;flex:1">
          <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:5px">
            <span style="display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;background:#E7F7EF;color:#16805C;font-size:11px;font-weight:700">Folder configurat</span>
            <span style="font-size:12px;color:var(--text-muted)">Setarea este salvată în portal, nu în cod.</span>
          </div>
          <a href="${this.escapeHtml(driveConfig.folder_url)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;color:#1769AA;font-size:13px;font-weight:700;word-break:break-all">Deschide folderul de backup ↗</a>
          <div style="font-size:12px;color:var(--text-muted);margin-top:6px">Ultima actualizare: ${driveConfig.updated_at ? `${formatDate(driveConfig.updated_at)} ${new Date(driveConfig.updated_at).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}` : '—'}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-secondary" onclick="Backup.openDriveConfigModal()">Modifică folderul</button>
          <button onclick="Backup.removeDriveConfig()" style="border:1px solid #F3C7C3;background:#FFF7F6;color:#B42318;border-radius:6px;padding:8px 10px;font-size:12px;font-weight:700;cursor:pointer">Elimină</button>
        </div>
      </div>
    ` : `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div>
          <div style="font-size:13px;font-weight:700;margin-bottom:4px">Niciun folder nu este configurat</div>
          <p style="font-size:12px;color:var(--text-muted);line-height:1.5;margin:0">Alege un folder Drive dedicat. Linkul va rămâne modificabil aici de către administratori și nu va fi inclus în codul portalului.</p>
        </div>
        <button class="btn-brand" onclick="Backup.openDriveConfigModal()">Configurează folderul</button>
      </div>
    `;
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
            Exportul JSON este salvat direct în folderul Drive configurat. La prima utilizare, administratorul care inițiază exportul confirmă în Google permisiunea strictă de a crea și gestiona exporturile portalului.
          </p>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <button class="btn-primary" onclick="Backup.exportJSON()" style="display:flex;align-items:center;gap:8px">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Export JSON în Drive
            </button>
            <button class="btn-secondary" onclick="Backup.exportCSV()" style="display:flex;align-items:center;gap:8px">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
              Export CSV ore
            </button>
            <button class="btn-secondary" onclick="Backup.exportProjectsCSV()" style="display:flex;align-items:center;gap:8px">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
              Export CSV proiecte
            </button>
            <label class="btn-secondary" style="display:flex;align-items:center;gap:8px;cursor:pointer;background:rgba(16,185,129,0.08);border-color:#10b981;color:#065f46">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Import JSON
              <input type="file" accept=".json" style="display:none" onchange="Backup.importJSON(event)" />
            </label>
          </div>
        </div>

        <!-- DESTINAȚIE BACKUP DRIVE -->
        <div class="card" style="margin-bottom:20px;border-left:4px solid #FFCB09">
          <div style="display:flex;gap:12px;align-items:flex-start">
            <div style="font-size:22px;line-height:1">☁️</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:15px;margin-bottom:5px">Export manual în Google Drive</div>
              <p style="font-size:13px;color:var(--text-muted);line-height:1.55;margin:0 0 13px">Destinația este configurată manual aici. Apăsarea butonului de export creează arhiva JSON direct în acest folder; nu rulează nimic automat în fundal.</p>
              ${driveDestinationCard}
            </div>
          </div>
        </div>

        <div class="card" style="margin-bottom:20px;background:rgba(59,130,246,0.05);border-left:4px solid #3b82f6">
          <div style="display:flex;gap:12px;align-items:flex-start">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" style="flex-shrink:0;margin-top:2px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01"/></svg>
            <div>
              <div style="font-weight:600;font-size:13px;margin-bottom:4px">Protecție suplimentară Supabase</div>
              <p style="font-size:13px;color:var(--text-muted);line-height:1.55;margin:0">Backupurile Supabase depind de planul proiectului și acoperă doar baza de date, nu fișierele din Storage. Verifică starea curentă în <a href="https://supabase.com/dashboard/project/ofknvxwcqwgnthnvslfl/database/backups" target="_blank" rel="noopener noreferrer" style="color:#3b82f6">Supabase Dashboard → Database → Backups</a>.</p>
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
                  <th style="text-align:left;padding:8px 12px;font-weight:600">Acțiuni</th>
                </tr>
              </thead>
              <tbody>
                ${logs.map(l => {
                  const driveFile = this.parseDriveStoragePath(l.storage_path);
                  return `
                    <tr style="border-bottom:1px solid var(--border)">
                      <td style="padding:8px 12px">${l.backup_type || 'full'}</td>
                      <td style="padding:8px 12px">${formatDate(l.created_at)} ${new Date(l.created_at).toLocaleTimeString('ro-RO', {hour:'2-digit',minute:'2-digit'})}</td>
                      <td style="padding:8px 12px">${badge(l.status, l.status === 'completed' ? 'green' : 'red')}</td>
                      <td style="padding:8px 12px">${l.file_size_bytes ? Math.round(l.file_size_bytes/1024) + ' KB' : '—'}</td>
                      <td style="padding:8px 12px;white-space:nowrap">
                        ${driveFile ? `<a href="${this.escapeHtml(driveFile.web_view_link || `https://drive.google.com/file/d/${driveFile.file_id}/view`)}" target="_blank" rel="noopener noreferrer" style="color:#1769AA;font-size:12px;font-weight:700;text-decoration:none;margin-right:8px">Deschide ↗</a>` : ''}
                        <button onclick="Backup.deleteLog('${l.id}')" style="background:none;border:1px solid var(--danger);color:var(--danger);border-radius:6px;padding:3px 10px;font-size:12px;cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='var(--danger)';this.style.color='#fff'" onmouseout="this.style.background='none';this.style.color='var(--danger)'">🗑 Șterge</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>`
          }
        </div>
      </div>
    `;
  },

  openDriveConfigModal() {
    const currentUrl = this.escapeHtml(this.driveConfig?.folder_url || '');
    openModal('Configurează folderul de backup', `
      <div class="space-y-3">
        <div style="padding:10px 12px;border-radius:7px;background:#FFF8D6;color:#5B4700;font-size:12px;line-height:1.5">
          Folosește un folder Google Drive dedicat pentru backupuri. Linkul este salvat ca setare administrabilă în baza de date — nu ajunge în codul portalului sau în GitHub.
        </div>
        <div>
          <label class="label">Link folder Google Drive *</label>
          <input id="backup-drive-folder-url" class="input" type="url" value="${currentUrl}" placeholder="https://drive.google.com/drive/folders/..." autocomplete="off" />
          <div style="font-size:11px;color:var(--text-muted);line-height:1.45;margin-top:6px">Partajează folderul doar cu contul tehnic al portalului, cu rol de Editor. Nu folosi un folder cu documente HR sau personale.</div>
        </div>
      </div>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
      <button class="btn-brand" onclick="Backup.saveDriveConfig()">Salvează folderul</button>
    `);
  },

  async saveDriveConfig() {
    const folderUrl = String(document.getElementById('backup-drive-folder-url')?.value || '').trim();
    const folderId = this.extractDriveFolderId(folderUrl);
    if (!folderId) {
      showToast('Introdu un link valid de folder Google Drive.', 'error');
      return;
    }

    const config = {
      folder_id: folderId,
      folder_url: `https://drive.google.com/drive/folders/${folderId}`,
      configured_at: new Date().toISOString(),
    };
    const sb = getSupabase();
    const { error } = await sb.from('app_settings').upsert({
      key: 'backup_drive_destination',
      value: JSON.stringify(config),
      updated_by: Auth.currentUser?.id || Auth.currentProfile?.id || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
    if (error) {
      showToast(`Nu s-a putut salva folderul: ${error.message}`, 'error');
      return;
    }

    closeModalForce();
    showToast('Folderul de backup a fost salvat. Adresa poate fi modificată oricând de un administrator.', 'success');
    await this.render();
  },

  async removeDriveConfig() {
    if (!this.driveConfig || !confirm('Elimini configurația folderului de backup? Backupurile existente din Drive nu sunt șterse.')) return;
    const sb = getSupabase();
    const { error } = await sb.from('app_settings').delete().eq('key', 'backup_drive_destination');
    if (error) {
      showToast(`Nu s-a putut elimina configurația: ${error.message}`, 'error');
      return;
    }
    showToast('Configurația folderului a fost eliminată. Backupurile existente rămân neschimbate în Drive.', 'success');
    await this.render();
  },

  async exportJSON() {
    if (!this.driveConfig?.folder_id) {
      showToast('Configurează mai întâi folderul Google Drive pentru export.', 'error');
      return;
    }
    if (!window.DriveViewer?.uploadJsonToFolder) {
      showToast('Conectorul Google Drive nu este disponibil. Reîncarcă pagina și încearcă din nou.', 'error');
      return;
    }

    showToast('Se pregătește exportul pentru Google Drive...', 'info');
    try {
      const sb = getSupabase();
      const [projRes, phasesRes, tasksRes, membersRes, timeRes] = await Promise.all([
        sb.from('projects').select('*'),
        sb.from('project_phases').select('*'),
        sb.from('project_tasks').select('*'),
        sb.from('project_members').select('*, profiles(full_name, email)'),
        sb.from('time_entries').select('*, profiles(full_name)').order('date', { ascending: false }).limit(5000),
      ]);
      const readError = [projRes, phasesRes, tasksRes, membersRes, timeRes].find(result => result.error)?.error;
      if (readError) throw readError;

      const fileName = this.formatDriveBackupFileName(new Date());
      const exportData = {
        exported_at: new Date().toISOString(),
        exported_by: Auth.currentProfile?.full_name || Auth.currentUser?.email,
        version: '1.0',
        file_name: fileName,
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
      const uploadedFile = await DriveViewer.uploadJsonToFolder(
        this.driveConfig.folder_id,
        fileName,
        json
      );

      const { error: logError } = await DB.createBackupLog({
        backup_type: 'json-drive-export',
        status: 'completed',
        file_size_bytes: json.length,
        storage_path: JSON.stringify({
          provider: 'google_drive',
          folder_id: this.driveConfig.folder_id,
          file_id: uploadedFile.id,
          file_name: uploadedFile.name || fileName,
          web_view_link: uploadedFile.webViewLink || `https://drive.google.com/file/d/${uploadedFile.id}/view`,
        }),
        created_by: Auth.currentUser?.id,
        completed_at: new Date().toISOString(),
      });

      if (logError) console.warn('[Backup] Exportul a fost încărcat, dar nu a putut fi adăugat în istoric:', logError.message);
      showToast(logError
        ? 'Exportul a fost salvat în Google Drive, însă nu a putut fi adăugat în istoric.'
        : 'Exportul JSON a fost salvat direct în folderul Google Drive.', 'success');
      this.render();
    } catch (e) {
      showToast('Eroare la exportul în Google Drive: ' + e.message, 'error');
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

  async importJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    // Reset input so same file can be re-selected
    event.target.value = '';
    const confirmed = confirm(
      '⚠️ ATENȞIE: Importul JSON va restaura datele exportate anterior.\n\n' +
      'Procesul adaugă date noi în baza de date (nu şterge datele existente).\n\n' +
      'Continuă?'
    );
    if (!confirmed) return;
    showToast('Se importă datele...', 'info');
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      if (!backup.version || !backup.data) {
        showToast('Fişierul JSON nu este un backup valid al portalului!', 'error');
        return;
      }
      const sb = getSupabase();
      let importedProjects = 0;
      // Import proiecte (skip duplicate code)
      for (const proj of (backup.data.projects || [])) {
        const { data: existing } = await sb.from('projects').select('id').eq('code', proj.code).single();
        if (!existing) {
          const { id, created_at, updated_at, ...projData } = proj;
          const { error } = await sb.from('projects').insert(projData);
          if (!error) importedProjects++;
        }
      }
      await DB.createBackupLog({
        backup_type: 'import-json',
        status: 'completed',
        file_size_bytes: text.length,
        created_by: Auth.currentUser?.id,
        completed_at: new Date().toISOString(),
      });
      showToast(`Import finalizat! ${importedProjects} proiecte noi importate.`, 'success');
      this.render();
    } catch (e) {
      showToast('Eroare la import: ' + e.message, 'error');
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

  async deleteLog(id) {
    const sb = getSupabase();
    const { data: backupLog, error: lookupError } = await sb.from('backup_logs')
      .select('id, storage_path')
      .eq('id', id)
      .maybeSingle();
    if (lookupError || !backupLog) {
      showToast('Backupul nu mai este disponibil în istoric.', 'error');
      return;
    }

    const driveFile = this.parseDriveStoragePath(backupLog.storage_path);
    const confirmationText = driveFile
      ? 'Ștergi acest backup din Google Drive și din istoric? Acțiunea nu poate fi anulată.'
      : 'Ștergi acest backup din istoric? Acțiunea nu poate fi anulată.';
    if (!confirm(confirmationText)) return;
    try {
      if (driveFile?.file_id) {
        await DriveViewer.deletePortalFile(driveFile.file_id);
      }
      const { error } = await sb.from('backup_logs').delete().eq('id', id);
      if (error) throw error;
      showToast(driveFile ? 'Backup șters din Google Drive și din istoric.' : 'Backup șters din istoric.', 'success');
      this.render();
    } catch (e) {
      showToast('Backupul nu a putut fi șters: ' + e.message, 'error');
    }
  },
};
