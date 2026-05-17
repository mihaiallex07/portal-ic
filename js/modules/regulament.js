// ============================================================
// Regulament Module — Portal Inginerie Creativă
// Afișează conținut din Google Drive folder 02. Regulament Intern
// Inline viewer — documentul se vede direct în pagină
// ============================================================
const Regulament = {
  FOLDER_ID: '1QBuw8rw4V1YXZ-72LsVwo0Hs5TA3l33w',
  FOLDER_URL: 'https://drive.google.com/drive/folders/1QBuw8rw4V1YXZ-72LsVwo0Hs5TA3l33w',
  currentFileId: null,

  render() {
    const container = document.getElementById('page-content');
    if (!container) return;
    container.innerHTML = `
      <div style="margin-bottom:20px">
        <h2 style="font-size:22px;font-weight:700;margin:0 0 4px">Regulament Intern</h2>
        <p style="color:var(--text-muted);font-size:13px;margin:0">Regulamentul intern al companiei Inginerie Creativă</p>
      </div>
      <div style="display:flex;gap:16px;height:calc(100vh - 180px);min-height:500px">
        <div id="regulament-sidebar" style="width:260px;flex-shrink:0;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;overflow-y:auto;padding:8px">
          <div style="padding:8px 12px;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">Documente</div>
          <div id="regulament-file-list">
            <div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">
              <div style="font-size:24px;margin-bottom:8px">⏳</div>
              Se încarcă...
            </div>
          </div>
        </div>
        <div id="regulament-viewer" style="flex:1;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center">
          <div style="text-align:center;color:var(--text-muted)">
            <div style="font-size:48px;margin-bottom:12px">📋</div>
            <p style="font-size:14px">Selectează un document din lista din stânga</p>
          </div>
        </div>
      </div>
    `;
    this.loadFileList();
  },

  async loadFileList() {
    const listEl = document.getElementById('regulament-file-list');
    if (!listEl) return;
    try {
      const files = await DriveViewer.listFolder(this.FOLDER_ID);

      if (files === null) {
        // Nu avem token — afișăm buton de conectare
        listEl.innerHTML = `
          <div style="padding:16px;text-align:center">
            <div style="font-size:32px;margin-bottom:8px">🔗</div>
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Conectează Google Drive pentru a vedea documentele</p>
            <button onclick="Regulament.connectDrive()"
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
          <p>Niciun document în acest folder.</p>
          <a href="${this.FOLDER_URL}" target="_blank" style="color:var(--primary);font-size:12px">Deschide în Drive →</a>
        </div>`;
        return;
      }

      listEl.innerHTML = files.map(f => `
        <button onclick="Regulament.openFile('${f.id}','${f.mimeType}')"
          style="display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;border:none;background:none;cursor:pointer;border-radius:6px;text-align:left;transition:background 0.15s"
          onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="if(this.id!=='active-file')this.style.background='none'"
          id="file-btn-${f.id}">
          <span style="font-size:16px;flex-shrink:0">${DriveViewer.getIcon(f.mimeType)}</span>
          <span style="font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</span>
        </button>
      `).join('');

      // Auto-deschide primul document
      if (files.length > 0) {
        setTimeout(() => this.openFile(files[0].id, files[0].mimeType), 100);
      }
    } catch(e) {
      const listEl2 = document.getElementById('regulament-file-list');
      if (listEl2) listEl2.innerHTML = `<div style="padding:16px;font-size:13px;color:var(--text-muted)">
        <p>Nu s-a putut încărca lista.</p>
        <a href="${this.FOLDER_URL}" target="_blank" style="color:var(--primary)">Deschide în Google Drive →</a>
      </div>`;
    }
  },

  async connectDrive() {
    const token = await DriveViewer.getToken(true);
    if (token) this.loadFileList();
  },

  openFile(fileId, mimeType) {
    this.currentFileId = fileId;
    document.querySelectorAll('[id^="file-btn-"]').forEach(b => {
      b.style.background = 'none';
      b.id !== 'active-file' && (b.id = b.id);
    });
    const btn = document.getElementById(`file-btn-${fileId}`);
    if (btn) btn.style.background = 'rgba(255,203,8,0.2)';
    DriveViewer.showInViewer('regulament-viewer', fileId, mimeType);
  }
};
