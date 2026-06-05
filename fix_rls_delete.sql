-- ============================================================
-- FIX RLS DELETE POLICIES PENTRU time_entries și manual_hours_log
-- ============================================================

-- 1. Șterge politici DELETE vechi (dacă există)
DROP POLICY IF EXISTS "Allow delete time_entries" ON time_entries;
DROP POLICY IF EXISTS "Allow delete manual_hours_log" ON manual_hours_log;

-- 2. Crează politici DELETE pentru time_entries
CREATE POLICY "Allow delete time_entries" ON time_entries
  FOR DELETE
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR
    EXISTS (
      SELECT 1 FROM project_tasks pt
      JOIN project_members pm ON pm.project_id = (
        SELECT project_id FROM project_tasks WHERE id = pt.id
      )
      WHERE pt.id = time_entries.task_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('coordonator', 'coord', 'admin')
    )
  );

-- 3. Crează politici DELETE pentru manual_hours_log
CREATE POLICY "Allow delete manual_hours_log" ON manual_hours_log
  FOR DELETE
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR
    EXISTS (
      SELECT 1 FROM project_tasks pt
      JOIN project_members pm ON pm.project_id = (
        SELECT project_id FROM project_tasks WHERE id = pt.id
      )
      WHERE pt.id = manual_hours_log.task_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('coordonator', 'coord', 'admin')
    )
  );

-- 4. Verific politici după update
SELECT policyname, qual, with_check FROM pg_policies WHERE tablename IN ('time_entries', 'manual_hours_log');
