#!/bin/bash

echo "🔍 Verificando configuración de Nginx en el VPS..."
echo "=================================================="
echo ""

# 1. Verificar configuración global
echo "1️⃣ Configuración global (/etc/nginx/nginx.conf):"
echo "--------------------------------------------------"
if grep -q "client_max_body_size" /etc/nginx/nginx.conf; then
    echo "✅ client_max_body_size encontrado:"
    grep "client_max_body_size" /etc/nginx/nginx.conf
else
    echo "❌ client_max_body_size NO encontrado en la configuración global"
fi
echo ""

# 2. Listar archivos de configuración de sitios
echo "2️⃣ Archivos de configuración de sitios:"
echo "--------------------------------------------------"
if [ -d "/etc/nginx/sites-enabled" ]; then
    echo "📁 /etc/nginx/sites-enabled:"
    ls -la /etc/nginx/sites-enabled/
elif [ -d "/etc/nginx/conf.d" ]; then
    echo "📁 /etc/nginx/conf.d:"
    ls -la /etc/nginx/conf.d/
fi
echo ""

# 3. Buscar configuración de proxy para /api/
echo "3️⃣ Buscando configuración de proxy /api/:"
echo "--------------------------------------------------"
if [ -d "/etc/nginx/sites-enabled" ]; then
    for file in /etc/nginx/sites-enabled/*; do
        if [ -f "$file" ]; then
            echo "📄 Revisando: $file"
            if grep -q "location /api/" "$file" || grep -q "location.*api" "$file"; then
                echo "✅ Encontrado bloque location para /api/"
                echo "Contenido del bloque:"
                grep -A 20 "location.*api" "$file" | head -25
                echo ""
                
                # Verificar configuraciones específicas
                echo "Verificando configuraciones:"
                if grep -q "client_max_body_size" "$file"; then
                    echo "  ✅ client_max_body_size configurado en este archivo"
                    grep "client_max_body_size" "$file"
                else
                    echo "  ⚠️  client_max_body_size NO configurado en este archivo"
                fi
                
                if grep -q "proxy_request_buffering" "$file"; then
                    echo "  ✅ proxy_request_buffering configurado"
                    grep "proxy_request_buffering" "$file"
                else
                    echo "  ⚠️  proxy_request_buffering NO configurado (recomendado: off)"
                fi
                
                if grep -q "proxy.*timeout" "$file"; then
                    echo "  ✅ Timeouts de proxy configurados"
                    grep "proxy.*timeout" "$file"
                else
                    echo "  ⚠️  Timeouts de proxy NO configurados (recomendado: 300s)"
                fi
            fi
        fi
    done
elif [ -d "/etc/nginx/conf.d" ]; then
    for file in /etc/nginx/conf.d/*.conf; do
        if [ -f "$file" ]; then
            echo "📄 Revisando: $file"
            if grep -q "location /api/" "$file" || grep -q "location.*api" "$file"; then
                echo "✅ Encontrado bloque location para /api/"
                grep -A 20 "location.*api" "$file" | head -25
            fi
        fi
    done
fi
echo ""

# 4. Verificar estado de nginx
echo "4️⃣ Estado de Nginx:"
echo "--------------------------------------------------"
systemctl status nginx --no-pager -l | head -10
echo ""

# 5. Test de configuración
echo "5️⃣ Test de configuración:"
echo "--------------------------------------------------"
if nginx -t 2>&1; then
    echo "✅ La configuración de Nginx es válida"
else
    echo "❌ Hay errores en la configuración de Nginx"
fi
echo ""

# 6. Recomendaciones
echo "📋 Recomendaciones:"
echo "--------------------------------------------------"
echo "Si necesitas actualizar la configuración del proxy /api/, agrega:"
echo ""
echo "  location /api/ {"
echo "      proxy_pass http://localhost:4100/api/;  # o tu backend"
echo "      proxy_set_header Host \$host;"
echo "      proxy_set_header X-Real-IP \$remote_addr;"
echo "      proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;"
echo "      proxy_set_header X-Forwarded-Proto \$scheme;"
echo "      "
echo "      # Aumentar límite de tamaño de cuerpo para imágenes batch"
echo "      client_max_body_size 150M;"
echo "      proxy_request_buffering off;"
echo "      "
echo "      # Timeouts aumentados para subidas grandes"
echo "      proxy_connect_timeout 300s;"
echo "      proxy_send_timeout 300s;"
echo "      proxy_read_timeout 300s;"
echo "  }"
echo ""

