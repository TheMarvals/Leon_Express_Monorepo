#!/bin/bash
# ══════════════════════════════════════════════════════
# Leon Express — Setup de Respaldo Diario Automático
# Ejecutar en el servidor: bash setup_backup.sh
# ══════════════════════════════════════════════════════

set -e

REMOTE_NAME="leon_backup"          # Nombre del remote en rclone
REMOTE_PATH="LeonExpress/backups"  # Carpeta dentro del destino (Drive/S3/etc)
BACKUP_DIR="/opt/leon_express/backups"
LOG_FILE="/var/log/leon_backup.log"
RETAIN_DAYS=30                     # Cuántos días conservar backups locales

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   💾 Leon Express — Configuración de Backup   ║"
echo "╚══════════════════════════════════════════════╝"

# ── 1. Instalar rclone si no está ─────────────────────
if ! command -v rclone > /dev/null 2>&1; then
    echo "📦 Instalando rclone..."
    curl https://rclone.org/install.sh | bash
    echo "✅ rclone instalado: $(rclone --version | head -1)"
else
    echo "✅ rclone ya instalado: $(rclone --version | head -1)"
fi

# ── 2. Crear directorio de backups ────────────────────
mkdir -p "$BACKUP_DIR"
echo "✅ Directorio de backups: $BACKUP_DIR"

# ── 3. Crear script de backup diario ─────────────────
BACKUP_SCRIPT_CONTENT=$(cat << 'BACKUP_SCRIPT'
#!/bin/bash
# Leon Express — Backup Diario
set -euo pipefail

BACKUP_DIR="/opt/leon_express/backups"
REMOTE_NAME="leon_backup"
REMOTE_PATH="LeonExpress"
RETAIN_DAYS=7
DATE=$(date +%Y-%m-%d_%H-%M)
LOG_FILE="/var/log/leon_backup.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"; }
log "════════════════════════════════"
log "🚀 Iniciando backup: $DATE"

mkdir -p "$BACKUP_DIR"

# ── A. Dump de MySQL (comprimido: ~500KB-700KB por día) ──
log "🗄️  Haciendo dump de MySQL..."
DB_NAME=$(grep ^DB_NAME /opt/leon_express/.env | cut -d= -f2)
DB_USER=$(grep ^DB_USER /opt/leon_express/.env | cut -d= -f2)
DB_PASS=$(grep ^DB_PASSWORD /opt/leon_express/.env | cut -d= -f2 | tr -d '"')

DUMP_FILE="$BACKUP_DIR/db_${DATE}.sql.gz"
docker exec leonexpress_mysql mysqldump \
    -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" 2>/dev/null \
    | gzip > "$DUMP_FILE"

DUMP_SIZE=$(du -sh "$DUMP_FILE" | cut -f1)
log "✅ DB dump: $DUMP_FILE ($DUMP_SIZE)"

# ── B. Uploads: sync incremental (solo archivos nuevos) ──
# No comprime todo cada día (evita 2GB diarios).
# Solo sube archivos nuevos/modificados — como Dropbox.
if rclone listremotes | grep -q "^${REMOTE_NAME}:"; then
    log "☁️  Sync DB dump → ${REMOTE_NAME}:${REMOTE_PATH}/db/"
    rclone copy "$DUMP_FILE" "${REMOTE_NAME}:${REMOTE_PATH}/db/" \
        --log-level INFO 2>>"$LOG_FILE" || log "⚠️  Error subiendo DB"

    log "☁️  Sync uploads → ${REMOTE_NAME}:${REMOTE_PATH}/uploads/ (solo nuevos)"
    rclone sync /opt/leon_express/data/uploads/ "${REMOTE_NAME}:${REMOTE_PATH}/uploads/" \
        --log-level INFO 2>>"$LOG_FILE" || log "⚠️  Error sync uploads"

    log "✅ Sync completado en $REMOTE_NAME"
else
    log "⚠️  Remote '${REMOTE_NAME}' no configurado aún. Backup solo local."
fi

# ── C. Limpiar dumps locales viejos (mantiene 7 días) ────
log "🧹 Limpiando dumps locales > ${RETAIN_DAYS} días..."
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETAIN_DAYS -delete 2>/dev/null || true

TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
log "✅ Backup completado. Espacio local usado: $TOTAL_SIZE"
log "════════════════════════════════"
BACKUP_SCRIPT
)

echo "$BACKUP_SCRIPT_CONTENT" > /usr/local/bin/leon_backup.sh

chmod +x /usr/local/bin/leon_backup.sh
echo "✅ Script de backup creado en /usr/local/bin/leon_backup.sh"

# ── 4. Configurar cron diario (3:00 AM hora del server) ─
CRON_LINE="0 3 * * * /usr/local/bin/leon_backup.sh >> /var/log/leon_backup.log 2>&1"
(crontab -l 2>/dev/null | grep -v leon_backup; echo "$CRON_LINE") | crontab -
echo "✅ Cron configurado: todos los días a las 03:00 AM"

# ── 5. Configurar rclone ──────────────────────────────
echo ""
echo "══════════════════════════════════════════════════"
echo "  PASO FINAL: Configura el destino del backup"
echo "══════════════════════════════════════════════════"
echo ""
echo "  Ejecuta en el servidor:"
echo "  rclone config"
echo ""
echo "  Opciones recomendadas:"
echo "  • Google Drive → tipo: drive"
echo "  • Backblaze B2 → tipo: b2"
echo "  • SFTP (NAS)   → tipo: sftp"
echo ""
echo "  Luego nombra el remote: leon_backup"
echo "  (El script lo usará automáticamente)"
echo ""
echo "  Para probar manualmente:"
echo "  /usr/local/bin/leon_backup.sh"
echo ""
echo "  Para ver logs:"
echo "  tail -f /var/log/leon_backup.log"
echo ""
