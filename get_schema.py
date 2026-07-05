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

# Get company_events columns via OpenAPI
resp = requests.get(f'{SUPABASE_URL}/rest/v1/', headers=headers)
if resp.status_code == 200:
    schema = resp.json()
    # Find company_events
    defs = schema.get('definitions', {})
    for tname in ['company_events', 'event_participants']:
        if tname in defs:
            props = defs[tname].get('properties', {})
            print(f'\n=== {tname} ===')
            for col, info in props.items():
                print(f'  {col}: {info.get("type","?")} {info.get("format","")}')
        else:
            print(f'\n{tname}: NOT FOUND in schema')
else:
    print(f'Schema fetch failed: {resp.status_code}')
