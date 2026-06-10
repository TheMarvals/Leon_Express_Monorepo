#!/bin/bash

echo "🧪 Iniciando pruebas locales de OCR batch..."

# Verificar que los servidores estén corriendo
echo "📡 Verificando backend..."
curl -s http://localhost:4000/api/auth/me > /dev/null
if [ $? -eq 0 ]; then
    echo "✅ Backend corriendo en puerto 4000"
else
    echo "❌ Backend no responde en puerto 4000"
    exit 1
fi

echo "🌐 Verificando frontend..."
curl -s http://localhost:5173/ > /dev/null
if [ $? -eq 0 ]; then
    echo "✅ Frontend corriendo en puerto 5173"
else
    echo "❌ Frontend no responde en puerto 5173"
    exit 1
fi

echo "📁 Verificando directorio de uploads..."
if [ -d "LeonExpress_back/uploads/batch-photos" ]; then
    echo "✅ Directorio batch-photos existe"
else
    echo "❌ Directorio batch-photos no existe"
    mkdir -p LeonExpress_back/uploads/batch-photos
    echo "✅ Directorio batch-photos creado"
fi

echo ""
echo "🎯 Pruebas listas!"
echo "   • Frontend: http://localhost:5173/"
echo "   • Backend API: http://localhost:4000/api-docs"
echo ""
echo "🔧 Para probar el flujo:"
echo "   1. Navega a una recolección en el frontend"
echo "   2. Activa 'Captura Rápida (Procesar Después)'"
echo "   3. Toma varias fotos"
echo "   4. Pulsa 'Subir X Fotos'"
echo "   5. Observa los logs en ambas terminales"