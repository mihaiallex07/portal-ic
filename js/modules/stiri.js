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
    const canCreate = Auth.isAdmin();
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
    return `
      <div class="news-card ${n.is_pinned ? 'pinned' : ''}" onclick="Stiri.openDetail(${n.id})">
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
    `;
  },

  openDetail(id) {
    const n = this.news.find(n => n.id === id);
    if (!n) return;
    openModal(n.title, `
      <div class="space-y-3">
        <div class="flex items-center gap-2">
          ${categoryBadge(n.category)}
          ${n.is_pinned ? badge('Anunț important', 'yellow') : ''}
        </div>
        <div class="text-xs text-muted">${n.author_name || 'Redacție IC'} · ${formatDateTime(n.created_at)}</div>
        <div style="font-size:14px;line-height:1.7;color:var(--text);white-space:pre-wrap">${n.content || n.excerpt || ''}</div>
      </div>
    `, `<button class="btn-secondary" onclick="closeModalForce()">Închide</button>`);
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
