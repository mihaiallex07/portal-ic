// ============================================================
// DocumenteMele — Portal Inginerie Creativă
// Foldere personale Google Drive, configurate centralizat în Supabase.
// Fiecare utilizator vede exclusiv folderul asociat e-mailului său.
// ============================================================
const DocumenteMele = {
  PARENT_FOLDER_ID: '1OcLEzdXa98BbGC7TJphPbfXi_R_EHGuk',
  LEGACY_STORAGE_KEY: 'ic_employee_folders',
  myFolder: null,

  normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  },

  normalizeFolderName(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  },

  getFolderNameCandidates() {
    const profile = Auth.currentProfile || {};
    const emailLocalPart = this.normalizeEmail(profile.email).split('@')[0].replace(/[._-]+/g, ' ');
    return new Set([
      profile.full_name,
      profile.name,
      emailLocalPart,
    ].map(value => this.normalizeFolderName(value)).filter(Boolean));
  },

  getFolderSearchNames() {
    const profile = Auth.currentProfile || {};
    const emailLocalPart = this.normalizeEmail(profile.email).split('@')[0].replace(/[._-]+/g, ' ').trim();
    return [...new Set([profile.full_name, profile.name, emailLocalPart].map(value => String(value || '').trim()).filter(Boolean))];
  },

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  },

  isAdmin() {
    return Auth.currentProfile?.role === 'admin';
  },

  getLegacyFolders() {
    try {
      const parsed = JSON.parse(localStorage.getItem(this.LEGACY_STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  },

  saveLegacyFolders(folders) {
    try { localStorage.setItem(this.LEGACY_STORAGE_KEY, JSON.stringify(folders || {})); } catch (_) {}
  },

  async migrateLegacyFoldersOnce() {
    if (!this.isAdmin()) return;
    const legacy = this.getLegacyFolders();
    const candidates = Object.entries(legacy).map(([email, folder]) => ({
      email: this.normalizeEmail(email),
      folder_id: String(folder?.id || '').trim(),
      folder_name: String(folder?.name || email).trim(),
    })).filter(folder => folder.email && folder.folder_id && folder.folder_name);
    if (!candidates.length) return;

    const sb = getSupabase();
    if (!sb) return;
    const { data: existing, error: existingError } = await sb
      .from('employee_document_folders')
      .select('email')
      .in('email', candidates.map(folder => folder.email));
    if (existingError) {
      console.warn('[DocumenteMele] Nu s-a putut verifica migrarea folderelor locale:', existingError);
      return;
    }
    const existingEmails = new Set((existing || []).map(folder => this.normalizeEmail(folder.email)));
    const missing = candidates.filter(folder => !existingEmails.has(folder.email));
    if (!missing.length) return;

    const { error } = await sb.from('employee_document_folders').upsert(
      missing.map(folder => ({ ...folder, updated_at: new Date().toISOString() })),
      { onConflict: 'email' }
    );
    if (error) console.warn('[DocumenteMele] Migrarea folderelor locale a eșuat:', error);
  },

  async getMyFolder() {
    const sb = getSupabase();
    const email = this.normalizeEmail(Auth.currentProfile?.email);
    if (!sb || !email) return { data: null, error: new Error('Profilul nu are o adresă de e-mail validă.') };
    return sb.from('employee_document_folders')
      .select('email,folder_id,folder_name,updated_at')
      .eq('email', email)
      .maybeSingle();
  },

  render() {
    const container = document.getElementById('page-content');
    if (!container) return;
    this.myFolder = null;
    container.innerHTML = `
      <div style="margin-bottom:20px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div>
            <h2 style="font-size:22px;font-weight:700;margin:0 0 4px">Documentele mele</h2>
            <p style="color:var(--text-muted);font-size:13px;margin:0">Contract, fișa postului, evaluări și alte documente personale</p>
          </div>
          ${this.isAdmin() ? `<button class="btn-secondary" onclick="DocumenteMele.showAdminPanel()" style="font-size:13px">⚙ Configurare foldere</button>` : ''}
        </div>
      </div>
      <div id="docmele-content"><div style="padding:40px;text-align:center;color:var(--text-muted)"><div style="font-size:32px;margin-bottom:12px">⏳</div><p>Se încarcă documentele personale...</p></div></div>
    `;
    this.findMyFolder();
  },

  async findMyFolder() {
    const contentEl = document.getElementById('docmele-content');
    if (!contentEl) return;
    if (!Auth.currentProfile?.email) {
      this.renderFolderError(contentEl, 'Profilul nu are o adresă de e-mail validă. Contactează administratorul.');
      return;
    }

    await this.migrateLegacyFoldersOnce();
    const { data: folder, error } = await this.getMyFolder();
    if (error) {
      console.error('[DocumenteMele] Încărcare folder personal:', error);
      this.renderFolderError(contentEl, 'Nu s-a putut încărca folderul personal. Încearcă din nou.');
      return;
    }
    if (folder?.folder_id) {
      this.myFolder = folder;
      this.renderMyDocuments(contentEl, folder);
      return;
    }
    this.renderNoFolder(contentEl);
  },

  renderFolderError(container, message) {
    container.innerHTML = `<div style="padding:56px 20px;text-align:center;color:var(--text-muted)"><div style="font-size:42px;margin-bottom:12px">⚠️</div><h3 style="font-size:16px;color:var(--text);margin:0 0 8px">Documentele nu sunt disponibile momentan</h3><p style="font-size:13px;margin:0 0 16px">${this.escapeHtml(message)}</p><button class="btn-secondary" onclick="DocumenteMele.findMyFolder()">↻ Reîncearcă</button></div>`;
  },

  renderNoFolder(container, hint = '') {
    const email = this.normalizeEmail(Auth.currentProfile?.email);
    container.innerHTML = `
      <div style="padding:60px 20px;text-align:center;color:var(--text-muted)">
        <div style="font-size:48px;margin-bottom:16px">📂</div>
        <h3 style="font-size:16px;font-weight:600;color:var(--text);margin:0 0 8px">Niciun folder configurat</h3>
        <p style="font-size:13px;margin:0 0 16px">Folderul tău personal nu este configurat încă.</p>
        <div style="padding:12px 16px;background:var(--bg-secondary);border-radius:8px;font-size:12px;color:var(--text-muted);display:inline-block">Email: <strong>${this.escapeHtml(email)}</strong></div>
        ${hint ? `<p style="font-size:12px;color:#9a3412;margin:14px 0 0">${this.escapeHtml(hint)}</p>` : ''}
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:18px"><button class="btn-primary" onclick="DocumenteMele.discoverMyFolder()">🔎 Caută automat în Google Drive</button>${this.isAdmin() ? `<button class="btn-secondary" onclick="DocumenteMele.showAdminPanel()">⚙ Configurează folderele</button>` : ''}</div>
        ${this.isAdmin() ? '' : '<p style="font-size:12px;margin:16px 0 0">Dacă folderul nu este găsit automat, un administrator îl poate asocia folosind linkul din Google Drive.</p>'}
      </div>`;
  },

  async discoverMyFolder() {
    const contentEl = document.getElementById('docmele-content');
    if (!contentEl || typeof DriveViewer === 'undefined' || !DriveViewer.listFolderResult) return;
    contentEl.innerHTML = '<div style="padding:44px;text-align:center;color:var(--text-muted)"><div style="font-size:32px;margin-bottom:12px">🔎</div><p>Se caută folderul personal în Google Drive...</p></div>';

    let result = await DriveViewer.listFolderResult(this.PARENT_FOLDER_ID);
    if (result.status === 'auth_required') {
      const token = await DriveViewer.getToken(true);
      if (!token) {
        this.renderNoFolder(contentEl, 'Conectarea la Google Drive a fost anulată sau nu a putut fi finalizată.');
        return;
      }
      result = await DriveViewer.listFolderResult(this.PARENT_FOLDER_ID);
    }
    if (!['ok', 'forbidden'].includes(result.status)) {
      this.renderNoFolder(contentEl, 'Google Drive nu a răspuns. Încearcă din nou.');
      return;
    }

    const candidates = this.getFolderNameCandidates();
    let matchingFolder = (result.files || []).find(file =>
      file.mimeType === 'application/vnd.google-apps.folder' && candidates.has(this.normalizeFolderName(file.name))
    );
    // Un folder poate fi partajat direct cu angajatul fără ca folderul rădăcină
    // să fie vizibil pentru toată echipa; îl căutăm și în Drive-ul accesibil contului.
    if (!matchingFolder && DriveViewer.searchFoldersByNames) {
      const searchResult = await DriveViewer.searchFoldersByNames(this.getFolderSearchNames());
      if (searchResult.status === 'auth_required') {
        this.renderNoFolder(contentEl, 'Conectarea la Google Drive a expirat. Încearcă din nou.');
        return;
      }
      if (searchResult.status === 'ok') {
        matchingFolder = (searchResult.files || []).find(file => candidates.has(this.normalizeFolderName(file.name))) || null;
      }
    }
    if (!matchingFolder) {
      const hint = result.status === 'forbidden'
        ? 'Folderul principal nu este partajat cu acest cont și nu a fost găsit un folder personal partajat direct.'
        : 'Nu a fost găsit un folder cu numele profilului tău.';
      this.renderNoFolder(contentEl, hint);
      return;
    }

    const folder = {
      email: this.normalizeEmail(Auth.currentProfile?.email),
      folder_id: matchingFolder.id,
      folder_name: matchingFolder.name,
    };
    this.myFolder = folder;
    const { error } = await getSupabase().from('employee_document_folders').upsert({
      ...folder,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'email' });
    if (error) console.warn('[DocumenteMele] Salvare automată folder personal:', error);
    else showToast('Folderul personal a fost găsit și configurat automat.', 'success');
    this.renderMyDocuments(contentEl, folder);
  },

  renderMyDocuments(container, folder) {
    const folderUrl = `https://drive.google.com/drive/folders/${encodeURIComponent(folder.folder_id)}`;
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px;padding:10px 12px;border:1px solid var(--border);border-radius:9px;background:var(--card-bg)">
        <div style="min-width:0"><div style="font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${this.escapeHtml(folder.folder_name)}</div><div style="font-size:11px;color:var(--text-muted);margin-top:2px">Folder personal · accesibil numai titularului și administratorilor configuratori</div></div>
        <div style="display:flex;gap:8px;align-items:center"><button class="btn-secondary" onclick="DocumenteMele.findMyFolder()" style="font-size:12px">↻ Reîncarcă</button>${this.isAdmin() ? `<button class="btn-secondary" onclick="DocumenteMele.showAdminPanel()" style="font-size:12px">⚙ Configurare foldere</button>` : ''}</div>
      </div>
      <div id="docmele-drive-explorer"></div>
    `;
    if (typeof DriveViewer === 'undefined' || !DriveViewer.renderDriveExplorer) {
      this.renderFolderError(document.getElementById('docmele-drive-explorer'), 'Vizualizatorul Google Drive nu s-a încărcat. Reîncarcă pagina.');
      return;
    }
    DriveViewer.renderDriveExplorer('docmele-drive-explorer', folder.folder_id, {
      title: folder.folder_name,
      subtitle: 'Documentele mele',
      folderUrl,
      height: 'calc(100vh - 265px)',
    });
  },

  async showAdminPanel() {
    if (!this.isAdmin()) return;
    const contentEl = document.getElementById('docmele-content');
    if (!contentEl) return;
    contentEl.innerHTML = '<div style="padding:34px;text-align:center;color:var(--text-muted)">Se încarcă configurarea folderelor...</div>';
    await this.renderAdminView(contentEl);
  },

  async renderAdminView(container) {
    if (!this.isAdmin()) return;
    const sb = getSupabase();
    const [foldersResult, usersResult] = await Promise.all([
      sb.from('employee_document_folders').select('email,folder_id,folder_name,updated_at').order('folder_name'),
      DB.getUsers(),
    ]);
    if (foldersResult.error) {
      this.renderFolderError(container, 'Nu s-a putut încărca configurarea folderelor.');
      return;
    }

    const folders = foldersResult.data || [];
    const users = (usersResult?.data || []).filter(user =>
      user?.email && user?.is_active !== false && !user?.is_pre_created
    );
    const userByEmail = new Map(users.map(user => [this.normalizeEmail(user.email), user]));
    const userOptions = users.map(user => {
      const email = this.normalizeEmail(user.email);
      const name = user.full_name || user.name || email;
      const configured = folders.some(folder => this.normalizeEmail(folder.email) === email) ? ' · configurat' : '';
      return `<option value="${this.escapeHtml(email)}" data-name="${this.escapeHtml(name)}">${this.escapeHtml(name)} (${this.escapeHtml(email)})${configured}</option>`;
    }).join('');

    container.innerHTML = `
      <div style="max-width:800px">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:14px"><div><h3 style="font-size:17px;margin:0;color:var(--text)">Configurare foldere angajați</h3><p style="font-size:12px;color:var(--text-muted);margin:4px 0 0">Configurarea este centralizată și disponibilă pentru fiecare utilizator, indiferent de browser.</p></div><button class="btn-secondary" onclick="DocumenteMele.findMyFolder()" style="font-size:12px">← Documentele mele</button></div>
        <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:16px">
          <div style="display:grid;grid-template-columns:minmax(0,1fr);gap:12px">
            <div><label class="form-label">Angajat activ</label><select id="admin-emp-select" class="form-input" onchange="DocumenteMele.onUserSelect(this)"><option value="">— Selectează angajat —</option>${userOptions}</select><input id="admin-emp-email" type="hidden"><input id="admin-emp-name" type="hidden"></div>
            <div><label class="form-label">Link sau ID folder Google Drive</label><input id="admin-emp-folder" class="form-input" placeholder="https://drive.google.com/drive/folders/..." autocomplete="off"><div style="font-size:11px;color:var(--text-muted);margin-top:5px">Folderul trebuie să fie partajat cu angajatul din Google Drive.</div></div>
            <div><button class="btn-primary" onclick="DocumenteMele.addEmployeeFolder()">Salvează folderul</button></div>
          </div>
        </div>
        <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:10px">ANGAJATI CONFIGURAȚI (${folders.length})</div>
          ${folders.length ? folders.map(folder => {
            const profile = userByEmail.get(this.normalizeEmail(folder.email));
            const displayName = profile?.full_name || profile?.name || folder.folder_name || folder.email;
            return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;background:var(--bg-secondary);border-radius:7px;margin-bottom:7px"><div style="min-width:0"><div style="font-size:13px;font-weight:650;color:var(--text)">${this.escapeHtml(displayName)}</div><div style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${this.escapeHtml(folder.email)} · ${this.escapeHtml(folder.folder_name)}</div></div><div style="display:flex;gap:6px;flex-shrink:0"><a href="https://drive.google.com/drive/folders/${encodeURIComponent(folder.folder_id)}" target="_blank" class="btn-secondary" style="font-size:11px;text-decoration:none">Drive ↗</a><button onclick="DocumenteMele.removeEmployeeFolder('${this.escapeHtml(this.normalizeEmail(folder.email))}')" style="border:1px solid #fecaca;background:#fff;color:#dc2626;border-radius:6px;padding:5px 8px;cursor:pointer;font-size:11px">Șterge</button></div></div>`;
          }).join('') : '<div style="padding:18px;text-align:center;color:var(--text-muted);font-size:13px">Încă nu este configurat niciun folder.</div>'}
        </div>
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px;font-size:12px;color:#854d0e"><strong>Regulă de acces:</strong> portalul doar afișează folderul asociat profilului. Dreptul efectiv de a vedea fișierele rămâne controlat în Google Drive, prin partajarea folderului cu adresa angajatului.</div>
      </div>
    `;
  },

  onUserSelect(select) {
    const option = select.options[select.selectedIndex];
    const email = this.normalizeEmail(option?.value);
    document.getElementById('admin-emp-email').value = email;
    document.getElementById('admin-emp-name').value = option?.getAttribute('data-name') || email;
  },

  extractFolderId(value) {
    const source = String(value || '').trim();
    const matched = source.match(/(?:folders\/|id=)([a-zA-Z0-9_-]+)/);
    if (matched?.[1]) return matched[1];
    return /^[a-zA-Z0-9_-]{10,}$/.test(source) ? source : null;
  },

  async addEmployeeFolder() {
    if (!this.isAdmin()) return;
    const email = this.normalizeEmail(document.getElementById('admin-emp-email')?.value || document.getElementById('admin-emp-select')?.value);
    const name = String(document.getElementById('admin-emp-name')?.value || email).trim();
    const folderId = this.extractFolderId(document.getElementById('admin-emp-folder')?.value);
    if (!email || !folderId) {
      showToast('Selectează un angajat și introdu un link sau ID valid de folder Google Drive.', 'error');
      return;
    }
    const sb = getSupabase();
    const { error } = await sb.from('employee_document_folders').upsert({
      email,
      folder_id: folderId,
      folder_name: name || email,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'email' });
    if (error) {
      console.error('[DocumenteMele] Salvare folder:', error);
      showToast(`Folderul nu a putut fi salvat: ${error.message}`, 'error');
      return;
    }
    showToast(`Folder configurat pentru ${name || email}`, 'success');
    await this.renderAdminView(document.getElementById('docmele-content'));
  },

  async removeEmployeeFolder(email) {
    if (!this.isAdmin()) return;
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail || !confirm(`Elimini asocierea folderului pentru ${normalizedEmail}? Fișierele din Google Drive nu vor fi șterse.`)) return;
    const { error } = await getSupabase().from('employee_document_folders').delete().eq('email', normalizedEmail);
    if (error) {
      showToast(`Asocierea nu a putut fi eliminată: ${error.message}`, 'error');
      return;
    }
    showToast('Asocierea folderului a fost eliminată. Fișierele Drive au rămas neschimbate.', 'success');
    await this.renderAdminView(document.getElementById('docmele-content'));
  },
};
