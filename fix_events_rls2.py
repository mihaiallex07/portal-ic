#!/usr/bin/env python3
import requests, json

PROJECT_REF = 'ofknvxwcqwgnthnvslfl'
SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ma252eHdjcXdnbnRobnZzbGZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODYwMjA1NywiZXhwIjoyMDk0MTc4MDU3fQ.tD9697RLX8MtTZy6GWkJaB5WZ89AEvJXq1HEc2mT9K4'

# Use the pg endpoint via service role
headers = {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': f'Bearer {SERVICE_ROLE_KEY}',
    'Content-Type': 'application/json',
}

sql = """
ALTER TABLE company_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view events" ON company_events;
CREATE POLICY "Authenticated users can view events" ON company_events FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins can manage events" ON company_events;
CREATE POLICY "Admins can manage events" ON company_events FOR ALL TO authenticated 
USING ((SELECT role::text FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordonator'))
WITH CHECK ((SELECT role::text FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordonator'));

ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view event participants" ON event_participants;
CREATE POLICY "Users can view event participants" ON event_participants FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Users can manage own participation" ON event_participants;
CREATE POLICY "Users can manage own participation" ON event_participants FOR ALL TO authenticated 
USING (user_id = auth.uid() OR (SELECT role::text FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordonator'))
WITH CHECK (user_id = auth.uid() OR (SELECT role::text FROM profiles WHERE id = auth.uid()) IN ('admin', 'coordonator'));
"""

# Try Supabase Management API
resp = requests.post(
    f'https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query',
    headers={
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {SERVICE_ROLE_KEY}'
    },
    json={'query': sql}
)
print(f"Management API Status: {resp.status_code}")
print(resp.text[:500])
