// ============================================================
// DriveViewer — Utilitar comun pentru vizualizare Google Drive
// Folosește Google Identity Services (GIS) pentru token OAuth
// Client ID: 1079754177727-89qmga68d5r0utsdclspd0tfqldil0og.apps.googleusercontent.com
// ============================================================
const DriveViewer = {
  CLIENT_ID: '1079754177727-89qmga68d5r0utsdclspd0tfqldil0og.apps.googleusercontent.com',
  SCOPE: 'https://www.googleapis.com/auth/drive.readonly',
  _tokenClient: null,
  _accessToken: null,
  _tokenExpiry: 0,
  _pendingResolve: null,

  // Inițializează Google Identity Services
  async init() {
    return new Promise((resolve) => {
      if (typeof google !== 'undefined' && google.accounts) {
        this._setupTokenClient();
        resolve();
        return;
      }
      // Dacă GIS nu e încărcat, îl încărcăm dinamic
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = () => {
        this._setupTokenClient();
        resolve();
      };
      script.onerror = () => resolve();
      document.head.appendChild(script);
    });
  },

  _setupTokenClient() {
    if (!google?.accounts?.oauth2) return;
    // Restaurăm token din localStorage dacă e valid
    try {
      const saved = JSON.parse(localStorage.getItem('ic_drive_token') || 'null');
      if (saved && saved.token && saved.expiry && Date.now() < saved.expiry) {
        this._accessToken = saved.token;
        this._tokenExpiry = saved.expiry;
      }
    } catch(e) {}

    this._tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: this.CLIENT_ID,
      scope: this.SCOPE,
      callback: (resp) => {
        if (resp.error) {
          console.error('GIS token error:', resp.error);
          if (this._pendingResolve) { this._pendingResolve(null); this._pendingResolve = null; }
          return;
        }
        this._accessToken = resp.access_token;
        this._tokenExpiry = Date.now() + (resp.expires_in - 60) * 1000;
        // Salvăm token în localStorage pentru persistență între refresh-uri
        try {
          localStorage.setItem('ic_drive_token', JSON.stringify({
            token: this._accessToken,
            expiry: this._tokenExpiry
          }));
        } catch(e) {}
        if (this._pendingResolve) { this._pendingResolve(this._accessToken); this._pendingResolve = null; }
      }
    });
  },

  // Obține un token valid (din cache sau nou)
  async getToken(forcePrompt = false) {
    // Token valid în cache
    if (!forcePrompt && this._accessToken && Date.now() < this._tokenExpiry) {
      return this._accessToken;
    }
    // Inițializează GIS dacă nu e gata
    await this.init();
    if (!this._tokenClient) return null;

    return new Promise((resolve) => {
      this._pendingResolve = resolve;
      // Silent refresh (fără popup dacă utilizatorul a acordat deja permisiunea)
      this._tokenClient.requestAccessToken({ prompt: forcePrompt ? 'consent' : '' });
    });
  },

  // Listează fișierele dintr-un folder Drive
  async listFolder(folderId) {
    try {
      const token = await this.getToken();
      if (!token) return null;

      const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size,modifiedTime)&orderBy=name&pageSize=100`;
      const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.status === 401) {
        // Token expirat — forțăm refresh
        this._accessToken = null;
        const newToken = await this.getToken(false);
        if (!newToken) return null;
        const resp2 = await fetch(url, { headers: { 'Authorization': `Bearer ${newToken}` } });
        if (!resp2.ok) return null;
        const data2 = await resp2.json();
        return data2.files || [];
      }
      if (!resp.ok) {
        console.warn('Drive API error:', resp.status);
        return null;
      }
      const data = await resp.json();
      return data.files || [];
    } catch(e) {
      console.error('DriveViewer.listFolder error:', e);
      return null;
    }
  },

  // Randează lista de fișiere + viewer într-un container
  async renderFolderViewer(containerId, folderId, folderUrl, opts = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--text-muted);font-size:14px">
      <span>Se încarcă documentele...</span>
    </div>`;

    const files = await this.listFolder(folderId);

    if (files === null) {
      // Nu avem token — afișăm buton de conectare
      container.innerHTML = this._renderConnectUI(containerId, folderId, folderUrl, opts);
      return;
    }

    if (files.length === 0) {
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:200px;gap:12px">
          <span style="font-size:40px">📂</span>
          <p style="color:var(--text-muted);font-size:14px">Niciun document în acest folder.</p>
          <a href="${folderUrl}" target="_blank" style="color:var(--primary);font-size:13px;text-decoration:none">Deschide în Drive →</a>
        </div>`;
      return;
    }

    // Layout split: lista stânga + viewer dreapta
    const listId = containerId + '-list';
    const viewerId = containerId + '-viewer';
    container.innerHTML = `
      <div style="display:flex;height:${opts.height || '600px'};border:1px solid var(--border);border-radius:8px;overflow:hidden">
        <div id="${listId}" style="width:260px;min-width:200px;border-right:1px solid var(--border);overflow-y:auto;background:var(--card-bg)">
          <div style="padding:10px 12px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid var(--border)">DOCUMENTE</div>
          ${files.map(f => `
            <div class="drive-file-item" onclick="DriveViewer.showInViewer('${viewerId}','${f.id}','${f.mimeType}', this)"
              style="display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--border);transition:background 0.1s"
              onmouseover="this.style.background='var(--hover-bg)'" onmouseout="this.style.background=''"
              data-file-id="${f.id}">
              <span style="font-size:18px;flex-shrink:0">${this.getIcon(f.mimeType)}</span>
              <div style="min-width:0">
                <div style="font-size:13px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.name}</div>
                <div style="font-size:11px;color:var(--text-muted)">${this.getMimeLabel(f.mimeType)}</div>
              </div>
            </div>
          `).join('')}
        </div>
        <div id="${viewerId}" style="flex:1;display:flex;align-items:center;justify-content:center;background:var(--bg)">
          <div style="text-align:center;color:var(--text-muted)">
            <span style="font-size:48px">📋</span>
            <p style="margin-top:8px;font-size:14px">Selectează un document din lista din stânga</p>
          </div>
        </div>
      </div>`;

    // Auto-deschide primul fișier dacă e setat
    if (opts.autoOpen && files.length > 0) {
      const firstItem = document.querySelector(`#${listId} .drive-file-item`);
      if (firstItem) setTimeout(() => this.showInViewer(viewerId, files[0].id, files[0].mimeType, firstItem), 300);
    }
  },

  _renderConnectUI(containerId, folderId, folderUrl, opts) {
    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:250px;gap:16px;text-align:center;padding:24px">
        <span style="font-size:48px">🔗</span>
        <div>
          <p style="font-weight:600;color:var(--text);margin-bottom:4px">Conectează Google Drive</p>
          <p style="font-size:13px;color:var(--text-muted)">Este necesară o permisiune suplimentară pentru a vizualiza documentele direct în portal.</p>
        </div>
        <button onclick="DriveViewer._connectAndReload('${containerId}','${folderId}','${folderUrl}',${JSON.stringify(opts).replace(/"/g,"'")})"
          style="background:var(--brand);color:#000;font-weight:700;font-size:13px;padding:10px 20px;border-radius:8px;border:none;cursor:pointer;display:flex;align-items:center;gap:8px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/><path d="M12 8v4l3 3"/></svg>
          Conectează cu Google
        </button>
        <a href="${folderUrl}" target="_blank" style="font-size:12px;color:var(--primary);text-decoration:none">Sau deschide direct în Google Drive →</a>
      </div>`;
  },

  async _connectAndReload(containerId, folderId, folderUrl, opts) {
    const token = await this.getToken(true); // forțăm popup
    if (token) {
      await this.renderFolderViewer(containerId, folderId, folderUrl, opts);
    }
  },

  // Afișează un fișier Drive în viewer-ul specificat
  showInViewer(viewerId, fileId, mimeType, itemEl) {
    // Highlight item activ
    if (itemEl) {
      document.querySelectorAll('.drive-file-item').forEach(el => el.style.background = '');
      itemEl.style.background = 'var(--brand-light, rgba(255,203,8,0.15))';
    }

    const viewer = document.getElementById(viewerId);
    if (!viewer) return;

    const embedUrl = this.getEmbedUrl(fileId, mimeType);

    viewer.innerHTML = `
      <div style="position:relative;width:100%;height:100%;display:flex;flex-direction:column">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--border);background:var(--card-bg);flex-shrink:0">
          <span style="font-size:12px;color:var(--text-muted)">${this.getMimeLabel(mimeType)}</span>
          <a href="https://drive.google.com/file/d/${fileId}/view" target="_blank"
             style="font-size:12px;color:var(--primary);text-decoration:none;display:flex;align-items:center;gap:4px">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Deschide în Drive
          </a>
        </div>
        <iframe src="${embedUrl}"
          style="flex:1;width:100%;border:none"
          allow="autoplay"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-top-navigation">
        </iframe>
      </div>
    `;
  },

  // Generează URL-ul de embed pentru diferite tipuri de fișiere
  getEmbedUrl(fileId, mimeType) {
    if (mimeType === 'application/vnd.google-apps.document') {
      return `https://docs.google.com/document/d/${fileId}/preview`;
    }
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      return `https://docs.google.com/spreadsheets/d/${fileId}/preview`;
    }
    if (mimeType === 'application/vnd.google-apps.presentation') {
      return `https://docs.google.com/presentation/d/${fileId}/preview`;
    }
    // PDF, imagini, Word, etc.
    return `https://drive.google.com/file/d/${fileId}/preview`;
  },

  getIcon(mimeType) {
    if (!mimeType) return '📄';
    if (mimeType === 'application/vnd.google-apps.folder') return '📁';
    if (mimeType === 'application/vnd.google-apps.document') return '📝';
    if (mimeType === 'application/vnd.google-apps.spreadsheet') return '📊';
    if (mimeType === 'application/vnd.google-apps.presentation') return '🖥️';
    if (mimeType === 'application/pdf') return '📕';
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.includes('word')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    return '📄';
  },

  getMimeLabel(mimeType) {
    if (!mimeType) return 'Document';
    if (mimeType === 'application/vnd.google-apps.document') return 'Google Docs';
    if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'Google Sheets';
    if (mimeType === 'application/vnd.google-apps.presentation') return 'Google Slides';
    if (mimeType === 'application/pdf') return 'PDF';
    if (mimeType.startsWith('image/')) return 'Imagine';
    if (mimeType.includes('word')) return 'Word';
    return 'Document';
  }
};
