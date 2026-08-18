// ============================================================
// Admin Module — Portal Inginerie Creativă
// ============================================================
const Admin = {
  users: [],
  tab: 'utilizatori',

  async render() {
    if (!Auth.isAdmin()) {
      document.getElementById('page-content').innerHTML = `
        <div class="flex items-center justify-center" style="height:300px">
          <div style="text-align:center">
            <div style="font-size:48px;margin-bottom:12px">🔒</div>
            <div style="font-size:16px;font-weight:700">Acces restricționat</div>
            <div class="text-sm text-muted">Această secțiune este disponibilă doar pentru administratori.</div>
          </div>
        </div>
      `;
      return;
    }
    const { data } = await DB.getUsers();
    this.users = data || [];
    this.renderPage();
  },

  renderPage() {
    document.getElementById('page-content').innerHTML = `
      <div>
        <div class="page-header">
          <h1 class="page-title">Administrare</h1>
        </div>
        <!-- Tabs -->
        <div class="flex gap-1 mb-4">
          <button class="tab-btn ${this.tab === 'utilizatori' ? 'active' : ''}" onclick="Admin.setTab('utilizatori')">Utilizatori</button>
          <button class="tab-btn ${this.tab === 'setari' ? 'active' : ''}" onclick="Admin.setTab('setari')">Setări aplicație</button>
          <button class="tab-btn ${this.tab === 'supabase' ? 'active' : ''}" onclick="Admin.setTab('supabase')">Supabase</button>
        </div>
        <div id="admin-tab-content">${this.renderTab()}</div>
      </div>
    `;
  },

  renderTab() {
    if (this.tab === 'utilizatori') return this.renderUsers();
    if (this.tab === 'setari') return this.renderSettings();
    if (this.tab === 'supabase') return this.renderSupabase();
    return '';
  },

  renderUsers() {
    return `
      <div class="card" style="overflow:hidden">
        <div class="card-header">
          <span class="card-title">Utilizatori (${this.users.length})</span>
          <button class="btn-brand" style="font-size:12px;padding:5px 12px" onclick="Admin.openAddUserModal()">
            + Adaugă angajat
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Utilizator</th>
              <th>Email</th>
              <th>Departament</th>
              <th>Funcție</th>
              <th>Rol</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${this.users.map(u => `
              <tr>
                <td>
                  <div class="flex items-center gap-2">
                    ${avatarHtml(u.full_name || u.name, u.avatar_url, 'sm')}
                    <span style="font-weight:600">${u.full_name || u.name || u.email || 'Utilizator'}</span>
                  </div>
                </td>
                <td class="text-sm text-muted">${u.email}</td>
                <td class="text-sm">${u.department || '—'}</td>
                <td class="text-sm">${u.position || '—'}</td>
                <td>${roleBadge(u.role)}</td>
                <td>
                  <div class="flex gap-1">
                    ${u.is_pre_created ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#fffbea;color:#7a5c00;border:1px solid #ffe066;font-weight:600">Pre-creat</span>` : ''}
                    <button class="btn-icon" onclick="Admin.editUser('${u.id}')" title="Editează profil complet" style="display:flex;align-items:center;gap:4px;padding:4px 8px;font-size:11px;border-radius:5px">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      Profil
                    </button>
                    <button class="btn-icon" onclick="Admin.confirmDeleteUser('${u.id}', '${(u.full_name||u.email||'').replace(/'/g,"&#39;")}')"
                      title="Șterge utilizator"
                      style="display:flex;align-items:center;gap:4px;padding:4px 8px;font-size:11px;border-radius:5px;color:#dc2626;border-color:#fca5a5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      Șterge
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  renderSettings() {
    return `
      <div class="card p-6 space-y-4">
        <div style="font-size:15px;font-weight:700;margin-bottom:4px">Setări aplicație</div>
        <div class="form-row form-row-2">
          <div>
            <label class="label">Numele companiei</label>
            <input type="text" class="input" value="Inginerie Creativă SRL" />
          </div>
          <div>
            <label class="label">Email contact</label>
            <input type="email" class="input" value="contact@inginerie-creativa.ro" />
          </div>
        </div>
        <div>
          <label class="label">Mod aplicație</label>
          <div class="flex items-center gap-3 mt-1">
            <span class="text-sm">${APP_CONFIG.demoMode ? badge('Demo mode activ', 'yellow') : badge('Supabase conectat', 'green')}</span>
            <span class="text-sm text-muted">Editează <code>js/config.js</code> pentru a configura Supabase</span>
          </div>
        </div>
        <div class="flex justify-end">
          <button class="btn-brand" onclick="showToast('Setări salvate (demo)','success')">Salvează</button>
        </div>
      </div>
    `;
  },

  renderSupabase() {
    return `
      <div class="card p-6 space-y-4">
        <div style="font-size:15px;font-weight:700">Configurare Supabase</div>
        <div class="p-3 rounded" style="background:var(--surface-2)">
          <div class="text-sm mb-2"><strong>Status:</strong> ${APP_CONFIG.demoMode ? '⚠️ Demo mode — Supabase nu este configurat' : '✅ Supabase conectat'}</div>
          <div class="text-sm text-muted">Editează fișierul <code>js/config.js</code> și setează valorile reale din proiectul tău Supabase.</div>
        </div>
        <div>
          <label class="label">SUPABASE_URL</label>
          <input type="text" class="input" value="${APP_CONFIG.supabase?.url || ''}" placeholder="https://xxxx.supabase.co" readonly />
        </div>
        <div>
          <label class="label">SUPABASE_ANON_KEY</label>
          <input type="text" class="input" value="${APP_CONFIG.supabase?.anonKey ? '••••••••••••••••' : ''}" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." readonly />
        </div>
        <div class="p-3 rounded" style="background:var(--surface-2)">
          <div class="text-sm font-bold mb-2">Pași configurare:</div>
          <ol style="font-size:13px;color:var(--text-muted);padding-left:16px;line-height:2">
            <li>Creează un proiect nou pe <a href="https://supabase.com" target="_blank" style="color:var(--brand-dark)">supabase.com</a></li>
            <li>Rulează <code>supabase/schema.sql</code> în SQL Editor</li>
            <li>Activează Google Auth în Authentication → Providers</li>
            <li>Copiază URL și anon key în <code>js/config.js</code></li>
            <li>Setează <code>demoMode: false</code> în config.js</li>
          </ol>
        </div>
      </div>
    `;
  },

  editUser(id) {
    // Deschide profilul complet al angajatului (admin poate edita tot) - preview implicit
    Profil.render(id, false);
    window.location.hash = '/admin-utilizatori';
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === 'admin-utilizatori');
    });
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = 'Profil angajat';
  },

  confirmDeleteUser(id, name) {
    // Nu permite ștergerea propriului cont
    if (id === Auth.currentProfile?.id) {
      showToast('Nu poți șterge propriul cont', 'error');
      return;
    }
    openModal('Șterge utilizator', `
      <div class="space-y-3">
        <div style="padding:12px;border-radius:8px;background:#fef2f2;border:1px solid #fca5a5;font-size:13px;color:#991b1b">
          <strong>Atenție!</strong> Această acțiune este ireversibilă.
        </div>
        <p style="font-size:14px">Eşti sigur că vrei să ștergi utilizatorul <strong>${name}</strong>?</p>
        <p style="font-size:13px;color:var(--text-muted)">Profilul va fi șters din portal. Dacă utilizatorul are un cont Google activ, va fi blocat la următoarea autentificare.</p>
      </div>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
      <button class="btn-brand" style="background:#dc2626;border-color:#dc2626" onclick="Admin.deleteUser('${id}', '${name}')">Da, șterge</button>
    `);
  },

  async deleteUser(id, name) {
    const sb = getSupabase();
    if (!sb) { showToast('Eroare: Supabase nu este conectat', 'error'); return; }

    // Un profil pre-creat este ancora pentru proiectele și task-urile pregătite
    // înainte de prima autentificare; nu îl ștergem, îl lăsăm să fie revendicat prin Google.
    const { data: profileToDelete } = await sb.from('profiles')
      .select('is_pre_created')
      .eq('id', id)
      .maybeSingle();
    if (profileToDelete?.is_pre_created) {
      closeModalForce();
      showToast('Profilul pre-creat nu se șterge. Angajatul îl va activa automat la prima autentificare Google.', 'info');
      return;
    }

    // 1. Șterge din project_members
    await sb.from('project_members').delete().eq('user_id', id);

    // 2. Șterge din profiles
    const { error } = await sb.from('profiles').delete().eq('id', id);
    if (error) {
      showToast('Eroare la ștergere: ' + error.message, 'error');
      return;
    }

    // 3. Actualizează lista locală
    this.users = this.users.filter(u => u.id !== id);
    closeModalForce();
    showToast('✅ Utilizatorul ' + name + ' a fost șters', 'success');
    document.getElementById('admin-tab-content').innerHTML = this.renderTab();
  },

  async saveUser(id) {
    const updates = {
      role: document.getElementById('edit-role')?.value,
      department: document.getElementById('edit-dept')?.value?.trim(),
      position: document.getElementById('edit-pos')?.value?.trim(),
    };
    const { error } = await DB.updateProfile(id, updates);
    if (error) { showToast('Eroare: ' + error.message, 'error'); return; }
    const u = this.users.find(u => u.id === id);
    if (u) Object.assign(u, updates);
    closeModalForce();
    showToast('Utilizator actualizat', 'success');
    document.getElementById('admin-tab-content').innerHTML = this.renderTab();
  },

  setTab(tab) {
    this.tab = tab;
    this.renderPage();
  },

  openAddUserModal() {
    openModal('Adaugă angajat nou', `
      <div class="space-y-3">
        <div style="padding:10px 12px;border-radius:8px;background:#fffbea;border:1px solid #ffe066;font-size:13px;color:#7a5c00">
          ℹ️ Angajatul va fi adăugat fără notificare. Când va intra pe portal cu contul Google <strong>@ingineriecreativa.ro</strong>, contul său va fi legat automat de profilul creat.
        </div>
        <div class="form-row form-row-2">
          <div>
            <label class="label">Prenume *</label>
            <input type="text" id="new-user-fname" class="input" placeholder="ex: Maria" />
          </div>
          <div>
            <label class="label">Nume *</label>
            <input type="text" id="new-user-lname" class="input" placeholder="ex: IONESCU" />
          </div>
        </div>
        <div>
          <label class="label">Email *</label>
          <div class="flex items-center gap-2">
            <input type="text" id="new-user-email-prefix" class="input" placeholder="maria.ionescu" style="flex:1" />
            <span class="text-sm text-muted" style="white-space:nowrap">@ingineriecreativa.ro</span>
          </div>
        </div>
        <div class="form-row form-row-2">
          <div>
            <label class="label">Departament</label>
            <input type="text" id="new-user-dept" class="input" placeholder="ex: Structuri" />
          </div>
          <div>
            <label class="label">Funcție</label>
            <input type="text" id="new-user-pos" class="input" placeholder="ex: Inginer proiectant" />
          </div>
        </div>
        <div>
          <label class="label">Rol</label>
          <select id="new-user-role" class="select">
            <option value="angajat" selected>Angajat</option>
            <option value="coordonator">Coordonator</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div>
          <label class="label">Cod angajat (opțional)</label>
          <input type="text" id="new-user-code" class="input" placeholder="ex: MI (apare în cercul galben)" maxlength="4" style="text-transform:uppercase" />
        </div>
      </div>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
      <button class="btn-brand" onclick="Admin.saveNewUser()">Creează profil</button>
    `);
  },

  async saveNewUser() {
    const fname = document.getElementById('new-user-fname')?.value?.trim();
    const lname = document.getElementById('new-user-lname')?.value?.trim();
    const emailPrefix = document.getElementById('new-user-email-prefix')?.value?.trim().toLowerCase();
    const dept = document.getElementById('new-user-dept')?.value?.trim();
    const pos = document.getElementById('new-user-pos')?.value?.trim();
    const role = document.getElementById('new-user-role')?.value || 'angajat';
    const code = document.getElementById('new-user-code')?.value?.trim().toUpperCase();

    if (!fname || !lname || !emailPrefix) {
      showToast('Prenume, Nume și Email sunt obligatorii', 'error');
      return;
    }

    const email = emailPrefix + '@ingineriecreativa.ro';
    const fullName = fname + ' ' + lname.toUpperCase();

    // Verifică dacă emailul există deja
    const existing = this.users.find(u => u.email === email);
    if (existing) {
      showToast('Un utilizator cu acest email există deja', 'error');
      return;
    }

    // Pre-creăm profilul cu un UUID temporar
    // Trigger-ul va actualiza id-ul când angajatul se loghează cu Google
    const tempId = crypto.randomUUID();
    const profile = {
      id: tempId,
      email,
      full_name: fullName,
      name: fullName,
      role,
      department: dept || null,
      position: pos || null,
      employee_code: code || (fname[0] + lname[0]).toUpperCase(),
      is_pre_created: true,
    };

    const result = await dbQuery('profiles', q => q.insert(profile).select().single(), null);
    if (result && result.error) {
      showToast('Eroare la creare: ' + result.error.message, 'error');
      return;
    }

    this.users.push(profile);
    closeModalForce();
    showToast('✅ Profil creat pentru ' + fullName + '. Angajatul poate intra acum pe portal cu Google.', 'success');
    document.getElementById('admin-tab-content').innerHTML = this.renderTab();
  },
};
