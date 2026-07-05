/**
 * Beneficiary Service
 * Gestionează beneficiarii proiectelor și accesul lor
 */

const BeneficiaryService = {
  // ── INVITE BENEFICIARY ─────────────────────────────────────────────────
  async inviteBeneficiary(projectId, email, name = null) {
    const sb = getSupabase();
    if (!sb) return null;

    try {
      const { data, error } = await sb
        .from('project_beneficiaries')
        .insert({
          project_id: projectId,
          email: email,
          name: name || email.split('@')[0],
          invited_by: Auth.currentProfile?.id,
          status: 'invited'
        })
        .select()
        .single();

      if (error) throw error;

      console.log('[BeneficiaryService] Beneficiar invitat:', data);
      showToast(`Invitație trimisă la ${email}`, 'success');
      return data;
    } catch (err) {
      console.error('[BeneficiaryService] Eroare invite:', err);
      showToast('Eroare la trimiterea invitației: ' + err.message, 'error');
      return null;
    }
  },

  // ── GET PROJECT BENEFICIARIES ──────────────────────────────────────────
  async getBeneficiaries(projectId) {
    const sb = getSupabase();
    if (!sb) return [];

    try {
      const { data, error } = await sb
        .from('project_beneficiaries')
        .select('*')
        .eq('project_id', projectId)
        .order('invited_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('[BeneficiaryService] Eroare get beneficiaries:', err);
      return [];
    }
  },

  // ── GET PROJECT BY ACCESS TOKEN ────────────────────────────────────────
  async getProjectByAccessToken(accessToken) {
    const sb = getSupabase();
    if (!sb) return null;

    try {
      const { data, error } = await sb
        .from('project_beneficiaries')
        .select('project_id, token_expires_at, status')
        .eq('access_token', accessToken)
        .single();

      if (error) throw error;

      // Verific dacă token e expirat
      if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) {
        return null; // Token expirat
      }

      if (data.status === 'expired') {
        return null;
      }

      // Actualizez last_accessed_at
      await sb
        .from('project_beneficiaries')
        .update({ last_accessed_at: new Date().toISOString() })
        .eq('access_token', accessToken);

      return data.project_id;
    } catch (err) {
      console.error('[BeneficiaryService] Eroare get project:', err);
      return null;
    }
  },

  // ── GET PROJECT PROGRESS ───────────────────────────────────────────────
  async getProjectProgress(projectId) {
    const sb = getSupabase();
    if (!sb) return null;

    try {
      const { data: project, error: projectError } = await sb
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (projectError) throw projectError;

      // Obțin faze și sarcini
      const { data: phases, error: phasesError } = await sb
        .from('project_phases')
        .select('*, project_tasks(id, name, budget_hours, minutes_worked)')
        .eq('project_id', projectId)
        .order('start_date', { ascending: true });

      if (phasesError) throw phasesError;

      // Calculez progres
      let totalBudget = 0;
      let totalConsumed = 0;
      let completedTasks = 0;
      let totalTasks = 0;

      phases.forEach(phase => {
        if (phase.project_tasks) {
          phase.project_tasks.forEach(task => {
            totalBudget += task.budget_hours || 0;
            totalConsumed += (task.minutes_worked || 0) / 60;
            totalTasks++;
            if ((task.minutes_worked || 0) >= (task.budget_hours || 0) * 60) {
              completedTasks++;
            }
          });
        }
      });

      const progressPercentage = totalBudget > 0 
        ? Math.round((totalConsumed / totalBudget) * 100)
        : 0;

      return {
        project,
        phases,
        stats: {
          totalBudget,
          totalConsumed,
          progressPercentage,
          completedTasks,
          totalTasks,
          remainingHours: Math.max(0, totalBudget - totalConsumed)
        }
      };
    } catch (err) {
      console.error('[BeneficiaryService] Eroare get progress:', err);
      return null;
    }
  },

  // ── REVOKE ACCESS ──────────────────────────────────────────────────────
  async revokeBeneficiary(beneficiaryId) {
    const sb = getSupabase();
    if (!sb) return false;

    try {
      const { error } = await sb
        .from('project_beneficiaries')
        .update({ status: 'expired' })
        .eq('id', beneficiaryId);

      if (error) throw error;

      console.log('[BeneficiaryService] Acces revocat');
      showToast('Acces revocat', 'success');
      return true;
    } catch (err) {
      console.error('[BeneficiaryService] Eroare revoke:', err);
      showToast('Eroare la revocare: ' + err.message, 'error');
      return false;
    }
  },

  // ── RESEND INVITATION ──────────────────────────────────────────────────
  async resendInvitation(beneficiaryId) {
    const sb = getSupabase();
    if (!sb) return false;

    try {
      const { error } = await sb
        .from('project_beneficiaries')
        .update({ 
          token_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        })
        .eq('id', beneficiaryId);

      if (error) throw error;

      console.log('[BeneficiaryService] Invitație retrimisă');
      showToast('Invitație retrimisă', 'success');
      return true;
    } catch (err) {
      console.error('[BeneficiaryService] Eroare resend:', err);
      showToast('Eroare la retrimisie: ' + err.message, 'error');
      return false;
    }
  }
};

// Export
window.BeneficiaryService = BeneficiaryService;
