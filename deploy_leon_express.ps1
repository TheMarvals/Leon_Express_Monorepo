# Leon Express - Script PowerShell para deploy en VPS
# Uso: .\deploy_leon_express.ps1

$ErrorActionPreference = "Stop"

# Configuración del VPS
$VPS_IP = "leonexpress.themarvals.com"
$VPS_USER = "root"
$REMOTE_PATH = "/opt/leon_express"
$LOCAL_PATH = Get-Location

Write-Host "🚀 Starting Leon Express deployment to VPS..." -ForegroundColor Cyan
Write-Host "VPS: ${VPS_USER}@${VPS_IP}" -ForegroundColor Yellow
Write-Host "Remote path: ${REMOTE_PATH}" -ForegroundColor Yellow

# Paso 1: Eliminar imágenes .tar antiguas
Write-Host "`n🧹 Limpiando imágenes .tar antiguas..." -ForegroundColor Yellow
Remove-Item -Path "leon_express-frontend.tar", "leon_express-backend.tar" -ErrorAction SilentlyContinue

# Paso 2: Construir imágenes Docker
Write-Host "`n🛠️ Building Docker images fresh (no cache)..." -ForegroundColor Cyan
docker-compose build --no-cache frontend backend

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error al construir imágenes Docker" -ForegroundColor Red
    exit 1
}

# Paso 3: Guardar imágenes como .tar
Write-Host "`n💾 Guardando imágenes Docker..." -ForegroundColor Cyan
docker save leon_express-frontend:latest -o leon_express-frontend.tar
docker save leon_express-backend:latest -o leon_express-backend.tar

# Verificar que se crearon
if (-not (Test-Path "leon_express-frontend.tar") -or -not (Test-Path "leon_express-backend.tar")) {
    Write-Host "❌ Error: No se crearon las imágenes .tar" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Imágenes Docker listas." -ForegroundColor Green

# Paso 4: Subir archivos al VPS
Write-Host "`n📤 Subiendo archivos a VPS..." -ForegroundColor Cyan

# Archivos necesarios
$files = @(
    "docker-compose.prod.yml",
    ".env",
    "leon_express-frontend.tar",
    "leon_express-backend.tar"
)

# Verificar que existen los archivos
foreach ($file in $files) {
    if (-not (Test-Path $file)) {
        Write-Host "⚠️  Archivo no encontrado: $file" -ForegroundColor Yellow
    }
}

# Crear estructura de directorios en VPS
Write-Host "📁 Creando estructura de directorios en VPS..." -ForegroundColor Cyan
ssh "${VPS_USER}@${VPS_IP}" "mkdir -p ${REMOTE_PATH} ${REMOTE_PATH}/data ${REMOTE_PATH}/data/uploads ${REMOTE_PATH}/data/mysql"

# Subir archivos
foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "  📤 Subiendo $file..." -ForegroundColor Gray
        scp $file "${VPS_USER}@${VPS_IP}:${REMOTE_PATH}/"
    }
}

# Subir directorio uploads si existe
if (Test-Path "LeonExpress_back/uploads") {
    Write-Host "📁 Sincronizando directorio uploads..." -ForegroundColor Cyan
    # Usar scp recursivo (rsync no está disponible en PowerShell por defecto)
    scp -r "LeonExpress_back/uploads" "${VPS_USER}@${VPS_IP}:${REMOTE_PATH}/data/"
}

# Paso 5: Desplegar en VPS
Write-Host "`n🚀 Desplegando en VPS..." -ForegroundColor Cyan

$deployScript = @"
cd ${REMOTE_PATH}

# Detener contenedores anteriores
echo "🛑 Stopping previous containers..."
docker-compose -f docker-compose.prod.yml down --remove-orphans || true
docker rm -f leonexpress_backend leonexpress_frontend 2>/dev/null || true

# Limpiar imágenes antiguas
echo "🧹 Cleaning old images..."
docker rmi leon_express-frontend:latest leon_express-backend:latest 2>/dev/null || true
docker image prune -f || true

# Cargar nuevas imágenes
echo "📦 Loading new images..."
docker load -i leon_express-frontend.tar
docker load -i leon_express-backend.tar

# Iniciar servicios
echo "🚀 Starting services..."
docker-compose -f docker-compose.prod.yml up -d --force-recreate

# Limpiar archivos temporales
rm -f *.tar

# Verificar estado
echo "📊 Container status:"
docker-compose -f docker-compose.prod.yml ps
"@

# Ejecutar script en el VPS
ssh "${VPS_USER}@${VPS_IP}" $deployScript

Write-Host "`n✅ Despliegue completado!" -ForegroundColor Green
Write-Host "🌐 Accede a: http://${VPS_IP}" -ForegroundColor Cyan
Write-Host "📋 Para ver logs:" -ForegroundColor Yellow
Write-Host "   ssh ${VPS_USER}@${VPS_IP} 'cd ${REMOTE_PATH} && docker-compose -f docker-compose.prod.yml logs -f'" -ForegroundColor Gray

