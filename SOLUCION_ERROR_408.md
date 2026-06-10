# Solución para Error 408 (Request Timeout) con Cargas Grandes de Paquetes

## Problema
El error 408 (Request Timeout) ocurre cuando se suben lotes grandes de paquetes. Esto sucede porque las solicitudes tardan más tiempo del permitido en completarse.

## Solución Implementada

### 1. Configuración de Nginx (10 minutos de timeout)

La configuración de nginx ahora permite hasta **600 segundos (10 minutos)** para procesar solicitudes grandes.

**Archivos relacionados:**
- `fix_nginx_408_timeout.sh` - Script automático para actualizar nginx
- `nginx_config_408_fix.conf` - Configuración de referencia

#### Cambios principales:
- `proxy_connect_timeout`: 300s → **600s**
- `proxy_send_timeout`: 300s → **600s**
- `proxy_read_timeout`: 300s → **600s**
- `send_timeout`: **600s** (nuevo)
- `proxy_http_version 1.1` (para mantener conexiones vivas)
- Buffers aumentados para datos grandes

### 2. Configuración del Servidor Node.js

El servidor ahora tiene timeouts de **10 minutos** configurados en:
- `server.timeout`: 600000ms (10 minutos)
- `server.headersTimeout`: 610000ms
- `server.keepAliveTimeout`: 610000ms
- `server.requestTimeout`: 600000ms

**Archivo modificado:**
- `LeonExpress_back/app.js`

## Instrucciones de Aplicación

### Opción 1: Script Automático (Recomendado)

1. **Dar permisos de ejecución al script:**
   ```bash
   chmod +x fix_nginx_408_timeout.sh
   ```

2. **Ejecutar el script:**
   ```bash
   sudo ./fix_nginx_408_timeout.sh
   ```

3. El script:
   - Creará un backup automático
   - Actualizará los timeouts en nginx
   - Verificará la configuración
   - Pedirá confirmación para recargar nginx

### Opción 2: Manual

1. **Hacer backup de la configuración actual:**
   ```bash
   sudo cp /etc/nginx/sites-enabled/leonexpress.themarvals.com /etc/nginx/sites-enabled/leonexpress.themarvals.com.backup.$(date +%Y%m%d_%H%M%S)
   ```

2. **Editar el archivo de configuración:**
   ```bash
   sudo nano /etc/nginx/sites-enabled/leonexpress.themarvals.com
   ```

3. **Reemplazar el bloque `location /api/` con:**
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

4. **Verificar la configuración:**
   ```bash
   sudo nginx -t
   ```

5. **Recargar nginx:**
   ```bash
   sudo systemctl reload nginx
   ```

### 3. Reiniciar el Servidor Node.js

1. **Detener el servidor actual:**
   ```bash
   # Si está corriendo con PM2:
   pm2 restart leon_express_backend
   
   # O si está corriendo directamente:
   # Ctrl+C en la terminal donde está corriendo
   ```

2. **Iniciar el servidor:**
   ```bash
   # Con PM2:
   pm2 start LeonExpress_back/app.js --name leon_express_backend
   
   # O directamente:
   cd LeonExpress_back
   npm start
   ```

3. **Verificar que los timeouts están aplicados:**
   - Deberías ver en la consola: `⏱️  Timeouts configurados: 600s para cargas grandes`

## Verificación

1. **Probar con un lote grande de paquetes** y verificar que no ocurre el error 408.

2. **Revisar logs de nginx** si el problema persiste:
   ```bash
   sudo tail -f /var/log/nginx/error.log
   ```

3. **Revisar logs del servidor Node.js** para ver el tiempo de procesamiento:
   ```bash
   pm2 logs leon_express_backend
   # O los logs de tu aplicación
   ```

## Notas Importantes

- Los timeouts de 10 minutos deberían ser suficientes para la mayoría de casos. Si necesitas más tiempo, puedes aumentarlos a 900s (15 minutos) o 1200s (20 minutos).

- Si el problema persiste, también verifica:
  - Límites de tiempo del sistema operativo
  - Configuración de firewall
  - Límites del cliente (aplicación móvil)

- El procesamiento de OCR puede tomar tiempo. Asegúrate de que el procesamiento en background esté funcionando correctamente para no bloquear las solicitudes.

## Rollback (Si es necesario)

Si necesitas revertir los cambios:

1. **Restaurar configuración de nginx desde backup:**
   ```bash
   sudo cp /etc/nginx/sites-enabled/leonexpress.themarvals.com.backup.* /etc/nginx/sites-enabled/leonexpress.themarvals.com
   sudo nginx -t
   sudo systemctl reload nginx
   ```

2. **Revertir cambios en app.js:**
   ```bash
   git checkout LeonExpress_back/app.js
   # O restaurar desde tu sistema de control de versiones
   ```

3. **Reiniciar el servidor Node.js**

