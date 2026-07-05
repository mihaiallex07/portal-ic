/**
 * Beneficiari Public Module
 * Pagina publică pentru beneficiari (stil Passive House Buildings)
 * URL: /beneficiari/{projectId}/{accessToken}
 */

const BeneficiariPublic = {
  projectId: null,
  accessToken: null,
  projectData: null,

  // ── INIT ───────────────────────────────────────────────────────────────
  async init(projectId, accessToken) {
    this.projectId = projectId;
    this.accessToken = accessToken;

    console.log('[BeneficiariPublic] Init cu token:', accessToken);

    // Verific token
    const validProjectId = await BeneficiaryService.getProjectByAccessToken(accessToken);
    if (!validProjectId || validProjectId !== projectId) {
      this.renderAccessDenied();
      return;
    }

    // Încarcă date proiect
    await this.loadProjectData();
    this.render();
  },

  // ── LOAD PROJECT DATA ──────────────────────────────────────────────────
  async loadProjectData() {
    this.projectData = await BeneficiaryService.getProjectProgress(this.projectId);
  },

  // ── RENDER ACCESS DENIED ───────────────────────────────────────────────
  renderAccessDenied() {
    const html = `
      <div style="
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
        padding: 20px;
      ">
        <div style="
          background: white;
          border-radius: 12px;
          padding: 40px;
          text-align: center;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
          max-width: 500px;
        ">
          <div style="font-size: 64px; margin-bottom: 16px">🔒</div>
          <h1 style="margin: 0 0 12px 0; font-size: 24px; color: #1f2937">Acces Refuzat</h1>
          <p style="margin: 0 0 24px 0; color: #6b7280; font-size: 14px; line-height: 1.6">
            Link-ul de acces a expirat sau nu este valid. Contactează administratorul proiectului pentru o nouă invitație.
          </p>
          <a href="/" style="
            display: inline-block;
            background: #3b82f6;
            color: white;
            padding: 12px 24px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: 600;
          ">
            Înapoi la pagina principală
          </a>
        </div>
      </div>
    `;

    document.body.innerHTML = html;
  },

  // ── RENDER PAGE ────────────────────────────────────────────────────────
  render() {
    if (!this.projectData) {
      document.body.innerHTML = '<div style="padding: 20px; text-align: center">Eroare la încărcarea datelor</div>';
      return;
    }

    const { project, phases, stats } = this.projectData;

    const html = `
      <div style="background: #f9fafb; min-height: 100vh">
        <!-- HEADER -->
        <div style="
          background: white;
          border-bottom: 1px solid #e5e7eb;
          padding: 24px 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        ">
          <div style="max-width: 1200px; margin: 0 auto">
            <h1 style="margin: 0 0 8px 0; font-size: 28px; font-weight: 700; color: #1f2937">
              ${project.name}
            </h1>
            <p style="margin: 0; color: #6b7280; font-size: 14px">
              Client: <strong>${project.client || 'N/A'}</strong>
            </p>
          </div>
        </div>

        <!-- MAIN CONTENT -->
        <div style="max-width: 1200px; margin: 0 auto; padding: 40px 20px">
          <!-- PROGRESS SECTION -->
          <div style="
            background: white;
            border-radius: 12px;
            padding: 32px;
            margin-bottom: 32px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          ">
            <h2 style="margin: 0 0 24px 0; font-size: 18px; font-weight: 700; color: #1f2937">
              Progres Proiect
            </h2>

            <!-- PROGRESS BAR -->
            <div style="margin-bottom: 24px">
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px">
                <span style="font-size: 14px; color: #6b7280">Progres general</span>
                <span style="font-size: 16px; font-weight: 700; color: #1f2937">
                  ${stats.progressPercentage}%
                </span>
              </div>
              <div style="
                width: 100%;
                height: 8px;
                background: #e5e7eb;
                border-radius: 4px;
                overflow: hidden;
              ">
                <div style="
                  width: ${stats.progressPercentage}%;
                  height: 100%;
                  background: linear-gradient(90deg, #3b82f6 0%, #1d4ed8 100%);
                  transition: width 0.3s ease;
                "></div>
              </div>
            </div>

            <!-- STATS GRID -->
            <div style="
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
              gap: 16px;
            ">
              <div style="
                background: #f0f9ff;
                border-left: 4px solid #3b82f6;
                padding: 16px;
                border-radius: 6px;
              ">
                <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px">Ore Bugetate</div>
                <div style="font-size: 24px; font-weight: 700; color: #1f2937">
                  ${Math.round(stats.totalBudget)}h
                </div>
              </div>

              <div style="
                background: #f0fdf4;
                border-left: 4px solid #10b981;
                padding: 16px;
                border-radius: 6px;
              ">
                <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px">Ore Consumate</div>
                <div style="font-size: 24px; font-weight: 700; color: #1f2937">
                  ${Math.round(stats.totalConsumed)}h
                </div>
              </div>

              <div style="
                background: #fef3c7;
                border-left: 4px solid #f59e0b;
                padding: 16px;
                border-radius: 6px;
              ">
                <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px">Ore Rămase</div>
                <div style="font-size: 24px; font-weight: 700; color: #1f2937">
                  ${Math.round(stats.remainingHours)}h
                </div>
              </div>

              <div style="
                background: #f3f4f6;
                border-left: 4px solid #6b7280;
                padding: 16px;
                border-radius: 6px;
              ">
                <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px">Sarcini Completate</div>
                <div style="font-size: 24px; font-weight: 700; color: #1f2937">
                  ${stats.completedTasks}/${stats.totalTasks}
                </div>
              </div>
            </div>
          </div>

          <!-- PHASES SECTION -->
          <div style="
            background: white;
            border-radius: 12px;
            padding: 32px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          ">
            <h2 style="margin: 0 0 24px 0; font-size: 18px; font-weight: 700; color: #1f2937">
              Etape și Sarcini
            </h2>

            <div style="display: flex; flex-direction: column; gap: 16px">
              ${phases.map(phase => this.renderPhaseCard(phase)).join('')}
            </div>
          </div>
        </div>

        <!-- FOOTER -->
        <div style="
          background: white;
          border-top: 1px solid #e5e7eb;
          padding: 24px 20px;
          text-align: center;
          color: #6b7280;
          font-size: 13px;
        ">
          <p style="margin: 0">
            Pentru întrebări, contactează administratorul proiectului.
          </p>
        </div>
      </div>
    `;

    document.body.innerHTML = html;
  },

  // ── RENDER PHASE CARD ──────────────────────────────────────────────────
  renderPhaseCard(phase) {
    const tasks = phase.project_tasks || [];
    const phaseBudget = tasks.reduce((sum, t) => sum + (t.budget_hours || 0), 0);
    const phaseConsumed = tasks.reduce((sum, t) => sum + ((t.minutes_worked || 0) / 60), 0);
    const phaseProgress = phaseBudget > 0 ? Math.round((phaseConsumed / phaseBudget) * 100) : 0;

    return `
      <div style="
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        overflow: hidden;
      ">
        <!-- PHASE HEADER -->
        <div style="
          background: #f3f4f6;
          padding: 16px;
          border-bottom: 1px solid #e5e7eb;
        ">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px">
            <h3 style="margin: 0; font-size: 15px; font-weight: 600; color: #1f2937">
              ${phase.name}
            </h3>
            <span style="
              background: #dbeafe;
              color: #1e40af;
              padding: 4px 12px;
              border-radius: 12px;
              font-size: 12px;
              font-weight: 600;
            ">
              ${phaseProgress}%
            </span>
          </div>

          <!-- MINI PROGRESS BAR -->
          <div style="
            width: 100%;
            height: 4px;
            background: #e5e7eb;
            border-radius: 2px;
            overflow: hidden;
          ">
            <div style="
              width: ${phaseProgress}%;
              height: 100%;
              background: #3b82f6;
              transition: width 0.3s ease;
            "></div>
          </div>
        </div>

        <!-- TASKS LIST -->
        <div style="padding: 16px">
          ${tasks.length > 0 
            ? tasks.map(task => this.renderTaskItem(task)).join('')
            : '<div style="color: #9ca3af; font-size: 13px">Nu sunt sarcini</div>'
          }
        </div>
      </div>
    `;
  },

  // ── RENDER TASK ITEM ───────────────────────────────────────────────────
  renderTaskItem(task) {
    const taskProgress = task.budget_hours > 0 
      ? Math.round(((task.minutes_worked || 0) / 60 / task.budget_hours) * 100)
      : 0;
    const consumed = Math.round((task.minutes_worked || 0) / 60);

    return `
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 0;
        border-bottom: 1px solid #f3f4f6;
      ">
        <div style="flex: 1">
          <div style="font-size: 13px; color: #1f2937; margin-bottom: 4px">
            ${task.name}
          </div>
          <div style="font-size: 12px; color: #6b7280">
            ${consumed}h / ${task.budget_hours}h
          </div>
        </div>
        <div style="
          background: ${taskProgress >= 100 ? '#dcfce7' : '#f3f4f6'};
          color: ${taskProgress >= 100 ? '#166534' : '#6b7280'};
          padding: 4px 12px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
        ">
          ${taskProgress}%
        </div>
      </div>
    `;
  }
};

// Export
window.BeneficiariPublic = BeneficiariPublic;
