#!/bin/bash

echo "🔧 Script para corregir error 413 en Nginx"
echo "==========================================="
echo ""
echo "Este script buscará y actualizará la configuración de Nginx"
echo "para permitir subidas grandes desde Android."
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
BACKUP_FILE="${CONFIG_FILE}.backup.$(date +%Y%m%d_%H%M%S)"
echo "💾 Creando backup: $BACKUP_FILE"
cp "$CONFIG_FILE" "$BACKUP_FILE"
echo "✅ Backup creado"
echo ""

# Verificar si ya existe el bloque location /api/
if grep -q "location.*/api/" "$CONFIG_FILE"; then
    echo "✅ Bloque location /api/ encontrado"
    
    # Verificar si ya tiene las configuraciones necesarias
    HAS_MAX_BODY=$(grep -A 10 "location.*/api/" "$CONFIG_FILE" | grep -q "client_max_body_size" && echo "yes" || echo "no")
    HAS_BUFFERING=$(grep -A 10 "location.*/api/" "$CONFIG_FILE" | grep -q "proxy_request_buffering" && echo "yes" || echo "no")
    HAS_TIMEOUTS=$(grep -A 10 "location.*/api/" "$CONFIG_FILE" | grep -q "proxy.*timeout" && echo "yes" || echo "no")
    
    if [ "$HAS_MAX_BODY" = "yes" ] && [ "$HAS_BUFFERING" = "yes" ] && [ "$HAS_TIMEOUTS" = "yes" ]; then
        echo "✅ La configuración ya está completa"
        echo "Las siguientes configuraciones ya están presentes:"
        grep -A 10 "location.*/api/" "$CONFIG_FILE" | grep -E "(client_max_body_size|proxy_request_buffering|proxy.*timeout)"
        exit 0
    fi
    
    echo "⚠️  Actualizando configuración existente..."
    
    # Usar Python para editar el archivo de forma más segura
    python3 << EOF
import re

config_file = "$CONFIG_FILE"
backup_file = "$BACKUP_FILE"

# Leer el archivo
with open(config_file, 'r') as f:
    content = f.read()

# Buscar el bloque location /api/
pattern = r'(location\s+/api/.*?\{)(.*?)(\n\s*\})'

def update_location_block(match):
    location_line = match.group(1)
    existing_config = match.group(2)
    closing_brace = match.group(3)
    
    # Verificar qué configuraciones faltan
    needs_max_body = 'client_max_body_size' not in existing_config
    needs_buffering = 'proxy_request_buffering' not in existing_config
    needs_timeouts = 'proxy.*timeout' not in existing_config
    
    new_config = existing_config
    
    # Agregar configuraciones faltantes antes del cierre del bloque
    additions = []
    if needs_max_body:
        additions.append('        client_max_body_size 150M;')
    if needs_buffering:
        additions.append('        proxy_request_buffering off;')
    if needs_timeouts:
        additions.extend([
            '        proxy_connect_timeout 300s;',
            '        proxy_send_timeout 300s;',
            '        proxy_read_timeout 300s;'
        ])
    
    if additions:
        # Encontrar la última línea antes del cierre
        lines = new_config.split('\n')
        # Agregar las nuevas configuraciones antes del cierre
        lines_with_additions = lines[:-1] + additions + ['']
        new_config = '\n'.join(lines_with_additions)
    
    return location_line + new_config + closing_brace

# Reemplazar el bloque
new_content = re.sub(pattern, update_location_block, content, flags=re.DOTALL)

# Si no se encontró el patrón, intentar otro formato
if new_content == content:
    # Buscar location /api/ con formato más flexible
    pattern2 = r'(location\s+[\'"\/]?api[\'"\/]?\s*\{)(.*?)(\n\s*[}\s])'
    new_content = re.sub(pattern2, update_location_block, content, flags=re.DOTALL)

if new_content != content:
    with open(config_file, 'w') as f:
        f.write(new_content)
    print("✅ Archivo actualizado")
else:
    print("⚠️  No se pudo actualizar automáticamente. Edita manualmente:")
    print(f"   sudo nano {config_file}")

EOF

else
    echo "⚠️  No se encontró bloque location /api/"
    echo "Por favor, agrega manualmente este bloque al archivo:"
    echo ""
    echo "  location /api/ {"
    echo "      proxy_pass http://localhost:4100/api/;"
    echo "      proxy_set_header Host \$host;"
    echo "      proxy_set_header X-Real-IP \$remote_addr;"
    echo "      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;"
    echo "      proxy_set_header X-Forwarded-Proto \$scheme;"
    echo "      client_max_body_size 150M;"
    echo "      proxy_request_buffering off;"
    echo "      proxy_connect_timeout 300s;"
    echo "      proxy_send_timeout 300s;"
    echo "      proxy_read_timeout 300s;"
    echo "  }"
    echo ""
    exit 1
fi

echo ""
echo "🧪 Probando configuración..."
if nginx -t 2>&1; then
    echo "✅ La configuración es válida"
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

