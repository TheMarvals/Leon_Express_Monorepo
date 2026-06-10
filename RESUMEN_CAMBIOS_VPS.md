# Resumen: Cambios para Aplicar en el VPS

## ✅ Cambios Ya Realizados Localmente

### 1. Servidor Node.js (Ya aplicado)
- **Archivo**: `LeonExpress_back/app.js`
- **Cambios**: Timeouts configurados a 600s (10 minutos)
- **Estado**: ✅ Ya aceptado y guardado

### 2. Archivos Preparados para el VPS
- `fix_nginx_408_timeout.sh` - Script automático para actualizar nginx
- `nginx_config_completo_actualizado.conf` - Configuración completa de referencia
- `nginx_config_408_fix.conf` - Solo el bloque location /api/ actualizado

---

## 🚀 Qué Hacer en el VPS

### Paso 1: Transferir Archivos al VPS

Desde tu máquina Windows, transfiere el script al VPS:

```bash
# Opción 1: Usando SCP (desde PowerShell o Git Bash)
scp fix_nginx_408_timeout.sh usuario@tu-vps:/home/usuario/

# Opción 2: Usando WinSCP o similar (interfaz gráfica)
# Copia el archivo fix_nginx_408_timeout.sh al directorio home del usuario en el VPS
```

**Reemplaza:**
- `usuario` por tu usuario del VPS
- `tu-vps` por la IP o dominio de tu VPS

### Paso 2: Conectarse al VPS

```bash
ssh usuario@tu-vps
```

### Paso 3: Ejecutar el Script en el VPS

Una vez conectado al VPS, ejecuta:

```bash
# Ir al directorio donde copiaste el script
cd ~

# Dar permisos de ejecución
chmod +x fix_nginx_408_timeout.sh

# Ejecutar el script
sudo ./fix_nginx_408_timeout.sh
```

El script hará:
- ✅ Buscar el archivo de configuración de nginx
- ✅ Crear un backup automático
- ✅ Actualizar los timeouts de 300s a 600s
- ✅ Agregar configuraciones de keep-alive
- ✅ Verificar la configuración
- ✅ Pedir confirmación para recargar nginx

**Responde 'y' cuando pregunte si quieres recargar nginx.**

### Paso 4: Reiniciar el Servidor Node.js en el VPS

Después de actualizar nginx, reinicia el backend:

**Si usas PM2:**
```bash
pm2 restart leon_express_backend
# O el nombre que uses
pm2 logs leon_express_backend --lines 50
```

**Si no usas PM2:**
```bash
# Detén el servidor (Ctrl+C si está corriendo)
# Luego reinícialo
cd /ruta/a/LeonExpress_back
npm start
# O como tengas configurado
```

### Paso 5: Verificar

1. **Verificar logs de nginx:**
   ```bash
   sudo tail -f /var/log/nginx/error.log
   ```

2. **Probar con una carga grande de paquetes** y verificar que no ocurra el error 408.

---

## 🔄 Alternativa: Aplicación Manual

Si prefieres aplicar los cambios manualmente en lugar del script:

### 1. Hacer Backup
```bash
sudo cp /etc/nginx/sites-enabled/leonexpress.themarvals.com /etc/nginx/sites-enabled/leonexpress.themarvals.com.backup.$(date +%Y%m%d_%H%M%S)
```

### 2. Editar el Archivo
```bash
sudo nano /etc/nginx/sites-enabled/leonexpress.themarvals.com
```

### 3. Reemplazar el Bloque `location /api/`

Busca el bloque:
```nginx
location /api/ {
    proxy_pass http://127.0.0.1:4000;
    ...
    proxy_read_timeout 300s;
}
```

Y reemplázalo por:
```nginx
location /api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Límites para subidas grandes desde Android
    client_max_body_size 150M;
    proxy_request_buffering off;
    
    # HTTP/1.1 para mantener conexiones vivas (keep-alive)
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    
    # Timeouts aumentados a 600s (10 minutos) para cargas grandes de paquetes
    proxy_connect_timeout 600s;
    proxy_send_timeout 600s;
    proxy_read_timeout 600s;
    send_timeout 600s;
    
    # Buffers aumentados para evitar problemas con datos grandes
    proxy_buffer_size 16k;
    proxy_buffers 8 16k;
    proxy_busy_buffers_size 32k;
    
    # No cachear respuestas de la API
    proxy_cache_bypass $http_upgrade;
    proxy_no_cache $http_upgrade;
}
```

### 4. Verificar y Recargar
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## 📋 Checklist Final

- [ ] Script transferido al VPS (o aplicar manualmente)
- [ ] Backup de configuración nginx creado
- [ ] Timeouts actualizados en nginx (300s → 600s)
- [ ] Nginx recargado exitosamente
- [ ] Servidor Node.js reiniciado en el VPS
- [ ] Verificado que no hay errores en logs
- [ ] Probado con carga grande de paquetes
- [ ] Error 408 resuelto ✅

---

## ⚠️ Importante

- Los cambios en `LeonExpress_back/app.js` ya están guardados localmente
- Necesitas **subir ese archivo actualizado al VPS** también, o hacer los cambios directamente en el VPS
- El archivo `app.js` debe tener los timeouts configurados para que funcione completamente

## 🆘 Si Algo Sale Mal

```bash
# Restaurar backup de nginx
sudo cp /etc/nginx/sites-enabled/leonexpress.themarvals.com.backup.* /etc/nginx/sites-enabled/leonexpress.themarvals.com
sudo nginx -t
sudo systemctl reload nginx
```

¡Éxito con la aplicación en el VPS!

