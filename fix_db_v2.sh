#!/bin/bash
set -e

MYSQL_CONTAINER=$(docker ps --format '{{.Names}}' | grep -i mysql | head -1)
echo "MYSQL_CONTAINER=$MYSQL_CONTAINER"

if [ -z "$MYSQL_CONTAINER" ]; then
    echo "ERROR: No MySQL container found"
    docker ps -a --format 'table {{.Names}}\t{{.Status}}' 2>/dev/null
    exit 1
fi

echo ""
echo "=== SHOW DATABASES ==="
docker exec "$MYSQL_CONTAINER" mysql -uroot -p'efMfK3fH5dZYNaus3Sz68Etuyt69e3WpqoHDxsePFtz1EjIiQn82ikEurkHGfihr' -e "SHOW DATABASES;" 2>&1

echo ""
echo "=== CREATE DATABASE ==="
docker exec "$MYSQL_CONTAINER" mysql -uroot -p'efMfK3fH5dZYNaus3Sz68Etuyt69e3WpqoHDxsePFtz1EjIiQn82ikEurkHGfihr' -e "CREATE DATABASE IF NOT EXISTS leon_express CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>&1

echo ""
echo "=== CREATE USER ==="
docker exec "$MYSQL_CONTAINER" mysql -uroot -p'efMfK3fH5dZYNaus3Sz68Etuyt69e3WpqoHDxsePFtz1EjIiQn82ikEurkHGfihr' -e "CREATE USER IF NOT EXISTS 'marval'@'%' IDENTIFIED BY 'ThomasMarval2105..';" 2>&1

echo ""
echo "=== GRANT PRIVILEGES ==="
docker exec "$MYSQL_CONTAINER" mysql -uroot -p'efMfK3fH5dZYNaus3Sz68Etuyt69e3WpqoHDxsePFtz1EjIiQn82ikEurkHGfihr' -e "GRANT ALL PRIVILEGES ON leon_express.* TO 'marval'@'%' WITH GRANT OPTION; FLUSH PRIVILEGES;" 2>&1

echo ""
echo "=== VERIFY CONNECTION ==="
docker exec "$MYSQL_CONTAINER" mysql -umarval -p'ThomasMarval2105..' leon_express -e "SELECT 'CONEXION EXITOSA' AS test;" 2>&1

echo ""
echo "=== RESTART BACKEND ==="
docker restart leonexpress_backend 2>&1
sleep 3

echo ""
echo "=== BACKEND STATUS ==="
docker ps --filter name=leonexpress_backend --format '{{.Names}}: {{.Status}}' 2>&1

echo ""
echo "=== BACKEND LOGS (last 30 lines) ==="
docker logs leonexpress_backend --tail 30 2>&1

echo ""
echo "=== DONE ==="
