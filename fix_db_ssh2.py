#!/usr/bin/env python3
"""Fix MySQL - suppress SSH warnings"""
import subprocess
import time

VPS = "root@65.75.201.175"
SSH_KEY = "/home/marval/.ssh/id_rsa"
SSH_OPTS = "-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"

def ssh(cmd):
    """Run SSH command via shell"""
    full = f'ssh {SSH_OPTS} -i {SSH_KEY} {VPS}'
    result = subprocess.run(full, shell=True, input=cmd, capture_output=True, text=True, timeout=30)
    return result.stdout.strip()

def ssh_script(script_lines):
    """Run multiple commands via SSH with heredoc"""
    full = f'ssh {SSH_OPTS} -i {SSH_KEY} {VPS} bash -s'
    result = subprocess.run(full, shell=True, input='\n'.join(script_lines), capture_output=True, text=True, timeout=60)
    return result.stdout.strip()

# Accept host key first
print("Setting up SSH...")
ssh("echo connected")
print("OK")

# Get clean container names
mysql_name = ssh("docker ps --format '{{.Names}}' | grep mysql | head -1")
backend_name = ssh("docker ps --format '{{.Names}}' | grep backend- | head -1")
print(f"MySQL: {mysql_name}")
print(f"Backend: {backend_name}")

if not mysql_name or not backend_name:
    print("ERROR: Could not find containers!")
    exit(1)

# Stop old containers
print("\n1. Cleaning old containers...")
ssh("docker stop leonexpress_backend 2>/dev/null; docker rm leonexpress_backend 2>/dev/null")
print("   Done")

# Create database and user via heredoc
print("\n2. Creating database and user...")
script = [
    f'cat <<EOF | docker exec -i {mysql_name} mysql -uroot -p\'efMfK3fH5dZYNaus3Sz68Etuyt69e3WpqoHDxsePFtz1EjIiQn82ikEurkHGfihr\'',
    'CREATE DATABASE IF NOT EXISTS leon_express CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;',
    "CREATE USER IF NOT EXISTS 'marval'@'%' IDENTIFIED BY 'ThomasMarval2105..';",
    "GRANT ALL PRIVILEGES ON leon_express.* TO 'marval'@'%' WITH GRANT OPTION;",
    'FLUSH PRIVILEGES;',
    'SHOW DATABASES;',
    'EOF'
]
output = ssh_script(script)
print(output)

# Verify
print("\n3. Verifying marval user...")
output = ssh(f"docker exec {mysql_name} mysql -umarval -p'ThomasMarval2105..' leon_express -e \"SELECT 1 AS test;\"")
print(output)

# Restart backend
print(f"\n4. Restarting {backend_name}...")
ssh(f"docker restart {backend_name}")
print("   Restarted, waiting 20s...")
time.sleep(20)

# Check backend status
status = ssh(f"docker ps --filter name={backend_name} --format '{{{{.Names}}}}: {{{{.Status}}}}'")
print(f"   Status: {status}")

# Check backend logs
print("\n5. Backend logs:")
logs = ssh(f"docker logs {backend_name} --tail 20 2>&1")
print(logs)

# Check nginx errors  
print("\n6. Nginx error check:")
errors = ssh('docker logs nginx-wljwks 2>&1 | grep -E "502|error" | tail -5 || echo "No 502 errors"')
print(errors)

# Check all containers
print("\n7. All containers:")
containers = ssh("docker ps --filter name=wljwks --format 'table {{.Names}}\t{{.Status}}'")
print(containers)

print("\n✅ COMPLETED")
