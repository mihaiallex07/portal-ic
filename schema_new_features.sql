-- ============================================================
-- SCHEMA PENTRU 4 FEATURE-URI MAJORE
-- Rulează în Supabase SQL Editor
-- ============================================================

-- 1. TABEL NOTIFICĂRI
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE,
  task_id BIGINT REFERENCES project_tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN DEFAULT FALSE,
  action_required BOOLEAN DEFAULT FALSE,
  action_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- 2. TABEL CERERI ORE SUPLIMENTARE
CREATE TABLE IF NOT EXISTS budget_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id BIGINT NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  requested_hours INT NOT NULL CHECK (requested_hours > 0),
  justification TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_requests_task_id ON budget_requests(task_id);
CREATE INDEX IF NOT EXISTS idx_budget_requests_user_id ON budget_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_requests_status ON budget_requests(status);

-- 3. TABEL BENEFICIARI
CREATE TABLE IF NOT EXISTS project_beneficiaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  access_token UUID UNIQUE DEFAULT gen_random_uuid(),
  token_expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),
  status TEXT DEFAULT 'invited' CHECK (status IN ('invited', 'accepted', 'expired')),
  last_accessed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beneficiaries_project_id ON project_beneficiaries(project_id);
CREATE INDEX IF NOT EXISTS idx_beneficiaries_email ON project_beneficiaries(email);
CREATE INDEX IF NOT EXISTS idx_beneficiaries_access_token ON project_beneficiaries(access_token);
CREATE INDEX IF NOT EXISTS idx_beneficiaries_status ON project_beneficiaries(status);

-- 4. TABEL BACKUP METADATA
CREATE TABLE IF NOT EXISTS backup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type TEXT NOT NULL DEFAULT 'full',
  status TEXT NOT NULL DEFAULT 'completed',
  storage_path TEXT,
  file_size_bytes INT,
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  retention_until TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS idx_backup_logs_status ON backup_logs(status);
CREATE INDEX IF NOT EXISTS idx_backup_logs_created_at ON backup_logs(created_at DESC);

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- Notificări
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications" ON notifications;
CREATE POLICY "Users can read own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
CREATE POLICY "System can insert notifications" ON notifications
  FOR INSERT WITH CHECK (TRUE);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
CREATE POLICY "Users can delete own notifications" ON notifications
  FOR DELETE USING (auth.uid() = user_id);

-- Budget Requests
ALTER TABLE budget_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own budget requests" ON budget_requests;
CREATE POLICY "Users can read own budget requests" ON budget_requests
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can read all budget requests" ON budget_requests;
CREATE POLICY "Admins can read all budget requests" ON budget_requests
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR EXISTS (
      SELECT 1 FROM project_members pm
      JOIN project_tasks pt ON pt.project_id = pm.project_id
      WHERE pt.id = budget_requests.task_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('admin', 'coordonator', 'coord')
    )
  );

DROP POLICY IF EXISTS "Users can create budget requests" ON budget_requests;
CREATE POLICY "Users can create budget requests" ON budget_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can update budget requests" ON budget_requests;
CREATE POLICY "Admins can update budget requests" ON budget_requests
  FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR EXISTS (
      SELECT 1 FROM project_members pm
      JOIN project_tasks pt ON pt.project_id = pm.project_id
      WHERE pt.id = budget_requests.task_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('admin', 'coordonator', 'coord')
    )
  );

-- Beneficiari
ALTER TABLE project_beneficiaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage beneficiaries" ON project_beneficiaries;
CREATE POLICY "Admins can manage beneficiaries" ON project_beneficiaries
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = project_beneficiaries.project_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('admin', 'coordonator', 'coord')
    )
  );

DROP POLICY IF EXISTS "Public access with token" ON project_beneficiaries;
CREATE POLICY "Public access with token" ON project_beneficiaries
  FOR SELECT USING (TRUE);

-- Backup Logs
ALTER TABLE backup_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Only admins can view backup logs" ON backup_logs;
CREATE POLICY "Only admins can view backup logs" ON backup_logs
  FOR SELECT USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

DROP POLICY IF EXISTS "System can insert backup logs" ON backup_logs;
CREATE POLICY "System can insert backup logs" ON backup_logs
  FOR INSERT WITH CHECK (TRUE);

-- ============================================================
-- TRIGGER ALERTĂ BUGET
-- ============================================================

CREATE OR REPLACE FUNCTION check_budget_threshold()
RETURNS TRIGGER AS $$
DECLARE
  budget_minutes INT;
  percentage INT;
  threshold INT := NULL;
  already_notified BOOLEAN;
BEGIN
  budget_minutes := COALESCE(NEW.budget_hours, 0) * 60;
  IF budget_minutes = 0 THEN RETURN NEW; END IF;

  percentage := (COALESCE(NEW.minutes_worked, 0) * 100) / budget_minutes;

  IF percentage >= 95 AND (OLD.minutes_worked * 100 / budget_minutes) < 95 THEN
    threshold := 95;
  ELSIF percentage >= 90 AND (OLD.minutes_worked * 100 / budget_minutes) < 90 THEN
    threshold := 90;
  ELSIF percentage >= 75 AND (OLD.minutes_worked * 100 / budget_minutes) < 75 THEN
    threshold := 75;
  ELSIF percentage >= 50 AND (OLD.minutes_worked * 100 / budget_minutes) < 50 THEN
    threshold := 50;
  END IF;

  IF threshold IS NOT NULL THEN
    -- Notifică toți membrii proiectului cu rol admin/coordonator
    INSERT INTO notifications (user_id, type, project_id, task_id, title, message, data, action_required)
    SELECT 
      pm.user_id,
      'budget_alert',
      NEW.project_id,
      NEW.id,
      'Alertă buget: ' || threshold || '% consumat',
      'Sarcina "' || NEW.name || '" a atins ' || percentage || '% din bugetul alocat (' || ROUND(COALESCE(NEW.minutes_worked,0)::numeric/60,1) || 'h / ' || COALESCE(NEW.budget_hours,0) || 'h)',
      jsonb_build_object(
        'threshold', threshold,
        'percentage', percentage,
        'budget_hours', NEW.budget_hours,
        'consumed_hours', ROUND(COALESCE(NEW.minutes_worked,0)::numeric/60,1),
        'task_name', NEW.name
      ),
      threshold >= 90
    FROM project_members pm
    WHERE pm.project_id = NEW.project_id
    AND pm.role IN ('admin', 'coordonator', 'coord');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_budget_alert ON project_tasks;
CREATE TRIGGER trigger_budget_alert
AFTER UPDATE OF minutes_worked ON project_tasks
FOR EACH ROW
WHEN (NEW.minutes_worked IS DISTINCT FROM OLD.minutes_worked)
EXECUTE FUNCTION check_budget_threshold();

-- ============================================================
-- TRIGGER BUDGET REQUEST APPROVAL
-- ============================================================

CREATE OR REPLACE FUNCTION handle_budget_request_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status != OLD.status AND NEW.status IN ('approved', 'rejected') THEN
    INSERT INTO notifications (user_id, type, project_id, task_id, title, message, data)
    VALUES (
      NEW.user_id,
      CASE WHEN NEW.status = 'approved' THEN 'budget_approved' ELSE 'budget_rejected' END,
      (SELECT project_id FROM project_tasks WHERE id = NEW.task_id),
      NEW.task_id,
      CASE WHEN NEW.status = 'approved' THEN '✅ Cerere ore aprobată' ELSE '❌ Cerere ore respinsă' END,
      CASE WHEN NEW.status = 'approved'
        THEN 'Cererea ta pentru ' || NEW.requested_hours || ' ore suplimentare a fost aprobată'
        ELSE 'Cererea ta pentru ' || NEW.requested_hours || ' ore a fost respinsă. Motiv: ' || COALESCE(NEW.rejection_reason, 'N/A')
      END,
      jsonb_build_object(
        'requested_hours', NEW.requested_hours,
        'status', NEW.status,
        'justification', NEW.justification
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_budget_request_update ON budget_requests;
CREATE TRIGGER trigger_budget_request_update
AFTER UPDATE ON budget_requests
FOR EACH ROW
EXECUTE FUNCTION handle_budget_request_update();

-- ============================================================
-- VERIFICARE FINALĂ
-- ============================================================

SELECT 
  'notifications' as tabel, COUNT(*) as randuri FROM notifications
UNION ALL SELECT 'budget_requests', COUNT(*) FROM budget_requests
UNION ALL SELECT 'project_beneficiaries', COUNT(*) FROM project_beneficiaries
UNION ALL SELECT 'backup_logs', COUNT(*) FROM backup_logs;
