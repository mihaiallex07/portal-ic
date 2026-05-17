// ============================================================
// ProceseProc Module — Portal Inginerie Creativă
// Afișează conținut din Google Drive folder 03. Procese & Proceduri
// Structură de foldere cu viewer inline
// ============================================================
const ProceseProc = {
  FOLDER_ID: '1mqNUVdi3n5kDwK7BTyJQ6JcJt8abqheG',
  FOLDER_URL: 'https://drive.google.com/drive/folders/1mqNUVdi3n5kDwK7BTyJQ6JcJt8abqheG',
  currentPath: [],
  currentFileId: null,

  render() {
    const container = document.getElementById('page-content');
    if (!container) return;
    this.currentPath = [];
    container.innerHTML = `
      <div style="margin-bottom:20px">
        <h2 style="font-size:22px;font-weight:700;margin:0 0 4px">Procese & Proceduri</h2>
        <p style="color:var(--text-muted);font-size:13px;margin:0">Procesele și procedurile interne ale companiei</p>
      </div>
      <div style="display:flex;gap:16px;height:calc(100vh - 180px);min-height:500px">
        <div id="procproc-sidebar" style="width:280px;flex-shrink:0;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;overflow-y:auto;padding:8px">
          <div id="procproc-breadcrumb" style="padding:8px 12px 4px;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">Foldere</div>
          <div id="procproc-file-list">
            <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">
              <div style="font-size:24px;margin-bottom:8px">⏳</div>
              Se încarcă...
            </div>
          </div>
        </div>
        <div id="procproc-viewer" style="flex:1;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center">
          <div style="text-align:center;color:var(--text-muted)">
            <div style="font-size:48px;margin-bottom:12px">⚙️</div>
            <p style="font-size:14px">Selectează un document din lista din stânga</p>
          </div>
        </div>
      </div>
    `;
    this.loadFolder(this.FOLDER_ID);
  },

  async loadFolder(folderId) {
    const listEl = document.getElementById('procproc-file-list');
    const breadcrumb = document.getElementById('procproc-breadcrumb');
    if (!listEl) return;

    listEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px"><div style="font-size:24px;margin-bottom:8px">⏳</div>Se încarcă...</div>`;

    if (breadcrumb) {
      const crumbs = [{ id: this.FOLDER_ID, name: 'Procese' }, ...this.currentPath];
      breadcrumb.innerHTML = crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return isLast
          ? `<span style="color:var(--text);font-weight:600">${c.name}</span>`
          : `<button onclick="ProceseProc.navigateTo(${i})" style="border:none;background:none;cursor:pointer;color:var(--primary);font-size:11px;padding:0">${c.name}</button><span style="color:var(--text-muted)"> / </span>`;
      }).join('');
    }

    try {
      const files = await DriveViewer.listFolder(folderId);

      if (files === null) {
        // Nu avem token — afișăm buton de conectare
        listEl.innerHTML = `
          <div style="padding:16px;text-align:center">
            <div style="font-size:32px;margin-bottom:8px">🔗</div>
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Conectează Google Drive pentru a vedea documentele</p>
            <button onclick="ProceseProc.connectDrive()"
              style="background:var(--brand);color:#000;font-weight:700;font-size:12px;padding:8px 16px;border-radius:6px;border:none;cursor:pointer;width:100%">
              Conectează Drive
            </button>
            <a href="${this.FOLDER_URL}" target="_blank" style="display:block;margin-top:8px;font-size:11px;color:var(--primary);text-decoration:none">Deschide în Drive →</a>
          </div>`;
        return;
      }

      if (!files || files.length === 0) {
        listEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">
          <div style="font-size:24px;margin-bottom:8px">📂</div>
          <p>Folder gol.</p>
        </div>`;
        return;
      }

      const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
      const docs = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

      listEl.innerHTML = [
        ...folders.map(f => `
          <button onclick="ProceseProc.enterFolder('${f.id}','${f.name.replace(/'/g, "\\'")}'))"
            style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:none;background:none;cursor:pointer;border-radius:6px;text-align:left;transition:background 0.15s"
            onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='none'">
            <span style="font-size:16px;flex-shrink:0">📁</span>
            <span style="font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500">${f.name}</span>
          </button>
        `),
        ...docs.map(f => `
          <button onclick="ProceseProc.openFile('${f.id}','${f.mimeType}')"
            style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:none;background:none;cursor:pointer;border-radius:6px;text-align:left;transition:background 0.15s"
            onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='none'"
            id="file-btn-${f.id}">
            <span style="font-size:16px;flex-shrink:0">${DriveViewer.getIcon(f.mimeType)}</span>
            <span style="font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</span>
          </button>
        `)
      ].join('');
    } catch(e) {
      const listEl2 = document.getElementById('procproc-file-list');
      if (listEl2) listEl2.innerHTML = `<div style="padding:16px;font-size:13px;color:var(--text-muted)">
        <p>Nu s-a putut încărca conținutul.</p>
        <a href="${this.FOLDER_URL}" target="_blank" style="color:var(--primary)">Deschide în Drive →</a>
      </div>`;
    }
  },

  async connectDrive() {
    const token = await DriveViewer.getToken(true);
    if (token) this.loadFolder(this.FOLDER_ID);
  },

  enterFolder(folderId, folderName) {
    this.currentPath.push({ id: folderId, name: folderName });
    this.loadFolder(folderId);
  },

  navigateTo(index) {
    if (index === 0) {
      this.currentPath = [];
      this.loadFolder(this.FOLDER_ID);
    } else {
      this.currentPath = this.currentPath.slice(0, index);
      this.loadFolder(this.currentPath[this.currentPath.length - 1].id);
    }
  },

  openFile(fileId, mimeType) {
    this.currentFileId = fileId;
    document.querySelectorAll('[id^="file-btn-"]').forEach(b => b.style.background = 'none');
    const btn = document.getElementById(`file-btn-${fileId}`);
    if (btn) btn.style.background = 'rgba(255,203,8,0.2)';
    DriveViewer.showInViewer('procproc-viewer', fileId, mimeType);
  }
};
