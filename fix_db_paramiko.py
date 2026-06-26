#!/usr/bin/env python3
"""Connect backend to coolify network so it can reach MySQL"""
import paramiko
import time

VPS_IP = "65.75.201.175"
VPS_USER = "root"
SSH_KEY = "/home/marval/.ssh/id_rsa"

def ssh_exec(client, command, timeout=30):
    stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
    exit_status = stdout.channel.recv_exit_status()
    output = stdout.read().decode().strip()
    error = stderr.read().decode().strip()
    return output, error, exit_status

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
client.connect(VPS_IP, username=VPS_USER, pkey=key, look_for_keys=False)
print("Connected!")

# Get names
out, err, code = ssh_exec(client, "docker ps --format '{{.Names}}' | grep backend- | head -1")
backend_name = out.strip()
out, err, code = ssh_exec(client, "docker ps --format '{{.Names}} {{.Image}}' | grep 'mysql:' | head -1 | cut -d' ' -f1")
mysql_name = out.strip()
print(f"Backend: {backend_name}")
print(f"MySQL: {mysql_name}")

# Step 1: Find the coolify network name
print("\n1. Finding coolify network...")
out, err, code = ssh_exec(client, "docker network ls --format '{{.Name}}' | grep coolify | head -1")
coolify_net = out.strip()
print(f"   Coolify network: '{coolify_net}'")

# Step 2: Check what networks MySQL is on
print(f"\n2. MySQL networks:")
out, err, code = ssh_exec(client, f"docker inspect {mysql_name} --format '{{{{range $k, $v := .NetworkSettings.Networks}}}}{{$k}}\n{{{{end}}}}'")
for line in out.strip().split('\n'):
    if line.strip():
        print(f"   - {line}")

# Step 3: Connect backend to coolify network
print(f"\n3. Connecting {backend_name} to {coolify_net} network...")
out, err, code = ssh_exec(client, f"docker network connect {coolify_net} {backend_name}")
print(f"   stdout: {out}")
print(f"   stderr: {err}")
print(f"   exit: {code}")

# Step 4: Verify they're now on the same network
print(f"\n4. Verifying network connection...")
out, err, code = ssh_exec(client, f"docker inspect {backend_name} --format '{{{{range $k, $v := .NetworkSettings.Networks}}}}{{$k}}\n{{{{end}}}}'")
print(f"   Backend networks:\n{out}")

# Step 5: Test DNS resolution from backend
print(f"\n5. Testing DNS resolution from backend...")
out, err, code = ssh_exec(client, f"docker exec {backend_name} sh -c 'getent hosts {mysql_name} 2>&1 || nslookup {mysql_name} 2>&1 | head -5'")
print(f"   DNS: {out}")

# Step 6: Test mysql connection from backend
print(f"\n6. Testing MySQL connection from backend...")
out, err, code = ssh_exec(client, f"docker exec {backend_name} sh -c 'DB_HOST={mysql_name} timeout 10 mariadb-admin ping -h \\$DB_HOST -P 3306 -u marval -pThomasMarval2105.. --skip-ssl 2>&1'")
print(f"   mysqladmin ping: {out}")

# Step 7: Restart backend
print(f"\n7. Restarting backend...")
ssh_exec(client, f"docker restart {backend_name}")
print("   Waiting 25 seconds...")
time.sleep(25)

# Step 8: Check status & logs
out, err, code = ssh_exec(client, f"docker ps --filter name={backend_name} --format '{{{{.Names}}}}: {{{{.Status}}}}'")
print(f"   Status: {out}")

print(f"\n8. Backend logs:")
out, err, code = ssh_exec(client, f"docker logs {backend_name} --tail 25 2>&1")
print(out)

# Step 9: Check nginx for 502
print(f"\n9. Nginx error check:")
out, err, code = ssh_exec(client, "docker logs nginx-wljwks 2>&1 | grep -E '502|error' | tail -5 || echo 'No 502 errors'")
print(out)

client.close()
print("\n✅ COMPLETED")
