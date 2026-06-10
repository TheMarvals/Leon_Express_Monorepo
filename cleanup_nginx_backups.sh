#!/bin/bash

echo "🧹 Limpiando backups de Nginx en sites-enabled..."
echo "=================================================="
echo ""

# Buscar y eliminar todos los archivos de backup en sites-enabled
FOUND=0
for file in /etc/nginx/sites-enabled/*.backup.*; do
    if [ -f "$file" ]; then
        echo "🗑️  Eliminando: $file"
        rm -f "$file"
        FOUND=1
    fi
done

if [ $FOUND -eq 0 ]; then
    echo "ℹ️  No se encontraron archivos de backup en sites-enabled"
else
    echo "✅ Archivos de backup eliminados"
fi

echo ""
echo "🧪 Probando configuración de Nginx..."
if nginx -t 2>&1; then
    echo "✅ La configuración de Nginx es válida ahora"
else
    echo "❌ Todavía hay errores. Verifica manualmente:"
    echo "   sudo nginx -t"
fi

echo ""

