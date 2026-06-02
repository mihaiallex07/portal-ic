// ============================================================
// Procese & Proceduri — folosește DriveViewer template unic
// Folder Drive: 03. Procese & Proceduri
// Folder ID: 1mqNUVdi3n5kDwK7BTyJQ6JcJt8abqheG
// ============================================================
const Procese = {
  FOLDER_ID: '1mqNUVdi3n5kDwK7BTyJQ6JcJt8abqheG',
  FOLDER_URL: 'https://drive.google.com/drive/folders/1mqNUVdi3n5kDwK7BTyJQ6JcJt8abqheG',

  async render() {
    const container = document.getElementById('page-content');
    if (!container) return;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Procese & Proceduri</h1>
          <p class="page-subtitle">Procedurile și procesele operaționale ale companiei</p>
        </div>
      </div>
      <div id="procese-explorer"></div>
    `;

    await DriveViewer.renderDriveExplorer('procese-explorer', this.FOLDER_ID, {
      title: 'Procese & Proceduri',
      subtitle: 'Inginerie Creativă',
      folderUrl: this.FOLDER_URL,
      height: 'calc(100vh - 200px)'
    });
  }
};
