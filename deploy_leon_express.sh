#!/bin/bash

# Leon Express - Script para transferir y desplegar en VPS
# Uso: ./deploy_leon_express.sh

set -e

# ──────────────────────────────────────────────
# CONFIGURACIÓN DEL SERVIDOR
# ──────────────────────────────────────────────
VPS_IP="65.75.201.175"
VPS_USER="root"
VPS_PASSWORD="WAiSX7503rY9sdb"
SSH_KEY="$(dirname "$0")/ssh_key/id_rsa.priv"
REMOTE_PATH="/opt/leon_express"
LOCAL_PATH="$(pwd)"

DATA_DIR_REMOTE="${REMOTE_PATH}/data"
UPLOADS_DIR_LOCAL="LeonExpress_back/uploads"
UPLOADS_DIR_REMOTE="${DATA_DIR_REMOTE}/uploads"
MYSQL_DIR_REMOTE="${DATA_DIR_REMOTE}/mysql"

# ──────────────────────────────────────────────
# HELPER: comando SSH/SCP con fallback a sshpass
# ──────────────────────────────────────────────
_ssh() {
  if [[ -f "$SSH_KEY" ]]; then
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o ControlMaster=auto \
        -o ControlPersist=60s -o ControlPath=~/.ssh/cm-%r@%h:%p \
        "${VPS_USER}@${VPS_IP}" "$@"
  elif command -v sshpass > /dev/null 2>&1; then
    sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no \
        -o ControlMaster=auto -o ControlPersist=60s \
        -o ControlPath=~/.ssh/cm-%r@%h:%p \
        "${VPS_USER}@${VPS_IP}" "$@"
  else
    echo "⚠️  Ni ssh_key ni sshpass disponibles. Usando SSH con contraseña interactiva..."
    ssh -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_IP}" "$@"
  fi
}

_scp() {
  if [[ -f "$SSH_KEY" ]]; then
    scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$@"
  elif command -v sshpass > /dev/null 2>&1; then
    sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no "$@"
  else
    scp -o StrictHostKeyChecking=no "$@"
  fi
}

_rsync() {
  if [[ -f "$SSH_KEY" ]]; then
    rsync -avzP -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=no" "$@"
  elif command -v sshpass > /dev/null 2>&1; then
    sshpass -p "$VPS_PASSWORD" rsync -avzP -e "ssh -o StrictHostKeyChecking=no" "$@"
  else
    rsync -avzP -e "ssh -o StrictHostKeyChecking=no" "$@"
  fi
}

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   🚀 Leon Express — Deploy al nuevo VPS      ║"
echo "║   Servidor: ${VPS_USER}@${VPS_IP}      ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ──────────────────────────────────────────────
# PASO 0: Copiar clave SSH al servidor (una vez)
# ──────────────────────────────────────────────
echo "🔑 Configurando acceso SSH sin contraseña..."
PUB_KEY_FILE="$(dirname "$0")/ssh_key/id_rsa.pub"
if [[ -f "$PUB_KEY_FILE" ]]; then
  if command -v sshpass > /dev/null 2>&1; then
    sshpass -p "$VPS_PASSWORD" ssh-copy-id -i "$PUB_KEY_FILE" \
      -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_IP}" 2>/dev/null && \
      echo "✅ Clave SSH copiada al servidor." || echo "ℹ️  Clave ya existente o sin sshpass, continuando..."
  else
    echo "ℹ️  sshpass no disponible, omitiendo copia de clave (conexión manual)"
  fi
else
  echo "ℹ️  No se encontró id_rsa.pub, saltando copia de clave"
fi

# ──────────────────────────────────────────────
# PASO 1: Preparar el servidor (instalar Docker si falta)
# ──────────────────────────────────────────────
echo ""
echo "🔧 Verificando dependencias en el servidor..."
_ssh bash -s << 'REMOTE_SETUP'
  set -e
  if ! command -v docker > /dev/null 2>&1; then
    echo "📦 Docker no encontrado. Instalando..."
    curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
    sh /tmp/get-docker.sh
    rm /tmp/get-docker.sh
    systemctl enable docker
    systemctl start docker
    echo "✅ Docker instalado: $(docker --version)"
  else
    echo "✅ Docker ya instalado: $(docker --version)"
  fi

  if ! docker compose version > /dev/null 2>&1 && ! command -v docker-compose > /dev/null 2>&1; then
    echo "📦 Instalando Docker Compose plugin..."
    apt-get install -y docker-compose-plugin 2>/dev/null || \
      curl -SL "https://github.com/docker/compose/releases/download/v2.24.6/docker-compose-$(uname -s)-$(uname -m)" \
        -o /usr/local/bin/docker-compose && chmod +x /usr/local/bin/docker-compose
    echo "✅ Docker Compose instalado"
  else
    echo "✅ Docker Compose ya disponible"
  fi

  # Configurar firewall
  if command -v ufw > /dev/null 2>&1; then
    ufw allow 22 > /dev/null 2>&1 || true
    ufw allow 80 > /dev/null 2>&1 || true
    ufw allow 443 > /dev/null 2>&1 || true
    ufw allow 4000 > /dev/null 2>&1 || true
    ufw allow 8443 > /dev/null 2>&1 || true
    ufw allow 9443 > /dev/null 2>&1 || true
    ufw --force enable > /dev/null 2>&1 || true
    echo "✅ Firewall configurado (22, 80, 443, 4000, 9443)"
  fi

  # Crear estructura de directorios
  mkdir -p /opt/leon_express/data/uploads /opt/leon_express/data/mysql
  echo "✅ Directorios del servidor listos"
REMOTE_SETUP

echo "🛠️  Building Docker images (direct docker build to avoid API mismatch)..."
docker build --no-cache -t leon_express-frontend:latest ./LeonExpress_front
docker build --no-cache -t leon_express-backend:latest ./LeonExpress_back

echo "📦 Comprimiendo imágenes..."
docker save leon_express-frontend:latest | gzip > leon_express-frontend.tar.gz
docker save leon_express-backend:latest  | gzip > leon_express-backend.tar.gz

echo "⏳ Esperando a que las imágenes estén listas..."
while [[ ! -f "leon_express-frontend.tar.gz" || ! -f "leon_express-backend.tar.gz" ]]; do
  sleep 2
done
echo "✅ Imágenes comprimidas listas."

# ──────────────────────────────────────────────
# PASO 3: Transferir archivos al servidor
# ──────────────────────────────────────────────
echo ""
echo "📤 Transfiriendo archivos al servidor..."

FILES=(
  "docker-compose.prod.yml"
  ".env"
  "leon_express-frontend.tar.gz"
  "leon_express-backend.tar.gz"
)

for file in "${FILES[@]}"; do
  if [[ -e "$file" ]]; then
    echo "  → $file"
    if command -v rsync > /dev/null 2>&1; then
      _rsync "$file" "${VPS_USER}@${VPS_IP}:${REMOTE_PATH}/"
    else
      _scp "$file" "${VPS_USER}@${VPS_IP}:${REMOTE_PATH}/"
    fi
  else
    echo "  ⚠️  Archivo no encontrado: $file"
  fi
done

if [[ -d "$UPLOADS_DIR_LOCAL" ]]; then
  echo "  → uploads/"
  if command -v rsync > /dev/null 2>&1; then
    _rsync "$UPLOADS_DIR_LOCAL/" "${VPS_USER}@${VPS_IP}:${UPLOADS_DIR_REMOTE}/"
  else
    _scp -r "$UPLOADS_DIR_LOCAL" "${VPS_USER}@${VPS_IP}:${UPLOADS_DIR_REMOTE}/"
  fi
fi

# ──────────────────────────────────────────────
# PASO 4: Deploy en el servidor remoto
# ──────────────────────────────────────────────
echo ""
echo "🔄 Ejecutando deploy en el servidor..."
_ssh bash -s << REMOTE_DEPLOY
  set -e
  cd ${REMOTE_PATH}

  # Permisos de datos persistentes
  chown -R 999:999 ${MYSQL_DIR_REMOTE} 2>/dev/null || true
  chmod -R 755 ${DATA_DIR_REMOTE} 2>/dev/null || true
  chmod -R 700 ${MYSQL_DIR_REMOTE} 2>/dev/null || true

  # Detectar docker compose command
  if docker compose version > /dev/null 2>&1; then
    DC="docker compose"
  else
    DC="docker-compose"
  fi

  echo "🛑 Deteniendo contenedores anteriores..."
  \$DC -f docker-compose.prod.yml down --remove-orphans 2>/dev/null || true
  docker rm -f leonexpress_backend leonexpress_frontend 2>/dev/null || true

  echo "🧹 Limpiando imágenes antiguas..."
  docker rmi leon_express-frontend:latest leon_express-backend:latest 2>/dev/null || true
  docker image prune -f || true
  docker system prune -f || true

  echo "📦 Cargando nuevas imágenes..."
  gunzip -c leon_express-frontend.tar.gz | docker load
  gunzip -c leon_express-backend.tar.gz  | docker load

  echo "🚀 Iniciando servicios..."
  \$DC -f docker-compose.prod.yml up -d --force-recreate

  echo "🧹 Limpiando archivos temporales..."
  rm -f *.tar *.tar.gz

  echo ""
  echo "📋 Estado de contenedores:"
  \$DC -f docker-compose.prod.yml ps
REMOTE_DEPLOY

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   ✅ Deploy completado exitosamente!          ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "🌐 Frontend:  http://${VPS_IP}"
echo "🔌 Backend:   http://${VPS_IP}:4000"
echo "📋 Logs:      ssh ${VPS_USER}@${VPS_IP} 'cd ${REMOTE_PATH} && docker compose -f docker-compose.prod.yml logs -f'"
echo "" 