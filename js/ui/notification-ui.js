/**
 * Notification UI Component
 * Bell icon cu dropdown pentru notificări
 */

const NotificationUI = {
  // ── RENDER BELL ICON ───────────────────────────────────────────────────
  renderBellIcon() {
    const unreadCount = NotificationService.unreadCount || 0;
    const badgeHtml = unreadCount > 0 
      ? `<span class="notification-badge" style="
          position: absolute;
          top: -8px;
          right: -8px;
          background: #EF4444;
          color: white;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          border: 2px solid var(--bg);
        ">${unreadCount > 99 ? '99+' : unreadCount}</span>`
      : '';

    return `
      <div style="position: relative; display: inline-block">
        <button 
          onclick="NotificationUI.toggleDropdown()" 
          style="
            background: none;
            border: none;
            cursor: pointer;
            font-size: 20px;
            padding: 8px;
            position: relative;
            color: var(--text);
          "
          title="Notificări"
        >
          🔔
          ${badgeHtml}
        </button>
        <div id="notification-dropdown" style="display: none; position: absolute; top: 100%; right: 0; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); width: 400px; max-height: 500px; overflow-y: auto; z-index: 1000;">
          ${this.renderDropdownContent()}
        </div>
      </div>
    `;
  },

  // ── RENDER DROPDOWN CONTENT ────────────────────────────────────────────
  renderDropdownContent() {
    if (NotificationService.notifications.length === 0) {
      return `
        <div style="padding: 20px; text-align: center; color: var(--text-muted)">
          Nu ai notificări
        </div>
      `;
    }

    const notifs = NotificationService.notifications.slice(0, 20);
    return `
      <div style="padding: 8px 0">
        ${notifs.map(n => this.renderNotificationItem(n)).join('')}
        <div style="border-top: 1px solid var(--border); padding: 8px; text-align: center">
          <a href="#" onclick="Notificari.openPage(); return false;" style="color: var(--primary); font-size: 12px; text-decoration: none">
            Vezi toate notificările →
          </a>
        </div>
      </div>
    `;
  },

  // ── RENDER NOTIFICATION ITEM ───────────────────────────────────────────
  renderNotificationItem(notif) {
    const icon = this.getNotificationIcon(notif.type);
    const bgColor = notif.read ? 'transparent' : 'var(--primary)20';
    const timestamp = this.formatTime(notif.created_at);

    return `
      <div style="
        padding: 12px 16px;
        border-bottom: 1px solid var(--border);
        background: ${bgColor};
        cursor: pointer;
        transition: background 0.2s;
      " onmouseover="this.style.background='var(--primary)10'" onmouseout="this.style.background='${bgColor}'">
        <div style="display: flex; gap: 12px">
          <div style="font-size: 18px; flex-shrink: 0">${icon}</div>
          <div style="flex: 1; min-width: 0">
            <div style="font-weight: 600; font-size: 13px; color: var(--text); margin-bottom: 4px">
              ${notif.title}
            </div>
            <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px">
              ${notif.message || ''}
            </div>
            <div style="font-size: 11px; color: var(--text-muted)">
              ${timestamp}
            </div>
          </div>
          ${!notif.read ? `<div style="width: 8px; height: 8px; background: var(--primary); border-radius: 50%; flex-shrink: 0; margin-top: 4px"></div>` : ''}
        </div>
        <div style="display: flex; gap: 8px; margin-top: 8px; font-size: 11px">
          ${!notif.read ? `<button onclick="NotificationService.markAsRead('${notif.id}'); event.stopPropagation()" style="background: none; border: none; color: var(--primary); cursor: pointer; padding: 0">Citit</button>` : ''}
          <button onclick="NotificationService.deleteNotification('${notif.id}'); event.stopPropagation()" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0">Șterge</button>
        </div>
      </div>
    `;
  },

  // ── GET NOTIFICATION ICON ──────────────────────────────────────────────
  getNotificationIcon(type) {
    const icons = {
      'budget_alert': '⚠️',
      'budget_request': '📋',
      'budget_approved': '✅',
      'budget_rejected': '❌',
      'beneficiary_invite': '👤'
    };
    return icons[type] || '📢';
  },

  // ── FORMAT TIME ────────────────────────────────────────────────────────
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Acum';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString('ro-RO');
  },

  // ── TOGGLE DROPDOWN ────────────────────────────────────────────────────
  toggleDropdown() {
    const dropdown = document.getElementById('notification-dropdown');
    if (!dropdown) return;

    const isVisible = dropdown.style.display !== 'none';
    dropdown.style.display = isVisible ? 'none' : 'block';

    if (!isVisible) {
      // Actualizez conținutul
      dropdown.innerHTML = this.renderDropdownContent();
    }

    // Închid dropdown când click în afară
    if (!isVisible) {
      setTimeout(() => {
        document.addEventListener('click', this.closeDropdownOnClickOutside);
      }, 0);
    } else {
      document.removeEventListener('click', this.closeDropdownOnClickOutside);
    }
  },

  closeDropdownOnClickOutside(e) {
    const dropdown = document.getElementById('notification-dropdown');
    const bellButton = e.target.closest('[onclick*="toggleDropdown"]');
    
    if (dropdown && !bellButton && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
      document.removeEventListener('click', NotificationUI.closeDropdownOnClickOutside);
    }
  },

  // ── UPDATE UI WHEN NOTIFICATIONS CHANGE ────────────────────────────────
  setupSubscription() {
    NotificationService.subscribe(({ notifications, unreadCount }) => {
      // Actualizez badge
      const badge = document.querySelector('.notification-badge');
      if (badge) {
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        badge.style.display = unreadCount > 0 ? 'flex' : 'none';
      }

      // Actualizez dropdown dacă e deschis
      const dropdown = document.getElementById('notification-dropdown');
      if (dropdown && dropdown.style.display !== 'none') {
        dropdown.innerHTML = this.renderDropdownContent();
      }
    });
  }
};

// Export
window.NotificationUI = NotificationUI;
