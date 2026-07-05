/**
 * Budget Request Modal
 * Modal pentru cerere ore suplimentare cu justificare
 */

const BudgetRequestModal = {
  // ── OPEN MODAL ─────────────────────────────────────────────────────────
  open(taskId, taskName, currentBudget, consumedHours) {
    const html = `
      <div id="budget-request-modal" style="
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
      " onclick="if(event.target.id === 'budget-request-modal') BudgetRequestModal.close()">
        <div style="
          background: var(--bg);
          border-radius: 12px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          width: 90%;
          max-width: 500px;
          padding: 24px;
          max-height: 90vh;
          overflow-y: auto;
        ">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px">
            <h2 style="margin: 0; font-size: 20px; font-weight: 700">Cerere ore suplimentare</h2>
            <button onclick="BudgetRequestModal.close()" style="
              background: none;
              border: none;
              font-size: 24px;
              cursor: pointer;
              color: var(--text-muted);
            ">×</button>
          </div>

          <div style="background: var(--primary)10; border-left: 4px solid var(--primary); padding: 12px; border-radius: 4px; margin-bottom: 20px">
            <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 4px">Sarcina</div>
            <div style="font-weight: 600; color: var(--text)">${taskName}</div>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 8px">
              Buget: <strong>${currentBudget}h</strong> | Consumat: <strong>${consumedHours}h</strong>
            </div>
          </div>

          <form id="budget-request-form" onsubmit="BudgetRequestModal.handleSubmit(event, '${taskId}')">
            <div style="margin-bottom: 16px">
              <label style="display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px">
                Ore suplimentare solicitate
              </label>
              <input 
                type="number" 
                name="requested_hours" 
                min="1" 
                max="100" 
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
                placeholder="Ex: 10"
              />
            </div>

            <div style="margin-bottom: 16px">
              <label style="display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px">
                Justificare *
              </label>
              <textarea 
                name="justification" 
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
                  resize: vertical;
                  min-height: 100px;
                  font-family: inherit;
                "
                placeholder="De ce ai nevoie de ore suplimentare? (complexitate, probleme neașteptate, etc.)"
              ></textarea>
              <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px">
                Justificarea va fi trimisă adminului/coordonatorului pentru aprobare
              </div>
            </div>

            <div style="display: flex; gap: 12px">
              <button 
                type="button" 
                onclick="BudgetRequestModal.close()"
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
                Trimite cerere
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
  },

  // ── HANDLE SUBMIT ──────────────────────────────────────────────────────
  async handleSubmit(event, taskId) {
    event.preventDefault();

    const form = event.target;
    const requestedHours = parseInt(form.requested_hours.value);
    const justification = form.justification.value.trim();

    if (!requestedHours || !justification) {
      showToast('Completează toate câmpurile', 'error');
      return;
    }

    const result = await NotificationService.createBudgetRequest(
      taskId,
      requestedHours,
      justification
    );

    if (result) {
      this.close();
    }
  },

  // ── CLOSE MODAL ────────────────────────────────────────────────────────
  close() {
    const modal = document.getElementById('budget-request-modal');
    if (modal) {
      modal.remove();
    }
  }
};

// Export
window.BudgetRequestModal = BudgetRequestModal;
