/**
 * Notification Service
 * Gestionează notificări, alertă buget și cereri ore suplimentare
 * 
 * Principii:
 * - Modular: fiecare funcție are o responsabilitate unică
 * - Curat: fără spaghetti code
 * - Reusable: componente generice
 */

const NotificationService = {
  // ── CONSTANTE ──────────────────────────────────────────────────────────
  TYPES: {
    BUDGET_ALERT: 'budget_alert',
    BUDGET_REQUEST: 'budget_request',
    BUDGET_APPROVED: 'budget_approved',
    BUDGET_REJECTED: 'budget_rejected',
    BENEFICIARY_INVITE: 'beneficiary_invite'
  },

  THRESHOLDS: {
    CRITICAL: 95,  // 95% - roșu
    WARNING: 75,   // 75% - portocaliu
    CAUTION: 50,   // 50% - galben
    INFO: 25       // 25% - albastru
  },

  // ── STATE ──────────────────────────────────────────────────────────────
  notifications: [],
  unreadCount: 0,
  listeners: [],

  // ── INITIALIZATION ─────────────────────────────────────────────────────
  async init() {
    console.log('[NotificationService] Inițializare...');
    await this.loadNotifications();
    this.setupRealtimeListener();
    this.startPolling();
  },

  // ── LOAD NOTIFICATIONS ─────────────────────────────────────────────────
  async loadNotifications(limit = 50) {
    const sb = getSupabase();
    if (!sb) return;

    try {
      const { data, error } = await sb
        .from('notifications')
        .select('*')
        .eq('user_id', Auth.currentProfile?.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      this.notifications = data || [];
      this.unreadCount = this.notifications.filter(n => !(n.is_read ?? n.read)).length;
      this.notifyListeners();

      console.log(`[NotificationService] Încarcate ${this.notifications.length} notificări (${this.unreadCount} necitite)`);
    } catch (err) {
      console.error('[NotificationService] Eroare la încărcare:', err);
    }
  },

  // ── REALTIME LISTENER ──────────────────────────────────────────────────
  setupRealtimeListener() {
    const sb = getSupabase();
    if (!sb) return;

    const subscription = sb
      .channel(`notifications:${Auth.currentProfile?.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${Auth.currentProfile?.id}`
        },
        (payload) => {
          console.log('[NotificationService] Notificare nouă:', payload.new);
          this.notifications.unshift(payload.new);
          if (!(payload.new.is_read ?? payload.new.read)) this.unreadCount++;
          this.notifyListeners();
          this.playSound();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${Auth.currentProfile?.id}`
        },
        (payload) => {
          const idx = this.notifications.findIndex(n => n.id === payload.new.id);
          if (idx >= 0) {
            const wasUnread = !(this.notifications[idx].is_read ?? this.notifications[idx].read);
            const isUnread = !(payload.new.is_read ?? payload.new.read);
            if (wasUnread && !isUnread) this.unreadCount--;
            if (!wasUnread && isUnread) this.unreadCount++;
            this.notifications[idx] = payload.new;
            this.notifyListeners();
          }
        }
      )
      .subscribe();

    this.subscription = subscription;
  },

  // ── POLLING (fallback dacă realtime nu merge) ──────────────────────────
  startPolling(interval = 30000) {
    setInterval(() => {
      this.loadNotifications(10); // Doar ultimele 10 noi
    }, interval);
  },

  // ── MARK AS READ ───────────────────────────────────────────────────────
  async markAsRead(notificationId) {
    const sb = getSupabase();
    if (!sb) return;

    try {
      const { error } = await sb
        .from('notifications')
        .update({ is_read: true, read: true })
        .eq('id', notificationId);

      if (error) throw error;

      const idx = this.notifications.findIndex(n => n.id === notificationId);
      if (idx >= 0) {
        this.notifications[idx].read = true; this.notifications[idx].is_read = true;
        this.unreadCount = Math.max(0, this.unreadCount - 1);
        this.notifyListeners();
      }
    } catch (err) {
      console.error('[NotificationService] Eroare mark as read:', err);
    }
  },

  async markAllAsRead() {
    const sb = getSupabase();
    if (!sb) return;

    try {
      const { error } = await sb
        .from('notifications')
        .update({ is_read: true, read: true })
        .eq('user_id', Auth.currentProfile?.id)
        .eq('is_read', false);

      if (error) throw error;

      this.notifications.forEach(n => { n.read = true; n.is_read = true; });
      this.unreadCount = 0;
      this.notifyListeners();
    } catch (err) {
      console.error('[NotificationService] Eroare mark all as read:', err);
    }
  },

  // ── DELETE NOTIFICATION ────────────────────────────────────────────────
  async deleteNotification(notificationId) {
    const sb = getSupabase();
    if (!sb) return;

    try {
      const { error } = await sb
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;

      const idx = this.notifications.findIndex(n => n.id === notificationId);
      if (idx >= 0) {
        if (!this.notifications[idx].read) this.unreadCount--;
        this.notifications.splice(idx, 1);
        this.notifyListeners();
      }
    } catch (err) {
      console.error('[NotificationService] Eroare delete:', err);
    }
  },

  // ── BUDGET REQUEST MANAGEMENT ──────────────────────────────────────────
  async createBudgetRequest(taskId, requestedHours, justification) {
    const sb = getSupabase();
    if (!sb) return null;

    try {
      const { data, error } = await sb
        .from('budget_requests')
        .insert({
          task_id: taskId,
          user_id: Auth.currentProfile?.id,
          requested_hours: requestedHours,
          justification: justification,
          status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;

      console.log('[NotificationService] Cerere ore creată:', data);
      showToast('Cererea ta pentru ore suplimentare a fost trimisă', 'success');
      return data;
    } catch (err) {
      console.error('[NotificationService] Eroare creare cerere:', err);
      showToast('Eroare la trimiterea cererii: ' + err.message, 'error');
      return null;
    }
  },

  async approveBudgetRequest(requestId, approvedHours = null) {
    const sb = getSupabase();
    if (!sb) return;

    try {
      const { error } = await sb
        .from('budget_requests')
        .update({
          status: 'approved',
          approved_by: Auth.currentProfile?.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (error) throw error;

      console.log('[NotificationService] Cerere aprobată');
      showToast('Cerere aprobată', 'success');
    } catch (err) {
      console.error('[NotificationService] Eroare aprob:', err);
      showToast('Eroare la aprobare: ' + err.message, 'error');
    }
  },

  async rejectBudgetRequest(requestId, rejectionReason) {
    const sb = getSupabase();
    if (!sb) return;

    try {
      const { error } = await sb
        .from('budget_requests')
        .update({
          status: 'rejected',
          approved_by: Auth.currentProfile?.id,
          approved_at: new Date().toISOString(),
          rejection_reason: rejectionReason
        })
        .eq('id', requestId);

      if (error) throw error;

      console.log('[NotificationService] Cerere respinsă');
      showToast('Cerere respinsă', 'success');
    } catch (err) {
      console.error('[NotificationService] Eroare respingere:', err);
      showToast('Eroare la respingere: ' + err.message, 'error');
    }
  },

  async getBudgetRequests(taskId = null) {
    const sb = getSupabase();
    if (!sb) return [];

    try {
      let query = sb.from('budget_requests').select('*');

      if (taskId) {
        query = query.eq('task_id', taskId);
      } else {
        query = query.eq('user_id', Auth.currentProfile?.id);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('[NotificationService] Eroare get requests:', err);
      return [];
    }
  },


  // ── BUDGET ALERT JS-SIDE (înlocuiește trigger-ul SQL defect) ──────────
  async checkBudgetAlert(task, oldMinutes, newMinutes) {
    const sb = getSupabase();
    if (!sb || !task || !task.budget_hours || task.budget_hours <= 0) return;
    const budgetMin = task.budget_hours * 60;
    const oldPct = (oldMinutes / budgetMin) * 100;
    const newPct = (newMinutes / budgetMin) * 100;
    const oldRemaining = 100 - oldPct;
    const newRemaining = 100 - newPct;
    const thresholds = [
      { pct: 50, title: 'Buget 50% consumat',    type: 'budget_alert' },
      { pct: 25, title: 'Buget 75% consumat',    type: 'budget_alert' },
      { pct: 10, title: 'Buget 90% consumat',    type: 'budget_alert' },
      { pct: 5,  title: 'Buget aproape epuizat', type: 'budget_alert' },
    ];
    const projName = task.project_name || '';
    const taskName = task.name || 'Sarcina';
    for (const t of thresholds) {
      if (oldRemaining > t.pct && newRemaining <= t.pct) {
        const msg = 'Sarcina "' + taskName + '" din proiectul "' + projName + '" a consumat ' + (100 - t.pct) + '% din buget.';
        await this._sendBudgetNotif(sb, task, t.title, msg, t.type);
      }
    }
    if (oldPct < 100 && newPct >= 100) {
      const msg = 'Sarcina "' + taskName + '" din proiectul "' + projName + '" a depasit bugetul alocat!';
      await this._sendBudgetNotif(sb, task, 'Buget depasit!', msg, 'budget_exceeded');
    }
  },

  async _sendBudgetNotif(sb, task, title, message, type) {
    const recipients = new Set();
    if (task.assigned_user_id) recipients.add(task.assigned_user_id);
    if (Array.isArray(task.assigned_users)) task.assigned_users.forEach(uid => uid && recipients.add(uid));
    try {
      const { data: asgn } = await sb.from('project_task_assignments').select('user_id').eq('task_id', task.id);
      (asgn || []).forEach(a => a.user_id && recipients.add(a.user_id));
    } catch (e) { /* ignora */ }
    if (recipients.size === 0) return;
    const rows = Array.from(recipients).map(uid => ({ user_id: uid, title, message, type, is_read: false, link: '#proiecte' }));
    try {
      const { error } = await sb.from('notifications').insert(rows);
      if (!error && typeof updateNotifBadge === 'function') updateNotifBadge();
      if (error) console.warn('[NotificationService] Budget notif error:', error.message);
    } catch (e) { console.warn('[NotificationService] Budget notif error:', e); }
  },

  // ── LISTENERS ──────────────────────────────────────────────────────────
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  },

  notifyListeners() {
    this.listeners.forEach(callback => {
      callback({
        notifications: this.notifications,
        unreadCount: this.unreadCount
      });
    });
  },

  // ── UI HELPERS ─────────────────────────────────────────────────────────
  getThresholdColor(percentage) {
    if (percentage >= this.THRESHOLDS.CRITICAL) return '#EF4444'; // roșu
    if (percentage >= this.THRESHOLDS.WARNING) return '#F59E0B';  // portocaliu
    if (percentage >= this.THRESHOLDS.CAUTION) return '#EAB308';  // galben
    return '#3B82F6'; // albastru
  },

  getThresholdLabel(percentage) {
    if (percentage >= this.THRESHOLDS.CRITICAL) return 'CRITIC';
    if (percentage >= this.THRESHOLDS.WARNING) return 'AVERTISMENT';
    if (percentage >= this.THRESHOLDS.CAUTION) return 'ATENȚIE';
    return 'INFO';
  },

  playSound() {
    // Sunet notificare (dacă vrem)
    // const audio = new Audio('/sounds/notification.mp3');
    // audio.play().catch(e => console.log('Audio play failed:', e));
  },

  // ── CLEANUP ────────────────────────────────────────────────────────────
  destroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
};

// Export pentru global
window.NotificationService = NotificationService;
