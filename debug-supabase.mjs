#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ofknvxwcqwgnthnvslfl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ma252eHdjcXdnbnRobnZzbGZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MDIwNTcsImV4cCI6MjA5NDE3ODA1N30.HhI-MAeGlmFIIEfL1mDWxQhKBbCPDn3qgaSKBS9otS8';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function debug() {
  console.log('🔍 Verificare Supabase...\n');

  // 1. Verific tabelul profiles
  console.log('📋 Tabelul profiles:');
  const { data: profiles, error: profilesErr } = await supabase
    .from('profiles')
    .select('id, email, full_name, employee_code, role')
    .limit(10);
  
  if (profilesErr) {
    console.error('❌ Eroare:', profilesErr.message);
  } else {
    console.table(profiles);
  }

  // 2. Verific project_members
  console.log('\n📋 Tabelul project_members (primele 10):');
  const { data: members, error: membersErr } = await supabase
    .from('project_members')
    .select('id, project_id, user_id, role')
    .limit(10);
  
  if (membersErr) {
    console.error('❌ Eroare:', membersErr.message);
  } else {
    console.table(members);
  }

  // 3. Verific project_change_log
  console.log('\n📋 Tabelul project_change_log:');
  const { data: changeLogs, error: changeErr } = await supabase
    .from('project_change_log')
    .select('*')
    .limit(10);
  
  if (changeErr) {
    console.error('❌ Eroare:', changeErr.message);
  } else if (!changeLogs || changeLogs.length === 0) {
    console.log('⚠️  Tabelul este gol - nici o înregistrare de modificări');
  } else {
    console.table(changeLogs);
  }

  // 4. Verific time_entries
  console.log('\n📋 Tabelul time_entries (primele 5):');
  const { data: timeEntries, error: timeErr } = await supabase
    .from('time_entries')
    .select('id, project_task_id, duration_minutes, created_at')
    .limit(5);
  
  if (timeErr) {
    console.error('❌ Eroare:', timeErr.message);
  } else {
    console.table(timeEntries);
  }

  // 5. Verific manual_hours_log
  console.log('\n📋 Tabelul manual_hours_log (primele 5):');
  const { data: manualLogs, error: manualErr } = await supabase
    .from('manual_hours_log')
    .select('id, task_id, minutes, created_at')
    .limit(5);
  
  if (manualErr) {
    console.error('❌ Eroare:', manualErr.message);
  } else {
    console.table(manualLogs);
  }

  console.log('\n✅ Debug complet');
}

debug().catch(console.error);
