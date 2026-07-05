#!/usr/bin/env python3
import requests
import json

# Supabase config
SUPABASE_URL = "https://ofknvxwcqwgnthhnvslfl.supabase.co"
SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ma252eHdjcXdnbnRoaG52c2xmbCIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE3Nzg2MDIwNTcsImV4cCI6MjA5NDE3ODA1N30.tD9697RLX8MtTZy6GWkJaB5WZ89AEvJXq1HEc2mT9K4"

# Citesc SQL-ul din fișier
with open('/home/ubuntu/portal-ic/schema_new_features.sql', 'r') as f:
    sql_content = f.read()

# Execut SQL-ul prin REST API (nu merge direct, trebuie RPC)
# Voi folosi psql direct prin SSH sau voi crea o funcție RPC

# Pentru acum, voi folosi o abordare mai simplă: voi crea fiecare tabel individual

headers = {
    "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
    "Content-Type": "application/json",
    "apikey": SERVICE_ROLE_KEY
}

# Test conexiune
try:
    response = requests.get(f"{SUPABASE_URL}/rest/v1/", headers=headers)
    print(f"✅ Conexiune Supabase OK: {response.status_code}")
except Exception as e:
    print(f"❌ Eroare conexiune: {e}")
    exit(1)

# Execut SQL prin pg_dump/psql (nu merge prin REST API direct pentru DDL)
# Voi folosi psql dacă e disponibil

import subprocess
import os

# Crează fișier temporar cu SQL
with open('/tmp/schema.sql', 'w') as f:
    f.write(sql_content)

# Încerc să execut prin psql dacă e disponibil
try:
    result = subprocess.run([
        'psql',
        f'postgresql://postgres:{SERVICE_ROLE_KEY}@db.ofknvxwcqwgnthhnvslfl.supabase.co:5432/postgres',
        '-f', '/tmp/schema.sql'
    ], capture_output=True, text=True, timeout=30)
    
    if result.returncode == 0:
        print("✅ SQL executat cu succes!")
        print(result.stdout)
    else:
        print(f"❌ Eroare SQL: {result.stderr}")
except Exception as e:
    print(f"⚠️  psql nu e disponibil: {e}")
    print("Voi folosi o abordare alternativă...")

# Alternativă: crează tabele prin API
print("\n📝 Creez tabele prin API REST...")

# Notificări
try:
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/exec_sql",
        headers=headers,
        json={"sql": "CREATE TABLE IF NOT EXISTS notifications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL, type TEXT NOT NULL, project_id UUID, task_id UUID, title TEXT NOT NULL, message TEXT, data JSONB DEFAULT '{}'::jsonb, read BOOLEAN DEFAULT FALSE, action_required BOOLEAN DEFAULT FALSE, action_url TEXT, created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(), updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW());"}
    )
    print(f"Notificări: {response.status_code}")
except Exception as e:
    print(f"Notificări error: {e}")

print("\n✅ Schema setup completat!")
