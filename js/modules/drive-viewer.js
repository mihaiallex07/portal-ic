// ============================================================
// DriveViewer — Utilitar comun pentru vizualizare Google Drive
// Folosește sesiunea Google a utilizatorului (iframe embed)
// ============================================================
const DriveViewer = {

  // Listează fișierele dintr-un folder Drive folosind Drive Picker API
  // Deoarece nu avem acces API direct, folosim un iframe cu Drive folder
  // și afișăm un link de deschidere + embed pentru fișiere individuale
  async listFolder(folderId) {
    // Folosim Google Drive API v3 cu token-ul OAuth al utilizatorului
    // Token-ul e disponibil prin Supabase OAuth session
    try {
      const token = await this.getGoogleToken();
      if (!token) return null;

      const url = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size,modifiedTime)&orderBy=name&pageSize=100`;
      const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!resp.ok) {
        console.warn('Drive API error:', resp.status, await resp.text());
        return null;
      }
      const data = await resp.json();
      return data.files || [];
    } catch(e) {
      console.error('DriveViewer.listFolder error:', e);
      return null;
    }
  },

  // Obține token-ul Google OAuth din sesiunea Supabase
  async getGoogleToken() {
    try {
      // Supabase stochează provider_token în sesiune
      const supabase = getSupabase();
      if (!supabase) return null;
      const { data: { session } } = await supabase.auth.getSession();
      if (session && session.provider_token) {
        return session.provider_token;
      }
      // Fallback: refresh session
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed?.session?.provider_token) {
        return refreshed.session.provider_token;
      }
      console.warn('No Google provider_token in session');
      return null;
    } catch(e) {
      console.error('getGoogleToken error:', e);
      return null;
    }
  },

  // Afișează un fișier Drive în viewer-ul specificat
  showInViewer(viewerId, fileId, mimeType) {
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
    if (mimeType === 'application/pdf') {
      return `https://drive.google.com/file/d/${fileId}/preview`;
    }
    if (mimeType && mimeType.startsWith('image/')) {
      return `https://drive.google.com/file/d/${fileId}/preview`;
    }
    // Word, Excel, etc. — folosim Google Docs Viewer
    return `https://drive.google.com/file/d/${fileId}/preview`;
  },

  // Returnează icon emoji pentru tipul de fișier
  getIcon(mimeType) {
    if (!mimeType) return '📄';
    if (mimeType === 'application/vnd.google-apps.folder') return '📁';
    if (mimeType === 'application/vnd.google-apps.document') return '📝';
    if (mimeType === 'application/vnd.google-apps.spreadsheet') return '📊';
    if (mimeType === 'application/vnd.google-apps.presentation') return '📊';
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

  // Afișează un folder Drive complet ca iframe (fallback)
  showFolderEmbed(viewerId, folderId) {
    const viewer = document.getElementById(viewerId);
    if (!viewer) return;
    viewer.innerHTML = `
      <iframe src="https://drive.google.com/embeddedfolderview?id=${folderId}#list" 
        style="width:100%;height:100%;border:none">
      </iframe>
    `;
  }
};
