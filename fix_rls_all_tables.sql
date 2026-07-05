-- ============================================================
-- FIX RLS POLICIES PENTRU manual_hours_log ȘI time_entries
-- ============================================================

-- ============================================================
-- 1. FIX manual_hours_log
-- ============================================================

-- Șterge politici vechi
DROP POLICY IF EXISTS "Allow admin to update manual_hours_log" ON manual_hours_log;
DROP POLICY IF EXISTS "Allow coordinator to update manual_hours_log" ON manual_hours_log;
DROP POLICY IF EXISTS "Allow read manual_hours_log" ON manual_hours_log;
DROP POLICY IF EXISTS "Allow insert manual_hours_log" ON manual_hours_log;
DROP POLICY IF EXISTS "Allow delete manual_hours_log" ON manual_hours_log;

-- UPDATE policy
CREATE POLICY "Allow admin to update manual_hours_log" ON manual_hours_log
  FOR UPDATE
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = manual_hours_log.project_id
      AND project_members.user_id = auth.uid()
      AND project_members.role IN ('coordonator', 'coord', 'admin')
    )
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = manual_hours_log.project_id
      AND project_members.user_id = auth.uid()
      AND project_members.role IN ('coordonator', 'coord', 'admin')
    )
  );

-- SELECT policy
CREATE POLICY "Allow read manual_hours_log" ON manual_hours_log
  FOR SELECT
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = manual_hours_log.project_id
      AND project_members.user_id = auth.uid()
    )
  );

-- INSERT policy
CREATE POLICY "Allow insert manual_hours_log" ON manual_hours_log
  FOR INSERT
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = manual_hours_log.project_id
      AND project_members.user_id = auth.uid()
      AND project_members.role IN ('coordonator', 'coord', 'admin')
    )
  );

-- DELETE policy
CREATE POLICY "Allow delete manual_hours_log" ON manual_hours_log
  FOR DELETE
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = manual_hours_log.project_id
      AND project_members.user_id = auth.uid()
      AND project_members.role IN ('coordonator', 'coord', 'admin')
    )
  );

-- ============================================================
-- 2. FIX time_entries
-- ============================================================

-- Șterge politici vechi
DROP POLICY IF EXISTS "Allow admin to update time_entries" ON time_entries;
DROP POLICY IF EXISTS "Allow coordinator to update time_entries" ON time_entries;
DROP POLICY IF EXISTS "Allow read time_entries" ON time_entries;
DROP POLICY IF EXISTS "Allow insert time_entries" ON time_entries;
DROP POLICY IF EXISTS "Allow delete time_entries" ON time_entries;

-- UPDATE policy
CREATE POLICY "Allow admin to update time_entries" ON time_entries
  FOR UPDATE
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR
    auth.uid() = user_id
    OR
    EXISTS (
      SELECT 1 FROM project_members pm
      JOIN project_tasks pt ON pt.project_id = pm.project_id
      WHERE pt.id = time_entries.project_task_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('coordonator', 'coord', 'admin')
    )
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR
    auth.uid() = user_id
    OR
    EXISTS (
      SELECT 1 FROM project_members pm
      JOIN project_tasks pt ON pt.project_id = pm.project_id
      WHERE pt.id = time_entries.project_task_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('coordonator', 'coord', 'admin')
    )
  );

-- SELECT policy
CREATE POLICY "Allow read time_entries" ON time_entries
  FOR SELECT
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR
    auth.uid() = user_id
    OR
    EXISTS (
      SELECT 1 FROM project_members pm
      JOIN project_tasks pt ON pt.project_id = pm.project_id
      WHERE pt.id = time_entries.project_task_id
      AND pm.user_id = auth.uid()
    )
  );

-- INSERT policy
CREATE POLICY "Allow insert time_entries" ON time_entries
  FOR INSERT
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR
    auth.uid() = user_id
  );

-- DELETE policy
CREATE POLICY "Allow delete time_entries" ON time_entries
  FOR DELETE
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR
    auth.uid() = user_id
    OR
    EXISTS (
      SELECT 1 FROM project_members pm
      JOIN project_tasks pt ON pt.project_id = pm.project_id
      WHERE pt.id = time_entries.project_task_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('coordonator', 'coord', 'admin')
    )
  );

-- ============================================================
-- 3. Verific politicile după update
-- ============================================================
SELECT policyname, qual, with_check FROM pg_policies WHERE tablename IN ('manual_hours_log', 'time_entries');
