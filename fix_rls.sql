-- ============================================================
-- FIX RLS POLICIES PENTRU project_tasks
-- Permite UPDATE pentru admin, coordonator, și utilizatori înscriși
-- ============================================================

-- 1. Verific RLS curent
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'project_tasks';

-- 2. Șterge politici vechi (dacă există)
DROP POLICY IF EXISTS "Allow admin to update project_tasks" ON project_tasks;
DROP POLICY IF EXISTS "Allow coordinator to update project_tasks" ON project_tasks;
DROP POLICY IF EXISTS "Allow user to update own tasks" ON project_tasks;
DROP POLICY IF EXISTS "Allow read for enrolled users" ON project_tasks;

-- 3. Crează politici noi pentru UPDATE
CREATE POLICY "Allow admin to update project_tasks" ON project_tasks
  FOR UPDATE
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Allow coordinator to update project_tasks" ON project_tasks
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_tasks.project_id
      AND project_members.user_id = auth.uid()
      AND project_members.role IN ('coordonator', 'coord', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_tasks.project_id
      AND project_members.user_id = auth.uid()
      AND project_members.role IN ('coordonator', 'coord', 'admin')
    )
  );

-- 4. Politici pentru SELECT (citire)
DROP POLICY IF EXISTS "Allow read project_tasks" ON project_tasks;

CREATE POLICY "Allow read project_tasks" ON project_tasks
  FOR SELECT
  USING (
    -- Admin poate citi toate
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR
    -- Coordonator pe proiect poate citi
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_tasks.project_id
      AND project_members.user_id = auth.uid()
      AND project_members.role IN ('coordonator', 'coord', 'admin')
    )
    OR
    -- Utilizator înscris pe proiect poate citi
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_tasks.project_id
      AND project_members.user_id = auth.uid()
    )
  );

-- 5. Politici pentru INSERT
DROP POLICY IF EXISTS "Allow insert project_tasks" ON project_tasks;

CREATE POLICY "Allow insert project_tasks" ON project_tasks
  FOR INSERT
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_tasks.project_id
      AND project_members.user_id = auth.uid()
      AND project_members.role IN ('coordonator', 'coord', 'admin')
    )
  );

-- 6. Politici pentru DELETE
DROP POLICY IF EXISTS "Allow delete project_tasks" ON project_tasks;

CREATE POLICY "Allow delete project_tasks" ON project_tasks
  FOR DELETE
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
    OR
    EXISTS (
      SELECT 1 FROM project_members
      WHERE project_members.project_id = project_tasks.project_id
      AND project_members.user_id = auth.uid()
      AND project_members.role IN ('coordonator', 'coord', 'admin')
    )
  );

-- 7. Verific RLS după update
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'project_tasks';
SELECT policyname, qual, with_check FROM pg_policies WHERE tablename = 'project_tasks';
