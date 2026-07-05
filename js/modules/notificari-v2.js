/**
 * Notificări Module v2
 * Pagina completă pentru notificări și management cereri ore
 */

const NotificariV2 = {
  currentTab: 'notifications', // 'notifications' | 'budget_requests'

  // ── RENDER PAGE ────────────────────────────────────────────────────────
  async render() {
    console.log('[NotificariV2] Render pagina notificări');

    const html = `
      <div style="padding: 20px; max-width: 1000px; margin: 0 auto">
        <h1 style="margin-bottom: 24px">Notificări și Cereri Ore</h1>

        <!-- TABS -->
        <div style="display: flex; gap: 12px; border-bottom: 2px solid var(--border); margin-bottom: 20px">
          <button 
            onclick="NotificariV2.switchTab('notifications')"
            style="
              padding: 12px 16px;
              background: none;
              border: none;
              border-bottom: 3px solid transparent;
              cursor: pointer;
              font-weight: 600;
              color: var(--text-muted);
              transition: all 0.2s;
            "
            id="tab-notifications"
          >
            🔔 Notificări
          </button>
          <button 
            onclick="NotificariV2.switchTab('budget_requests')"
            style="
              padding: 12px 16px;
              background: none;
              border: none;
              border-bottom: 3px solid transparent;
              cursor: pointer;
              font-weight: 600;
              color: var(--text-muted);
              transition: all 0.2s;
            "
            id="tab-budget_requests"
          >
            📋 Cereri Ore
          </button>
        </div>

        <!-- CONTENT -->
        <div id="notificari-content"></div>
      </div>
    `;

    const container = document.getElementById('main-content') || document.body;
    container.innerHTML = html;

    this.switchTab('notifications');
  },

  // ── SWITCH TAB ─────────────────────────────────────────────────────────
  switchTab(tab) {
    this.currentTab = tab;

    // Update tab buttons
    document.querySelectorAll('[id^="tab-"]').forEach(btn => {
      btn.style.color = btn.id === `tab-${tab}` ? 'var(--primary)' : 'var(--text-muted)';
      btn.style.borderBottomColor = btn.id === `tab-${tab}` ? 'var(--primary)' : 'transparent';
    });

    // Render content
    if (tab === 'notifications') {
      this.renderNotifications();
    } else {
      this.renderBudgetRequests();
    }
  },

  // ── RENDER NOTIFICATIONS ───────────────────────────────────────────────
  renderNotifications() {
    const notifs = NotificationService.notifications;
    const content = document.getElementById('notificari-content');

    if (notifs.length === 0) {
      content.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted)">
          <div style="font-size: 48px; margin-bottom: 12px">🔔</div>
          <div style="font-size: 16px; margin-bottom: 8px">Nu ai notificări</div>
          <div style="font-size: 13px">Vei primi notificări când se vor întâmpla lucruri importante</div>
        </div>
      `;
      return;
    }

    const html = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px">
        <div style="font-size: 13px; color: var(--text-muted)">
          ${notifs.filter(n => !n.read).length} necitite din ${notifs.length}
        </div>
        <button 
          onclick="NotificationService.markAllAsRead()"
          style="
            background: none;
            border: none;
            color: var(--primary);
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
          "
        >
          Marchează toate ca citite
        </button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 12px">
        ${notifs.map(n => this.renderNotificationCard(n)).join('')}
      </div>
    `;

    content.innerHTML = html;
  },

  renderNotificationCard(notif) {
    const icon = NotificationUI.getNotificationIcon(notif.type);
    const bgColor = notif.read ? 'transparent' : 'var(--primary)10';
    const timestamp = NotificationUI.formatTime(notif.created_at);

    return `
      <div style="
        padding: 16px;
        background: ${bgColor};
        border: 1px solid var(--border);
        border-radius: 8px;
        display: flex;
        gap: 12px;
      ">
        <div style="font-size: 24px; flex-shrink: 0">${icon}</div>
        <div style="flex: 1; min-width: 0">
          <div style="font-weight: 600; font-size: 14px; color: var(--text); margin-bottom: 4px">
            ${notif.title}
          </div>
          <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px">
            ${notif.message || ''}
          </div>
          <div style="font-size: 12px; color: var(--text-muted)">
            ${timestamp}
          </div>
        </div>
        <div style="display: flex; gap: 8px; flex-shrink: 0">
          ${!notif.read ? `
            <button 
              onclick="NotificationService.markAsRead('${notif.id}')"
              style="
                background: var(--primary);
                color: white;
                border: none;
                border-radius: 4px;
                padding: 6px 12px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 600;
              "
            >
              Citit
            </button>
          ` : ''}
          <button 
            onclick="NotificationService.deleteNotification('${notif.id}')"
            style="
              background: none;
              border: 1px solid var(--border);
              color: var(--text-muted);
              border-radius: 4px;
              padding: 6px 12px;
              cursor: pointer;
              font-size: 12px;
            "
          >
            Șterge
          </button>
        </div>
      </div>
    `;
  },

  // ── RENDER BUDGET REQUESTS ─────────────────────────────────────────────
  async renderBudgetRequests() {
    const content = document.getElementById('notificari-content');
    content.innerHTML = '<div style="text-align: center; padding: 20px">Încarcă...</div>';

    const requests = await NotificationService.getBudgetRequests();

    if (requests.length === 0) {
      content.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted)">
          <div style="font-size: 48px; margin-bottom: 12px">📋</div>
          <div style="font-size: 16px; margin-bottom: 8px">Nu ai cereri de ore</div>
          <div style="font-size: 13px">Cere ore suplimentare din pagina Proiecte</div>
        </div>
      `;
      return;
    }

    const html = `
      <div style="display: flex; flex-direction: column; gap: 12px">
        ${requests.map(r => this.renderBudgetRequestCard(r)).join('')}
      </div>
    `;

    content.innerHTML = html;
  },

  renderBudgetRequestCard(request) {
    const statusColors = {
      'pending': { bg: '#FEF3C7', text: '#92400E', label: 'În așteptare' },
      'approved': { bg: '#DCFCE7', text: '#166534', label: 'Aprobată' },
      'rejected': { bg: '#FEE2E2', text: '#991B1B', label: 'Respinsă' }
    };

    const status = statusColors[request.status] || statusColors.pending;

    return `
      <div style="
        padding: 16px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--bg);
      ">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px">
          <div>
            <div style="font-weight: 600; font-size: 14px; color: var(--text); margin-bottom: 4px">
              ${request.requested_hours} ore suplimentare
            </div>
            <div style="font-size: 12px; color: var(--text-muted)">
              Creat: ${new Date(request.created_at).toLocaleDateString('ro-RO')}
            </div>
          </div>
          <div style="
            background: ${status.bg};
            color: ${status.text};
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
          ">
            ${status.label}
          </div>
        </div>

        <div style="background: var(--primary)10; padding: 12px; border-radius: 6px; margin-bottom: 12px">
          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px">Justificare</div>
          <div style="font-size: 13px; color: var(--text); line-height: 1.5">
            ${request.justification}
          </div>
        </div>

        ${request.rejection_reason ? `
          <div style="background: #FEE2E2; padding: 12px; border-radius: 6px; margin-bottom: 12px; border-left: 4px solid #EF4444">
            <div style="font-size: 12px; color: #991B1B; margin-bottom: 4px; font-weight: 600">Motiv respingere</div>
            <div style="font-size: 13px; color: #991B1B">
              ${request.rejection_reason}
            </div>
          </div>
        ` : ''}

        ${request.status === 'pending' && Auth.currentProfile?.role !== 'admin' && !Auth.currentProfile?.isCoordinator ? `
          <div style="display: flex; gap: 8px">
            <button 
              onclick="NotificationService.deleteNotification('${request.id}')"
              style="
                flex: 1;
                background: none;
                border: 1px solid var(--border);
                color: var(--text);
                border-radius: 4px;
                padding: 8px 12px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
              "
            >
              Anulează
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }
};

// Export
window.NotificariV2 = NotificariV2;
