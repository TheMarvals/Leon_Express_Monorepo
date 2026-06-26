#!/usr/bin/env python3
"""Fix MySQL database: create user marval and database leon_express"""
import pexpect
import time

VPS_IP = "65.75.201.175"
VPS_USER = "root"

child = pexpect.spawn(
    f'ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i /home/marval/.ssh/id_rsa {VPS_USER}@{VPS_IP}',
    timeout=60, encoding='utf-8', maxread=65535
)
i = child.expect(['continue connecting', 'root@.*#', 'root@.*\\$', pexpect.TIMEOUT], timeout=15)
if i == 0:
    child.sendline('yes')
    child.expect(['root@.*#', 'root@.*\\$', pexpect.TIMEOUT], timeout=15)
print("Connected!")

def run(cmd, wait=3):
    child.sendline(cmd)
    time.sleep(wait)
    child.expect(['root@.*#', 'root@.*\\$', pexpect.TIMEOUT], timeout=30)
    return child.before

# Get container names
result = run("docker ps --format '{{.Names}}' | grep mysql | head -1")
mysql_name = [l.strip() for l in result.split('\n') if l.strip()][-1]

result = run("docker ps --format '{{.Names}}' | grep 'backend-' | head -1")
backend_name = [l.strip() for l in result.split('\n') if l.strip()][-1]

print(f"MySQL: {mysql_name}")
print(f"Backend: {backend_name}")

# Stop old leonexpress_backend
run("docker stop leonexpress_backend 2>/dev/null; docker rm leonexpress_backend 2>/dev/null")
print("Old containers cleaned")

# Run MySQL setup via docker exec - writing SQL to a temp file first to avoid quoting issues
run(f'docker exec {mysql_name} mysql -uroot -p\'efMfK3fH5dZYNaus3Sz68Etuyt69e3WpqoHDxsePFtz1EjIiQn82ikEurkHGfihr\' -e "CREATE DATABASE IF NOT EXISTS leon_express CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"')
print(f"DB created: {child.before.strip()[-100:]}")

run(f'docker exec {mysql_name} mysql -uroot -p\'efMfK3fH5dZYNaus3Sz68Etuyt69e3WpqoHDxsePFtz1EjIiQn82ikEurkHGfihr\' -e "CREATE USER IF NOT EXISTS marval@\'%%\' IDENTIFIED BY \'ThomasMarval2105..\';"')
print(f"User created: {child.before.strip()[-100:]}")

run(f'docker exec {mysql_name} mysql -uroot -p\'efMfK3fH5dZYNaus3Sz68Etuyt69e3WpqoHDxsePFtz1EjIiQn82ikEurkHGfihr\' -e "GRANT ALL PRIVILEGES ON leon_express.* TO marval@\'%%\' WITH GRANT OPTION; FLUSH PRIVILEGES;"')
print(f"Privileges granted: {child.before.strip()[-100:]}")

# Verify
run(f'docker exec {mysql_name} mysql -umarval -p\'ThomasMarval2105..\' leon_express -e "SELECT 1 AS test;"')
print(f"Verify: {child.before.strip()[-100:]}")

# Restart Coolify backend
print(f"Restarting {backend_name}...")
run(f"docker restart {backend_name}")
time.sleep(15)

# Check status
run("docker ps --filter name=backend-wljwks --format '{{.Names}}: {{.Status}}'")
print(f"Status: {child.before.strip()[-100:]}")

# Check logs
run(f"docker logs {backend_name} --tail 20 2>&1")
print("=== BACKEND LOGS ===")
for line in child.before.strip().split('\n')[-20:]:
    if line.strip():
        print(f"  {line.strip()}")

# Check nginx for 502
run("docker logs nginx-wljwks 2>&1 | grep '502\\|error' | tail -3 || echo 'No 502 errors'")
print(f"Nginx: {child.before.strip()[-200:]}")

child.sendline('exit')
child.close()
print("\nDONE")
