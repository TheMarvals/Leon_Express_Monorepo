#!/usr/bin/env python3
import pexpect
import sys
import time

VPS_IP = "65.75.201.175"
VPS_USER = "root"
VPS_PASSWORD = "WAiSX7503rY9sdb"

def run_ssh_command(command, timeout=30):
    """Run a single command via SSH and return output"""
    child = pexpect.spawn(
        f'ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null {VPS_USER}@{VPS_IP}',
        timeout=30,
        encoding='utf-8'
    )
    
    i = child.expect(['password:', 'continue connecting', pexpect.TIMEOUT], timeout=10)
    if i == 1:
        child.sendline('yes')
        child.expect('password:', timeout=10)
    elif i == 2:
        return "TIMEOUT_SSH"
    
    child.sendline(VPS_PASSWORD)
    i = child.expect(['root@.*#', 'root@.*\$', pexpect.TIMEOUT], timeout=10)
    if i == 2:
        return "TIMEOUT_SHELL"
    
    child.sendline(command)
    time.sleep(3)
    child.expect(['root@.*#', 'root@.*\$', pexpect.TIMEOUT], timeout=timeout)
    output = child.before
    
    child.sendline('exit')
    child.close()
    return output

# Step 1: Find MySQL container
print("🔍 Buscando contenedor MySQL...")
result = run_ssh_command("docker ps --format '{{.Names}}' | grep -i mysql | head -1")
mysql_container = [l.strip() for l in result.split('\n') if l.strip() and 'mysql' in l.lower() and 'grep' not in l]
mysql_container = mysql_container[-1] if mysql_container else None
if not mysql_container:
    # Try docker ps -a
    result = run_ssh_command("docker ps -a --format '{{.Names}}' | grep -i mysql | head -1")
    mysql_container = [l.strip() for l in result.split('\n') if l.strip() and 'docker' not in l and mysql_container is None]
    mysql_container = mysql_container[-1] if mysql_container else "unknown"
print(f"   Contenedor: {mysql_container}")

# Step 2: Check if the database and user exist
print("\n🔍 Verificando estado actual de MySQL...")
result = run_ssh_command(f"docker exec {mysql_container} mysql -uroot -p'efMfK3fH5dZYNaus3Sz68Etuyt69e3WpqoHDxsePFtz1EjIiQn82ikEurkHGfihr' -e \"SHOW DATABASES;\" 2>&1")
print(result)

# Step 3: Create database
print("\n📦 Creando base de datos 'leon_express'...")
result = run_ssh_command(f"docker exec {mysql_container} mysql -uroot -p'efMfK3fH5dZYNaus3Sz68Etuyt69e3WpqoHDxsePFtz1EjIiQn82ikEurkHGfihr' -e \"CREATE DATABASE IF NOT EXISTS leon_express CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\" 2>&1")
print(f"   Resultado: {result.strip()[:200] if result else 'None'}")

# Step 4: Create user
print("\n👤 Creando usuario 'marval'...")
result = run_ssh_command(f"docker exec {mysql_container} mysql -uroot -p'efMfK3fH5dZYNaus3Sz68Etuyt69e3WpqoHDxsePFtz1EjIiQn82ikEurkHGfihr' -e \"CREATE USER IF NOT EXISTS 'marval'@'%' IDENTIFIED BY 'ThomasMarval2105..';\" 2>&1")
print(f"   Resultado: {result.strip()[:200] if result else 'None'}")

# Step 5: Grant privileges
print("\n🔑 Otorgando privilegios...")
result = run_ssh_command(f"docker exec {mysql_container} mysql -uroot -p'efMfK3fH5dZYNaus3Sz68Etuyt69e3WpqoHDxsePFtz1EjIiQn82ikEurkHGfihr' -e \"GRANT ALL PRIVILEGES ON leon_express.* TO 'marval'@'%' WITH GRANT OPTION; FLUSH PRIVILEGES;\" 2>&1")
print(f"   Resultado: {result.strip()[:200] if result else 'None'}")

# Step 6: Verify connection
print("\n✅ Verificando conexión con usuario marval...")
result = run_ssh_command(f"docker exec {mysql_container} mysql -umarval -p'ThomasMarval2105..' leon_express -e \"SELECT 'CONEXIÓN EXITOSA' AS test;\" 2>&1")
print(f"   Resultado: {result.strip()[:300] if result else 'None'}")

# Step 7: Restart backend
print("\n🔄 Reiniciando backend...")
result = run_ssh_command("docker restart leonexpress_backend 2>&1", timeout=15)
print(f"   Resultado: {result.strip()[:200] if result else 'None'}")
time.sleep(3)

# Step 8: Check backend status
print("\n📋 Estado del backend...")
result = run_ssh_command("docker ps --filter name=leonexpress_backend --format '{{.Names}}: {{.Status}}' 2>&1")
print(f"   {result.strip() if result else 'None'}")

# Step 9: Check backend logs
print("\n📋 Últimos logs del backend...")
result = run_ssh_command("docker logs leonexpress_backend --tail 30 2>&1", timeout=15)
print(f"   {result.strip() if result else 'None'}")

print("\n✅ PROCESO COMPLETADO")
