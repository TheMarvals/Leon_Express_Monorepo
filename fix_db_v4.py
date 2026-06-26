#!/usr/bin/env python3
"""Final fix - check state and fix MySQL"""
import pexpect
import time

VPS_IP = "65.75.201.175"
VPS_USER = "root"

# This should now work with SSH key
child = pexpect.spawn(
    f'ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i /home/marval/.ssh/id_rsa {VPS_USER}@{VPS_IP}',
    timeout=60,
    encoding='utf-8',
    maxread=65535
)

i = child.expect(['password:', 'continue connecting', 'root@.*#', 'root@.*\\$', pexpect.TIMEOUT], timeout=15)
if i == 0:
    print("SSH key didn't work, need password")
    child.sendline("WAiSX7503rY9sdb")
    child.expect(['root@.*#', 'root@.*\\$', pexpect.TIMEOUT], timeout=15)
elif i == 1:
    child.sendline('yes')
    child.expect(['root@.*#', 'root@.*\\$', pexpect.TIMEOUT], timeout=15)
print("Connected!")

# Check all containers
print("\n=== ALL CONTAINERS ===")
child.sendline("docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'")
time.sleep(3)
child.expect(['root@.*#', 'root@.*\\$', pexpect.TIMEOUT], timeout=15)
print(child.before)

# Get exact MySQL container name
print("\n=== MYSQL CONTAINER ===")
child.sendline("docker ps -a --format '{{.Names}}' | grep -i mysql")
time.sleep(3)
child.expect(['root@.*#', 'root@.*\\$', pexpect.TIMEOUT], timeout=15)
mysql_name = [l.strip() for l in child.before.split('\n') if l.strip() and 'docker' not in l and 'grep' not in l]
mysql_name = mysql_name[-1] if mysql_name else ""
print(f"MySQL container: '{mysql_name}'")

# Run MySQL commands with proper quoting using heredoc
print("\n=== FIXING MYSQL ===")
cmds = f"""
MYSQL="{mysql_name}"
docker exec "$MYSQL" mysql -uroot -p'efMfK3fH5dZYNaus3Sz68Etuyt69e3WpqoHDxsePFtz1EjIiQn82ikEurkHGfihr' <<'SQLEOF'
CREATE DATABASE IF NOT EXISTS leon_express CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'marval'@'%' IDENTIFIED BY 'ThomasMarval2105..';
GRANT ALL PRIVILEGES ON leon_express.* TO 'marval'@'%' WITH GRANT OPTION;
FLUSH PRIVILEGES;
SHOW DATABASES;
SELECT 'USER_EXISTS' FROM mysql.user WHERE user='marval';
SQLEOF
"""
for line in cmds.strip().split('\n'):
    if line.strip():
        child.sendline(line.strip())
        time.sleep(1.5)

time.sleep(3)
child.expect(['root@.*#', 'root@.*\\$', pexpect.TIMEOUT], timeout=30)
print(child.before)

# Verify marval can connect
print("\n=== VERIFY MARVAL CONNECTION ===")
child.sendline(f'docker exec "{mysql_name}" mysql -umarval -p\'ThomasMarval2105..\' leon_express -e "SELECT \'CONEXION_EXITOSA\' AS test;"')
time.sleep(3)
child.expect(['root@.*#', 'root@.*\\$', pexpect.TIMEOUT], timeout=15)
print(child.before)

# Check backend status
print("\n=== BACKEND STATUS ===")
child.sendline("docker ps --filter name=leonexpress_backend --format '{{.Names}}: {{.Status}}'")
time.sleep(2)
child.expect(['root@.*#', 'root@.*\\$', pexpect.TIMEOUT], timeout=10)
print(child.before)

# If backend is not running or crashed, restart it
print("\n=== RESTARTING BACKEND ===")
child.sendline("docker restart leonexpress_backend")
time.sleep(5)
child.expect(['root@.*#', 'root@.*\\$', pexpect.TIMEOUT], timeout=15)

# Wait and check logs
time.sleep(8)
child.sendline("docker logs leonexpress_backend --tail 30 2>&1")
time.sleep(3)
child.expect(['root@.*#', 'root@.*\\$', pexpect.TIMEOUT], timeout=15)
logs = child.before
print("=== BACKEND LOGS ===")
for line in logs.split('\n'):
    if line.strip():
        print(f"  {line.strip()}")

child.sendline('exit')
child.close()
print("\n✅ DONE")
