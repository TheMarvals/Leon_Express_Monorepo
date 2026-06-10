# 🚀 Instrucciones de Deploy - Leon Express

## Opción 1: Deploy Automático (Recomendado - Linux/Mac/WSL)

Si estás en Linux, Mac o WSL, ejecuta:

```bash
cd /ruta/al/proyecto/Leon_Express
chmod +x deploy_leon_express.sh
./deploy_leon_express.sh
```

## Opción 2: Deploy Manual (Windows o si el script falla)

### Paso 1: Construir las imágenes Docker

```bash
# Desde la raíz del proyecto
docker-compose build --no-cache frontend backend

# Guardar las imágenes como .tar
docker save leon_express-frontend:latest -o leon_express-frontend.tar
docker save leon_express-backend:latest -o leon_express-backend.tar
```

### Paso 2: Subir archivos al VPS

```bash
# Configuración del VPS
VPS_IP="leonexpress.themarvals.com"
VPS_USER="root"
REMOTE_PATH="/opt/leon_express"

# Subir archivos necesarios
scp docker-compose.prod.yml ${VPS_USER}@${VPS_IP}:${REMOTE_PATH}/
scp .env ${VPS_USER}@${VPS_IP}:${REMOTE_PATH}/
scp leon_express-frontend.tar ${VPS_USER}@${VPS_IP}:${REMOTE_PATH}/
scp leon_express-backend.tar ${VPS_USER}@${VPS_IP}:${REMOTE_PATH}/

# Subir directorio uploads (si hay cambios)
rsync -avz LeonExpress_back/uploads/ ${VPS_USER}@${VPS_IP}:${REMOTE_PATH}/data/uploads/
```

### Paso 3: Conectar al VPS y desplegar

```bash
ssh ${VPS_USER}@${VPS_IP}
cd ${REMOTE_PATH}

# Crear estructura de directorios
mkdir -p data/uploads data/mysql

# Detener contenedores anteriores
docker-compose -f docker-compose.prod.yml down --remove-orphans

# Limpiar imágenes antiguas
docker rmi leon_express-frontend:latest leon_express-backend:latest 2>/dev/null || true
docker image prune -f

# Cargar nuevas imágenes
docker load -i leon_express-frontend.tar
docker load -i leon_express-backend.tar

# Iniciar servicios
docker-compose -f docker-compose.prod.yml up -d --force-recreate

# Verificar estado
docker-compose -f docker-compose.prod.yml ps

# Ver logs
docker-compose -f docker-compose.prod.yml logs -f
```

## Verificación Post-Deploy

1. **Verificar contenedores:**
   ```bash
   docker-compose -f docker-compose.prod.yml ps
   ```
   Ambos contenedores deben estar "Up"

2. **Verificar logs:**
   ```bash
   docker-compose -f docker-compose.prod.yml logs backend
   docker-compose -f docker-compose.prod.yml logs frontend
   ```

3. **Probar acceso:**
   - Frontend: http://leonexpress.themarvals.com
   - Backend API: http://leonexpress.themarvals.com:4000/api

## Troubleshooting

### Si los contenedores no inician:
```bash
# Ver logs detallados
docker-compose -f docker-compose.prod.yml logs

# Reiniciar servicios
docker-compose -f docker-compose.prod.yml restart

# Reconstruir si es necesario
docker-compose -f docker-compose.prod.yml up -d --build --force-recreate
```

### Si hay problemas de permisos:
```bash
chmod -R 755 /opt/leon_express/data
chown -R 999:999 /opt/leon_express/data/mysql
```

### Si el backend no conecta a la BD:
- Verificar variables en `.env` en el VPS
- Verificar que el servidor de BD permita conexiones remotas
- Probar conexión: `mysql -h DB_HOST -u DB_USER -p DB_NAME`

## Archivos Necesarios en VPS

- `docker-compose.prod.yml` - Configuración de Docker Compose
- `.env` - Variables de entorno (DB, JWT, VAPID, etc.)
- `leon_express-frontend.tar` - Imagen del frontend
- `leon_express-backend.tar` - Imagen del backend
- `data/uploads/` - Directorio de uploads (si aplica)

