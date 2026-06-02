// ============================================================
// Viziune & Valori — folosește DriveViewer template unic
// Folder Drive: 01. Viziune & Valori
// Folder ID: 1HMvvYY19l_zjO3NRQKaFxxlyQL6BV6oy
// ============================================================
const Viziune = {
  FOLDER_ID: '1HMvvYY19l_zjO3NRQKaFxxlyQL6BV6oy',
  FOLDER_URL: 'https://drive.google.com/drive/folders/1HMvvYY19l_zjO3NRQKaFxxlyQL6BV6oy',

  async render() {
    const container = document.getElementById('page-content');
    if (!container) return;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Viziune & Valori</h1>
          <p class="page-subtitle">Misiunea, viziunea și valorile companiei Inginerie Creativă</p>
        </div>
      </div>
      <div id="viziune-explorer"></div>
    `;

    await DriveViewer.renderDriveExplorer('viziune-explorer', this.FOLDER_ID, {
      title: 'Viziune & Valori',
      subtitle: 'Inginerie Creativă',
      folderUrl: this.FOLDER_URL,
      height: 'calc(100vh - 200px)'
    });
  }
};
