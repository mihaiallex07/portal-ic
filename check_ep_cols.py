#!/usr/bin/env python3
import requests

SUPABASE_URL = 'https://ofknvxwcqwgnthnvslfl.supabase.co'
SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ma252eHdjcXdnbnRobnZzbGZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODYwMjA1NywiZXhwIjoyMDk0MTc4MDU3fQ.tD9697RLX8MtTZy6GWkJaB5WZ89AEvJXq1HEc2mT9K4'

headers = {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': f'Bearer {SERVICE_ROLE_KEY}',
    'Content-Type': 'application/json',
}

# Verifica coloanele prin information_schema
resp = requests.get(
    f'{SUPABASE_URL}/rest/v1/rpc/version',
    headers=headers
)
print(f"Version: {resp.status_code} {resp.text[:100]}")

# Incearca sa insereze un rand de test pentru a vedea ce coloane sunt necesare
resp2 = requests.post(
    f'{SUPABASE_URL}/rest/v1/event_participants',
    headers={**headers, 'Prefer': 'return=representation'},
    json={'event_id': 1, 'user_id': '28f6d18f-b033-4df9-bb77-45ee9a084e2b', 'status': 'accepted'}
)
print(f"\nInsert test: {resp2.status_code}")
print(resp2.text[:500])
