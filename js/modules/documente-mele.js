// ============================================================
// DocumenteMele Module — Portal Inginerie Creativă
// Link direct spre Google Drive folder personal al angajatului
// Folder 05. Documente angajati / [Nume Angajat]
// Confidențial — fiecare angajat vede DOAR folderul lui
// ============================================================
const DocumenteMele = {
  PARENT_FOLDER_ID: '1OcLEzdXa98BbGC7TJphPbfXi_R_EHGuk',
  myFolderId: null,
  currentPath: [],
  currentFileId: null,

  // Mapare email → folder ID (se populează dinamic sau manual de admin)
  // Cheia e email-ul angajatului, valoarea e ID-ul folderului din Drive
  FOLDER_MAP: {
    // Exemplu: 'mihai.porumboiu@ingineriecreativa.ro': 'FOLDER_ID_MIHAI',
    // Admin-ul adaugă intrări noi când creează foldere noi
  },

  render() {
    const container = document.getElementById('page-content');
    if (!container) return;
    this.currentPath = [];

    const profile = Auth.currentProfile;
    const isAdmin = profile && profile.role === 'admin';

    container.innerHTML = `
      <div style="margin-bottom:20px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div>
            <h2 style="font-size:22px;font-weight:700;margin:0 0 4px">Documentele mele</h2>
            <p style="color:var(--text-muted);font-size:13px;margin:0">Contract, fișa postului, evaluări și alte documente personale</p>
          </div>
          ${isAdmin ? `<button class="btn-secondary" onclick="DocumenteMele.showAdminPanel()" style="font-size:13px">⚙ Configurare foldere</button>` : ''}
        </div>
      </div>
      <div id="docmele-content">
        <div style="padding:40px;text-align:center;color:var(--text-muted)">
          <div style="font-size:32px;margin-bottom:12px">⏳</div>
          <p>Se caută folderul tău de documente...</p>
        </div>
      </div>
    `;

    this.findMyFolder();
  },

  async findMyFolder() {
    const profile = Auth.currentProfile;
    const isAdmin = profile && profile.role === 'admin';
    const contentEl = document.getElementById('docmele-content');
    if (!contentEl) return;

    // Verificăm dacă există un folder configurat pentru acest utilizator
    const email = profile?.email || '';
    const savedFolders = this.getSavedFolders();

     // Toți utilizatorii (inclusiv admin) văd mai întâi documentele proprii
    const myFolder = savedFolders[email];
    if (myFolder) {
      this.myFolderId = myFolder.id;
      this.renderMyDocuments(contentEl, myFolder.name);
      return;
    }
    // Admin fără folder propriu configurat — vede direct panoul de configurare
    if (isAdmin) {
      this.renderAdminView(contentEl, savedFolders);
      return;
    }
    // Angajat fără folder configurat
    {
      // Nu există folder configurat
      contentEl.innerHTML = `
        <div style="padding:60px;text-align:center;color:var(--text-muted)">
          <div style="font-size:48px;margin-bottom:16px">📂</div>
          <h3 style="font-size:16px;font-weight:600;color:var(--text-primary);margin:0 0 8px">Niciun folder configurat</h3>
          <p style="font-size:13px;margin:0 0 16px">Folderul tău de documente nu a fost configurat încă.<br>Contactează administratorul pentru a-ți crea folderul.</p>
          <div style="padding:12px 16px;background:var(--bg-secondary);border-radius:8px;font-size:12px;color:var(--text-muted);display:inline-block">
            Email: <strong>${email}</strong>
          </div>
        </div>
      `;
    }
  },

  getSavedFolders() {
    try {
      return JSON.parse(localStorage.getItem('ic_employee_folders') || '{}');
    } catch { return {}; }
  },

  saveFolders(folders) {
    localStorage.setItem('ic_employee_folders', JSON.stringify(folders));
  },

  renderMyDocuments(container, folderName) {
    const folderUrl = `https://drive.google.com/drive/folders/${this.myFolderId}`;
    container.innerHTML = `
      <div style="display:flex;gap:0;height:calc(100vh - 220px);min-height:500px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
        <div style="width:240px;flex-shrink:0;border-right:1px solid var(--border);display:flex;flex-direction:column;background:var(--surface)">
          <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-size:13px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px">${folderName}</div>
              <div style="font-size:11px;color:var(--text-muted)">Documentele mele</div>
            </div>
            <a href="${folderUrl}" target="_blank" title="Deschide în Drive"
               style="color:var(--text-muted);text-decoration:none;display:flex;align-items:center;padding:4px;border-radius:4px;flex-shrink:0"
               onmouseover="this.style.color='var(--primary)'" onmouseout="this.style.color='var(--text-muted)'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          </div>
          <div id="docmele-file-list" style="flex:1;overflow-y:auto;padding:8px">
            <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">
              <div style="width:20px;height:20px;border:2px solid var(--border);border-top-color:var(--brand);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 8px"></div>
              Se încarcă...
            </div>
          </div>
        </div>
        <div id="docmele-viewer" style="flex:1;display:flex;align-items:center;justify-content:center;background:var(--surface-2,var(--bg-secondary));color:var(--text-muted);font-size:14px">
          <div style="text-align:center">
            <div style="font-size:40px;margin-bottom:12px">📄</div>
            <p style="margin:0">Selectează un document din stânga</p>
          </div>
        </div>
      </div>
    `;
    this.loadMyFiles();
  },

  async loadMyFiles() {
    const listEl = document.getElementById('docmele-file-list');
    if (!listEl || !this.myFolderId) return;

    try {
      const files = await DriveViewer.listFolder(this.myFolderId);
      if (!files || files.length === 0) {
        listEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">
          <div style="font-size:24px;margin-bottom:8px">📂</div>
          <p>Nu există documente încă.</p>
        </div>`;
        return;
      }
      const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
      const docs = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
      listEl.innerHTML = [
        ...folders.map(f => `
          <div style="padding:6px 12px;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;margin-top:8px">${f.name}</div>
        `),
        ...docs.map(f => `
          <button onclick="DocumenteMele.openFile('${f.id}','${f.mimeType}')"
            style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:none;background:none;cursor:pointer;border-radius:6px;text-align:left;transition:background 0.15s"
            onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='none'"
            id="file-btn-${f.id}">
            <span style="font-size:16px;flex-shrink:0">${DriveViewer.getIcon(f.mimeType)}</span>
            <span style="font-size:13px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</span>
          </button>
        `)
      ].join('');
    } catch(e) {
      listEl.innerHTML = `<div style="padding:16px;font-size:13px;color:var(--text-muted)">
        <p>Nu s-a putut încărca lista.</p>
      </div>`;
    }
  },

  openFile(fileId, mimeType) {
    document.querySelectorAll('[id^="file-btn-"]').forEach(b => b.style.background = 'none');
    const btn = document.getElementById(`file-btn-${fileId}`);
    if (btn) btn.style.background = 'var(--primary)20';
    DriveViewer.showInViewer('docmele-viewer', fileId, mimeType);
  },

  // Admin: vede toate folderele și poate configura maparea email → folder
  async renderAdminView(container, savedFolders) {
    const folderEntries = Object.entries(savedFolders);
    // Încarcă utilizatorii din DB
    let users = [];
    try {
      const result = await DB.getUsers();
      users = (result?.data || []).filter(u => u.email);
    } catch(e) { users = []; }
    const userOptions = users.map(u => `<option value="${u.email}" data-name="${(u.full_name||'').replace(/"/g,'&quot;')}">${u.full_name || u.email} (${u.email})</option>`).join('');
    container.innerHTML = `
      <div style="max-width:700px">
        <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:16px">
          <h3 style="font-size:15px;font-weight:600;margin:0 0 4px">Configurare foldere angajați</h3>
          <p style="font-size:13px;color:var(--text-muted);margin:0 0 16px">Asociază fiecare angajat înrolat în portal cu folderul lui din Google Drive.</p>
          
          <div style="margin-bottom:16px">
            <label class="form-label">Angajat</label>
            <select id="admin-emp-select" class="form-input" style="margin-bottom:8px" onchange="DocumenteMele.onUserSelect(this)">
              <option value="">-- Selectează angajat --</option>
              ${userOptions}
            </select>
            <input id="admin-emp-email" type="hidden" value="">
            <input id="admin-emp-name" type="hidden" value="">
            <label class="form-label">Link folder Google Drive (al angajatului)</label>
            <input id="admin-emp-folder" class="form-input" placeholder="https://drive.google.com/drive/folders/...">
            <button class="btn-primary" onclick="DocumenteMele.addEmployeeFolder()" style="margin-top:12px">+ Adaugă</button>
          </div>

          ${folderEntries.length > 0 ? `
            <div style="border-top:1px solid var(--border);padding-top:16px">
              <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:8px">ANGAJAȚI CONFIGURAȚI</div>
              ${folderEntries.map(([email, info]) => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--bg-secondary);border-radius:6px;margin-bottom:6px">
                  <div>
                    <div style="font-size:13px;font-weight:500">${info.name || email}</div>
                    <div style="font-size:11px;color:var(--text-muted)">${email}</div>
                  </div>
                  <button onclick="DocumenteMele.removeEmployeeFolder('${email}')" style="border:none;background:none;cursor:pointer;color:#EF4444;font-size:18px;padding:4px">×</button>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
        
        <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:20px">
          <h3 style="font-size:15px;font-weight:600;margin:0 0 4px">Folder principal angajați</h3>
          <p style="font-size:13px;color:var(--text-muted);margin:0 0 12px">Folderul <strong>05. Documente angajati</strong> din Drive</p>
          <a href="https://drive.google.com/drive/folders/${this.PARENT_FOLDER_ID}" target="_blank" class="btn-secondary" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Deschide în Google Drive
          </a>
        </div>
      </div>
    `;
  },

   onUserSelect(sel) {
    const opt = sel.options[sel.selectedIndex];
    document.getElementById('admin-emp-email').value = opt.value;
    document.getElementById('admin-emp-name').value = opt.getAttribute('data-name') || opt.value;
  },

  addEmployeeFolder() {
    const email = document.getElementById('admin-emp-email')?.value.trim() ||
                  document.getElementById('admin-emp-select')?.value.trim();
    const name = document.getElementById('admin-emp-name')?.value.trim() ||
                 document.getElementById('admin-emp-select')?.options[document.getElementById('admin-emp-select')?.selectedIndex]?.text;
    const folderLink = document.getElementById('admin-emp-folder')?.value.trim();
    if (!email || email === '' || !folderLink) { showToast('Selectează un angajat și completează link-ul folderului', 'error'); return; }
    
    // Extrage folder ID din link
    const match = folderLink.match(/folders\/([a-zA-Z0-9_-]+)/);
    if (!match) { showToast('Link invalid. Copiază link-ul direct din Google Drive.', 'error'); return; }
    const folderId = match[1];

    const folders = this.getSavedFolders();
    folders[email] = { id: folderId, name: name || email };
    this.saveFolders(folders);
    showToast(`Folder configurat pentru ${name || email}`, 'success');
    this.render();
  },

  removeEmployeeFolder(email) {
    const folders = this.getSavedFolders();
    delete folders[email];
    this.saveFolders(folders);
    showToast('Folder eliminat', 'success');
    this.render();
  },

  showAdminPanel() {
    const contentEl = document.getElementById('docmele-content');
    if (contentEl) this.renderAdminView(contentEl, this.getSavedFolders());
  }
};
