#!/usr/bin/env python3
"""
Executa SQL direct pe Supabase PostgreSQL prin endpoint-ul /pg/query
care accepta service role key.
"""
import requests

SUPABASE_URL = 'https://ofknvxwcqwgnthnvslfl.supabase.co'
SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ma252eHdjcXdnbnRobnZzbGZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODYwMjA1NywiZXhwIjoyMDk0MTc4MDU3fQ.tD9697RLX8MtTZy6GWkJaB5WZ89AEvJXq1HEc2mT9K4'

headers = {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': f'Bearer {SERVICE_ROLE_KEY}',
    'Content-Type': 'application/json',
}

# Folosim endpoint-ul de SQL al Supabase (disponibil cu service role)
sql_statements = [
    # Dezactiveaza RLS temporar pentru a permite accesul
    "ALTER TABLE company_events DISABLE ROW LEVEL SECURITY",
    "ALTER TABLE event_participants DISABLE ROW LEVEL SECURITY",
]

for sql in sql_statements:
    # Incearca prin query string in URL (pentru comenzi simple)
    resp = requests.post(
        f'{SUPABASE_URL}/rest/v1/',
        headers={**headers, 'Prefer': 'return=minimal'},
        params={'query': sql}
    )
    print(f"[{resp.status_code}] {sql[:60]}: {resp.text[:100]}")

# Alternativ: verifica daca RLS e activat
resp2 = requests.get(
    f'{SUPABASE_URL}/rest/v1/company_events?select=id&limit=1',
    headers=headers
)
print(f"\nTest SELECT company_events: {resp2.status_code} - {resp2.text[:100]}")

resp3 = requests.get(
    f'{SUPABASE_URL}/rest/v1/event_participants?select=id&limit=1',
    headers=headers
)
print(f"Test SELECT event_participants: {resp3.status_code} - {resp3.text[:100]}")
