// ============================================================
// Știri Module — Portal Inginerie Creativă
// ============================================================

const Stiri = {
  news: [],
  search: '',
  category: 'toate',

  CATEGORIES: [
    { value: 'toate', label: 'Toate' },
    { value: 'companie', label: 'Companie' },
    { value: 'proiecte', label: 'Proiecte' },
    { value: 'hr', label: 'HR' },
    { value: 'it', label: 'IT' },
    { value: 'evenimente', label: 'Evenimente' },
    { value: 'realizari', label: 'Realizări' },
  ],

  async render() {
    const { data } = await DB.getNews(this.category === 'toate' ? null : this.category);
    this.news = data || [];
    this.renderPage();
  },

  renderPage() {
    const canCreate = !!Auth.currentUser;  // orice utilizator autentificat poate crea/edita stiri
    let filtered = this.news;
    if (this.search) filtered = filtered.filter(n =>
      n.title.toLowerCase().includes(this.search.toLowerCase()) ||
      (n.excerpt || '').toLowerCase().includes(this.search.toLowerCase())
    );
    const pinned = filtered.filter(n => n.is_pinned);
    const regular = filtered.filter(n => !n.is_pinned);

    document.getElementById('page-content').innerHTML = `
      <div style="width:100%">
        <div class="page-header">
          <div>
            <h1 class="page-title">Știri &amp; Anunțuri</h1>
            <p class="page-subtitle">Noutăți din cadrul companiei</p>
          </div>
          ${canCreate ? `<button class="btn-brand" onclick="Stiri.openNewModal()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Adaugă știre
          </button>` : ''}
        </div>

        <!-- Filters -->
        <div class="flex gap-2 mb-4" style="flex-wrap:wrap">
          ${searchInput('news-search', 'Caută știri...', 'Stiri.onSearch(this.value)')}
          <div class="flex gap-1">
            ${this.CATEGORIES.map(c => `
              <button class="tab-btn ${this.category === c.value ? 'active' : ''}" onclick="Stiri.onCategory('${c.value}')">${c.label}</button>
            `).join('')}
          </div>
        </div>

        <!-- Pinned -->
        ${pinned.length > 0 ? `
          <div class="mb-4">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:8px">📌 Anunțuri importante</div>
            <div class="space-y-2">
              ${pinned.map(n => this.renderCard(n)).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Regular -->
        <div class="space-y-2">
          ${regular.length === 0 && pinned.length === 0
            ? emptyState('Nu există știri')
            : regular.map(n => this.renderCard(n)).join('')
          }
        </div>
      </div>
    `;
  },

  renderCard(n) {
    const canEdit = !!Auth.currentUser;  // orice utilizator autentificat poate edita/sterge
    return `
      <div class="news-card ${n.is_pinned ? 'pinned' : ''}" style="position:relative">
        <div onclick="Stiri.openDetail(${n.id})" style="cursor:pointer">
          <div class="flex items-center gap-2 mb-2">
            ${categoryBadge(n.category)}
            ${n.is_pinned ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="var(--brand-dark)" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' : ''}
          </div>
          <div class="news-title">${n.title}</div>
          <div class="news-excerpt">${n.excerpt || ''}</div>
          <div class="news-meta">
            <span>${n.author_name || 'Redacție IC'}</span>
            <span>·</span>
            <span>${timeAgo(n.created_at)}</span>
          </div>
        </div>
        ${canEdit ? `
        <div style="position:absolute;top:12px;right:12px;display:flex;gap:6px">
          <button onclick="event.stopPropagation();Stiri.openEditModal(${n.id})" title="Editează"
            style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px;color:var(--text-muted);transition:all 0.15s"
            onmouseover="this.style.borderColor='var(--brand)';this.style.color='var(--brand)'"
            onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text-muted)'">✏️</button>
          <button onclick="event.stopPropagation();Stiri.confirmDelete(${n.id})" title="Șterge"
            style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px;color:var(--text-muted);transition:all 0.15s"
            onmouseover="this.style.borderColor='#ef4444';this.style.color='#ef4444'"
            onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text-muted)'">🗑️</button>
        </div>
        ` : ''}
      </div>
    `;
  },

  openDetail(id) {
    const n = this.news.find(n => n.id === id);
    if (!n) return;
    const canEdit = !!Auth.currentUser;
    openModal(n.title, `
      <div class="space-y-3">
        <div class="flex items-center gap-2">
          ${categoryBadge(n.category)}
          ${n.is_pinned ? badge('Anunț important', 'yellow') : ''}
        </div>
        <div class="text-xs text-muted">${n.author_name || 'Redacție IC'} · ${formatDateTime(n.created_at)}</div>
        <div style="font-size:14px;line-height:1.7;color:var(--text);white-space:pre-wrap">${n.content || n.excerpt || ''}</div>
      </div>
    `, `
      ${canEdit ? `<button class="btn-secondary" onclick="closeModalForce();Stiri.openEditModal(${n.id})">✏️ Editează</button>` : ''}
      <button class="btn-secondary" onclick="closeModalForce()">Închide</button>
    `);
  },

  openNewModal() {
    openModal('Știre nouă', `
      <div class="space-y-3">
        <div>
          <label class="label">Titlu *</label>
          <input type="text" id="news-title" class="input" placeholder="Titlul știrii" />
        </div>
        <div>
          <label class="label">Categorie</label>
          <select id="news-cat" class="select">
            ${this.CATEGORIES.filter(c => c.value !== 'toate').map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="label">Rezumat</label>
          <textarea id="news-excerpt" class="textarea" placeholder="Rezumat scurt..." style="min-height:60px"></textarea>
        </div>
        <div>
          <label class="label">Conținut complet</label>
          <textarea id="news-content" class="textarea" placeholder="Conținut detaliat..."></textarea>
        </div>
        <div class="flex items-center gap-2">
          <input type="checkbox" id="news-pinned" style="width:16px;height:16px;accent-color:var(--brand)" />
          <label for="news-pinned" style="font-size:13px;cursor:pointer">Anunț important (pinned)</label>
        </div>
      </div>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
      <button class="btn-brand" onclick="Stiri.saveNew()">Publică</button>
    `);
  },

  openEditModal(id) {
    const n = this.news.find(n => n.id === id);
    if (!n) return;
    openModal('Editează știrea', `
      <div class="space-y-3">
        <div>
          <label class="label">Titlu *</label>
          <input type="text" id="edit-news-title" class="input" value="${(n.title || '').replace(/"/g, '&quot;')}" />
        </div>
        <div>
          <label class="label">Categorie</label>
          <select id="edit-news-cat" class="select">
            ${this.CATEGORIES.filter(c => c.value !== 'toate').map(c =>
              `<option value="${c.value}" ${n.category === c.value ? 'selected' : ''}>${c.label}</option>`
            ).join('')}
          </select>
        </div>
        <div>
          <label class="label">Rezumat</label>
          <textarea id="edit-news-excerpt" class="textarea" style="min-height:60px">${n.excerpt || ''}</textarea>
        </div>
        <div>
          <label class="label">Conținut complet</label>
          <textarea id="edit-news-content" class="textarea">${n.content || ''}</textarea>
        </div>
        <div class="flex items-center gap-2">
          <input type="checkbox" id="edit-news-pinned" style="width:16px;height:16px;accent-color:var(--brand)" ${n.is_pinned ? 'checked' : ''} />
          <label for="edit-news-pinned" style="font-size:13px;cursor:pointer">Anunț important (pinned)</label>
        </div>
      </div>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
      <button class="btn-brand" onclick="Stiri.saveEdit(${id})">Salvează</button>
    `);
  },

  async saveEdit(id) {
    const title = document.getElementById('edit-news-title')?.value?.trim();
    if (!title) { showToast('Completează titlul', 'error'); return; }
    const updates = {
      title,
      category: document.getElementById('edit-news-cat')?.value,
      excerpt: document.getElementById('edit-news-excerpt')?.value?.trim(),
      content: document.getElementById('edit-news-content')?.value?.trim(),
      is_pinned: document.getElementById('edit-news-pinned')?.checked || false,
      updated_at: new Date().toISOString(),
    };
    const sb = getSupabase();
    if (!sb) { showToast('Nu ești conectat', 'error'); return; }
    const { error } = await sb.from('news').update(updates).eq('id', id);
    if (error) { showToast('Eroare: ' + error.message, 'error'); return; }
    closeModalForce();
    showToast('Știre actualizată!', 'success');
    await this.render();
  },

  confirmDelete(id) {
    const n = this.news.find(n => n.id === id);
    if (!n) return;
    openModal('Șterge știrea', `
      <p style="font-size:14px;color:var(--text)">Ești sigur că vrei să ștergi știrea <strong>"${n.title}"</strong>? Această acțiune nu poate fi anulată.</p>
    `, `
      <button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
      <button style="background:#ef4444;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer" onclick="Stiri.doDelete(${id})">Șterge definitiv</button>
    `);
  },

  async doDelete(id) {
    const sb = getSupabase();
    if (!sb) { showToast('Nu ești conectat', 'error'); return; }
    // Sterge notificarile asociate acestei stiri (type='news' cu reference_id sau link catre stire)
    try {
      await sb.from('notifications').delete().eq('type', 'news').like('link', '%stiri%');
      // Sterge si dupa reference_id daca exista
      await sb.from('notifications').delete().eq('type', 'news').eq('reference_id', id);
      await sb.from('notifications').delete().eq('type', 'news').eq('reference_id', String(id));
    } catch(e) { console.warn('Eroare stergere notificari stire:', e); }
    const { error } = await sb.from('news').delete().eq('id', id);
    if (error) { showToast('Eroare: ' + error.message, 'error'); return; }
    closeModalForce();
    showToast('Știre și notificările asociate au fost șterse.', 'success');
    await this.render();
  },

  async saveNew() {
    const title = document.getElementById('news-title')?.value?.trim();
    if (!title) { showToast('Completează titlul', 'error'); return; }
    const item = {
      title,
      category: document.getElementById('news-cat')?.value,
      excerpt: document.getElementById('news-excerpt')?.value?.trim(),
      content: document.getElementById('news-content')?.value?.trim(),
      is_pinned: document.getElementById('news-pinned')?.checked || false,
      author_name: Auth.currentProfile?.full_name || 'Redacție IC',
      author_id: Auth.currentUser?.id,
    };
    const { data: newsData, error } = await DB.createNews(item);
    if (error) { showToast('Eroare: ' + error.message, 'error'); return; }
    closeModalForce();
    showToast('Știre publicată! Notificări trimise echipei.', 'success');
    // Trimite notificări tuturor utilizatorilor
    try {
      const { data: users } = await DB.getUsers();
      if (users && users.length > 0) {
        const sb = getSupabase();
        const currentUserId = Auth.currentUser?.id;
        const notifRows = users
          .filter(u => u.id !== currentUserId)
          .map(u => ({
            user_id: u.id,
            type: 'news',
            title: '📰 Știre nouă: ' + title,
            message: item.excerpt || 'A fost publicată o știre nouă în portal.',
            link: '#stiri',
            is_read: false,
          }));
        if (notifRows.length > 0) {
          await sb.from('notifications').insert(notifRows);
        }
      }
    } catch(e) { console.warn('Notificări știre:', e); }
    await this.render();
  },

  onSearch(val) { this.search = val; this.renderPage(); },
  onCategory(val) { this.category = val; this.render(); },
};
