#!/usr/bin/env python3
"""Fix MySQL database on VPS - simple approach"""
import pexpect
import sys
import time

VPS_IP = "65.75.201.175"
VPS_USER = "root"
VPS_PASSWORD = "WAiSX7503rY9sdb"
LOCAL_KEY = open("/home/marval/.ssh/id_rsa.pub").read().strip()

def ssh_session(cmds, timeout=60):
    """Open SSH session, run commands, return output"""
    child = pexpect.spawn(
        f'ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null {VPS_USER}@{VPS_IP}',
        timeout=timeout,
        encoding='utf-8',
        maxread=65535
    )
    
    i = child.expect(['password:', 'continue connecting', pexpect.TIMEOUT], timeout=15)
    if i == 1:
        child.sendline('yes')
        child.expect('password:', timeout=15)
    elif i == 2:
        return "TIMEOUT_SSH"
    
    child.sendline(VPS_PASSWORD)
    i = child.expect(['root@.*#', 'root@.*\$', pexpect.TIMEOUT], timeout=15)
    if i == 2:
        return "TIMEOUT_SHELL"
    
    for cmd in cmds:
        child.sendline(cmd)
        time.sleep(2)
        child.expect(['root@.*#', 'root@.*\$', pexpect.TIMEOUT], timeout=timeout)
    
    child.sendline('echo "===SESSION_END==="')
    time.sleep(1)
    child.expect(['===SESSION_END===', pexpect.TIMEOUT], timeout=10)
    output = child.before
    
    child.sendline('exit')
    child.close()
    return output

# Step 1: Add SSH key for future access
print("1. Adding SSH key to VPS...")
output = ssh_session([
    f'mkdir -p ~/.ssh && chmod 700 ~/.ssh',
    f'echo "{LOCAL_KEY}" >> ~/.ssh/authorized_keys',
    'chmod 600 ~/.ssh/authorized_keys',
], timeout=15)
print(output[-300:] if len(output) > 300 else output)

# Step 2: Now SSH with key and fix MySQL
print("\n2. Connecting with SSH key to fix MySQL...")
child = pexpect.spawn(
    f'ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i /home/marval/.ssh/id_rsa {VPS_USER}@{VPS_IP}',
    timeout=90,
    encoding='utf-8',
    maxread=65535
)

i = child.expect(['password:', 'continue connecting', 'root@.*#', 'root@.*\$', pexpect.TIMEOUT], timeout=15)
if i == 0:
    # Key didn't work, fall back to password
    child.sendline(VPS_PASSWORD)
    child.expect(['root@.*#', 'root@.*\$', pexpect.TIMEOUT], timeout=15)
elif i == 1:
    child.sendline('yes')
    child.expect(['password:', 'root@.*#', 'root@.*\$', pexpect.TIMEOUT], timeout=15)
    if child.before and 'password' in str(child.before).lower():
        child.sendline(VPS_PASSWORD)
        child.expect(['root@.*#', 'root@.*\$', pexpect.TIMEOUT], timeout=15)

print("   Connected!")

# Get MySQL container name
child.sendline("docker ps --format '{{.Names}}' | grep -i mysql | head -1")
time.sleep(3)
child.expect(['root@.*#', 'root@.*\$', pexpect.TIMEOUT], timeout=15)
lines = child.before.strip().split('\n')
mysql_container = [l.strip() for l in lines if l.strip() and l.strip() != '']
mysql_container = mysql_container[-1] if mysql_container else ""
print(f"   MySQL container: {mysql_container}")

if not mysql_container:
    print("   ERROR: No MySQL container found!")
    child.sendline('exit')
    child.close()
    sys.exit(1)

# Run MySQL fix commands
mysql_cmds = [
    f'docker exec {mysql_container} mysql -uroot -p\'efMfK3fH5dZYNaus3Sz68Etuyt69e3WpqoHDxsePFtz1EjIiQn82ikEurkHGfihr\' -e "SHOW DATABASES;"',
    f'docker exec {mysql_container} mysql -uroot -p\'efMfK3fH5dZYNaus3Sz68Etuyt69e3WpqoHDxsePFtz1EjIiQn82ikEurkHGfihr\' -e "CREATE DATABASE IF NOT EXISTS leon_express CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"',
    f'docker exec {mysql_container} mysql -uroot -p\'efMfK3fH5dZYNaus3Sz68Etuyt69e3WpqoHDxsePFtz1EjIiQn82ikEurkHGfihr\' -e "CREATE USER IF NOT EXISTS \'marval\'@\'%%\' IDENTIFIED BY \'ThomasMarval2105..\';"',
    f'docker exec {mysql_container} mysql -uroot -p\'efMfK3fH5dZYNaus3Sz68Etuyt69e3WpqoHDxsePFtz1EjIiQn82ikEurkHGfihr\' -e "GRANT ALL PRIVILEGES ON leon_express.* TO \'marval\'@\'%%\' WITH GRANT OPTION; FLUSH PRIVILEGES;"',
    f'docker exec {mysql_container} mysql -umarval -p\'ThomasMarval2105..\' leon_express -e "SELECT \'CONEXION EXITOSA\' AS test;"',
]

for i, cmd in enumerate(mysql_cmds):
    print(f"   Step {i+1}/{len(mysql_cmds)}...")
    child.sendline(cmd)
    time.sleep(3)
    child.expect(['root@.*#', 'root@.*\$', pexpect.TIMEOUT], timeout=30)
    result = child.before.strip()
    # Print last few lines of result
    for line in result.split('\n')[-3:]:
        if line.strip():
            print(f"      {line.strip()}")

# Restart backend
print("\n3. Restarting backend...")
child.sendline("docker restart leonexpress_backend")
time.sleep(4)
child.expect(['root@.*#', 'root@.*\$', pexpect.TIMEOUT], timeout=15)
print(f"   Backend restarted")

# Check backend status
child.sendline("docker ps --filter name=leonexpress_backend --format '{{.Names}}: {{.Status}}'")
time.sleep(2)
child.expect(['root@.*#', 'root@.*\$', pexpect.TIMEOUT], timeout=10)
print(f"   Status: {child.before.strip().split(chr(10))[-1].strip()}")

# Get backend logs
print("\n4. Backend logs:")
child.sendline("docker logs leonexpress_backend --tail 20")
time.sleep(3)
child.expect(['root@.*#', 'root@.*\$', pexpect.TIMEOUT], timeout=15)
logs = child.before.strip()
for line in logs.split('\n'):
    print(f"   {line.strip()}")

child.sendline('exit')
child.close()

print("\n✅ COMPLETADO")
