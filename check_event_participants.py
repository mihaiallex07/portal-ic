#!/usr/bin/env python3
import requests

SUPABASE_URL = 'https://ofknvxwcqwgnthnvslfl.supabase.co'
SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ma252eHdjcXdnbnRobnZzbGZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODYwMjA1NywiZXhwIjoyMDk0MTc4MDU3fQ.tD9697RLX8MtTZy6GWkJaB5WZ89AEvJXq1HEc2mT9K4'

headers = {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': f'Bearer {SERVICE_ROLE_KEY}',
    'Content-Type': 'application/json',
}

# Verifica structura event_participants
resp = requests.get(
    f'{SUPABASE_URL}/rest/v1/event_participants?select=*&limit=1',
    headers=headers
)
print(f"event_participants columns: {resp.status_code}")
print(resp.text[:500])

# Verifica structura company_events
resp2 = requests.get(
    f'{SUPABASE_URL}/rest/v1/company_events?select=*&limit=1',
    headers=headers
)
print(f"\ncompany_events: {resp2.status_code}")
print(resp2.text[:500])
