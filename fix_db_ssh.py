#!/usr/bin/env python3
"""Fix MySQL using subprocess (no terminal emulation)"""
import subprocess
import time

VPS = "root@65.75.201.175"
SSH_KEY = "/home/marval/.ssh/id_rsa"
SSH_OPTS = "-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

def ssh(cmd):
    """Run SSH command and return output"""
    full_cmd = f'ssh {SSH_OPTS} -i {SSH_KEY} {VPS} {__import__("shlex").quote(cmd)}'
    result = subprocess.run(full_cmd, shell=True, capture_output=True, text=True, timeout=30)
    return result.stdout + result.stderr

def ssh_raw(cmd):
    """Run SSH command without shell quoting (for complex commands)"""
    result = subprocess.run(
        ["ssh", SSH_OPTS.split()[0], SSH_OPTS.split()[1], SSH_OPTS.split()[2], SSH_OPTS.split()[3],
         "-i", SSH_KEY, VPS, cmd],
        capture_output=True, text=True, timeout=30
    )
    return result.stdout + result.stderr

# Step 1: Get mysql container name
print("1. Finding MySQL container...")
output = ssh("docker ps --format '{{.Names}}' | grep mysql | head -1")
mysql_name = output.strip()
print(f"   MySQL: '{mysql_name}'")

# Step 2: Get backend name  
output = ssh("docker ps --format '{{.Names}}' | grep backend- | head -1")
backend_name = output.strip()
print(f"   Backend: '{backend_name}'")

# Step 3: Stop old containers
print("\n2. Cleaning old containers...")
ssh("docker stop leonexpress_backend 2>/dev/null; docker rm leonexpress_backend 2>/dev/null")
print("   Done")

# Step 4: Create database
print("\n3. Creating database leon_express...")
with open("/tmp/create_db.sql", "w") as f:
    f.write("CREATE DATABASE IF NOT EXISTS leon_express CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n")
    f.write("CREATE USER IF NOT EXISTS 'marval'@'%' IDENTIFIED BY 'ThomasMarval2105..';\n")
    f.write("GRANT ALL PRIVILEGES ON leon_express.* TO 'marval'@'%' WITH GRANT OPTION;\n")
    f.write("FLUSH PRIVILEGES;\n")

output = ssh(f"cat /tmp/create_db.sql | docker exec -i {mysql_name} mysql -uroot -p'efMfK3fH5dZYNaus3Sz68Etuyt69e3WpqoHDxsePFtz1EjIiQn82ikEurkHGfihr'")
print(f"   {output}")

# Step 5: Verify
print("\n4. Verifying connection...")
output = ssh(f'docker exec {mysql_name} mysql -umarval -p\'ThomasMarval2105..\' leon_express -e "SELECT 1 AS test;"')
print(f"   {output}")

# Step 6: Restart the Coolify backend  
print(f"\n5. Restarting backend {backend_name}...")
output = ssh(f"docker restart {backend_name}")
print(f"   {output}")
print("   Waiting 20 seconds for startup...")
time.sleep(20)

# Step 7: Check backend status
print("\n6. Backend status:")
output = ssh(f"docker ps --filter name={backend_name} --format '{{{{.Names}}}}: {{{{.Status}}}}'")
print(f"   {output}")

# Step 8: Check backend logs
print("\n7. Backend logs (last 20 lines):")
output = ssh(f"docker logs {backend_name} --tail 20 2>&1")
print(f"   {output}")

# Step 9: Check nginx for 502 errors
print("\n8. Nginx error check:")
output = ssh("docker logs nginx-wljwks 2>&1 | grep -E '502|error' | tail -3 || echo 'No 502 errors found'")
print(f"   {output}")

# Step 10: Final check - all containers
print("\n9. All containers:")
output = ssh("docker ps --filter name=wljwks --format 'table {{.Names}}\t{{.Status}}'")
print(f"   {output}")

print("\n✅ COMPLETED")
