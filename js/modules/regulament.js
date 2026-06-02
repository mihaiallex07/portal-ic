// ============================================================
// Regulament Intern — folosește DriveViewer template unic
// Folder Drive: 02. Regulamente
// Folder ID: 1QBuw8rw4V1YXZ-72LsVwo0Hs5TA3l33w
// ============================================================
const Regulament = {
  FOLDER_ID: '1QBuw8rw4V1YXZ-72LsVwo0Hs5TA3l33w',
  FOLDER_URL: 'https://drive.google.com/drive/folders/1QBuw8rw4V1YXZ-72LsVwo0Hs5TA3l33w',

  async render() {
    const container = document.getElementById('page-content');
    if (!container) return;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">Regulament Intern</h1>
          <p class="page-subtitle">Documentele oficiale ale companiei Inginerie Creativă</p>
        </div>
      </div>
      <div id="regulament-explorer"></div>
    `;

    await DriveViewer.renderDriveExplorer('regulament-explorer', this.FOLDER_ID, {
      title: 'Regulamente',
      subtitle: 'Inginerie Creativă',
      folderUrl: this.FOLDER_URL,
      height: 'calc(100vh - 200px)'
    });
  }
};
