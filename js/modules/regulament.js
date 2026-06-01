// ============================================================
// Regulament Intern Module — Portal Inginerie Creativă
// Viewer Markdown cu editor inline pentru administratori
// Stocare: tabel Supabase `regulament_intern`
// ============================================================

const Regulament = {
  _doc: null,
  _editing: false,

  // ── Conversie Markdown simplu → HTML ──────────────────────
  _md(text) {
    if (!text) return '';
    // Procesăm linie cu linie pentru liste, altfel bloc cu bloc
    const lines = text.split('\n');
    const blocks = [];
    let listBuffer = [];
    let listType = null;

    const flushList = () => {
      if (listBuffer.length === 0) return;
      const tag = listType === 'ol' ? 'ol' : 'ul';
      blocks.push(`<${tag}>${listBuffer.join('')}</${tag}>`);
      listBuffer = [];
      listType = null;
    };

    const inlineFormat = (s) => s
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Heading
      const hMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (hMatch) {
        flushList();
        const level = hMatch[1].length;
        blocks.push(`<h${level}>${inlineFormat(hMatch[2])}</h${level}>`);
        i++; continue;
      }

      // HR
      if (/^---+$/.test(trimmed)) {
        flushList();
        blocks.push('<hr>');
        i++; continue;
      }

      // Unordered list item
      const ulMatch = trimmed.match(/^[\*\-]\s+(.+)$/);
      if (ulMatch) {
        if (listType === 'ol') flushList();
        listType = 'ul';
        listBuffer.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
        i++; continue;
      }

      // Ordered list item
      const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      if (olMatch) {
        if (listType === 'ul') flushList();
        listType = 'ol';
        listBuffer.push(`<li>${inlineFormat(olMatch[1])}</li>`);
        i++; continue;
      }

      // Empty line
      if (!trimmed) {
        flushList();
        i++; continue;
      }

      // Paragraph — colectăm linii consecutive
      flushList();
      const paraLines = [];
      while (i < lines.length && lines[i].trim() && !lines[i].trim().match(/^(#{1,6}\s|[\*\-]\s|\d+\.\s|---+$)/)) {
        paraLines.push(inlineFormat(lines[i].trim()));
        i++;
      }
      if (paraLines.length) blocks.push(`<p>${paraLines.join('<br>')}</p>`);
    }
    flushList();
    return blocks.join('\n');
  },

  // ── Render principal ───────────────────────────────────────
  async render() {
    const container = document.getElementById('page-content');
    if (!container) return;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Regulament Intern</h1>
          <p class="page-subtitle">Regulamentul intern al companiei Inginerie Creativă</p>
        </div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:40px;min-height:200px;display:flex;align-items:center;justify-content:center">
        <span style="color:var(--text-muted);font-size:14px">Se încarcă regulamentul...</span>
      </div>
    `;

    try {
      const sb = getSupabase();
      const { data, error } = await sb
        .from('regulament_intern')
        .select('*')
        .order('id', { ascending: true })
        .limit(1)
        .single();

      if (error) throw error;
      this._doc = data;
      this._editing = false;
      this._renderView();
    } catch (err) {
      console.error('Regulament load error:', err);
      document.getElementById('page-content').innerHTML = `
        <div class="page-header">
          <div>
            <h1 class="page-title">Regulament Intern</h1>
            <p class="page-subtitle">Regulamentul intern al companiei Inginerie Creativă</p>
          </div>
        </div>
        ${emptyState('Nu s-a putut încărca regulamentul. Încearcă din nou.')}
        <div style="text-align:center;margin-top:16px">
          <button class="btn-secondary" onclick="Regulament.render()">Reîncearcă</button>
        </div>
      `;
    }
  },

  // ── Render vizualizare ─────────────────────────────────────
  _renderView() {
    const container = document.getElementById('page-content');
    if (!container || !this._doc) return;

    const isAdmin = Auth.isAdmin();
    const updatedAt = this._doc.updated_at
      ? new Date(this._doc.updated_at).toLocaleDateString('ro-RO', {
          day: '2-digit', month: 'long', year: 'numeric',
          hour: '2-digit', minute: '2-digit'
        })
      : '';
    const updatedBy = this._doc.updated_by_name || '';

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Regulament Intern</h1>
          <p class="page-subtitle">Regulamentul intern al companiei Inginerie Creativă</p>
        </div>
        ${isAdmin ? `
          <button class="btn-brand" onclick="Regulament._startEdit()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Editează
          </button>
        ` : ''}
      </div>

      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden">
        ${updatedAt ? `
          <div style="padding:10px 24px;background:var(--surface-2);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-muted)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Ultima actualizare: <strong style="color:var(--text)">${updatedAt}</strong>
            ${updatedBy ? `&nbsp;de&nbsp;<strong style="color:var(--text)">${updatedBy}</strong>` : ''}
          </div>
        ` : ''}
        <div class="regulament-content" style="padding:32px 40px;max-width:860px">
          ${this._md(this._doc.content)}
        </div>
      </div>
    `;
  },

  // ── Start editare ──────────────────────────────────────────
  _startEdit() {
    if (!this._doc) return;
    const container = document.getElementById('page-content');
    if (!container) return;
    this._editing = true;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Editează Regulamentul Intern</h1>
          <p class="page-subtitle">Folosește sintaxa Markdown pentru formatare</p>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn-secondary" onclick="Regulament._cancelEdit()">Anulează</button>
          <button class="btn-brand" id="reg-save-btn" onclick="Regulament._saveEdit()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            Salvează
          </button>
        </div>
      </div>

      <div style="background:var(--brand-light);border:1px solid var(--brand);border-radius:var(--radius);padding:10px 16px;margin-bottom:16px;font-size:12px;color:var(--text);display:flex;flex-wrap:wrap;gap:12px;align-items:center">
        <strong>Formatare Markdown:</strong>
        <span><code># Titlu 1</code></span>
        <span><code>## Titlu 2</code></span>
        <span><code>**bold**</code></span>
        <span><code>*italic*</code></span>
        <span><code>- element listă</code></span>
        <span><code>1. element numerotat</code></span>
        <span><code>---</code> linie separatoare</span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start">
        <div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:6px">Editor</div>
          <textarea id="reg-editor"
            style="width:100%;min-height:600px;padding:20px;font-family:'Courier New',monospace;font-size:13px;line-height:1.7;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);resize:vertical;outline:none;box-sizing:border-box;transition:border-color 0.15s"
            oninput="Regulament._updatePreview(this.value)"
            onfocus="this.style.borderColor='var(--brand)'"
            onblur="this.style.borderColor='var(--border)'"
            placeholder="Scrie regulamentul în format Markdown..."
          >${this._doc.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin-bottom:6px">Previzualizare</div>
          <div id="reg-preview"
            class="regulament-content"
            style="min-height:600px;padding:20px 28px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);overflow-y:auto">
            ${this._md(this._doc.content)}
          </div>
        </div>
      </div>
    `;
  },

  // ── Update preview live ────────────────────────────────────
  _updatePreview(value) {
    const preview = document.getElementById('reg-preview');
    if (preview) preview.innerHTML = this._md(value);
  },

  // ── Salvare ────────────────────────────────────────────────
  async _saveEdit() {
    const textarea = document.getElementById('reg-editor');
    const saveBtn = document.getElementById('reg-save-btn');
    if (!textarea || !this._doc) return;

    const newContent = textarea.value.trim();
    if (!newContent) {
      showToast('Conținutul nu poate fi gol.', 'error');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Se salvează...';

    try {
      const sb = getSupabase();
      const userName = Auth.currentProfile?.full_name
        || Auth.currentProfile?.email
        || 'Administrator';

      const { error } = await sb
        .from('regulament_intern')
        .update({
          content: newContent,
          updated_at: new Date().toISOString(),
          updated_by_name: userName
        })
        .eq('id', this._doc.id);

      if (error) throw error;

      this._doc.content = newContent;
      this._doc.updated_at = new Date().toISOString();
      this._doc.updated_by_name = userName;
      this._editing = false;

      showToast('Regulamentul a fost salvat cu succes!', 'success');
      this._renderView();
    } catch (err) {
      console.error('Regulament save error:', err);
      showToast('Eroare la salvare: ' + (err.message || 'Încearcă din nou.'), 'error');
      saveBtn.disabled = false;
      saveBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        Salvează
      `;
    }
  },

  // ── Anulare editare ────────────────────────────────────────
  _cancelEdit() {
    this._editing = false;
    this._renderView();
  }
};
