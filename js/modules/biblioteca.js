// ============================================================
// Bibliotecă Tehnică — folosește DriveViewer template unic
// Folder Drive: 04. Biblioteca tehnica
// Folder ID: 1SdHtLOvG2xFcCmwi8LX3ejUkL5k4EJwC
// ============================================================
const Biblioteca = {
  FOLDER_ID: '1SdHtLOvG2xFcCmwi8LX3ejUkL5k4EJwC',
  FOLDER_URL: 'https://drive.google.com/drive/folders/1SdHtLOvG2xFcCmwi8LX3ejUkL5k4EJwC',

  async render() {
    const container = document.getElementById('page-content');
    if (!container) return;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Bibliotecă Tehnică</h1>
          <p class="page-subtitle">Standarde, normative și detalii tehnice</p>
        </div>
      </div>
      <div id="biblioteca-explorer"></div>
    `;

    await DriveViewer.renderDriveExplorer('biblioteca-explorer', this.FOLDER_ID, {
      title: 'Bibliotecă Tehnică',
      subtitle: 'Inginerie Creativă',
      folderUrl: this.FOLDER_URL,
      height: 'calc(100vh - 200px)'
    });
  }
};
