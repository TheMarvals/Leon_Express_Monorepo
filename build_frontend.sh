#!/bin/bash
set -e

echo "🛠️  Re-construyendo frontend..."
cd /home/marval/Proyects/Leon_Express
docker-compose build --no-cache frontend
echo "📦 Comprimiendo imagen (esto puede tardar unos segundos)..."
docker save leon_express-frontend:latest | gzip > leon_express-frontend.tar.gz

echo "📤 Subiendo imagen al servidor..."
scp -i ssh_key/id_rsa.priv -o StrictHostKeyChecking=no leon_express-frontend.tar.gz root@65.75.201.175:/opt/leon_express/

echo "🔄 Reiniciando contenedor en servidor..."
ssh -i ssh_key/id_rsa.priv -o StrictHostKeyChecking=no root@65.75.201.175 "
  cd /opt/leon_express
  docker load -i leon_express-frontend.tar.gz
  docker compose -f docker-compose.prod.yml up -d --force-recreate frontend
"
echo "✅ Frontend actualizado."
