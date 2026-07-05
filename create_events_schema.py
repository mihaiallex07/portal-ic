#!/usr/bin/env python3
import requests
import json

SUPABASE_URL = 'https://ofknvxwcqwgnthnvslfl.supabase.co'
SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ma252eHdjcXdnbnRobnZzbGZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODYwMjA1NywiZXhwIjoyMDk0MTc4MDU3fQ.tD9697RLX8MtTZy6GWkJaB5WZ89AEvJXq1HEc2mT9K4'

headers = {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': f'Bearer {SERVICE_ROLE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
}

def run_sql(sql, label=''):
    url = f'{SUPABASE_URL}/rest/v1/rpc/exec_sql'
    # Use Management API instead
    url2 = f'https://api.supabase.com/v1/projects/ofknvxwcqwgnthnvslfl/database/query'
    # Try direct postgres connection via REST
    resp = requests.post(
        f'{SUPABASE_URL}/rest/v1/rpc/exec_sql',
        headers=headers,
        json={'sql': sql}
    )
    print(f'{label}: {resp.status_code} {resp.text[:200]}')
    return resp

# Step 1: Add columns to company_events
sql_alter = """
ALTER TABLE company_events ADD COLUMN IF NOT EXISTS event_date date;
ALTER TABLE company_events ADD COLUMN IF NOT EXISTS start_time time;
ALTER TABLE company_events ADD COLUMN IF NOT EXISTS end_time time;
ALTER TABLE company_events ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE company_events ADD COLUMN IF NOT EXISTS meeting_link text;
ALTER TABLE company_events ADD COLUMN IF NOT EXISTS is_mandatory boolean DEFAULT false;
ALTER TABLE company_events ADD COLUMN IF NOT EXISTS recurrence_type text DEFAULT 'none';
ALTER TABLE company_events ADD COLUMN IF NOT EXISTS recurrence_end_date date;
ALTER TABLE company_events ADD COLUMN IF NOT EXISTS parent_event_id uuid;
ALTER TABLE company_events ADD COLUMN IF NOT EXISTS counts_as_work_hours boolean DEFAULT true;
ALTER TABLE company_events ADD COLUMN IF NOT EXISTS reminder_hours int DEFAULT 24;
ALTER TABLE company_events ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE company_events ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
"""

# Step 2: Check if event_participants exists
resp_check = requests.get(
    f'{SUPABASE_URL}/rest/v1/event_participants?limit=1',
    headers=headers
)
print(f'event_participants check: {resp_check.status_code}')

if resp_check.status_code == 404:
    print('Table event_participants does not exist, need to create it')
else:
    print('Table event_participants exists!')
    # Check columns
    resp_cols = requests.get(
        f'{SUPABASE_URL}/rest/v1/event_participants?limit=0',
        headers={**headers, 'Prefer': 'return=representation'}
    )
    print(f'Columns check: {resp_cols.status_code}')

# Check company_events columns
resp_ev = requests.get(
    f'{SUPABASE_URL}/rest/v1/company_events?limit=1',
    headers=headers
)
print(f'company_events: {resp_ev.status_code} cols: {list(resp_ev.json()[0].keys()) if resp_ev.status_code == 200 and resp_ev.json() else "empty or error"}')

# Try to get column names via HEAD request
resp_head = requests.get(
    f'{SUPABASE_URL}/rest/v1/company_events?limit=0',
    headers={**headers, 'Accept': 'application/json'}
)
print(f'HEAD: {resp_head.status_code}')
