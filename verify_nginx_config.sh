#!/bin/bash

echo "🔍 Verificando configuración del bloque location /api/..."
echo "========================================================"
echo ""

CONFIG_FILE="/etc/nginx/sites-enabled/leon_express"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Archivo no encontrado: $CONFIG_FILE"
    exit 1
fi

echo "📄 Archivo: $CONFIG_FILE"
echo ""

# Mostrar el bloque location /api/
echo "📋 Bloque location /api/ actual:"
echo "--------------------------------------------------"
grep -A 15 "location /api/" "$CONFIG_FILE" | head -20
echo ""

# Verificar configuraciones
echo "✅ Verificando configuraciones necesarias:"
echo "--------------------------------------------------"

HAS_MAX_BODY=$(grep -A 10 "location /api/" "$CONFIG_FILE" | grep -q "client_max_body_size" && echo "✅" || echo "❌")
HAS_BUFFERING=$(grep -A 10 "location /api/" "$CONFIG_FILE" | grep -q "proxy_request_buffering" && echo "✅" || echo "❌")
HAS_CONNECT_TIMEOUT=$(grep -A 10 "location /api/" "$CONFIG_FILE" | grep -q "proxy_connect_timeout" && echo "✅" || echo "❌")
HAS_SEND_TIMEOUT=$(grep -A 10 "location /api/" "$CONFIG_FILE" | grep -q "proxy_send_timeout" && echo "✅" || echo "❌")
HAS_READ_TIMEOUT=$(grep -A 10 "location /api/" "$CONFIG_FILE" | grep -q "proxy_read_timeout" && echo "✅" || echo "❌")

echo "  client_max_body_size 150M:      $HAS_MAX_BODY"
echo "  proxy_request_buffering off:    $HAS_BUFFERING"
echo "  proxy_connect_timeout 300s:     $HAS_CONNECT_TIMEOUT"
echo "  proxy_send_timeout 300s:        $HAS_SEND_TIMEOUT"
echo "  proxy_read_timeout 300s:        $HAS_READ_TIMEOUT"
echo ""

# Verificar si todas están presentes
if grep -A 10 "location /api/" "$CONFIG_FILE" | grep -q "client_max_body_size" && \
   grep -A 10 "location /api/" "$CONFIG_FILE" | grep -q "proxy_request_buffering" && \
   grep -A 10 "location /api/" "$CONFIG_FILE" | grep -q "proxy_connect_timeout" && \
   grep -A 10 "location /api/" "$CONFIG_FILE" | grep -q "proxy_send_timeout" && \
   grep -A 10 "location /api/" "$CONFIG_FILE" | grep -q "proxy_read_timeout"; then
    echo "✅ ¡Todas las configuraciones están presentes!"
    echo ""
    echo "🧪 Probando configuración de Nginx..."
    if nginx -t 2>&1; then
        echo ""
        echo "✅ La configuración es válida"
        echo ""
        echo "🎉 ¡Todo está listo! Puedes recargar Nginx:"
        echo "   sudo systemctl reload nginx"
    else
        echo ""
        echo "❌ Hay errores en la configuración"
    fi
else
    echo "⚠️  Faltan algunas configuraciones"
    echo ""
    echo "📝 Para agregar las configuraciones faltantes, ejecuta:"
    echo "   sudo nano $CONFIG_FILE"
    echo ""
    echo "Y agrega estas líneas dentro del bloque location /api/ (después de proxy_set_header X-Forwarded-Proto \$scheme;):"
    echo ""
    echo "    client_max_body_size 150M;"
    echo "    proxy_request_buffering off;"
    echo "    proxy_connect_timeout 300s;"
    echo "    proxy_send_timeout 300s;"
    echo "    proxy_read_timeout 300s;"
fi

echo ""

