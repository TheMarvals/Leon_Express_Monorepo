#!/bin/bash

echo "🔧 Actualizando configuración de Nginx para Leon Express"
echo "========================================================"
echo ""

CONFIG_FILE="/etc/nginx/sites-enabled/leon_express"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Archivo no encontrado: $CONFIG_FILE"
    exit 1
fi

echo "📄 Archivo encontrado: $CONFIG_FILE"
echo ""

# Crear backup en /tmp o en sites-available (fuera de sites-enabled)
BACKUP_DIR="/etc/nginx/backups"
mkdir -p "$BACKUP_DIR" 2>/dev/null || BACKUP_DIR="/tmp"
BACKUP_FILE="${BACKUP_DIR}/leon_express.backup.$(date +%Y%m%d_%H%M%S)"
echo "💾 Creando backup: $BACKUP_FILE"
cp "$CONFIG_FILE" "$BACKUP_FILE"
echo "✅ Backup creado"
echo ""

# Limpiar backups antiguos de sites-enabled si existen (por si acaso)
find /etc/nginx/sites-enabled -name "*.backup.*" -type f -delete 2>/dev/null || true

# Leer el contenido del archivo
CONTENT=$(cat "$CONFIG_FILE")

# Verificar si el bloque location /api/ ya tiene las configuraciones necesarias
if echo "$CONTENT" | grep -A 10 "location /api/" | grep -q "client_max_body_size\|proxy_request_buffering\|proxy.*timeout"; then
    echo "⚠️  El bloque location /api/ ya tiene algunas configuraciones"
    echo "Verificando qué falta..."
fi

# Crear el nuevo contenido con las configuraciones actualizadas
# Usar Python para hacer el reemplazo de forma más segura
python3 << EOF
import re

config_file = "$CONFIG_FILE"
backup_file = "$BACKUP_FILE"

# Leer el archivo
with open(config_file, 'r') as f:
    content = f.read()

# Buscar y reemplazar el bloque location /api/
# Patrón que busca location /api/ y su contenido hasta el cierre
pattern = r'(location /api/ \{[^}]*)(proxy_set_header X-Forwarded-Proto \$scheme;\s*)(\})'

def update_location(match):
    location_start = match.group(1)
    last_header = match.group(2)
    closing_brace = match.group(3)
    
    # Verificar si ya tiene las configuraciones
    full_block = location_start + last_header + closing_brace
    
    new_additions = []
    
    # Agregar configuraciones si no existen
    if 'client_max_body_size' not in full_block:
        new_additions.append('    client_max_body_size 150M;')
    if 'proxy_request_buffering' not in full_block:
        new_additions.append('    proxy_request_buffering off;')
    if 'proxy_connect_timeout' not in full_block:
        new_additions.append('    proxy_connect_timeout 300s;')
        new_additions.append('    proxy_send_timeout 300s;')
        new_additions.append('    proxy_read_timeout 300s;')
    
    if new_additions:
        additions_text = '\n' + '\n'.join(new_additions) + '\n    '
        return location_start + last_header + additions_text + closing_brace
    else:
        return full_block

# Intentar reemplazar
new_content = re.sub(pattern, update_location, content, flags=re.DOTALL)

# Si no funcionó, intentar un patrón más flexible
if new_content == content:
    pattern2 = r'(location /api/ \{)(.*?)(\n    \})'
    def update_location2(match):
        location_line = match.group(1)
        existing_config = match.group(2)
        closing = match.group(3)
        
        additions = []
        if 'client_max_body_size' not in existing_config:
            additions.append('    client_max_body_size 150M;')
        if 'proxy_request_buffering' not in existing_config:
            additions.append('    proxy_request_buffering off;')
        if 'proxy_connect_timeout' not in existing_config:
            additions.append('    proxy_connect_timeout 300s;')
            additions.append('    proxy_send_timeout 300s;')
            additions.append('    proxy_read_timeout 300s;')
        
        if additions:
            return location_line + existing_config + '\n' + '\n'.join(additions) + closing
        else:
            return location_line + existing_config + closing
    
    new_content = re.sub(pattern2, update_location2, content, flags=re.DOTALL)

# Si aún no funcionó, usar un enfoque más directo: reemplazar todo el bloque
if new_content == content:
    # Buscar la línea exacta con el formato que vimos en la salida (5 espacios en location)
    old_block_variations = [
        # Formato con 5 espacios
        """     location /api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}""",
        # Formato con 4 espacios
        """    location /api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}""",
    ]
    
    new_block = """     location /api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Límites para subidas grandes desde Android
    client_max_body_size 150M;
    proxy_request_buffering off;
    
    # Timeouts aumentados para subidas grandes
    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
}"""
    
    replaced = False
    for old_block in old_block_variations:
        if old_block in content:
            new_content = content.replace(old_block, new_block)
            replaced = True
            break
    
    if not replaced:
        # Último intento: buscar cualquier variación usando regex
        # Buscar location /api/ seguido de todo hasta el cierre del bloque
        pattern3 = r'(location /api/ \{[\s\S]*?proxy_set_header X-Forwarded-Proto \$scheme;[\s]*)(\})'
        replacement = r'\1\n    \n    # Límites para subidas grandes desde Android\n    client_max_body_size 150M;\n    proxy_request_buffering off;\n    \n    # Timeouts aumentados para subidas grandes\n    proxy_connect_timeout 300s;\n    proxy_send_timeout 300s;\n    proxy_read_timeout 300s;\n\2'
        new_content = re.sub(pattern3, replacement, content)

# Guardar si hubo cambios
if new_content != content:
    with open(config_file, 'w') as f:
        f.write(new_content)
    print("✅ Archivo actualizado exitosamente")
    print("")
    print("📋 Configuraciones agregadas:")
    print("   - client_max_body_size 150M")
    print("   - proxy_request_buffering off")
    print("   - proxy_connect_timeout 300s")
    print("   - proxy_send_timeout 300s")
    print("   - proxy_read_timeout 300s")
    success = True
else:
    print("⚠️  No se pudo actualizar automáticamente")
    print("El bloque location /api/ podría tener un formato diferente")
    print(f"Por favor edita manualmente: nano {config_file}")
    success = False

import sys
sys.exit(0 if success else 1)

EOF

PYTHON_EXIT_CODE=$?
if [ $PYTHON_EXIT_CODE -eq 0 ]; then
    echo ""
    echo "🧪 Probando configuración de Nginx..."
    if nginx -t 2>&1; then
        echo "✅ La configuración es válida"
        echo ""
        read -p "¿Deseas recargar Nginx ahora? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            systemctl reload nginx
            echo "✅ Nginx recargado exitosamente"
            echo ""
            echo "🎉 ¡Configuración completada!"
            echo "El error 413 debería estar resuelto ahora"
        else
            echo ""
            echo "⚠️  Para aplicar los cambios, ejecuta:"
            echo "   sudo systemctl reload nginx"
        fi
    else
        echo "❌ Hay errores en la configuración"
        echo "Restaurando backup..."
        cp "$BACKUP_FILE" "$CONFIG_FILE"
        echo "✅ Backup restaurado"
        echo ""
        echo "Por favor revisa manualmente el archivo:"
        echo "   nano $CONFIG_FILE"
        exit 1
    fi
else
    echo "❌ Error al actualizar el archivo"
    exit 1
fi

echo ""
echo "📁 Backup guardado en: $BACKUP_FILE"
echo ""
echo "🧹 Limpiando backups antiguos de sites-enabled..."
find /etc/nginx/sites-enabled -name "*.backup.*" -type f -delete 2>/dev/null && echo "✅ Backups antiguos eliminados" || echo "ℹ️  No se encontraron backups antiguos"
echo ""

