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
      this.unreadCount = this.notifications.filter(n => !n.read).length;
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
          if (!payload.new.read) this.unreadCount++;
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
            const wasUnread = !this.notifications[idx].read;
            const isUnread = !payload.new.read;
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
        .update({ read: true })
        .eq('id', notificationId);

      if (error) throw error;

      const idx = this.notifications.findIndex(n => n.id === notificationId);
      if (idx >= 0) {
        this.notifications[idx].read = true;
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
        .update({ read: true })
        .eq('user_id', Auth.currentProfile?.id)
        .eq('read', false);

      if (error) throw error;

      this.notifications.forEach(n => n.read = true);
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
