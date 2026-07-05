// ============================================================
// Notificări Module — Portal Inginerie Creativă
// Suport: is_read, budget_requests, alertă buget, badge real-time
// ============================================================
const Notificari = {
  items: [],
  budgetRequests: [],

  async render() {
    const content = document.getElementById('page-content');
    content.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>Se încarcă...</p></div>`;
    const userId = Auth.currentUser?.id;
    const profile = Auth.currentProfile;
    const isAdminOrCoord = profile?.role === 'admin' || profile?.role === 'coordonator';
    const [notifRes, reqRes] = await Promise.all([
      DB.getNotifications(userId),
      isAdminOrCoord ? DB.getBudgetRequests({ status: 'pending' }) : Promise.resolve({ data: [] }),
    ]);
    this.items = (notifRes.data || []).map(n => ({ ...n, is_read: n.is_read ?? n.read ?? false }));
    this.budgetRequests = reqRes.data || [];
    this.renderPage();
  },

  renderPage() {
    const profile = Auth.currentProfile;
    const isAdminOrCoord = profile?.role === 'admin' || profile?.role === 'coordonator';
    const unread = this.items.filter(n => !n.is_read).length;
    const pendingReqs = this.budgetRequests.length;
    document.getElementById('page-content').innerHTML = `
      <div style="width:100%;max-width:860px;margin:0 auto">
        <div class="page-header">
          <div>
            <h1 class="page-title">Notificări</h1>
            <p class="page-subtitle">${unread} necitite din ${this.items.length} total</p>
          </div>
          <div class="flex gap-2">
            ${unread > 0 ? `<button class="btn-secondary" onclick="Notificari.markAllRead()">Marchează toate ca citite</button>` : ''}
          </div>
        </div>
        ${isAdminOrCoord && pendingReqs > 0 ? `
        <div class="card" style="margin-bottom:20px;border-left:4px solid #f59e0b;background:rgba(245,158,11,0.06)">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <strong style="font-size:15px">Cereri ore suplimentare în așteptare (${pendingReqs})</strong>
          </div>
          ${this.budgetRequests.map(req => `
            <div class="card" style="margin-bottom:8px;padding:12px 16px">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
                <div style="flex:1">
                  <div style="font-weight:600;font-size:13px">${req.profiles?.full_name || 'Angajat'} — ${req.project_tasks?.name || 'Task'}</div>
                  <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Solicită <strong>${req.requested_hours}h</strong> suplimentare</div>
                  <div style="font-size:12px;margin-top:4px;color:var(--text-secondary)">&ldquo;${req.justification}&rdquo;</div>
                  <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${timeAgo(req.created_at)}</div>
                </div>
                <div class="flex gap-2" style="flex-shrink:0">
                  <button class="btn-primary" style="font-size:12px;padding:6px 12px" onclick="Notificari.approveBudgetRequest('${req.id}')">✅ Aprobă</button>
                  <button class="btn-secondary" style="font-size:12px;padding:6px 12px" onclick="Notificari.rejectBudgetRequest('${req.id}')">❌ Refuză</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
        ` : ''}
        <div class="space-y-2">
          ${this.items.length === 0 ? emptyState('Nu ai notificări') :
            this.items.map(n => {
              const isRead = n.is_read ?? n.read ?? false;
              const typeColor = n.type === 'success' || n.type === 'budget_approved' ? 'green'
                : n.type === 'warning' || n.type === 'budget_alert' ? 'yellow'
                : n.type === 'error' || n.type === 'budget_rejected' ? 'red' : 'blue';
              const typeLabel = n.type === 'budget_alert' ? 'alertă buget'
                : n.type === 'budget_approved' ? 'aprobat'
                : n.type === 'budget_rejected' ? 'respins'
                : n.type || 'info';
              return `
              <div class="flex items-start gap-3 p-4 rounded card ${!isRead ? 'unread-notif' : ''}" style="cursor:pointer" onclick="Notificari.markRead('${n.id}')">
                <div style="width:8px;height:8px;border-radius:50%;background:${!isRead ? 'var(--brand)' : 'transparent'};flex-shrink:0;margin-top:4px"></div>
                <div style="flex:1">
                  <div style="font-size:13px;font-weight:${!isRead ? '700' : '400'}">${n.title}</div>
                  <div class="text-sm text-muted">${n.message || ''}</div>
                  ${n.data?.task_name ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">Task: ${n.data.task_name}</div>` : ''}
                  <div class="text-xs text-muted mt-1">${timeAgo(n.created_at)}</div>
                </div>
                <div>${badge(typeLabel, typeColor)}</div>
              </div>
            `}).join('')
          }
        </div>
      </div>
    `;
  },

  async markRead(id) {
    await DB.markNotificationRead(id);
    const n = this.items.find(n => String(n.id) === String(id));
    if (n) { n.is_read = true; n.read = true; }
    this.renderPage();
    updateNotifBadge();
  },

  async markAllRead() {
    const userId = Auth.currentUser?.id;
    await DB.markAllNotificationsRead(userId);
    this.items.forEach(n => { n.is_read = true; n.read = true; });
    this.renderPage();
    updateNotifBadge();
  },

  async approveBudgetRequest(id) {
    const { error } = await DB.updateBudgetRequest(id, {
      status: 'approved',
      approved_by: Auth.currentUser?.id,
      approved_at: new Date().toISOString(),
    });
    if (error) { showToast('Eroare la aprobare: ' + error.message, 'error'); return; }
    showToast('Cerere aprobată!', 'success');
    this.budgetRequests = this.budgetRequests.filter(r => r.id !== id);
    this.renderPage();
  },

  async rejectBudgetRequest(id) {
    const reason = prompt('Motivul refuzului (opțional):') || '';
    const { error } = await DB.updateBudgetRequest(id, {
      status: 'rejected',
      rejection_reason: reason,
      approved_by: Auth.currentUser?.id,
      approved_at: new Date().toISOString(),
    });
    if (error) { showToast('Eroare la refuz: ' + error.message, 'error'); return; }
    showToast('Cerere refuzată.', 'info');
    this.budgetRequests = this.budgetRequests.filter(r => r.id !== id);
    this.renderPage();
  },
};

// ── BADGE REAL-TIME ─────────────────────────────────────────
async function updateNotifBadge() {
  const badgeEl = document.getElementById('notif-badge');
  if (!badgeEl) return;
  const userId = Auth.currentUser?.id;
  if (!userId) { badgeEl.style.display = 'none'; return; }
  if (APP_CONFIG.demoMode) {
    const unread = (DB.demo.notifications || []).filter(n => !(n.is_read ?? n.read)).length;
    badgeEl.textContent = unread;
    badgeEl.style.display = unread > 0 ? 'flex' : 'none';
    return;
  }
  const { data } = await DB.getNotifications(userId);
  const unread = (data || []).filter(n => !(n.is_read ?? n.read)).length;
  badgeEl.textContent = unread > 99 ? '99+' : unread;
  badgeEl.style.display = unread > 0 ? 'flex' : 'none';
}

// ── MODAL CERERE ORE SUPLIMENTARE ───────────────────────────
async function openBudgetRequestModal(taskId, taskName, budgetH, workedH) {
  const pct = budgetH > 0 ? Math.round((workedH / budgetH) * 100) : 0;
  const existing = document.getElementById('budget-req-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'budget-req-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `
    <div class="card" style="width:100%;max-width:480px;padding:28px 32px;border-radius:16px">
      <h2 style="font-size:18px;font-weight:700;margin-bottom:4px">Cerere ore suplimentare</h2>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px">Task: <strong>${taskName}</strong></p>
      <div style="background:var(--bg-secondary);border-radius:8px;padding:12px 16px;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px">
          <span>Buget consumat</span>
          <span style="font-weight:600;color:${pct >= 90 ? '#ef4444' : pct >= 75 ? '#f59e0b' : 'var(--text-primary)'}">${workedH}h / ${budgetH}h (${pct}%)</span>
        </div>
        <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${Math.min(100,pct)}%;background:${pct >= 90 ? '#ef4444' : pct >= 75 ? '#f59e0b' : 'var(--brand)'};border-radius:3px"></div>
        </div>
      </div>
      <div style="margin-bottom:16px">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px">Ore suplimentare solicitate *</label>
        <input type="number" id="req-hours" min="1" max="200" value="8" class="input-field" style="width:100%" />
      </div>
      <div style="margin-bottom:20px">
        <label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px">Justificare *</label>
        <textarea id="req-justification" rows="3" class="input-field" style="width:100%;resize:vertical" placeholder="Explică de ce ai nevoie de ore suplimentare..."></textarea>
      </div>
      <div class="flex gap-2" style="justify-content:flex-end">
        <button class="btn-secondary" onclick="document.getElementById('budget-req-modal').remove()">Anulează</button>
        <button class="btn-primary" onclick="submitBudgetRequest(${taskId})">Trimite cererea</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function submitBudgetRequest(taskId) {
  const hours = parseInt(document.getElementById('req-hours')?.value || '0');
  const justification = document.getElementById('req-justification')?.value?.trim() || '';
  if (!hours || hours < 1) { showToast('Introdu numărul de ore', 'error'); return; }
  if (!justification) { showToast('Justificarea este obligatorie', 'error'); return; }
  const { error } = await DB.createBudgetRequest({
    task_id: taskId,
    user_id: Auth.currentUser?.id,
    requested_hours: hours,
    justification,
    status: 'pending',
  });
  if (error) { showToast('Eroare: ' + error.message, 'error'); return; }
  document.getElementById('budget-req-modal')?.remove();
  showToast('Cererea a fost trimisă! Admin/Coordonatorul va fi notificat.', 'success');
}
