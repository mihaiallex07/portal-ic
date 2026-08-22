// ============================================================
// Data Service — Portal Inginerie Creativă
// Date demo + query-uri Supabase pentru toate modulele
// ============================================================

const DB = {
  // ── DEMO DATA ──────────────────────────────────────────────

  demo: {
    projects: [
      { id: 1, name: 'Clădire Rezidențială Floreasca', code: 'IC-2024-001', abbreviation: 'CRF', emoji: '🏢', client_name: 'Invest Construct SRL', status: 'activ', color: '#FFCB09', start_date: '2024-03-01', end_date: '2025-06-30', budget_hours: 1200, used_hours: 680, description: 'Proiect rezidențial P+8 etaje, 48 apartamente', phases: ['Proiect tehnic', 'Detalii execuție', 'Asistență tehnică'] },
      { id: 2, name: 'Hală Industrială Chitila', code: 'IC-2024-002', abbreviation: 'HIC', emoji: '🏭', client_name: 'MetalProd SA', status: 'activ', color: '#3b82f6', start_date: '2024-06-01', end_date: '2025-03-31', budget_hours: 800, used_hours: 320, description: 'Hală producție metalică 5000 mp', phases: ['SF', 'PT', 'DTAC'] },
      { id: 3, name: 'Sediu Administrativ Pipera', code: 'IC-2024-003', abbreviation: 'SAP', emoji: '🏛️', client_name: 'TechHub Romania', status: 'activ', color: '#10b981', start_date: '2024-09-01', end_date: '2025-12-31', budget_hours: 2000, used_hours: 450, description: 'Clădire birouri S+P+6E, certificare BREEAM', phases: ['Concept', 'PT', 'DDE', 'AT'] },
      { id: 4, name: 'Complex Sportiv Voluntari', code: 'IC-2023-008', abbreviation: 'CSV', emoji: '🏟️', client_name: 'Primăria Voluntari', status: 'finalizat', color: '#6b7280', start_date: '2023-01-01', end_date: '2024-02-28', budget_hours: 1500, used_hours: 1487, description: 'Sală polivalentă 2000 locuri', phases: ['PT', 'DDE'] },
    ],

    projectTasks: [
      { id: 1, project_id: 1, name: 'Planșe arhitectură etaj 1-4', assigned_to: 'demo-user-001', status: 'in_progress', budget_hours: 80, used_hours: 45, due_date: '2025-02-28' },
      { id: 2, project_id: 1, name: 'Calcul structură fundații', assigned_to: 'demo-user-001', status: 'done', budget_hours: 40, used_hours: 38, due_date: '2025-01-15' },
      { id: 3, project_id: 2, name: 'Proiect instalații electrice', assigned_to: 'demo-user-001', status: 'todo', budget_hours: 60, used_hours: 0, due_date: '2025-03-15' },
      { id: 4, project_id: 3, name: 'Concept arhitectural', assigned_to: 'demo-user-001', status: 'in_progress', budget_hours: 120, used_hours: 55, due_date: '2025-02-01' },
    ],

    timeEntries: [
      { id: 1, user_id: 'demo-user-001', date: getTodayStr(), start_hour: 9, start_min: 0, duration_minutes: 120, task_name: 'Planșe arhitectură etaj 2', activity_type: 'proiectare', project_id: 1, task_id: 1, count_in_time: true },
      { id: 2, user_id: 'demo-user-001', date: getTodayStr(), start_hour: 11, start_min: 30, duration_minutes: 60, task_name: 'Ședință echipă proiect CRF', activity_type: 'administrativ', project_id: 1, task_id: null, count_in_time: false },
      { id: 3, user_id: 'demo-user-001', date: getTodayStr(), start_hour: 13, start_min: 0, duration_minutes: 90, task_name: 'Calcul structură hală', activity_type: 'proiectare', project_id: 2, task_id: 3, count_in_time: true },
      { id: 4, user_id: 'demo-user-001', date: getDateStr(-1), start_hour: 9, start_min: 0, duration_minutes: 240, task_name: 'Concept arhitectural SAP', activity_type: 'proiectare', project_id: 3, task_id: 4, count_in_time: true },
      { id: 5, user_id: 'demo-user-001', date: getDateStr(-1), start_hour: 14, start_min: 0, duration_minutes: 60, task_name: 'Revizuire documentație', activity_type: 'administrativ', project_id: null, task_id: null, count_in_time: false },
    ],

    news: [
      { id: 1, title: 'Lansarea noului portal intern IC', excerpt: 'Portalul intern Inginerie Creativă a fost modernizat complet. Acum beneficiezi de time-tracking integrat, vizualizare proiecte și acces rapid la toate documentele companiei.', content: 'Portalul intern Inginerie Creativă a fost modernizat complet. Acum beneficiezi de time-tracking integrat, vizualizare proiecte și acces rapid la toate documentele companiei.\n\nPrincipalele noutăți:\n- Time-tracking integrat cu proiectele\n- Process Overview tip Gantt\n- Documente accesibile direct din portal\n- Notificări în timp real', category: 'companie', is_pinned: true, author_name: 'Management IC', created_at: new Date().toISOString() },
      { id: 2, title: 'Proiectul Floreasca — etapa 2 aprobată', excerpt: 'Clientul Invest Construct SRL a aprobat documentația pentru etapa 2 a proiectului rezidențial Floreasca. Echipa poate trece la detaliile de execuție.', content: 'Clientul Invest Construct SRL a aprobat documentația pentru etapa 2 a proiectului rezidențial Floreasca.', category: 'proiecte', is_pinned: false, author_name: 'Mihai Ionescu', created_at: new Date(Date.now() - 86400000).toISOString() },
      { id: 3, title: 'Teambuilding — 15 Martie 2025', excerpt: 'Vă invităm la teambuilding-ul anual IC, programat pe 15 martie 2025. Detalii despre locație și program vor fi comunicate săptămâna viitoare.', content: 'Vă invităm la teambuilding-ul anual IC, programat pe 15 martie 2025.', category: 'hr', is_pinned: false, author_name: 'HR Inginerie Creativă', created_at: new Date(Date.now() - 172800000).toISOString() },
      { id: 4, title: 'Actualizare proceduri ISO 9001', excerpt: 'Procedurile de calitate au fost actualizate conform noilor cerințe ISO 9001:2015. Vă rugăm să consultați documentele actualizate în secțiunea Procese & Proceduri.', content: 'Procedurile de calitate au fost actualizate.', category: 'companie', is_pinned: false, author_name: 'Responsabil Calitate', created_at: new Date(Date.now() - 259200000).toISOString() },
    ],

    documents: [
      { id: 1, name: 'Regulament Intern IC 2025.pdf', type: 'pdf', category: 'regulament', size: '2.4 MB', url: '#', drive_url: null, uploaded_by: 'Admin IC', created_at: '2025-01-10T10:00:00Z' },
      { id: 2, name: 'Procedura Proiectare Arhitecturală v3.pdf', type: 'pdf', category: 'proceduri', size: '1.8 MB', url: '#', drive_url: null, uploaded_by: 'Responsabil Calitate', created_at: '2025-01-05T09:00:00Z' },
      { id: 3, name: 'Contract cadru prestări servicii.docx', type: 'doc', category: 'contracte', size: '340 KB', url: '#', drive_url: null, uploaded_by: 'Juridic', created_at: '2024-12-20T14:00:00Z' },
      { id: 4, name: 'Pontaj Template Lunar.xlsx', type: 'xls', category: 'formulare', size: '85 KB', url: '#', drive_url: null, uploaded_by: 'HR', created_at: '2024-12-15T11:00:00Z' },
      { id: 5, name: 'Ghid Utilizare Portal IC.pdf', type: 'pdf', category: 'ghiduri', size: '1.2 MB', url: '#', drive_url: null, uploaded_by: 'IT', created_at: '2025-01-12T08:00:00Z' },
    ],

    processes: [
      { id: 1, title: 'Procedura de Proiectare Arhitecturală', code: 'PRC-001', version: '3.0', category: 'proiectare', description: 'Definește pașii și responsabilitățile în procesul de proiectare arhitecturală de la concept la detalii de execuție.', status: 'activ', updated_at: '2025-01-05T09:00:00Z' },
      { id: 2, title: 'Procedura de Control Calitate', code: 'PRC-002', version: '2.1', category: 'calitate', description: 'Procesul de verificare și validare a documentației tehnice conform ISO 9001.', status: 'activ', updated_at: '2024-12-10T10:00:00Z' },
      { id: 3, title: 'Procedura de Relație cu Clienții', code: 'PRC-003', version: '1.5', category: 'comercial', description: 'Gestionarea relației cu clienții de la ofertare până la recepția finală.', status: 'activ', updated_at: '2024-11-20T14:00:00Z' },
      { id: 4, title: 'Procedura de Arhivare Documente', code: 'PRC-004', version: '2.0', category: 'administrativ', description: 'Reguli de arhivare fizică și digitală a documentelor tehnice și administrative.', status: 'activ', updated_at: '2024-10-15T09:00:00Z' },
    ],

    proposals: [
      { id: 1, title: 'Implementare sistem BIM pentru proiecte mari', description: 'Propun adoptarea Revit/BIM 360 pentru proiectele cu suprafață > 2000 mp. Ar reduce erorile de coordonare și ar îmbunătăți colaborarea cu antreprenorii.', author_name: 'Andrei Popa', status: 'in_review', votes_for: 8, votes_against: 2, created_at: '2025-01-08T10:00:00Z', user_voted: null },
      { id: 2, title: 'Program de lucru flexibil 4 zile/săptămână', description: 'Pilot de 3 luni cu program comprimat: 4 zile × 10 ore. Studiile arată creșterea productivității cu 15-20%.', author_name: 'Maria Ionescu', status: 'in_review', votes_for: 12, votes_against: 5, created_at: '2025-01-03T09:00:00Z', user_voted: null },
      { id: 3, title: 'Cursuri de formare AutoCAD avansat', description: 'Organizarea de cursuri interne de AutoCAD Civil 3D pentru echipa de structuri. Estimat 2 zile × 8 ore.', author_name: 'Ion Dumitrescu', status: 'aprobat', votes_for: 15, votes_against: 1, created_at: '2024-12-20T14:00:00Z', user_voted: 'for' },
    ],

    users: [
      { id: 'demo-user-001', full_name: 'Demo Utilizator', email: 'demo@inginerie-creativa.ro', role: 'admin', department: 'Management', position: 'Administrator', phone: '+40 700 000 000', avatar_url: null },
      { id: 'u002', full_name: 'Mihai Ionescu', email: 'mihai.ionescu@inginerie-creativa.ro', role: 'coordonator', department: 'Arhitectură', position: 'Arhitect Șef', phone: '+40 721 000 001', avatar_url: null },
      { id: 'u003', full_name: 'Andrei Popa', email: 'andrei.popa@inginerie-creativa.ro', role: 'angajat', department: 'Structuri', position: 'Inginer Structurist', phone: '+40 721 000 002', avatar_url: null },
      { id: 'u004', full_name: 'Maria Ionescu', email: 'maria.ionescu@inginerie-creativa.ro', role: 'angajat', department: 'Instalații', position: 'Inginer Instalații', phone: '+40 721 000 003', avatar_url: null },
      { id: 'u005', full_name: 'Ion Dumitrescu', email: 'ion.dumitrescu@inginerie-creativa.ro', role: 'angajat', department: 'Arhitectură', position: 'Arhitect', phone: '+40 721 000 004', avatar_url: null },
      { id: 'u006', full_name: 'Elena Constantin', email: 'elena.constantin@inginerie-creativa.ro', role: 'angajat', department: 'Management', position: 'Manager Proiecte', phone: '+40 721 000 005', avatar_url: null },
    ],

    events: [
      { id: 1, title: 'Ședință proiect Floreasca', date: getTodayStr(), start_time: '10:00', end_time: '11:30', type: 'sedinta', description: 'Revizuire planșe etaj 3-4', project_id: 1 },
      { id: 2, title: 'Prezentare client MetalProd', date: getDateStr(2), start_time: '14:00', end_time: '15:00', type: 'prezentare', description: 'Prezentare concept hală industrială', project_id: 2 },
      { id: 3, title: 'Teambuilding IC 2025', date: getDateStr(30), start_time: '09:00', end_time: '18:00', type: 'eveniment', description: 'Teambuilding anual companie', project_id: null },
    ],

    notifications: [
      { id: 1, title: 'Proiect nou atribuit', message: 'Ai fost adăugat în echipa proiectului "Sediu Administrativ Pipera"', type: 'info', read: false, created_at: new Date(Date.now() - 3600000).toISOString() },
      { id: 2, title: 'Propunere aprobată', message: 'Propunerea "Cursuri AutoCAD avansat" a fost aprobată de management', type: 'success', read: false, created_at: new Date(Date.now() - 7200000).toISOString() },
      { id: 3, title: 'Deadline aproape', message: 'Task-ul "Planșe arhitectură etaj 1-4" are deadline în 3 zile', type: 'warning', read: true, created_at: new Date(Date.now() - 86400000).toISOString() },
    ],

    orgChart: {
      name: 'Inginerie Creativă SRL',
      position: 'Companie',
      role: 'admin',
      children: [
        {
          name: 'Mihai Ionescu',
          position: 'Arhitect Șef',
          department: 'Arhitectură',
          children: [
            { name: 'Ion Dumitrescu', position: 'Arhitect', department: 'Arhitectură', children: [] },
          ]
        },
        {
          name: 'Andrei Popa',
          position: 'Inginer Structurist',
          department: 'Structuri',
          children: []
        },
        {
          name: 'Maria Ionescu',
          position: 'Inginer Instalații',
          department: 'Instalații',
          children: []
        },
        {
          name: 'Elena Constantin',
          position: 'Manager Proiecte',
          department: 'Management',
          children: []
        },
      ]
    },
  },

  // ── SUPABASE QUERIES ────────────────────────────────────────

  async getProjects() {
    return dbQuery('projects', q => q.select('*').order('created_at', { ascending: false }), this.demo.projects);
  },

  async getProjectById(id) {
    const { data } = await this.getProjects();
    if (APP_CONFIG.demoMode) return data.find(p => p.id === id) || null;
    return dbQuery('projects', q => q.select('*').eq('id', id).single(), null);
  },

  async getProjectTasks(projectId) {
    if (APP_CONFIG.demoMode) {
      const tasks = projectId
        ? this.demo.projectTasks.filter(t => t.project_id === projectId)
        : this.demo.projectTasks;
      return { data: tasks };
    }
    return dbQuery('project_tasks', q => q.select('*').eq('project_id', projectId).order('created_at'), []);
  },

  async createProject(project) {
    if (APP_CONFIG.demoMode) {
      const newP = { ...project, id: Date.now(), used_hours: 0, created_at: new Date().toISOString() };
      this.demo.projects.unshift(newP);
      return { data: newP, error: null };
    }
    return dbQuery('projects', q => q.insert(project).select().single(), null);
  },

  async getTimeEntries(userId, dateFrom, dateTo) {
    if (APP_CONFIG.demoMode) {
      let entries = this.demo.timeEntries.filter(e => e.user_id === userId || userId === 'all');
      if (dateFrom) entries = entries.filter(e => e.date >= dateFrom);
      if (dateTo) entries = entries.filter(e => e.date <= dateTo);
      return { data: entries };
    }
    const sb = getSupabase();
    let q = sb.from('time_entries').select('*, projects(name,color)').eq('user_id', userId);
    if (dateFrom) q = q.gte('date', dateFrom);
    if (dateTo) q = q.lte('date', dateTo);
    return q.order('date', { ascending: false });
  },

  async createTimeEntry(entry) {
    if (APP_CONFIG.demoMode) {
      const newE = { ...entry, id: Date.now(), created_at: new Date().toISOString() };
      this.demo.timeEntries.push(newE);
      // Actualizează ore folosite pe task
      if (entry.task_id && entry.count_in_time) {
        const task = this.demo.projectTasks.find(t => t.id === entry.task_id);
        if (task) task.used_hours += Math.round(entry.duration_minutes / 60 * 10) / 10;
      }
      return { data: newE, error: null };
    }
    return dbQuery('time_entries', q => q.insert(entry).select().single(), null);
  },

  async deleteTimeEntry(id) {
    if (APP_CONFIG.demoMode) {
      const idx = this.demo.timeEntries.findIndex(e => e.id === id);
      if (idx > -1) this.demo.timeEntries.splice(idx, 1);
      return { error: null };
    }
    const sb = getSupabase();
    return sb.from('time_entries').delete().eq('id', id);
  },

  async getNews(category) {
    if (APP_CONFIG.demoMode) {
      let news = [...this.demo.news];
      if (category && category !== 'toate') news = news.filter(n => n.category === category);
      return { data: news };
    }
    return dbQuery('news', q => {
      let q2 = q.select('*, profiles(full_name,avatar_url)').order('is_pinned', { ascending: false }).order('created_at', { ascending: false });
      if (category && category !== 'toate') q2 = q2.eq('category', category);
      return q2;
    }, this.demo.news);
  },

  async createNews(item) {
    if (APP_CONFIG.demoMode) {
      const newN = { ...item, id: Date.now(), created_at: new Date().toISOString() };
      this.demo.news.unshift(newN);
      return { data: newN, error: null };
    }
    return dbQuery('news', q => q.insert(item).select().single(), null);
  },

  async updateNews(id, updates) {
    if (APP_CONFIG.demoMode) {
      const idx = this.demo.news.findIndex(n => n.id === id);
      if (idx !== -1) Object.assign(this.demo.news[idx], updates);
      return { error: null };
    }
    return dbQuery('news', q => q.update(updates).eq('id', id), null);
  },

  async deleteNews(id) {
    if (APP_CONFIG.demoMode) {
      this.demo.news = this.demo.news.filter(n => n.id !== id);
      return { error: null };
    }
    return dbQuery('news', q => q.delete().eq('id', id), null);
  },

  async getDocuments(category) {
    if (APP_CONFIG.demoMode) {
      let docs = [...this.demo.documents];
      if (category && category !== 'toate') docs = docs.filter(d => d.category === category);
      return { data: docs };
    }
    return dbQuery('documents', q => {
      let q2 = q.select('*').order('created_at', { ascending: false });
      if (category && category !== 'toate') q2 = q2.eq('category', category);
      return q2;
    }, this.demo.documents);
  },

  async getProcesses(category) {
    if (APP_CONFIG.demoMode) {
      let procs = [...this.demo.processes];
      if (category && category !== 'toate') procs = procs.filter(p => p.category === category);
      return { data: procs };
    }
    return dbQuery('processes', q => q.select('*').order('code'), this.demo.processes);
  },

  async getProposals() {
    if (APP_CONFIG.demoMode) return { data: this.demo.proposals };
    const currentId = Auth.currentUser?.id || Auth.currentProfile?.id || null;
    const role = Auth.currentProfile?.role;
    return dbQuery('proposals', q => {
      let query = q.select('*,profiles!proposals_author_id_fkey(full_name,avatar_url),manager:profiles!proposals_manager_id_fkey(full_name,avatar_url)').order('created_at', { ascending: false });
      if (currentId && !['admin', 'coordonator', 'coordinator', 'coord'].includes(role)) {
        query = query.eq('author_id', currentId);
      } else if (currentId && ['coordonator', 'coordinator', 'coord'].includes(role)) {
        query = query.or(`author_id.eq.${currentId},manager_id.eq.${currentId}`);
      }
      return query;
    }, this.demo.proposals);
  },

  async voteProposal(proposalId, vote) {
    if (APP_CONFIG.demoMode) {
      const p = this.demo.proposals.find(p => p.id === proposalId);
      if (p) {
        if (p.user_voted === vote) {
          // Undo vote
          if (vote === 'for') p.votes_for--;
          else p.votes_against--;
          p.user_voted = null;
        } else {
          if (p.user_voted === 'for') p.votes_for--;
          if (p.user_voted === 'against') p.votes_against--;
          if (vote === 'for') p.votes_for++;
          else p.votes_against++;
          p.user_voted = vote;
        }
      }
      return { error: null };
    }
    // Supabase: upsert în proposal_votes
    const sb = getSupabase();
    const userId = Auth.currentUser?.id;
    return sb.from('proposal_votes').upsert({ proposal_id: proposalId, user_id: userId, vote });
  },

  async createProposal(proposal) {
    const safeProposal = {
      reference_number: proposal.reference_number || `PROP-${new Date().getFullYear()}-${Date.now()}`,
      status: proposal.status || 'in_review',
      ...proposal,
    };
    if (APP_CONFIG.demoMode) {
      const newP = { ...safeProposal, id: Date.now(), votes_for: 0, votes_against: 0, user_voted: null, author_name: Auth.currentProfile?.full_name, created_at: new Date().toISOString() };
      this.demo.proposals.unshift(newP);
      return { data: newP, error: null };
    }
    return dbQuery('proposals', q => q.insert(safeProposal).select().single(), null);
  },

  async getProposalProjectMemberships(userId) {
    if (APP_CONFIG.demoMode) return { data: [] };
    return dbQuery('project_members', q => q.select('project_id,user_id,projects(id,name,manager_id,status)').eq('user_id', userId), []);
  },

  async updateProposalStatus(proposalId, status) {
    if (APP_CONFIG.demoMode) {
      const proposal = this.demo.proposals.find(p => String(p.id) === String(proposalId));
      if (proposal) proposal.status = status;
      return { data: proposal || null, error: null };
    }
    return dbQuery('proposals', q => q.update({ status }).eq('id', proposalId).select().single(), null);
  },

  async createNotifications(notifications) {
    if (!Array.isArray(notifications) || notifications.length === 0) return { data: [], error: null };
    if (APP_CONFIG.demoMode) return { data: notifications, error: null };
    const sb = getSupabase();
    return sb.from('notifications').insert(notifications);
  },

  async getUsers() {
    if (APP_CONFIG.demoMode) return { data: this.demo.users };
    return dbQuery('profiles', q => q.select('*').order('full_name'), this.demo.users);
  },

  async getEvents(month, year) {
    if (APP_CONFIG.demoMode) return { data: this.demo.events };
    return dbQuery('events', q => q.select('*').order('date').order('start_time'), this.demo.events);
  },

  async createEvent(event) {
    if (APP_CONFIG.demoMode) {
      const newE = { ...event, id: Date.now(), created_at: new Date().toISOString() };
      this.demo.events.push(newE);
      return { data: newE, error: null };
    }
    return dbQuery('events', q => q.insert(event).select().single(), null);
  },

    async getNotifications(userId) {
    if (APP_CONFIG.demoMode) return { data: this.demo.notifications };
    return dbQuery('notifications', q => q.select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50), this.demo.notifications);
  },
  async markNotificationRead(id) {
    if (APP_CONFIG.demoMode) {
      const n = this.demo.notifications.find(n => n.id === id);
      if (n) { n.read = true; n.is_read = true; }
      return { error: null };
    }
    const sb = getSupabase();
    return sb.from('notifications').update({ is_read: true }).eq('id', id);
  },
  async markAllNotificationsRead(userId) {
    if (APP_CONFIG.demoMode) {
      this.demo.notifications.forEach(n => { n.read = true; n.is_read = true; });
      return { error: null };
    }
    const sb = getSupabase();
    return sb.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
  },
  // Budget Requests
  async getBudgetRequests(filters = {}) {
    if (APP_CONFIG.demoMode) return { data: [] };
    return dbQuery('budget_requests', q => {
      let query = q.select('*, project_tasks(name, project_id, budget_hours, minutes_worked), profiles!budget_requests_user_id_fkey(full_name, email)');
      if (filters.userId) query = query.eq('user_id', filters.userId);
      if (filters.taskId) query = query.eq('task_id', filters.taskId);
      if (filters.status) query = query.eq('status', filters.status);
      return query.order('created_at', { ascending: false });
    }, []);
  },
  async createBudgetRequest(req) {
    if (APP_CONFIG.demoMode) return { error: null };
    const sb = getSupabase();
    return sb.from('budget_requests').insert(req).select().single();
  },
  async updateBudgetRequest(id, updates) {
    if (APP_CONFIG.demoMode) return { error: null };
    const sb = getSupabase();
    return sb.from('budget_requests').update(updates).eq('id', id).select().single();
  },
  // Beneficiari
  async getProjectBeneficiaries(projectId) {
    if (APP_CONFIG.demoMode) return { data: [] };
    return dbQuery('project_beneficiaries', q => q.select('*').eq('project_id', projectId).order('created_at', { ascending: false }), []);
  },
  async inviteBeneficiary(data) {
    if (APP_CONFIG.demoMode) return { error: null };
    const sb = getSupabase();
    return sb.from('project_beneficiaries').insert(data).select().single();
  },
  async getBeneficiaryByToken(token) {
    if (APP_CONFIG.demoMode) return { data: null };
    return dbQuery('project_beneficiaries', q => q.select('*, projects(id, name, code, color, status, start_date, end_date, client_name)').eq('access_token', token).single(), null);
  },
  async updateBeneficiaryAccess(token) {
    if (APP_CONFIG.demoMode) return { error: null };
    const sb = getSupabase();
    return sb.from('project_beneficiaries').update({ last_accessed_at: new Date().toISOString(), status: 'accepted', accepted_at: new Date().toISOString() }).eq('access_token', token);
  },
  async deleteBeneficiary(id) {
    if (APP_CONFIG.demoMode) return { error: null };
    const sb = getSupabase();
    return sb.from('project_beneficiaries').delete().eq('id', id);
  },
  async updateBeneficiary(id, updates) {
    if (APP_CONFIG.demoMode) return { error: null };
    const sb = getSupabase();
    return sb.from('project_beneficiaries').update(updates).eq('id', id).select().single();
  },
  async getBeneficiaryByEmail(email) {
    if (APP_CONFIG.demoMode) return { data: [] };
    return dbQuery('project_beneficiaries', q => q.select('*, projects(id, name, code, color, status, start_date, end_date, client_name)').eq('email', email).order('created_at', { ascending: false }), []);
  },
  // Backup
  async getBackupLogs() {
    if (APP_CONFIG.demoMode) return { data: [] };
    return dbQuery('backup_logs', q => q.select('*').order('created_at', { ascending: false }).limit(20), []);
  },
  async createBackupLog(log) {
    if (APP_CONFIG.demoMode) return { error: null };
    const sb = getSupabase();
    return sb.from('backup_logs').insert(log).select().single();
  },

  async getProfile(userId) {
    if (APP_CONFIG.demoMode) {
      return { data: this.demo.users.find(u => u.id === userId) || Auth.demoProfile };
    }
    return dbQuery('profiles', q => q.select('*').eq('id', userId).single(), Auth.demoProfile);
  },

  // ── COMPANY EVENTS ─────────────────────────────────────────
  async getCompanyEvents(dateFrom, dateTo) {
    if (APP_CONFIG.demoMode) return { data: [] };
    const sb = getSupabase();
    let q = sb.from('company_events')
      .select('*, event_participants(id, user_id, status)')
      .eq('status', 'active')
      .order('event_date', { ascending: true })
      .order('start_time', { ascending: true });
    if (dateFrom) q = q.gte('event_date', dateFrom);
    if (dateTo) q = q.lte('event_date', dateTo);
    return q;
  },
  async getCompanyEventById(id) {
    if (APP_CONFIG.demoMode) return { data: null };
    const sb = getSupabase();
    return sb.from('company_events')
      .select('*')
      .eq('id', id)
      .single();
  },
  async createCompanyEvent(event) {
    if (APP_CONFIG.demoMode) return { data: null, error: null };
    const sb = getSupabase();
    return sb.from('company_events').insert(event).select().single();
  },
  async updateCompanyEvent(id, updates) {
    if (APP_CONFIG.demoMode) return { error: null };
    const sb = getSupabase();
    return sb.from('company_events').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
  },
  async cancelCompanyEvent(id) {
    if (APP_CONFIG.demoMode) return { error: null };
    const sb = getSupabase();
    return sb.from('company_events').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id);
  },
  async deleteCompanyEventHard(id) {
    if (APP_CONFIG.demoMode) return { error: null };
    const sb = getSupabase();
    return sb.from('company_events').delete().eq('id', id);
  },
  async getEventParticipants(eventId) {
    if (APP_CONFIG.demoMode) return { data: [] };
    const sb = getSupabase();
    return sb.from('event_participants')
      .select('*')
      .eq('event_id', eventId);
  },
  async upsertEventParticipant(eventId, userId, status, declineReason) {
    if (APP_CONFIG.demoMode) return { error: null };
    const sb = getSupabase();
    return sb.from('event_participants').upsert({
      event_id: eventId,
      user_id: userId,
      status,
      decline_reason: declineReason || null,
      responded_at: new Date().toISOString(),
    }, { onConflict: 'event_id,user_id' });
  },
  async addEventParticipants(eventId, userIds) {
    if (APP_CONFIG.demoMode) return { error: null };
    const sb = getSupabase();
    const rows = userIds.map(uid => ({ event_id: eventId, user_id: uid, status: 'pending' }));
    // Use upsert to update existing participants or insert new ones
    return sb.from('event_participants').upsert(rows, { onConflict: 'event_id,user_id' });
  },
  async markEventAttended(eventId, userId, timeEntryId) {
    if (APP_CONFIG.demoMode) return { error: null };
    const sb = getSupabase();
    return sb.from('event_participants').update({
      status: 'attended',
      time_entry_id: timeEntryId || null,
      responded_at: new Date().toISOString(),
    }).eq('event_id', eventId).eq('user_id', userId);
  },

  async updateProfile(userId, updates) {
    if (APP_CONFIG.demoMode) {
      const u = this.demo.users.find(u => u.id === userId);
      if (u) Object.assign(u, updates);
      Object.assign(Auth.currentProfile, updates);
      return { error: null };
    }
    const sb = getSupabase();
    return sb.from('profiles').update(updates).eq('id', userId);
  },
};

// ── HELPERS ──────────────────────────────────────────────────

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function getDateStr(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

function formatDate(dateStr, opts = {}) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  // Dacă se trece opts custom (ex: weekday), folosim toLocaleDateString
  if (Object.keys(opts).length > 0) {
    return d.toLocaleDateString('ro-RO', opts);
  }
  // Format implicit: dd/mm/yyyy
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hour = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hour}:${min}`;
}

function formatHours(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function timeAgo(dateStr) {
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'acum';
  if (diff < 3600) return `acum ${Math.floor(diff/60)} min`;
  if (diff < 86400) return `acum ${Math.floor(diff/3600)}h`;
  if (diff < 604800) return `acum ${Math.floor(diff/86400)} zile`;
  return formatDate(dateStr);
}

function getProjectColor(project) {
  return project?.color || '#FFCB09';
}

function getActivityColor(type) {
  const colors = {
    proiectare: '#3b82f6',
    verificare: '#8b5cf6',
    administrativ: '#6b7280',
    deplasare: '#f59e0b',
    formare: '#10b981',
    client: '#ec4899',
  };
  return colors[type] || '#6b7280';
}

function getActivityLabel(type) {
  const labels = {
    proiectare: 'Proiectare',
    verificare: 'Verificare',
    administrativ: 'Administrativ',
    deplasare: 'Deplasare',
    formare: 'Formare',
    client: 'Client',
  };
  return labels[type] || type;
}
