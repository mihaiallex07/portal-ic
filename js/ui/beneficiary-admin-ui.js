/**
 * Beneficiary Admin UI
 * Panel admin pentru gestionarea beneficiarilor unui proiect
 */

const BeneficiaryAdminUI = {
  currentProjectId: null,

  // ── RENDER PANEL ───────────────────────────────────────────────────────
  async renderPanel(projectId) {
    this.currentProjectId = projectId;

    const beneficiaries = await BeneficiaryService.getBeneficiaries(projectId);

    const html = `
      <div style="padding: 16px; border-top: 1px solid var(--border)">
        <h3 style="margin: 0 0 16px 0; font-size: 14px; font-weight: 700">Beneficiari</h3>

        <!-- INVITE BUTTON -->
        <button 
          onclick="BeneficiaryAdminUI.openInviteModal('${projectId}')"
          style="
            width: 100%;
            padding: 10px 12px;
            background: var(--primary);
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            font-size: 13px;
            margin-bottom: 16px;
          "
        >
          + Invită beneficiar
        </button>

        <!-- BENEFICIARIES LIST -->
        <div style="display: flex; flex-direction: column; gap: 8px">
          ${beneficiaries.length > 0
            ? beneficiaries.map(b => this.renderBeneficiaryItem(b)).join('')
            : '<div style="color: var(--text-muted); font-size: 12px; text-align: center; padding: 16px">Nu sunt beneficiari invitați</div>'
          }
        </div>
      </div>
    `;

    return html;
  },

  // ── RENDER BENEFICIARY ITEM ────────────────────────────────────────────
  renderBeneficiaryItem(beneficiary) {
    const statusColors = {
      'invited': { bg: '#FEF3C7', text: '#92400E', label: '📧 Invitat' },
      'accepted': { bg: '#DCFCE7', text: '#166534', label: '✅ Acceptat' },
      'expired': { bg: '#FEE2E2', text: '#991B1B', label: '❌ Expirat' }
    };

    const status = statusColors[beneficiary.status] || statusColors.invited;
    const invitedDate = new Date(beneficiary.invited_at).toLocaleDateString('ro-RO');
    const expiresDate = new Date(beneficiary.token_expires_at).toLocaleDateString('ro-RO');

    return `
      <div style="
        padding: 12px;
        background: var(--primary)05;
        border: 1px solid var(--border);
        border-radius: 6px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      ">
        <div style="flex: 1; min-width: 0">
          <div style="font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 2px">
            ${beneficiary.name || beneficiary.email}
          </div>
          <div style="font-size: 11px; color: var(--text-muted)">
            ${beneficiary.email}
          </div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px">
            Invitat: ${invitedDate} | Expira: ${expiresDate}
          </div>
        </div>

        <div style="display: flex; gap: 8px; align-items: center; flex-shrink: 0">
          <span style="
            background: ${status.bg};
            color: ${status.text};
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            white-space: nowrap;
          ">
            ${status.label}
          </span>

          <div style="display: flex; gap: 4px">
            ${beneficiary.status === 'invited' ? `
              <button 
                onclick="BeneficiaryAdminUI.resendInvitation('${beneficiary.id}')"
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
                title="Retrimite invitație"
              >
                🔄
              </button>
            ` : ''}

            <button 
              onclick="BeneficiaryAdminUI.revokeBeneficiary('${beneficiary.id}')"
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
              title="Revocare acces"
            >
              🗑️
            </button>
          </div>
        </div>
      </div>
    `;
  },

  // ── OPEN INVITE MODAL ──────────────────────────────────────────────────
  openInviteModal(projectId) {
    const html = `
      <div id="invite-modal" style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2000;
      " onclick="if(event.target.id === 'invite-modal') BeneficiaryAdminUI.closeInviteModal()">
        <div style="
          background: var(--bg);
          border-radius: 12px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          width: 90%;
          max-width: 400px;
          padding: 24px;
        ">
          <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 700">Invită beneficiar</h2>

          <form id="invite-form" onsubmit="BeneficiaryAdminUI.handleInviteSubmit(event, '${projectId}')">
            <div style="margin-bottom: 16px">
              <label style="display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px">
                Email beneficiar
              </label>
              <input 
                type="email" 
                name="email" 
                required
                style="
                  width: 100%;
                  padding: 10px 12px;
                  border: 1px solid var(--border);
                  border-radius: 6px;
                  font-size: 14px;
                  background: var(--bg);
                  color: var(--text);
                  box-sizing: border-box;
                "
                placeholder="beneficiar@example.com"
              />
            </div>

            <div style="margin-bottom: 16px">
              <label style="display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px">
                Nume (opțional)
              </label>
              <input 
                type="text" 
                name="name"
                style="
                  width: 100%;
                  padding: 10px 12px;
                  border: 1px solid var(--border);
                  border-radius: 6px;
                  font-size: 14px;
                  background: var(--bg);
                  color: var(--text);
                  box-sizing: border-box;
                "
                placeholder="Nume beneficiar"
              />
            </div>

            <div style="display: flex; gap: 12px">
              <button 
                type="button" 
                onclick="BeneficiaryAdminUI.closeInviteModal()"
                style="
                  flex: 1;
                  padding: 10px 16px;
                  border: 1px solid var(--border);
                  background: transparent;
                  color: var(--text);
                  border-radius: 6px;
                  cursor: pointer;
                  font-weight: 600;
                  font-size: 14px;
                "
              >
                Anulează
              </button>
              <button 
                type="submit"
                style="
                  flex: 1;
                  padding: 10px 16px;
                  border: none;
                  background: var(--primary);
                  color: white;
                  border-radius: 6px;
                  cursor: pointer;
                  font-weight: 600;
                  font-size: 14px;
                "
              >
                Trimite invitație
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  },

  // ── HANDLE INVITE SUBMIT ───────────────────────────────────────────────
  async handleInviteSubmit(event, projectId) {
    event.preventDefault();

    const form = event.target;
    const email = form.email.value.trim();
    const name = form.name.value.trim() || null;

    if (!email) {
      showToast('Introdu email-ul beneficiarului', 'error');
      return;
    }

    const result = await BeneficiaryService.inviteBeneficiary(projectId, email, name);

    if (result) {
      this.closeInviteModal();
      // Reîncarcă panelul
      const panel = document.querySelector('[data-beneficiary-panel]');
      if (panel) {
        panel.innerHTML = await this.renderPanel(projectId);
      }
    }
  },

  // ── CLOSE INVITE MODAL ─────────────────────────────────────────────────
  closeInviteModal() {
    const modal = document.getElementById('invite-modal');
    if (modal) modal.remove();
  },

  // ── REVOKE BENEFICIARY ─────────────────────────────────────────────────
  async revokeBeneficiary(beneficiaryId) {
    if (!confirm('Ești sigur că vrei să revocare accesul?')) return;

    const result = await BeneficiaryService.revokeBeneficiary(beneficiaryId);
    if (result) {
      // Reîncarcă panelul
      const panel = document.querySelector('[data-beneficiary-panel]');
      if (panel) {
        panel.innerHTML = await this.renderPanel(this.currentProjectId);
      }
    }
  },

  // ── RESEND INVITATION ──────────────────────────────────────────────────
  async resendInvitation(beneficiaryId) {
    const result = await BeneficiaryService.resendInvitation(beneficiaryId);
    if (result) {
      // Reîncarcă panelul
      const panel = document.querySelector('[data-beneficiary-panel]');
      if (panel) {
        panel.innerHTML = await this.renderPanel(this.currentProjectId);
      }
    }
  }
};

// Export
window.BeneficiaryAdminUI = BeneficiaryAdminUI;
