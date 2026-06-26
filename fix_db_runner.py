#!/usr/bin/env python3
"""SCP script to VPS and execute it to fix MySQL database"""
import pexpect
import time

VPS_IP = "65.75.201.175"
VPS_USER = "root"
VPS_PASSWORD = "WAiSX7503rY9sdb"

# Step 1: SCP the script to VPS
print("📤 Subiendo script al VPS...")
child = pexpect.spawn(
    f'scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null fix_db.sh {VPS_USER}@{VPS_IP}:/root/',
    timeout=30,
    encoding='utf-8'
)

i = child.expect(['password:', 'continue connecting', pexpect.TIMEOUT], timeout=10)
if i == 1:
    child.sendline('yes')
    child.expect('password:', timeout=10)
elif i == 2:
    print("❌ Timeout SCP")
    exit(1)

child.sendline(VPS_PASSWORD)
i = child.expect([pexpect.EOF, pexpect.TIMEOUT], timeout=15)
print(f"   SCP result: {child.before}")
child.close()

# Step 2: SSH and run the script
print("\n🔧 Ejecutando script en el VPS...")
child = pexpect.spawn(
    f'ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null {VPS_USER}@{VPS_IP}',
    timeout=60,
    encoding='utf-8',
    maxread=10000
)

i = child.expect(['password:', 'continue connecting', pexpect.TIMEOUT], timeout=10)
if i == 1:
    child.sendline('yes')
    child.expect('password:', timeout=10)
elif i == 2:
    print("❌ Timeout SSH")
    exit(1)

child.sendline(VPS_PASSWORD)
i = child.expect(['root@.*#', 'root@.*\$', pexpect.TIMEOUT], timeout=15)
if i == 2:
    print("❌ Timeout shell prompt")
    exit(1)
print("   ✅ Conectado al VPS")

child.sendline("chmod +x /root/fix_db.sh && bash /root/fix_db.sh")
time.sleep(2)

# Collect all output until we see DONE or timeout
output = ""
while True:
    i = child.expect(['=== DONE ===', 'root@.*#', 'root@.*\$', pexpect.TIMEOUT], timeout=45)
    output += child.before or ""
    if i == 0:
        output += child.after or ""
        break
    elif i == 3:
        print("⚠️ Timeout recolectando output")
        break
    else:
        # Got a prompt, send a newline to check if there's more
        child.sendline("")
        time.sleep(1)

print(output)

child.sendline('exit')
child.close()

# Step 3: Also check the final container health
print("\n📋 Verificando estado final de los contenedores...")
child = pexpect.spawn(
    f'ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null {VPS_USER}@{VPS_IP}',
    timeout=30,
    encoding='utf-8'
)
child.expect('password:', timeout=10)
child.sendline(VPS_PASSWORD)
child.expect(['root@.*#', 'root@.*\$', pexpect.TIMEOUT], timeout=10)

child.sendline("docker ps --format 'table {{.Names}}\t{{.Status}}'")
time.sleep(3)
child.expect(['root@.*#', 'root@.*\$', pexpect.TIMEOUT], timeout=10)
print(child.before)

child.sendline('exit')
child.close()

print("\n✅ PROCESO COMPLETADO")
