// ============================================================
// Regulament Intern Module — Portal Inginerie Creativă
// Taburi dinamice din Google Drive (folder 02. Regulamente)
// Viewer inline PDF/Word/Google Docs via DriveViewer (OAuth)
// Folder ID: 1QBuw8rw4V1YXZ-72LsVwo0Hs5TA3l33w
// ============================================================
const Regulament = {
  FOLDER_ID: '1QBuw8rw4V1YXZ-72LsVwo0Hs5TA3l33w',
  FOLDER_URL: 'https://drive.google.com/drive/folders/1QBuw8rw4V1YXZ-72LsVwo0Hs5TA3l33w',
  _files: [],

  // ── Render principal ───────────────────────────────────────
  async render() {
    const container = document.getElementById('page-content');
    if (!container) return;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Regulamente</h1>
          <p class="page-subtitle">Documentele oficiale ale companiei Inginerie Creativă</p>
        </div>
      </div>
      <div id="reg-body">
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;gap:16px">
          <div style="width:32px;height:32px;border:3px solid var(--border);border-top-color:var(--brand);border-radius:50%;animation:spin 0.8s linear infinite"></div>
          <p style="color:var(--text-muted);font-size:14px;margin:0">Se încarcă documentele...</p>
        </div>
      </div>
    `;

    // Inițializăm DriveViewer
    await DriveViewer.init();

    // Obținem token (silent — fără popup dacă e deja acordat)
    const token = await DriveViewer.getToken(false);

    if (!token) {
      this._renderConnectPrompt();
      return;
    }

    // Listăm fișierele din folder
    const files = await this._listFiles(token);
    if (files === null) {
      // Token invalid — cerem din nou
      const newToken = await DriveViewer.getToken(true);
      if (!newToken) { this._renderConnectPrompt(); return; }
      const retryFiles = await this._listFiles(newToken);
      this._renderTabs(retryFiles || []);
    } else {
      this._renderTabs(files);
    }
  },

  // ── Listare fișiere din folder ─────────────────────────────
  async _listFiles(token) {
    try {
      const params = new URLSearchParams({
        q: `'${this.FOLDER_ID}' in parents and trashed=false`,
        fields: 'files(id,name,mimeType,modifiedTime)',
        orderBy: 'name',
        includeItemsFromAllDrives: 'true',
        supportsAllDrives: 'true',
        corpora: 'allDrives',
        pageSize: '50'
      });
      const resp = await fetch(
        `https://www.googleapis.com/drive/v3/files?${params}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (resp.status === 401) return null;
      const data = await resp.json();
      return data.files || [];
    } catch (e) {
      console.error('Regulament listFiles error:', e);
      return [];
    }
  },

  // ── Render taburi ──────────────────────────────────────────
  _renderTabs(files) {
    const body = document.getElementById('reg-body');
    if (!body) return;

    // Filtrăm foldere
    const docs = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

    if (docs.length === 0) {
      body.innerHTML = `
        <div style="text-align:center;padding:80px 20px">
          <div style="font-size:48px;margin-bottom:16px">📂</div>
          <h3 style="font-size:18px;font-weight:600;margin:0 0 8px">Niciun document disponibil</h3>
          <p style="color:var(--text-muted);font-size:14px;margin:0 0 20px">
            Adaugă documente în folderul <strong>02. Regulamente</strong> din Google Drive.
          </p>
          <a href="${this.FOLDER_URL}" target="_blank"
             style="display:inline-flex;align-items:center;gap:8px;background:var(--brand);color:#000;font-weight:700;font-size:13px;padding:10px 20px;border-radius:8px;text-decoration:none">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Deschide folderul în Drive
          </a>
        </div>
      `;
      return;
    }

    // Construim taburi
    const tabsHtml = docs.map((f, i) => `
      <button
        class="reg-tab${i === 0 ? ' active' : ''}"
        data-index="${i}"
        onclick="Regulament._selectTab(${i})"
        title="${f.name}"
      >
        <span style="font-size:15px;flex-shrink:0">${DriveViewer.getIcon(f.mimeType)}</span>
        <span class="reg-tab-label">${this._cleanName(f.name)}</span>
      </button>
    `).join('');

    body.innerHTML = `
      <div class="reg-tabs-wrapper">
        <div class="reg-tabs" id="reg-tabs">
          ${tabsHtml}
        </div>
        <a href="${this.FOLDER_URL}" target="_blank" class="reg-drive-link" title="Deschide folderul în Google Drive">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          Drive
        </a>
      </div>
      <div class="reg-viewer" id="reg-viewer">
        <div style="display:flex;align-items:center;justify-content:center;height:100%">
          <div style="width:28px;height:28px;border:3px solid var(--border);border-top-color:var(--brand);border-radius:50%;animation:spin 0.8s linear infinite"></div>
        </div>
      </div>
    `;

    this._files = docs;
    this._selectTab(0);
  },

  // ── Selectare tab ──────────────────────────────────────────
  _selectTab(index) {
    if (!this._files || !this._files[index]) return;

    // Update UI taburi
    document.querySelectorAll('.reg-tab').forEach((btn, i) => {
      btn.classList.toggle('active', i === index);
    });

    const file = this._files[index];
    const viewer = document.getElementById('reg-viewer');
    if (!viewer) return;

    const embedUrl = DriveViewer.getEmbedUrl(file.id, file.mimeType);

    viewer.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%">
        <div class="reg-viewer-bar">
          <span style="font-size:12px;color:var(--text-muted)">${DriveViewer.getMimeLabel(file.mimeType)} · ${this._cleanName(file.name)}</span>
          <a href="https://drive.google.com/file/d/${file.id}/view" target="_blank"
             style="font-size:12px;color:var(--primary);text-decoration:none;display:flex;align-items:center;gap:4px;white-space:nowrap;flex-shrink:0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Deschide în Drive
          </a>
        </div>
        <iframe src="${embedUrl}"
          style="flex:1;width:100%;border:none;min-height:0"
          allow="autoplay"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation">
        </iframe>
      </div>
    `;
  },

  // ── Prompt conectare Google ────────────────────────────────
  _renderConnectPrompt() {
    const body = document.getElementById('reg-body');
    if (!body) return;
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;gap:20px;text-align:center">
        <div style="width:64px;height:64px;background:var(--brand-light);border-radius:16px;display:flex;align-items:center;justify-content:center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </div>
        <div>
          <h3 style="font-size:18px;font-weight:700;margin:0 0 8px">Conectează Google Drive</h3>
          <p style="color:var(--text-muted);font-size:14px;max-width:400px;margin:0">
            Pentru a vizualiza regulamentele direct în portal, este necesară o permisiune de citire din Google Drive (contul tău <strong>@ingineriecreativa.ro</strong>).
          </p>
        </div>
        <button onclick="Regulament._connectDrive()"
          style="background:var(--brand);color:#000;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;border:none;cursor:pointer;display:flex;align-items:center;gap:8px">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
          Conectează cu Google
        </button>
        <a href="${this.FOLDER_URL}" target="_blank" style="font-size:13px;color:var(--primary);text-decoration:none">
          Sau deschide direct în Google Drive →
        </a>
      </div>
    `;
  },

  async _connectDrive() {
    const token = await DriveViewer.getToken(true);
    if (token) await this.render();
  },

  // ── Utilitar: curăță numele fișierului (elimină extensia) ──
  _cleanName(name) {
    return name.replace(/\.(pdf|docx?|xlsx?|pptx?|txt|png|jpg|jpeg|gif)$/i, '').trim();
  }
};
