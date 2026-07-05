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

# Insert a test row to see what columns exist / are required
test_event = {
    'title': '__TEST__',
    'description': 'test',
    'event_date': '2026-07-10',
    'start_time': '10:00:00',
    'end_time': '11:00:00',
    'location': 'Online',
    'meeting_link': 'https://zoom.us/test',
    'is_mandatory': True,
    'target_type': 'all',
    'recurrence_type': 'none',
    'counts_as_work_hours': True,
    'reminder_hours': 24,
    'status': 'active',
}

resp = requests.post(
    f'{SUPABASE_URL}/rest/v1/company_events',
    headers={**headers, 'Prefer': 'return=representation'},
    json=test_event
)
print(f'INSERT TEST: {resp.status_code}')
print(resp.text[:500])

if resp.status_code in (200, 201):
    data = resp.json()
    if data:
        row = data[0] if isinstance(data, list) else data
        print(f'COLUMNS: {list(row.keys())}')
        # Delete test row
        test_id = row.get('id')
        if test_id:
            del_resp = requests.delete(
                f'{SUPABASE_URL}/rest/v1/company_events?id=eq.{test_id}',
                headers=headers
            )
            print(f'DELETE TEST: {del_resp.status_code}')

# Check event_participants columns
resp2 = requests.post(
    f'{SUPABASE_URL}/rest/v1/event_participants',
    headers={**headers, 'Prefer': 'return=representation'},
    json={'event_id': '00000000-0000-0000-0000-000000000000', 'user_id': '00000000-0000-0000-0000-000000000000', 'status': 'pending'}
)
print(f'event_participants INSERT TEST: {resp2.status_code} {resp2.text[:300]}')
