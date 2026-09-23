// ============================================================
// DriveViewer — Utilitar comun pentru vizualizare Google Drive
// Folosește Google Identity Services (GIS) pentru token OAuth
// Client ID: 1079754177727-89qmga68d5r0utsdclspd0tfqldil0og.apps.googleusercontent.com
// Template unic: sidebar fișiere stânga + viewer dreapta + navigare subfoldere
// ============================================================
const DriveViewer = {
  CLIENT_ID: '1079754177727-89qmga68d5r0utsdclspd0tfqldil0og.apps.googleusercontent.com',
  SCOPE: 'https://www.googleapis.com/auth/drive.readonly',
  WRITE_SCOPE: 'https://www.googleapis.com/auth/drive.file',
  _tokenClient: null,
  _accessToken: null,
  _tokenExpiry: 0,
  _pendingResolve: null,
  _writeTokenClient: null,
  _writeAccessToken: null,
  _writeTokenExpiry: 0,
  _pendingWriteResolve: null,

  // Inițializează Google Identity Services
  async init() {
    return new Promise((resolve) => {
      if (typeof google !== 'undefined' && google.accounts) {
        this._setupTokenClient();
        this._setupWriteTokenClient();
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = () => { this._setupTokenClient(); this._setupWriteTokenClient(); resolve(); };
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

  // Permisiune separată, cerută numai administratorului care inițiază
  // exportul manual. drive.file permite gestionarea strict a fișierelor
  // create de portal, fără acces general de editare la Drive.
  _setupWriteTokenClient() {
    if (!google?.accounts?.oauth2 || this._writeTokenClient) return;
    this._writeTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: this.CLIENT_ID,
      scope: this.WRITE_SCOPE,
      include_granted_scopes: true,
      callback: (resp) => {
        if (resp.error) {
          console.warn('GIS Drive write token error:', resp.error);
          if (this._pendingWriteResolve) { this._pendingWriteResolve(null); this._pendingWriteResolve = null; }
          return;
        }
        this._writeAccessToken = resp.access_token;
        this._writeTokenExpiry = Date.now() + Math.max(0, (resp.expires_in - 60) * 1000);
        if (this._pendingWriteResolve) { this._pendingWriteResolve(this._writeAccessToken); this._pendingWriteResolve = null; }
      }
    });
  },

  // Obține un token valid (din cache sau nou)
  async getToken(forcePrompt = false) {
    if (!forcePrompt && this._accessToken && Date.now() < this._tokenExpiry) {
      return this._accessToken;
    }
    await this.init();
    if (!this._tokenClient) return null;
    return new Promise((resolve) => {
      this._pendingResolve = resolve;
      this._tokenClient.requestAccessToken({ prompt: forcePrompt ? 'consent' : '' });
    });
  },

  async getWriteToken(forcePrompt = false) {
    if (!forcePrompt && this._writeAccessToken && Date.now() < this._writeTokenExpiry) {
      return this._writeAccessToken;
    }
    await this.init();
    if (!this._writeTokenClient) return null;
    return new Promise((resolve) => {
      this._pendingWriteResolve = resolve;
      this._writeTokenClient.requestAccessToken({ prompt: forcePrompt ? 'consent' : '' });
    });
  },

  async uploadJsonToFolder(folderId, fileName, jsonContent) {
    if (!/^[a-zA-Z0-9_-]+$/.test(String(folderId || ''))) {
      throw new Error('Folderul Drive configurat nu este valid.');
    }
    const token = await this.getWriteToken(true);
    if (!token) {
      throw new Error('Permisiunea Google pentru încărcarea exportului nu a fost acordată.');
    }

    const boundary = `portal_ic_backup_${Date.now()}`;
    const metadata = {
      name: fileName,
      mimeType: 'application/json',
      parents: [folderId],
    };
    const requestBody = new Blob([
      `--${boundary}\r\n`,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\n`,
      'Content-Type: application/json\r\n\r\n',
      jsonContent,
      `\r\n--${boundary}--`,
    ], { type: `multipart/related; boundary=${boundary}` });

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,createdTime,size',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: requestBody,
      }
    );
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      if (response.status === 403) {
        throw new Error('Contul Google conectat nu poate adăuga fișiere în folderul configurat. Verifică partajarea folderului.');
      }
      throw new Error(`Google Drive a refuzat încărcarea (${response.status})${errorText ? `: ${errorText}` : ''}`);
    }
    return response.json();
  },

  async deletePortalFile(fileId) {
    if (!/^[a-zA-Z0-9_-]+$/.test(String(fileId || ''))) {
      throw new Error('Identificatorul fișierului Drive nu este valid.');
    }
    const token = await this.getWriteToken(false);
    if (!token) {
      throw new Error('Acordă permisiunea Google pentru a șterge acest export din Drive.');
    }
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Google Drive nu a putut șterge fișierul (${response.status}).`);
    }
  },

  // Listează fișierele dintr-un folder Drive (suportă Shared Drives),
  // cu motiv explicit atunci când este necesară conectarea sau lipsește accesul.
  async listFolderResult(folderId) {
    try {
      const token = await this.getToken();
      if (!token) return { status: 'auth_required', files: [] };
      const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size,modifiedTime)&orderBy=name&pageSize=200&includeItemsFromAllDrives=true&supportsAllDrives=true`;
      const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (resp.status === 401) {
        this._accessToken = null;
        localStorage.removeItem('ic_drive_token');
        const newToken = await this.getToken(false);
        if (!newToken) return { status: 'auth_required', files: [] };
        const resp2 = await fetch(url, { headers: { 'Authorization': `Bearer ${newToken}` } });
        if (resp2.status === 403 || resp2.status === 404) return { status: 'forbidden', files: [] };
        if (!resp2.ok) return { status: 'error', files: [], httpStatus: resp2.status };
        return { status: 'ok', files: (await resp2.json()).files || [] };
      }
      if (resp.status === 403 || resp.status === 404) return { status: 'forbidden', files: [] };
      if (!resp.ok) return { status: 'error', files: [], httpStatus: resp.status };
      return { status: 'ok', files: (await resp.json()).files || [] };
    } catch(e) {
      console.error('DriveViewer.listFolder error:', e);
      return { status: 'error', files: [] };
    }
  },

  // Compatibilitate pentru modulele existente care așteaptă direct un array.
  async listFolder(folderId) {
    const result = await this.listFolderResult(folderId);
    return result.status === 'ok' ? result.files : null;
  },

  // ── Template principal: sidebar + viewer ──────────────────
  // instanceId: ID unic pentru a permite mai multe instanțe pe pagină
  // opts: { title, subtitle, folderUrl, height, onConnect }
  async renderDriveExplorer(containerId, rootFolderId, opts = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const instanceId = containerId;
    const height = opts.height || 'calc(100vh - 180px)';

    container.innerHTML = `
      <div id="${instanceId}-shell" style="display:flex;height:${height};min-height:500px;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--card-bg)">
        <!-- Sidebar -->
        <div id="${instanceId}-sidebar" style="width:260px;min-width:200px;flex-shrink:0;border-right:1px solid var(--border);display:flex;flex-direction:column;background:var(--surface,var(--card-bg))">
          <div style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
            <div style="min-width:0">
              <div style="font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${opts.title || 'Documente'}</div>
              ${opts.subtitle ? `<div style="font-size:11px;color:var(--text-muted);margin-top:1px">${opts.subtitle}</div>` : ''}
            </div>
            ${opts.folderUrl ? `
            <a href="${opts.folderUrl}" target="_blank" title="Deschide în Drive"
               style="color:var(--text-muted);text-decoration:none;display:flex;align-items:center;padding:4px;border-radius:4px;flex-shrink:0;transition:color 0.15s"
               onmouseover="this.style.color='var(--primary)'" onmouseout="this.style.color='var(--text-muted)'">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>` : ''}
          </div>
          <!-- Breadcrumb -->
          <div id="${instanceId}-breadcrumb" style="padding:6px 14px;border-bottom:1px solid var(--border);min-height:30px;display:flex;align-items:center;flex-wrap:wrap;gap:2px;flex-shrink:0;background:var(--bg-secondary,var(--surface))"></div>
          <!-- Lista fișiere -->
          <div id="${instanceId}-filelist" style="flex:1;overflow-y:auto;padding:6px 0">
            <div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">
              <div style="width:20px;height:20px;border:2px solid var(--border);border-top-color:var(--brand);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 8px"></div>
              Se încarcă...
            </div>
          </div>
        </div>
        <!-- Viewer -->
        <div id="${instanceId}-viewer" style="flex:1;display:flex;align-items:center;justify-content:center;background:var(--bg-secondary,var(--bg));color:var(--text-muted);font-size:14px;min-width:0">
          <div style="text-align:center">
            <div style="font-size:44px;margin-bottom:12px;opacity:0.4">📄</div>
            <p style="margin:0;font-size:13px">Selectează un document din stânga</p>
          </div>
        </div>
      </div>
    `;

    // State pentru navigare
    const state = {
      stack: [{ id: rootFolderId, name: opts.title || 'Documente' }],
      activeFileId: null
    };

    const renderBreadcrumb = () => {
      const bc = document.getElementById(`${instanceId}-breadcrumb`);
      if (!bc) return;
      if (state.stack.length <= 1) {
        bc.innerHTML = `<span style="font-size:11px;color:var(--text-muted)">Rădăcină</span>`;
        return;
      }
      bc.innerHTML = state.stack.map((item, i) => {
        if (i === state.stack.length - 1) {
          return `<span style="font-size:11px;font-weight:600;color:var(--text)">${item.name}</span>`;
        }
        return `<button onclick="DriveViewer._navTo('${instanceId}',${i},${JSON.stringify(state).replace(/"/g,"'")})"
          style="font-size:11px;color:var(--primary);background:none;border:none;cursor:pointer;padding:0">${item.name}</button>
          <span style="font-size:11px;color:var(--text-muted);margin:0 2px">/</span>`;
      }).join('');
    };

    const loadFolder = async (folderId) => {
      const listEl = document.getElementById(`${instanceId}-filelist`);
      if (!listEl) return;
      listEl.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">
        <div style="width:18px;height:18px;border:2px solid var(--border);border-top-color:var(--brand);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 8px"></div>
        Se încarcă...
      </div>`;

      const result = await this.listFolderResult(folderId);
      if (result.status === 'auth_required') {
        // Fără token — afișăm prompt conectare.
        const shell = document.getElementById(`${instanceId}-shell`);
        if (shell) shell.innerHTML = this._renderConnectPrompt(instanceId, rootFolderId, opts);
        return;
      }

      if (result.status === 'forbidden') {
        const shell = document.getElementById(`${instanceId}-shell`);
        if (shell) shell.innerHTML = this._renderAccessDenied(instanceId, rootFolderId, opts);
        return;
      }

      if (result.status !== 'ok') {
        listEl.innerHTML = `<div style="padding:28px 18px;text-align:center;color:var(--text-muted);font-size:13px"><div style="font-size:30px;margin-bottom:8px">⚠️</div><p style="margin:0 0 12px">Documentele nu au putut fi încărcate.</p><button onclick="DriveViewer.renderDriveExplorer('${instanceId}','${rootFolderId}',${JSON.stringify(opts).replace(/"/g,"'")})" style="border:1px solid var(--border);background:var(--card-bg);color:var(--text);padding:7px 12px;border-radius:7px;cursor:pointer;font-size:12px">↻ Reîncearcă</button></div>`;
        return;
      }

      const files = result.files || [];

      if (files.length === 0) {
        listEl.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">
          <div style="font-size:32px;margin-bottom:8px">📂</div>
          <p style="margin:0">Folder gol</p>
        </div>`;
        return;
      }

      // Sortăm: foldere primul, apoi fișiere
      const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
      const docs = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

      listEl.innerHTML = [...folders, ...docs].map(f => {
        const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
        const cleanName = this._cleanName(f.name);
        return `<div class="dv-item" 
          data-id="${f.id}" data-mime="${f.mimeType}" data-name="${cleanName.replace(/"/g,'&quot;')}"
          onclick="DriveViewer._itemClick('${instanceId}', '${f.id}', '${f.mimeType}', ${JSON.stringify(cleanName).replace(/"/g,"'")}, this, ${JSON.stringify(state).replace(/"/g,"'")})"
          style="display:flex;align-items:center;gap:10px;padding:8px 14px;cursor:pointer;transition:background 0.1s;border-radius:0"
          onmouseover="if(!this.classList.contains('dv-active'))this.style.background='var(--hover-bg,rgba(0,0,0,0.04))'"
          onmouseout="if(!this.classList.contains('dv-active'))this.style.background=''">
          <span style="font-size:17px;flex-shrink:0;line-height:1">${this.getIcon(f.mimeType)}</span>
          <div style="min-width:0;flex:1">
            <div style="font-size:13px;font-weight:${isFolder ? '600' : '400'};color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${cleanName}</div>
            ${!isFolder ? `<div style="font-size:11px;color:var(--text-muted)">${this.getMimeLabel(f.mimeType)}</div>` : ''}
          </div>
          ${isFolder ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>` : ''}
        </div>`;
      }).join('');
    };

    // Salvăm state și funcții pe elementul container pentru acces din onclick
    container._dvState = state;
    container._dvLoadFolder = loadFolder;
    container._dvRenderBreadcrumb = renderBreadcrumb;

    renderBreadcrumb();
    await loadFolder(rootFolderId);
  },

  // Click pe item din sidebar
  _itemClick(instanceId, fileId, mimeType, name, el, stateSnapshot) {
    const container = document.getElementById(instanceId)?.closest('[id]');
    // Găsim containerul corect
    const cont = document.getElementById(instanceId);
    if (!cont) return;

    if (mimeType === 'application/vnd.google-apps.folder') {
      // Navigăm în subfolder
      if (cont._dvState) {
        cont._dvState.stack.push({ id: fileId, name });
        cont._dvRenderBreadcrumb();
        cont._dvLoadFolder(fileId);
      }
    } else {
      // Afișăm fișierul în viewer
      document.querySelectorAll(`#${instanceId}-filelist .dv-item`).forEach(item => {
        item.classList.remove('dv-active');
        item.style.background = '';
      });
      if (el) {
        el.classList.add('dv-active');
        el.style.background = 'var(--brand-light,rgba(255,203,8,0.15))';
      }
      this._showInViewer(`${instanceId}-viewer`, fileId, mimeType, name);
    }
  },

  // Navigare breadcrumb
  _navTo(instanceId, stackIndex, stateSnapshot) {
    const cont = document.getElementById(instanceId);
    if (!cont || !cont._dvState) return;
    cont._dvState.stack = cont._dvState.stack.slice(0, stackIndex + 1);
    cont._dvRenderBreadcrumb();
    cont._dvLoadFolder(cont._dvState.stack[cont._dvState.stack.length - 1].id);
  },

  // Afișează fișier în viewer
  _showInViewer(viewerId, fileId, mimeType, name) {
    const viewer = document.getElementById(viewerId);
    if (!viewer) return;
    const embedUrl = this.getEmbedUrl(fileId, mimeType);
    viewer.innerHTML = `
      <div style="display:flex;flex-direction:column;width:100%;height:100%">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-bottom:1px solid var(--border);background:var(--card-bg);flex-shrink:0">
          <span style="font-size:12px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%">${this.getMimeLabel(mimeType)} · ${name}</span>
          <a href="https://drive.google.com/file/d/${fileId}/view" target="_blank"
             style="font-size:12px;color:var(--primary);text-decoration:none;display:flex;align-items:center;gap:4px;white-space:nowrap;flex-shrink:0;margin-left:8px">
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

  // Prompt conectare Google
  _renderConnectPrompt(instanceId, rootFolderId, opts) {
    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;padding:60px 20px;gap:20px;text-align:center">
        <div style="width:60px;height:60px;background:var(--brand-light,rgba(255,203,8,0.15));border-radius:14px;display:flex;align-items:center;justify-content:center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--brand,#FFCB08)" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </div>
        <div>
          <h3 style="font-size:17px;font-weight:700;margin:0 0 8px;color:var(--text)">Conectează Google Drive</h3>
          <p style="color:var(--text-muted);font-size:13px;max-width:380px;margin:0;line-height:1.6">
            Pentru a vizualiza documentele direct în portal, este necesară o permisiune de citire din Google Drive. Acordul Google se solicită o singură dată pentru acest portal și este reutilizat ulterior.
          </p>
        </div>
        <button onclick="DriveViewer._connectAndRender('${instanceId}','${rootFolderId}',${JSON.stringify(opts).replace(/"/g,"'")})"
          style="background:var(--brand,#FFCB08);color:#000;font-weight:700;font-size:14px;padding:11px 24px;border-radius:8px;border:none;cursor:pointer;display:flex;align-items:center;gap:8px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
          Conectează cu Google
        </button>
        ${opts.folderUrl ? `<a href="${opts.folderUrl}" target="_blank" style="font-size:12px;color:var(--primary);text-decoration:none">Sau deschide direct în Google Drive →</a>` : ''}
      </div>
    `;
  },

  // Accesul efectiv la documentele personale rămâne controlat în Google Drive.
  _renderAccessDenied(instanceId, rootFolderId, opts) {
    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;padding:60px 20px;gap:18px;text-align:center">
        <div style="width:60px;height:60px;background:#fff7ed;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:30px">🔒</div>
        <div>
          <h3 style="font-size:17px;font-weight:700;margin:0 0 8px;color:var(--text)">Nu ai acces la acest folder</h3>
          <p style="color:var(--text-muted);font-size:13px;max-width:420px;margin:0;line-height:1.6">Conectarea Google este activă, însă folderul nu este partajat cu contul Google folosit acum. Un administrator trebuie să partajeze folderul cu adresa ta de serviciu în Google Drive.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
          <button onclick="DriveViewer._connectAndRender('${instanceId}','${rootFolderId}',${JSON.stringify(opts).replace(/"/g,"'")})" style="background:var(--brand,#FFCB08);color:#000;font-weight:700;font-size:13px;padding:9px 14px;border-radius:8px;border:none;cursor:pointer">Schimbă contul Google</button>
          ${opts.folderUrl ? `<a href="${opts.folderUrl}" target="_blank" style="font-size:13px;color:var(--primary);text-decoration:none;padding:9px 4px">Deschide în Google Drive ↗</a>` : ''}
        </div>
      </div>
    `;
  },

  async _connectAndRender(instanceId, rootFolderId, opts) {
    const token = await this.getToken(true);
    if (token) await this.renderDriveExplorer(instanceId, rootFolderId, opts);
  },

  // ── Utilitare ─────────────────────────────────────────────
  getEmbedUrl(fileId, mimeType) {
    if (mimeType === 'application/vnd.google-apps.document')
      return `https://docs.google.com/document/d/${fileId}/preview`;
    if (mimeType === 'application/vnd.google-apps.spreadsheet')
      return `https://docs.google.com/spreadsheets/d/${fileId}/preview`;
    if (mimeType === 'application/vnd.google-apps.presentation')
      return `https://docs.google.com/presentation/d/${fileId}/preview`;
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
  },

  _cleanName(name) {
    return name.replace(/\.(pdf|docx?|xlsx?|pptx?|txt|png|jpg|jpeg|gif|webp)$/i, '').trim();
  },

  // Metodă păstrată pentru compatibilitate cu documente-mele.js
  async listFolder_compat(folderId) {
    return this.listFolder(folderId);
  }
};
