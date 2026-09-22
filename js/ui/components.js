// ============================================================
// UI Components — Portal Inginerie Creativă
// ============================================================

// ── TOAST ──────────────────────────────────────────────────
function showToast(message, type = 'default', duration = 3500) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = {
    success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    default: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  };
  
  toast.innerHTML = `${icons[type] || icons.default}<span>${message}</span>`;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.2s ease reverse';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

// ── MODAL ──────────────────────────────────────────────────
function openModal(title, contentHtml, footerHtml = '', options = {}) {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  const { closeOnBackdrop = true, showClose = true } = options;
  overlay.dataset.closeOnBackdrop = String(closeOnBackdrop);
  
  content.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">${title}</h3>
      ${showClose ? `<button class="modal-close" onclick="closeModalForce()" title="Închide">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>` : ''}
    </div>
    <div class="modal-body">${contentHtml}</div>
    ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
  `;
  
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeModal(event) {
  const overlay = document.getElementById('modal-overlay');
  if (event && event.target !== overlay) return;
  if (event && overlay.dataset.closeOnBackdrop === 'false') return;
  overlay.style.display = 'none';
  // Only reset overflow if we're not in the app (auth page doesn't need overflow hidden)
  if (document.getElementById('app').style.display !== 'none') {
    document.body.style.overflow = 'hidden';
  }
}

function closeModalForce() {
  const overlay = document.getElementById('modal-overlay');
  overlay.style.display = 'none';
  delete overlay.dataset.closeOnBackdrop;
  if (document.getElementById('app').style.display !== 'none') {
    document.body.style.overflow = 'hidden';
  }
}

// ── LOADING ─────────────────────────────────────────────────
function setPageLoading(show) {
  const content = document.getElementById('page-content');
  if (show) {
    content.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>Se încarcă...</p></div>`;
  }
}

// ── BADGE ───────────────────────────────────────────────────
function badge(text, color = 'gray') {
  return `<span class="badge badge-${color}">${text}</span>`;
}

function statusBadge(status) {
  const map = {
    activ: ['Activ', 'green'],
    in_progress: ['În lucru', 'blue'],
    todo: ['De făcut', 'gray'],
    done: ['Finalizat', 'green'],
    finalizat: ['Finalizat', 'gray'],
    arhivat: ['Arhivat', 'gray'],
    in_review: ['În analiză', 'yellow'],
    aprobat: ['Aprobat', 'green'],
    respins: ['Respins', 'red'],
    suspendat: ['Suspendat', 'orange'],
  };
  const [label, color] = map[status] || [status, 'gray'];
  return badge(label, color);
}

function roleBadge(role) {
  const map = {
    admin: ['Admin', 'red'],
    angajat: ['Angajat', 'gray'],
  };
  const [label, color] = map[role] || [role, 'gray'];
  return badge(label, color);
}

function categoryBadge(cat) {
  const map = {
    companie: ['Companie', 'blue'],
    proiecte: ['Proiecte', 'green'],
    hr: ['HR', 'purple'],
    it: ['IT', 'gray'],
    evenimente: ['Evenimente', 'orange'],
    realizari: ['Realizări', 'yellow'],
    proiectare: ['Proiectare', 'blue'],
    calitate: ['Calitate', 'green'],
    comercial: ['Comercial', 'purple'],
    administrativ: ['Administrativ', 'gray'],
  };
  const [label, color] = map[cat] || [cat, 'gray'];
  return badge(label, color);
}

// ── AVATAR ──────────────────────────────────────────────────
function avatarHtml(name, avatarUrl, size = 'md') {
  const initials = Auth.getInitials(name);
  if (avatarUrl) {
    return `<div class="avatar avatar-${size}"><img src="${avatarUrl}" alt="${name}" /></div>`;
  }
  return `<div class="avatar avatar-${size}">${initials}</div>`;
}

// ── PROGRESS BAR ─────────────────────────────────────────────
function progressBar(used, total, showText = true) {
  const pct = total > 0 ? Math.min(100, Math.round(used / total * 100)) : 0;
  const colorClass = pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : '';
  return `
    <div>
      ${showText ? `<div class="flex justify-between text-xs text-muted mb-1"><span>${used}h / ${total}h</span><span>${pct}%</span></div>` : ''}
      <div class="progress-bar"><div class="progress-fill ${colorClass}" style="width:${pct}%"></div></div>
    </div>
  `;
}

// ── EMPTY STATE ──────────────────────────────────────────────
function emptyState(message = 'Nu există date', icon = null) {
  const defaultIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  return `<div class="empty-state">${icon || defaultIcon}<p>${message}</p></div>`;
}

// ── CONFIRM DIALOG ───────────────────────────────────────────
function confirmDialog(message, onConfirm, confirmText = 'Confirmă', danger = false) {
  openModal('Confirmare', `<p style="font-size:14px;color:var(--text-muted)">${message}</p>`,
    `<button class="btn-secondary" onclick="closeModalForce()">Anulează</button>
     <button class="${danger ? 'btn-danger' : 'btn-primary'}" onclick="(${onConfirm.toString()})();closeModalForce()">${confirmText}</button>`
  );
}

// ── DOC ICON ─────────────────────────────────────────────────
function docIcon(type) {
  const t = (type || '').toLowerCase();
  if (t === 'pdf') return `<div class="doc-icon pdf">PDF</div>`;
  if (['doc', 'docx'].includes(t)) return `<div class="doc-icon doc">DOC</div>`;
  if (['xls', 'xlsx'].includes(t)) return `<div class="doc-icon xls">XLS</div>`;
  return `<div class="doc-icon other">FILE</div>`;
}

// ── SEARCH INPUT ─────────────────────────────────────────────
function searchInput(id, placeholder, onInput) {
  return `
    <div class="search-bar" style="flex:1">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input type="text" id="${id}" class="input" placeholder="${placeholder}" oninput="${onInput}" />
    </div>
  `;
}

// ── PAGINATION ───────────────────────────────────────────────
function paginationHtml(current, total, onPage) {
  if (total <= 1) return '';
  let html = `<div class="flex items-center gap-1 justify-end mt-3">`;
  for (let i = 1; i <= total; i++) {
    html += `<button class="btn-icon ${i === current ? 'active' : ''}" onclick="${onPage}(${i})" style="${i === current ? 'background:var(--brand);color:var(--nero);' : ''}">${i}</button>`;
  }
  html += '</div>';
  return html;
}
