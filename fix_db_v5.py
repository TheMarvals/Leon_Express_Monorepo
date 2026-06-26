#!/usr/bin/env python3
"""Clean up old containers and verify Coolify deployment health"""
import pexpect
import time

VPS_IP = "65.75.201.175"
VPS_USER = "root"

child = pexpect.spawn(
    f'ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i /home/marval/.ssh/id_rsa {VPS_USER}@{VPS_IP}',
    timeout=60,
    encoding='utf-8',
    maxread=65535
)
i = child.expect(['continue connecting', 'root@.*#', 'root@.*\\$', pexpect.TIMEOUT], timeout=15)
if i == 0:
    child.sendline('yes')
    child.expect(['root@.*#', 'root@.*\\$', pexpect.TIMEOUT], timeout=15)
print("Connected!")

# Stop the old leonexpress_backend I accidentally started
print("\n1. Stopping old leonexpress_backend container...")
child.sendline("docker stop leonexpress_backend 2>/dev/null; docker rm leonexpress_backend 2>/dev/null; echo 'done'")
time.sleep(2)
child.expect(['root@.*#', 'root@.*\\$', pexpect.TIMEOUT], timeout=10)
print("   Old backend container removed")

# Check Coolify backend is healthy
print("\n2. Coolify backend health check...")
child.sendline("docker ps --filter name=backend-wljwks --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'")
time.sleep(2)
child.expect(['root@.*#', 'root@.*\\$', pexpect.TIMEOUT], timeout=10)
print(f"   {child.before.strip()}")

# Get Coolify backend logs to verify it's working
print("\n3. Coolify backend logs (last 15 lines)...")
child.sendline("docker logs backend-wljwks19ph3cnnsua8luahue-232907395832 --tail 15 2>&1")
time.sleep(3)
child.expect(['root@.*#', 'root@.*\\$', pexpect.TIMEOUT], timeout=15)
logs = child.before.strip()
for line in logs.split('\n'):
    if line.strip():
        print(f"   {line.strip()}")

# Check Coolify nginx logs
print("\n4. Coolify nginx logs (last 5 lines - looking for 502)...")
child.sendline("docker logs nginx-wljwks19ph3cnnsua8luahue-232907484545 --tail 5 2>&1")
time.sleep(2)
child.expect(['root@.*#', 'root@.*\\$', pexpect.TIMEOUT], timeout=10)
print(f"   {child.before.strip()}")

# Verify API endpoint works (from inside the network)
print("\n5. Testing API connectivity...")
# Check if we can curl the backend from within the nginx container
child.sendline("docker exec nginx-wljwks19ph3cnnsua8luahue-232907484545 curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 http://backend-wljwks19ph3cnnsua8luahue-232907395832:4100/ 2>&1 || echo 'curl failed'")
time.sleep(3)
child.expect(['root@.*#', 'root@.*\\$', pexpect.TIMEOUT], timeout=15)
print(f"   API health check: {child.before.strip()}")

# Check all Coolify-managed containers
print("\n6. All Coolify leonexpress containers...")
child.sendline("docker ps --filter name=wljwks --format 'table {{.Names}}\t{{.Status}}'")
time.sleep(2)
child.expect(['root@.*#', 'root@.*\\$', pexpect.TIMEOUT], timeout=10)
for line in child.before.strip().split('\n'):
    if line.strip():
        print(f"   {line.strip()}")

child.sendline('exit')
child.close()
print("\n✅ VERIFICATION COMPLETE")
