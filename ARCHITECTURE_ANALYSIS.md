# Analiza Arhitecturii Portal IC - 4 Feature-uri Majore

## 1. CONTEXT CURENT

### Schema Supabase Existentă
- `profiles` — utilizatori (id, email, role: admin/coordonator/angajat)
- `project_members` — înscrierea în proiecte (user_id, project_id, role)
- `projects` — proiecte (id, name, client, status)
- `project_phases` — etape (id, project_id, name, budget_hours)
- `project_tasks` — sarcini (id, phase_id, name, budget_hours, minutes_worked)
- `project_task_assignments` — asignări (task_id, user_id, start_date, end_date)
- `time_entries` — înregistrări timp (phase_id, user_id, duration_minutes)
- `manual_hours_log` — consum manual (task_id, user_id, duration_minutes)
- `project_change_log` — jurnal modificări (project_id, changed_by, change_type, entity_type)

### Cod Curent
- Frontend: `/js/modules/proiecte.js` (1300+ linii, monolitic)
- Notificări: Placeholder în `/js/modules/notificari.js`
- Process Overview: Gantt chart în `/js/modules/process-overview.js`

---

## 2. TASK 1: SISTEM NOTIFICĂRI + ALERTĂ BUGET + CERERE ORE SUPLIMENTARE

### Schema Necesară (Supabase)
```sql
-- Tabel notificări
CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'budget_alert', 'budget_request', 'budget_approved', 'budget_rejected'
  project_id UUID REFERENCES projects(id),
  task_id UUID REFERENCES project_tasks(id),
  title TEXT NOT NULL,
  message TEXT,
  data JSONB, -- {threshold: 50, current: 45, budget: 100, ...}
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  action_required BOOLEAN DEFAULT FALSE
);

-- Tabel cereri ore suplimentare
CREATE TABLE budget_requests (
  id UUID PRIMARY KEY,
  task_id UUID REFERENCES project_tasks(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  requested_hours INT NOT NULL,
  justification TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Logică Implementare
1. **Trigger Supabase**: Când `minutes_worked` se actualizează, verific procent și emit notificare
2. **Frontend**: Afișez notificări în bell icon cu badge count
3. **Modal**: Cerere ore suplimentare cu justificare
4. **Admin Panel**: Aproba/refuza cereri

---

## 3. TASK 2: PAGINĂ BENEFICIARI (Stil Passive House Buildings)

### Schema Necesară
```sql
-- Tabel beneficiari
CREATE TABLE project_beneficiaries (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  invited_at TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP,
  access_token UUID UNIQUE,
  expires_at TIMESTAMP
);
```

### Pagină Beneficiari
- URL: `/beneficiari/{project_id}/{access_token}`
- Design: Minimal, informativ, similar Passive House Buildings
- Conținut:
  - Progres proiect (%)
  - Etape și sarcini (view-only)
  - Documente gata
  - Timeline estimat vs real
  - Contact admin

### Admin Interface
- Buton "Invită beneficiar"
- Input email + send
- Tabel beneficiari cu status (invited, accepted, expired)

---

## 4. TASK 3: REDESIGN PROCESS OVERVIEW

### Problemă Curentă
- Rânduri cu înălțimi diferite (Adrian Nanu și Cristina Mihei ocupă 6 rânduri)
- Scaling neuniform

### Soluție
- **Gantt chart cu timeline uniform**
- Fiecare persoană = 1 rând fix
- Proiecte/sarcini = bare orizontale pe timeline
- Hover: detalii
- Click: accesare task

---

## 5. TASK 4: SISTEM BACKUP DATE

### Strategie
1. **Backup Automat**: Zilnic la 02:00 UTC
2. **Locație**: AWS S3 / Supabase Storage
3. **Format**: SQL dump + JSON export
4. **Retenție**: 30 zile
5. **Restore**: Admin panel cu opțiune restore

### Implementare
- Edge Function Supabase: `backup-scheduler`
- Trigger: `pg_dump` + upload S3
- UI: Admin → Backup Management

---

## 6. PLAN EXECUTABIL

### Faza 1: Schema Supabase (30 min)
- Crează tabele notificări, budget_requests, beneficiari
- Crează RLS policies
- Crează triggers pentru alertă buget

### Faza 2: Sistem Notificări (2h)
- Backend: Logică notificări + cerere ore
- Frontend: Bell icon + modal
- Admin panel: Aproba/refuza

### Faza 3: Pagină Beneficiari (2h)
- Crează pagină public cu design Passive House
- Admin interface: Invitații
- Email notifications

### Faza 4: Process Overview Redesign (1.5h)
- Refactor Gantt chart
- Uniform scaling
- Interacțiuni

### Faza 5: Backup System (1h)
- Edge Function
- S3 integration
- Admin UI

### Faza 6: Testing + Deploy (1h)

**Total: ~8-9 ore**

---

## 7. PRINCIPII ARHITECTURALE

### Code Quality
- ✅ Modular: Fiecare feature în fișier separat
- ✅ No Spaghetti: Funcții mici, responsabilitate unică
- ✅ Reusable: Componente generice
- ✅ Documented: JSDoc + comentarii

### Structură Fișiere
```
js/
  modules/
    proiecte.js (existente)
    notificari.js (refactor + implementare)
    beneficiari.js (nou)
    process-overview.js (refactor)
    backup-manager.js (nou)
  services/
    notification-service.js (nou)
    backup-service.js (nou)
    beneficiary-service.js (nou)
```

### Database
- RLS policies pentru fiecare tabel
- Triggers pentru logică automată
- Indexes pe coloane frecvent căutate

---

## 8. PRIORITATE IMPLEMENTARE

1. **Notificări** — Core feature, necesară pentru celelalte
2. **Beneficiari** — Client-facing, important
3. **Process Overview** — UX improvement
4. **Backup** — Infrastructure, critical

