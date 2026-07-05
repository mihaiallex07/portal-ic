#!/usr/bin/env python3
import requests
import json

SUPABASE_URL = 'https://ofknvxwcqwgnthnvslfl.supabase.co'
SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ma252eHdjcXdnbnRobnZzbGZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODYwMjA1NywiZXhwIjoyMDk0MTc4MDU3fQ.tD9697RLX8MtTZy6GWkJaB5WZ89AEvJXq1HEc2mT9K4'

headers = {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': f'Bearer {SERVICE_ROLE_KEY}',
    'Content-Type': 'application/json',
}

def query_table(table_name, select='*', limit=10):
    """Query a Supabase table with service_role"""
    url = f'{SUPABASE_URL}/rest/v1/{table_name}'
    params = {
        'select': select,
        'limit': limit,
    }
    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
        if response.status_code == 200:
            return response.json()
        else:
            return {'error': response.text, 'status': response.status_code}
    except Exception as e:
        return {'error': str(e)}

def execute_sql(sql):
    """Execute SQL via Supabase REST API"""
    url = f'{SUPABASE_URL}/rest/v1/rpc/sql'
    try:
        response = requests.post(url, headers=headers, json={'sql': sql}, timeout=10)
        if response.status_code in [200, 201]:
            return response.json()
        else:
            return {'error': response.text, 'status': response.status_code}
    except Exception as e:
        return {'error': str(e)}

print('🔍 Verificare RLS pe Supabase...\n')

# 1. Verific profiles
print('📋 Tabelul profiles:')
profiles = query_table('profiles', 'id,email,full_name,employee_code,role', 20)
if isinstance(profiles, list):
    print(f'  Total: {len(profiles)} utilizatori')
    for p in profiles[:5]:
        print(f"  - {p.get('email', 'N/A')}: {p.get('full_name', 'N/A')} ({p.get('role', 'N/A')})")
else:
    print(f"  ❌ {profiles}")

# 2. Verific project_members
print('\n📋 Tabelul project_members:')
members = query_table('project_members', 'id,project_id,user_id,role', 20)
if isinstance(members, list):
    print(f'  Total: {len(members)} înscrieri')
    for m in members[:5]:
        print(f"  - Project {m.get('project_id')}: User {m.get('user_id')} → {m.get('role')}")
else:
    print(f"  ❌ {members}")

# 3. Verific project_tasks
print('\n📋 Tabelul project_tasks (primele 5):')
tasks = query_table('project_tasks', 'id,project_id,name,minutes_worked,budget_hours', 5)
if isinstance(tasks, list):
    print(f'  Total: {len(tasks)} sarcini')
    for t in tasks[:5]:
        print(f"  - {t.get('name', 'N/A')}: {t.get('minutes_worked', 0)} min / {t.get('budget_hours', 0)}h")
else:
    print(f"  ❌ {tasks}")

# 4. Verific manual_hours_log
print('\n📋 Tabelul manual_hours_log (primele 5):')
manual = query_table('manual_hours_log', 'id,task_id,minutes,created_at', 5)
if isinstance(manual, list):
    print(f'  Total: {len(manual)} înregistrări')
    for m in manual[:5]:
        print(f"  - Task {m.get('task_id')}: {m.get('minutes')} min")
else:
    print(f"  ❌ {manual}")

# 5. Verific time_entries
print('\n📋 Tabelul time_entries (primele 5):')
times = query_table('time_entries', 'id,project_task_id,duration_minutes,user_id', 5)
if isinstance(times, list):
    print(f'  Total: {len(times)} înregistrări')
    for t in times[:5]:
        print(f"  - Task {t.get('project_task_id')}: {t.get('duration_minutes')} min (User {t.get('user_id')})")
else:
    print(f"  ❌ {times}")

print('\n✅ Verificare complet')
