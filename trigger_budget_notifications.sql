-- ============================================================
-- TRIGGER: Notificări automate la atingerea pragurilor de buget
-- Se declanșează la fiecare UPDATE pe project_tasks.minutes_worked
-- Trimite notificări la 50%, 25%, 10%, 5% din bugetul rămas
-- ============================================================

-- 1. Funcția trigger
CREATE OR REPLACE FUNCTION notify_budget_threshold()
RETURNS TRIGGER AS $$
DECLARE
  old_pct NUMERIC;
  new_pct NUMERIC;
  remaining_pct NUMERIC;
  old_remaining_pct NUMERIC;
  task_name TEXT;
  proj_name TEXT;
  proj_id BIGINT;
  assigned_user UUID;
  notif_title TEXT;
  notif_body TEXT;
  threshold NUMERIC;
  thresholds NUMERIC[] := ARRAY[50, 25, 10, 5];
BEGIN
  -- Calculăm procentul din buget RĂMAS (nu consumat)
  IF NEW.budget_hours IS NULL OR NEW.budget_hours = 0 THEN
    RETURN NEW;
  END IF;

  old_pct := COALESCE(OLD.minutes_worked, 0) / (NEW.budget_hours * 60.0) * 100;
  new_pct := COALESCE(NEW.minutes_worked, 0) / (NEW.budget_hours * 60.0) * 100;
  
  -- Procentul RĂMAS
  old_remaining_pct := 100 - old_pct;
  remaining_pct := 100 - new_pct;

  -- Obținem info proiect
  SELECT p.name, p.id INTO proj_name, proj_id
  FROM projects p
  WHERE p.id = NEW.project_id;

  task_name := NEW.name;
  
  -- Verificăm dacă am trecut un prag (de sus în jos)
  FOREACH threshold IN ARRAY thresholds LOOP
    IF old_remaining_pct > threshold AND remaining_pct <= threshold THEN
      -- Notificare pentru utilizatorul asignat pe task
      IF NEW.assigned_user_id IS NOT NULL THEN
        notif_title := 'Buget aproape epuizat — ' || threshold::TEXT || '% rămas';
        notif_body := 'Sarcina "' || task_name || '" din proiectul "' || proj_name || '" mai are doar ' || threshold::TEXT || '% din bugetul de ore alocat.';
        
        INSERT INTO notifications (user_id, type, title, body, project_id, task_id, is_read, created_at)
        VALUES (
          NEW.assigned_user_id,
          'budget_warning',
          notif_title,
          notif_body,
          NEW.project_id,
          NEW.id,
          false,
          NOW()
        )
        ON CONFLICT DO NOTHING;
      END IF;

      -- Notificare și pentru coordonatorii/adminii proiectului
      INSERT INTO notifications (user_id, type, title, body, project_id, task_id, is_read, created_at)
      SELECT 
        pm.user_id,
        'budget_warning',
        notif_title,
        notif_body,
        NEW.project_id,
        NEW.id,
        false,
        NOW()
      FROM project_members pm
      WHERE pm.project_id = NEW.project_id
        AND pm.role IN ('coordonator', 'admin')
        AND pm.user_id != COALESCE(NEW.assigned_user_id, '00000000-0000-0000-0000-000000000000'::UUID)
      ON CONFLICT DO NOTHING;

    END IF;
  END LOOP;

  -- Notificare specială când bugetul e DEPĂȘIT (100%+)
  IF old_pct < 100 AND new_pct >= 100 THEN
    notif_title := '⚠️ Buget DEPĂȘIT — ' || task_name;
    notif_body := 'Sarcina "' || task_name || '" din proiectul "' || proj_name || '" a depășit bugetul alocat de ' || NEW.budget_hours::TEXT || ' ore!';
    
    IF NEW.assigned_user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, body, project_id, task_id, is_read, created_at)
      VALUES (NEW.assigned_user_id, 'budget_exceeded', notif_title, notif_body, NEW.project_id, NEW.id, false, NOW())
      ON CONFLICT DO NOTHING;
    END IF;

    INSERT INTO notifications (user_id, type, title, body, project_id, task_id, is_read, created_at)
    SELECT pm.user_id, 'budget_exceeded', notif_title, notif_body, NEW.project_id, NEW.id, false, NOW()
    FROM project_members pm
    WHERE pm.project_id = NEW.project_id
      AND pm.role IN ('coordonator', 'admin')
      AND pm.user_id != COALESCE(NEW.assigned_user_id, '00000000-0000-0000-0000-000000000000'::UUID)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Atașăm trigger-ul pe project_tasks
DROP TRIGGER IF EXISTS trg_budget_notifications ON project_tasks;
CREATE TRIGGER trg_budget_notifications
  AFTER UPDATE OF minutes_worked ON project_tasks
  FOR EACH ROW
  EXECUTE FUNCTION notify_budget_threshold();

-- 3. Adaugă coloana task_id în notifications (dacă nu există)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS task_id BIGINT REFERENCES project_tasks(id) ON DELETE SET NULL;

-- 4. Verificare
SELECT 'Trigger creat cu succes!' AS status;
