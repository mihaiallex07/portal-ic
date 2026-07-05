/**
 * Backup Admin UI
 * Panel admin pentru management backup-uri
 */

const BackupAdminUI = {
  // ── RENDER PANEL ───────────────────────────────────────────────────────
  async renderPanel() {
    const backups = await BackupService.getBackups();

    const html = `
      <div style="padding: 16px; border-top: 1px solid var(--border)">
        <h3 style="margin: 0 0 16px 0; font-size: 14px; font-weight: 700">Backup și Restore</h3>

        <!-- ACTION BUTTONS -->
        <div style="display: flex; gap: 8px; margin-bottom: 16px">
          <button 
            onclick="BackupAdminUI.createBackupNow()"
            style="
              flex: 1;
              padding: 10px 12px;
              background: var(--primary);
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-weight: 600;
              font-size: 13px;
            "
          >
            💾 Backup Acum
          </button>
          <button 
            onclick="BackupAdminUI.deleteOldBackups()"
            style="
              flex: 1;
              padding: 10px 12px;
              background: none;
              border: 1px solid var(--border);
              color: var(--text-muted);
              border-radius: 6px;
              cursor: pointer;
              font-weight: 600;
              font-size: 13px;
            "
          >
            🗑️ Șterge Vechi
          </button>
        </div>

        <!-- BACKUPS LIST -->
        <div style="max-height: 300px; overflow-y: auto">
          ${backups.length > 0
            ? backups.map(b => this.renderBackupItem(b)).join('')
            : '<div style="color: var(--text-muted); font-size: 12px; text-align: center; padding: 16px">Nu sunt backup-uri</div>'
          }
        </div>

        <!-- INFO -->
        <div style="
          margin-top: 16px;
          padding: 12px;
          background: var(--primary)05;
          border-left: 4px solid var(--primary);
          border-radius: 4px;
          font-size: 12px;
          color: var(--text-muted);
        ">
          <strong>ℹ️ Info:</strong> Backup-urile se crează automat zilnic la 02:00 UTC. Se păstrează 30 de zile.
        </div>
      </div>
    `;

    return html;
  },

  // ── RENDER BACKUP ITEM ─────────────────────────────────────────────────
  renderBackupItem(backup) {
    const date = new Date(backup.created_at).toLocaleString('ro-RO');
    const statusColors = {
      'completed': { bg: '#DCFCE7', text: '#166534', label: '✅' },
      'failed': { bg: '#FEE2E2', text: '#991B1B', label: '❌' },
      'in_progress': { bg: '#FEF3C7', text: '#92400E', label: '⏳' }
    };

    const status = statusColors[backup.status] || statusColors.completed;

    return `
      <div style="
        padding: 12px;
        background: var(--primary)05;
        border: 1px solid var(--border);
        border-radius: 6px;
        margin-bottom: 8px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      ">
        <div style="flex: 1; min-width: 0">
          <div style="font-size: 12px; font-weight: 600; color: var(--text); margin-bottom: 2px">
            ${backup.storage_path || 'Backup'}
          </div>
          <div style="font-size: 11px; color: var(--text-muted)">
            ${date} | ${backup.file_size_bytes ? (backup.file_size_bytes / 1024).toFixed(1) + ' KB' : 'N/A'}
          </div>
          ${backup.error_message ? `
            <div style="font-size: 11px; color: #991B1B; margin-top: 4px">
              Eroare: ${backup.error_message}
            </div>
          ` : ''}
        </div>

        <div style="display: flex; gap: 8px; flex-shrink: 0">
          <span style="
            background: ${status.bg};
            color: ${status.text};
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            white-space: nowrap;
          ">
            ${status.label} ${backup.status}
          </span>

          ${backup.status === 'completed' ? `
            <button 
              onclick="BackupAdminUI.restoreBackup('${backup.storage_path}')"
              style="
                background: none;
                border: 1px solid var(--border);
                color: var(--text-muted);
                border-radius: 4px;
                padding: 4px 8px;
                cursor: pointer;
                font-size: 11px;
                font-weight: 600;
              "
              title="Restore din acest backup"
            >
              ↩️
            </button>
          ` : ''}
        </div>
      </div>
    `;
  },

  // ── CREATE BACKUP NOW ──────────────────────────────────────────────────
  async createBackupNow() {
    const result = await BackupService.createBackup('manual');
    if (result) {
      // Reîncarcă panelul
      const panel = document.querySelector('[data-backup-panel]');
      if (panel) {
        panel.innerHTML = await this.renderPanel();
      }
    }
  },

  // ── DELETE OLD BACKUPS ─────────────────────────────────────────────────
  async deleteOldBackups() {
    if (!confirm('Ești sigur? Aceasta va șterge backup-urile mai vechi de 30 de zile.')) {
      return;
    }

    await BackupService.deleteOldBackups();

    // Reîncarcă panelul
    const panel = document.querySelector('[data-backup-panel]');
    if (panel) {
      panel.innerHTML = await this.renderPanel();
    }
  },

  // ── RESTORE BACKUP ────────────────────────────────────────────────────
  async restoreBackup(fileName) {
    const result = await BackupService.restoreBackup(fileName);
    if (result) {
      // Reîncarcă pagina
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  }
};

// Export
window.BackupAdminUI = BackupAdminUI;
