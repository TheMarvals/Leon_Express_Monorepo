# Instrucciones para Subir el Archivo de Configuración al Servidor

## Archivo Listo
El archivo `leonexpress.themarvals.com.conf` ya está actualizado con todos los cambios necesarios para solucionar el error 408.

## Cambios Realizados
- ✅ `proxy_connect_timeout`: 300s → **600s**
- ✅ `proxy_send_timeout`: 300s → **600s**
- ✅ `proxy_read_timeout`: 300s → **600s**
- ✅ `send_timeout`: **600s** (nuevo)
- ✅ `proxy_http_version 1.1` (para keep-alive)
- ✅ `proxy_set_header Connection ""` (mantener conexiones vivas)
- ✅ Buffers aumentados para datos grandes

---

## Pasos para Subir al Servidor

### Opción 1: Usando SCP (Recomendado)

1. **Desde tu máquina Windows (PowerShell o Git Bash):**
   ```bash
   scp leonexpress.themarvals.com.conf usuario@tu-vps:/tmp/
   ```

2. **Conectarte al VPS:**
   ```bash
   ssh usuario@tu-vps
   ```

3. **Hacer backup de la configuración actual:**
   ```bash
   sudo cp /etc/nginx/sites-enabled/leonexpress.themarvals.com /etc/nginx/sites-enabled/leonexpress.themarvals.com.backup.$(date +%Y%m%d_%H%M%S)
   ```

4. **Copiar el archivo nuevo:**
   ```bash
   sudo cp /tmp/leonexpress.themarvals.com.conf /etc/nginx/sites-enabled/leonexpress.themarvals.com
   ```

5. **Verificar la configuración:**
   ```bash
   sudo nginx -t
   ```
   
   Deberías ver: `nginx: configuration file /etc/nginx/nginx.conf test is successful`

6. **Recargar nginx:**
   ```bash
   sudo systemctl reload nginx
   ```

7. **Verificar que funciona:**
   ```bash
   sudo systemctl status nginx
   ```

### Opción 2: Editar Directamente en el Servidor

1. **Conectarte al VPS:**
   ```bash
   ssh usuario@tu-vps
   ```

2. **Hacer backup:**
   ```bash
   sudo cp /etc/nginx/sites-enabled/leonexpress.themarvals.com /etc/nginx/sites-enabled/leonexpress.themarvals.com.backup.$(date +%Y%m%d_%H%M%S)
   ```

3. **Editar el archivo:**
   ```bash
   sudo nano /etc/nginx/sites-enabled/leonexpress.themarvals.com
   ```

4. **Reemplazar el bloque `location /api/` completo** con:
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

5. **Guardar:** Ctrl+X, luego Y, luego Enter

6. **Verificar y recargar:**
   ```bash
   sudo nginx -t
   sudo systemctl reload nginx
   ```

### Opción 3: Usando WinSCP (Interfaz Gráfica)

1. **Abrir WinSCP** y conectarte al servidor

2. **Copiar el archivo** `leonexpress.themarvals.com.conf` al servidor (por ejemplo a `/tmp/`)

3. **Usar SSH** para conectarte y ejecutar:
   ```bash
   sudo cp /etc/nginx/sites-enabled/leonexpress.themarvals.com /etc/nginx/sites-enabled/leonexpress.themarvals.com.backup.$(date +%Y%m%d_%H%M%S)
   sudo cp /tmp/leonexpress.themarvals.com.conf /etc/nginx/sites-enabled/leonexpress.themarvals.com
   sudo nginx -t
   sudo systemctl reload nginx
   ```

---

## Después de Aplicar los Cambios

### 1. Reiniciar el Servidor Node.js

**Si usas PM2:**
```bash
pm2 restart leon_express_backend
pm2 logs leon_express_backend --lines 50
```

**Si no usas PM2:**
- Reinicia el servicio de Node.js como lo tengas configurado

### 2. Verificar Logs

```bash
# Logs de nginx
sudo tail -f /var/log/nginx/error.log

# Logs de access (opcional)
sudo tail -f /var/log/nginx/access.log
```

### 3. Probar con Carga Grande

Prueba subir un lote grande de paquetes y verifica que no ocurra el error 408.

---

## Si Algo Sale Mal (Rollback)

```bash
# Listar backups
ls -la /etc/nginx/sites-enabled/*.backup*

# Restaurar desde backup (reemplaza la fecha del backup)
sudo cp /etc/nginx/sites-enabled/leonexpress.themarvals.com.backup.YYYYMMDD_HHMMSS /etc/nginx/sites-enabled/leonexpress.themarvals.com

# Verificar y recargar
sudo nginx -t
sudo systemctl reload nginx
```

---

## Checklist

- [ ] Backup de configuración actual creado
- [ ] Archivo nuevo copiado a `/etc/nginx/sites-enabled/`
- [ ] Configuración verificada con `nginx -t`
- [ ] Nginx recargado exitosamente
- [ ] Servidor Node.js reiniciado
- [ ] Logs verificados (sin errores)
- [ ] Probado con carga grande de paquetes
- [ ] Error 408 resuelto ✅

---

¡Listo! El archivo está preparado para subirlo al servidor.

