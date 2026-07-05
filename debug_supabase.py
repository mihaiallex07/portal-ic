#!/usr/bin/env python3
import requests
import json

SUPABASE_URL = 'https://ofknvxwcqwgnthnvslfl.supabase.co'
SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ma252eHdjcXdnbnRobnZzbGZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MDIwNTcsImV4cCI6MjA5NDE3ODA1N30.HhI-MAeGlmFIIEfL1mDWxQhKBbCPDn3qgaSKBS9otS8'

headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': f'Bearer {SUPABASE_ANON_KEY}',
    'Content-Type': 'application/json',
}

def query_table(table_name, select='*', limit=10):
    """Query a Supabase table"""
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

print('🔍 Verificare Supabase...\n')

# 1. Profiles
print('📋 Tabelul profiles:')
profiles = query_table('profiles', 'id,email,full_name,employee_code,role', 20)
if isinstance(profiles, list):
    for p in profiles:
        print(f"  - {p.get('email', 'N/A')}: {p.get('full_name', 'N/A')} ({p.get('role', 'N/A')})")
else:
    print(f"  ❌ {profiles}")

# 2. Project Members
print('\n📋 Tabelul project_members (primele 10):')
members = query_table('project_members', 'id,project_id,user_id,role', 10)
if isinstance(members, list):
    for m in members:
        print(f"  - Project {m.get('project_id')}: User {m.get('user_id')} → {m.get('role')}")
else:
    print(f"  ❌ {members}")

# 3. Project Change Log
print('\n📋 Tabelul project_change_log:')
changes = query_table('project_change_log', '*', 10)
if isinstance(changes, list):
    if len(changes) == 0:
        print('  ⚠️  Tabelul este gol - nici o înregistrare de modificări')
    else:
        for c in changes:
            print(f"  - {c.get('created_at', 'N/A')}: {c.get('changed_by_name', 'N/A')} → {c.get('change_type')} ({c.get('entity_type')})")
else:
    print(f"  ❌ {changes}")

# 4. Time Entries
print('\n📋 Tabelul time_entries (primele 5):')
times = query_table('time_entries', 'id,project_task_id,duration_minutes,created_at', 5)
if isinstance(times, list):
    for t in times:
        print(f"  - Task {t.get('project_task_id')}: {t.get('duration_minutes')} min ({t.get('created_at')})")
else:
    print(f"  ❌ {times}")

# 5. Manual Hours Log
print('\n📋 Tabelul manual_hours_log (primele 5):')
manual = query_table('manual_hours_log', 'id,task_id,minutes,created_at', 5)
if isinstance(manual, list):
    for m in manual:
        print(f"  - Task {m.get('task_id')}: {m.get('minutes')} min ({m.get('created_at')})")
else:
    print(f"  ❌ {manual}")

print('\n✅ Debug complet')
