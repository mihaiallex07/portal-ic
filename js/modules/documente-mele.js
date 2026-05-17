// ============================================================
// DocumenteMele Module — Portal Inginerie Creativă
// Afișează documentele personale ale angajatului din Google Drive
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

    // Admin vede toate folderele
    if (isAdmin) {
      this.renderAdminView(contentEl, savedFolders);
      return;
    }

    // Angajat — caută folderul lui
    const myFolder = savedFolders[email];
    if (myFolder) {
      this.myFolderId = myFolder.id;
      this.renderMyDocuments(contentEl, myFolder.name);
    } else {
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
    container.innerHTML = `
      <div style="display:flex;gap:16px;height:calc(100vh - 220px);min-height:500px">
        <div id="docmele-sidebar" style="width:260px;flex-shrink:0;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;overflow-y:auto;padding:8px">
          <div style="padding:8px 12px;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">
            📁 ${folderName}
          </div>
          <div id="docmele-file-list">
            <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">
              <div style="font-size:24px;margin-bottom:8px">⏳</div>
              Se încarcă...
            </div>
          </div>
        </div>
        <div id="docmele-viewer" style="flex:1;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center">
          <div style="text-align:center;color:var(--text-muted)">
            <div style="font-size:48px;margin-bottom:12px">🔒</div>
            <p style="font-size:14px">Documentele tale personale</p>
            <p style="font-size:12px;color:var(--text-muted)">Selectează un document din stânga</p>
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
  renderAdminView(container, savedFolders) {
    const folderEntries = Object.entries(savedFolders);
    container.innerHTML = `
      <div style="max-width:700px">
        <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:16px">
          <h3 style="font-size:15px;font-weight:600;margin:0 0 4px">Configurare foldere angajați</h3>
          <p style="font-size:13px;color:var(--text-muted);margin:0 0 16px">Asociază email-ul fiecărui angajat cu folderul lui din Google Drive.</p>
          
          <div style="margin-bottom:16px">
            <label class="form-label">Email angajat</label>
            <input id="admin-emp-email" class="form-input" placeholder="prenume.nume@ingineriecreativa.ro" style="margin-bottom:8px">
            <label class="form-label">Nume afișat</label>
            <input id="admin-emp-name" class="form-input" placeholder="ex: Mihai PORUMBOIU" style="margin-bottom:8px">
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

  addEmployeeFolder() {
    const email = document.getElementById('admin-emp-email')?.value.trim();
    const name = document.getElementById('admin-emp-name')?.value.trim();
    const folderLink = document.getElementById('admin-emp-folder')?.value.trim();
    if (!email || !folderLink) { showToast('Completează email-ul și link-ul folderului', 'error'); return; }
    
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
