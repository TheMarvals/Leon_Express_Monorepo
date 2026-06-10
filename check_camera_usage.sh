#!/bin/bash

echo "🔍 Verificando qué está usando la cámara..."
echo ""

# Verificar procesos usando dispositivos de video
echo "=== Procesos usando /dev/video* ==="
lsof /dev/video* 2>/dev/null | head -20

echo ""
echo "=== Procesos Chrome con posible acceso a cámara ==="
ps aux | grep -i chrome | grep -v grep | head -5

echo ""
echo "=== Procesos relacionados con cámara ==="
ps aux | grep -E "(zoom|teams|obs|iriun|skype|discord)" | grep -v grep

echo ""
echo "🔧 Para liberar la cámara, ejecuta:"
echo "   sudo pkill iriunwebc"  
echo "   pkill zoom"
echo "   pkill teams"
echo "   pkill obs"

echo ""
echo "💡 También cierra pestañas de Chrome que puedan estar usando la cámara"