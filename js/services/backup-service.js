/**
 * Backup Service
 * Gestionează backup-ul automat și manual al datelor
 * 
 * Strategie:
 * - Backup zilnic la 02:00 UTC
 * - Retenție: 30 zile
 * - Format: JSON export
 * - Stocare: Supabase Storage
 */

const BackupService = {
  isBackingUp: false,
  lastBackupTime: null,

  // ── INIT ───────────────────────────────────────────────────────────────
  async init() {
    console.log('[BackupService] Inițializare');
    this.scheduleAutomaticBackup();
  },

  // ── SCHEDULE AUTOMATIC BACKUP ──────────────────────────────────────────
  scheduleAutomaticBackup() {
    // Verific la fiecare oră dacă e ora 02:00 UTC
    setInterval(() => {
      const now = new Date();
      const utcHour = now.getUTCHours();
      const utcMinute = now.getUTCMinutes();

      // Rulează la 02:00 UTC
      if (utcHour === 2 && utcMinute === 0) {
        this.createBackup('automatic');
      }
    }, 60000); // Check every minute
  },

  // ── CREATE BACKUP ──────────────────────────────────────────────────────
  async createBackup(type = 'manual') {
    if (this.isBackingUp) {
      console.log('[BackupService] Backup deja în progres');
      return false;
    }

    this.isBackingUp = true;
    console.log(`[BackupService] Inițiez backup ${type}...`);

    try {
      // Colectez date
      const data = await this.collectAllData();

      // Crează fișier JSON
      const backupData = {
        timestamp: new Date().toISOString(),
        type: type,
        version: '1.0',
        data: data
      };

      // Upload în Supabase Storage
      const fileName = `backup-${Date.now()}.json`;
      const result = await this.uploadBackupFile(fileName, backupData);

      if (result) {
        // Log backup în baza de date
        await this.logBackup(fileName, type, 'completed');
        console.log('[BackupService] Backup completat:', fileName);
        showToast('Backup completat cu succes', 'success');
        this.lastBackupTime = new Date();
        return true;
      }
    } catch (err) {
      console.error('[BackupService] Eroare backup:', err);
      await this.logBackup(null, type, 'failed', err.message);
      showToast('Eroare la backup: ' + err.message, 'error');
    } finally {
      this.isBackingUp = false;
    }

    return false;
  },

  // ── COLLECT ALL DATA ───────────────────────────────────────────────────
  async collectAllData() {
    const sb = getSupabase();
    if (!sb) return {};

    const tables = [
      'projects',
      'project_phases',
      'project_tasks',
      'project_members',
      'project_task_assignments',
      'time_entries',
      'manual_hours_log',
      'project_change_log',
      'notifications',
      'budget_requests',
      'project_beneficiaries'
    ];

    const data = {};

    for (const table of tables) {
      try {
        const { data: tableData, error } = await sb
          .from(table)
          .select('*');

        if (error) throw error;
        data[table] = tableData || [];
      } catch (err) {
        console.warn(`[BackupService] Eroare la colectare ${table}:`, err);
        data[table] = [];
      }
    }

    return data;
  },

  // ── UPLOAD BACKUP FILE ─────────────────────────────────────────────────
  async uploadBackupFile(fileName, backupData) {
    const sb = getSupabase();
    if (!sb) return false;

    try {
      const { data, error } = await sb.storage
        .from('backups')
        .upload(fileName, new Blob([JSON.stringify(backupData)], { type: 'application/json' }));

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('[BackupService] Eroare upload:', err);
      return false;
    }
  },

  // ── LOG BACKUP ─────────────────────────────────────────────────────────
  async logBackup(fileName, type, status, errorMessage = null) {
    const sb = getSupabase();
    if (!sb) return;

    try {
      await sb.from('backup_logs').insert({
        backup_type: type === 'automatic' ? 'full' : 'full',
        status: status,
        storage_path: fileName,
        error_message: errorMessage,
        created_by: Auth.currentProfile?.id
      });
    } catch (err) {
      console.error('[BackupService] Eroare log backup:', err);
    }
  },

  // ── GET BACKUPS ────────────────────────────────────────────────────────
  async getBackups() {
    const sb = getSupabase();
    if (!sb) return [];

    try {
      const { data, error } = await sb
        .from('backup_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('[BackupService] Eroare get backups:', err);
      return [];
    }
  },

  // ── RESTORE BACKUP ─────────────────────────────────────────────────────
  async restoreBackup(backupFileName) {
    if (!confirm('Ești sigur? Aceasta va suprascrie datele actuale!')) {
      return false;
    }

    console.log('[BackupService] Inițiez restore...');

    try {
      const sb = getSupabase();
      if (!sb) return false;

      // Download backup file
      const { data, error: downloadError } = await sb.storage
        .from('backups')
        .download(backupFileName);

      if (downloadError) throw downloadError;

      const backupData = JSON.parse(await data.text());

      // Restaurez fiecare tabel
      for (const [table, records] of Object.entries(backupData.data)) {
        if (records.length > 0) {
          // Șterge datele vechi
          await sb.from(table).delete().neq('id', null);

          // Inserează datele noi
          const { error: insertError } = await sb
            .from(table)
            .insert(records);

          if (insertError) throw insertError;
        }
      }

      console.log('[BackupService] Restore completat');
      showToast('Restore completat cu succes', 'success');
      return true;
    } catch (err) {
      console.error('[BackupService] Eroare restore:', err);
      showToast('Eroare la restore: ' + err.message, 'error');
      return false;
    }
  },

  // ── DELETE OLD BACKUPS ─────────────────────────────────────────────────
  async deleteOldBackups() {
    const sb = getSupabase();
    if (!sb) return;

    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Obțin backup-uri vechi
      const { data: oldBackups, error: queryError } = await sb
        .from('backup_logs')
        .select('storage_path')
        .lt('created_at', thirtyDaysAgo.toISOString());

      if (queryError) throw queryError;

      // Șterg fișierele din storage
      for (const backup of oldBackups || []) {
        if (backup.storage_path) {
          await sb.storage.from('backups').remove([backup.storage_path]);
        }
      }

      // Șterg logs
      await sb.from('backup_logs')
        .delete()
        .lt('created_at', thirtyDaysAgo.toISOString());

      console.log('[BackupService] Backup-uri vechi șterse');
    } catch (err) {
      console.error('[BackupService] Eroare delete old:', err);
    }
  }
};

// Export
window.BackupService = BackupService;
