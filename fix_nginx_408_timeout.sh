#!/bin/bash

echo "🔧 Script para corregir error 408 (Request Timeout) en Nginx"
echo "============================================================"
echo ""
echo "Este script actualizará la configuración de Nginx para manejar"
echo "cargas grandes de paquetes con timeouts aumentados."
echo ""

# Buscar archivo de configuración con proxy /api/
CONFIG_FILE=""
if [ -d "/etc/nginx/sites-enabled" ]; then
    for file in /etc/nginx/sites-enabled/*; do
        if [ -f "$file" ] && (grep -q "location.*api" "$file" || grep -q "proxy_pass" "$file"); then
            CONFIG_FILE="$file"
            break
        fi
    done
elif [ -d "/etc/nginx/conf.d" ]; then
    for file in /etc/nginx/conf.d/*.conf; do
        if [ -f "$file" ] && (grep -q "location.*api" "$file" || grep -q "proxy_pass" "$file"); then
            CONFIG_FILE="$file"
            break
        fi
    done
fi

if [ -z "$CONFIG_FILE" ]; then
    echo "❌ No se encontró archivo de configuración con proxy /api/"
    echo "Por favor, especifica manualmente el archivo:"
    echo "  sudo nano /etc/nginx/sites-enabled/tu-archivo.conf"
    exit 1
fi

echo "📄 Archivo encontrado: $CONFIG_FILE"
echo ""

# Crear backup
BACKUP_FILE="${CONFIG_FILE}.backup.408.$(date +%Y%m%d_%H%M%S)"
echo "💾 Creando backup: $BACKUP_FILE"
cp "$CONFIG_FILE" "$BACKUP_FILE"
echo "✅ Backup creado"
echo ""

# Verificar si ya existe el bloque location /api/
if grep -q "location.*/api/" "$CONFIG_FILE"; then
    echo "✅ Bloque location /api/ encontrado"
    echo "⚠️  Actualizando timeouts a 600s (10 minutos) para cargas grandes..."
    
    # Usar Python para editar el archivo de forma más segura
    python3 << EOF
import re

config_file = "$CONFIG_FILE"
backup_file = "$BACKUP_FILE"

# Leer el archivo
with open(config_file, 'r') as f:
    content = f.read()

# Buscar el bloque location /api/ y actualizar timeouts
def update_location_block(match):
    location_line = match.group(1)
    existing_config = match.group(2)
    closing_brace = match.group(3)
    
    # Actualizar o agregar timeouts a 600s
    updated_config = existing_config
    
    # Actualizar timeouts existentes
    updated_config = re.sub(r'proxy_connect_timeout\s+\d+[sm]?;', 'proxy_connect_timeout 600s;', updated_config)
    updated_config = re.sub(r'proxy_send_timeout\s+\d+[sm]?;', 'proxy_send_timeout 600s;', updated_config)
    updated_config = re.sub(r'proxy_read_timeout\s+\d+[sm]?;', 'proxy_read_timeout 600s;', updated_config)
    
    # Si no existen, agregarlos antes del cierre del bloque
    if 'proxy_connect_timeout' not in updated_config:
        updated_config = updated_config.rstrip() + '\n    proxy_connect_timeout 600s;'
    if 'proxy_send_timeout' not in updated_config:
        updated_config = updated_config.rstrip() + '\n    proxy_send_timeout 600s;'
    if 'proxy_read_timeout' not in updated_config:
        updated_config = updated_config.rstrip() + '\n    proxy_read_timeout 600s;'
    
    # Asegurar que client_max_body_size esté configurado
    if 'client_max_body_size' not in updated_config:
        updated_config = updated_config.rstrip() + '\n    client_max_body_size 150M;'
    
    # Agregar configuraciones adicionales para mantener conexiones vivas
    keep_alive_additions = []
    if 'proxy_http_version 1.1;' not in updated_config:
        keep_alive_additions.append('    proxy_http_version 1.1;')
    if 'proxy_set_header Connection "";' not in updated_config:
        keep_alive_additions.append('    proxy_set_header Connection "";')
    if 'send_timeout 600s;' not in updated_config:
        keep_alive_additions.append('    send_timeout 600s;')
    
    if keep_alive_additions:
        updated_config = updated_config.rstrip() + '\n' + '\n'.join(keep_alive_additions) + '\n'
    
    return location_line + updated_config + closing_brace

# Buscar y reemplazar el bloque location /api/
pattern = r'(location\s+/api/\s*\{)(.*?)(\n\s*\})'

new_content = re.sub(pattern, update_location_block, content, flags=re.DOTALL)

# Si no se encontró el patrón, intentar otro formato
if new_content == content:
    pattern2 = r'(location\s+[\'"\/]?api[\'"\/]?\s*\{)(.*?)(\n\s*[}\s])'
    new_content = re.sub(pattern2, update_location_block, content, flags=re.DOTALL)

if new_content != content:
    with open(config_file, 'w') as f:
        f.write(new_content)
    print("✅ Archivo actualizado con nuevos timeouts (600s)")
else:
    print("⚠️  No se pudo actualizar automáticamente. Edita manualmente:")
    print(f"   sudo nano {config_file}")

EOF

else
    echo "❌ No se encontró bloque location /api/"
    echo "Por favor, agrega manualmente este bloque al archivo:"
    echo ""
    echo "  location /api/ {"
    echo "      proxy_pass http://127.0.0.1:4000;"
    echo "      proxy_set_header Host \$host;"
    echo "      proxy_set_header X-Real-IP \$remote_addr;"
    echo "      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;"
    echo "      proxy_set_header X-Forwarded-Proto \$scheme;"
    echo "      client_max_body_size 150M;"
    echo "      proxy_request_buffering off;"
    echo "      proxy_http_version 1.1;"
    echo "      proxy_set_header Connection \"\";"
    echo "      proxy_connect_timeout 600s;"
    echo "      proxy_send_timeout 600s;"
    echo "      proxy_read_timeout 600s;"
    echo "      send_timeout 600s;"
    echo "  }"
    echo ""
    exit 1
fi

echo ""
echo "🧪 Probando configuración..."
if nginx -t 2>&1; then
    echo "✅ La configuración es válida"
    echo ""
    echo "📋 Resumen de cambios:"
    echo "   - proxy_connect_timeout: 600s (10 minutos)"
    echo "   - proxy_send_timeout: 600s (10 minutos)"
    echo "   - proxy_read_timeout: 600s (10 minutos)"
    echo "   - send_timeout: 600s (10 minutos)"
    echo "   - proxy_http_version 1.1 (para keep-alive)"
    echo ""
    read -p "¿Deseas recargar Nginx ahora? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        systemctl reload nginx
        echo "✅ Nginx recargado"
    else
        echo "⚠️  Recuerda recargar Nginx manualmente:"
        echo "   sudo systemctl reload nginx"
    fi
else
    echo "❌ Hay errores en la configuración"
    echo "Restaurando backup..."
    cp "$BACKUP_FILE" "$CONFIG_FILE"
    echo "✅ Backup restaurado"
    exit 1
fi

echo ""
echo "✅ Proceso completado"
echo "📁 Backup guardado en: $BACKUP_FILE"
echo ""
echo "💡 Nota: Si el error persiste, también verifica los timeouts del servidor Node.js"

