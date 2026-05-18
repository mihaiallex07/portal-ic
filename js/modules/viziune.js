// ============================================================
// Viziune Module — Portal Inginerie Creativă
// Link direct spre Google Drive folder 01. Viziune & Valori
// ============================================================
const Viziune = {
  FOLDER_URL: 'https://drive.google.com/drive/folders/1HMvvYY19l_zjO3NRQKaFxxlyQL6BV6oy',

  render() {
    const container = document.getElementById('page-content');
    if (!container) return;
    container.innerHTML = `
      <div style="margin-bottom:24px">
        <h2 style="font-size:22px;font-weight:700;margin:0 0 4px">Viziune & Valori</h2>
        <p style="color:var(--text-muted);font-size:13px;margin:0">Misiunea, viziunea și valorile companiei Inginerie Creativă</p>
      </div>

      <div style="background:var(--card-bg);border:1px solid var(--border);border-radius:12px;padding:32px;text-align:center;max-width:480px;margin:0 auto">
        <div style="font-size:56px;margin-bottom:16px">🏛️</div>
        <h3 style="font-size:18px;font-weight:700;margin:0 0 8px;color:var(--text)">Viziune & Valori IC</h3>
        <p style="font-size:14px;color:var(--text-muted);margin:0 0 24px;line-height:1.6">
          Documentele de viziune și valori ale companiei sunt disponibile în Google Drive.<br>
          Apasă butonul de mai jos pentru a le accesa.
        </p>
        <a href="${this.FOLDER_URL}" target="_blank"
          style="display:inline-flex;align-items:center;gap:8px;background:var(--brand);color:#000;font-weight:700;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Deschide în Google Drive
        </a>
      </div>
    `;
  }
};
