# Instrucciones para Aplicar Cambios en el Servidor Linux

Como estás en Windows, necesitas aplicar los cambios directamente en el servidor Linux donde está corriendo nginx.

## Pasos a Seguir

### 1. Conectarse al Servidor Linux
Usa SSH o la forma que tengas de acceder al servidor:
```bash
ssh usuario@tu-servidor
# O usa tu método de conexión preferido
```

### 2. Hacer Backup de la Configuración Actual
```bash
sudo cp /etc/nginx/sites-enabled/leonexpress.themarvals.com /etc/nginx/sites-enabled/leonexpress.themarvals.com.backup.$(date +%Y%m%d_%H%M%S)
```

### 3. Copiar el Script al Servidor
Opciones:
- **Opción A**: Sube el archivo `fix_nginx_408_timeout.sh` al servidor usando SCP:
  ```bash
  scp fix_nginx_408_timeout.sh usuario@tu-servidor:/home/usuario/
  ```
  
- **Opción B**: O crea el archivo directamente en el servidor editando `nano fix_nginx_408_timeout.sh` y copiando el contenido

### 4. Ejecutar el Script (Si usaste Opción A)
```bash
cd /home/usuario  # O donde hayas copiado el script
chmod +x fix_nginx_408_timeout.sh
sudo ./fix_nginx_408_timeout.sh
```

### 5. O Editar Manualmente (Si prefieres control total)

1. **Editar el archivo de configuración:**
   ```bash
   sudo nano /etc/nginx/sites-enabled/leonexpress.themarvals.com
   ```

2. **Reemplazar SOLO el bloque `location /api/` con:**
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

3. **Guardar y salir** (Ctrl+X, luego Y, luego Enter en nano)

### 6. Verificar la Configuración
```bash
sudo nginx -t
```

Deberías ver: `nginx: configuration file /etc/nginx/nginx.conf test is successful`

### 7. Recargar Nginx
```bash
sudo systemctl reload nginx
```

### 8. Verificar que Funciona
Revisa los logs para asegurarte de que no hay errores:
```bash
sudo tail -f /var/log/nginx/error.log
```

### 9. Reiniciar el Servidor Node.js

**Si usas PM2:**
```bash
pm2 restart leon_express_backend
# O el nombre que uses para tu proceso
pm2 logs leon_express_backend  # Para ver los logs y verificar los timeouts
```

**Si no usas PM2:**
```bash
# Detén el servidor actual (Ctrl+C)
# Luego reinícialo:
cd /ruta/a/LeonExpress_back
npm start
# O como tengas configurado el inicio
```

Deberías ver en la consola:
```
⏱️  Timeouts configurados: 600s para cargas grandes
```

## Verificación Final

1. Prueba subir un lote grande de paquetes
2. Verifica que no ocurra el error 408
3. Revisa los logs si hay algún problema

## Si Algo Sale Mal (Rollback)

```bash
# Restaurar desde el backup
sudo cp /etc/nginx/sites-enabled/leonexpress.themarvals.com.backup.* /etc/nginx/sites-enabled/leonexpress.themarvals.com

# Verificar
sudo nginx -t

# Recargar
sudo systemctl reload nginx
```

## Cambios Realizados

### Nginx:
- ✅ `proxy_connect_timeout`: 300s → **600s**
- ✅ `proxy_send_timeout`: 300s → **600s**  
- ✅ `proxy_read_timeout`: 300s → **600s**
- ✅ `send_timeout`: **600s** (nuevo)
- ✅ `proxy_http_version 1.1` (keep-alive)
- ✅ Buffers aumentados

### Node.js (Ya aplicado):
- ✅ Timeouts del servidor: 600s (10 minutos)
- ✅ Ya se aplicó en `LeonExpress_back/app.js`

¡Listo! Los cambios deberían resolver el error 408.

