#!/bin/bash

# Script para construir y ejecutar LeonExpress con Docker (Base de datos remota)

echo "🚀 Construyendo y ejecutando LeonExpress..."

# Verificar que existe el archivo .env
if [ ! -f .env ]; then
    echo "❌ Error: No existe el archivo .env"
    echo "📋 Copia .env.example a .env y configura tus variables de base de datos remota"
    echo "   cp .env.example .env"
    echo "   nano .env"
    exit 1
fi

# Detener contenedores existentes
echo "⏹️  Deteniendo contenedores existentes..."
sudo docker compose down

# Limpiar imágenes anteriores (opcional)
read -p "¿Quieres limpiar las imágenes anteriores? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo "🧹 Limpiando imágenes anteriores..."
    sudo docker compose down --rmi all --volumes --remove-orphans
fi

# Construir y ejecutar
echo "🔨 Construyendo contenedores..."
sudo docker compose build --no-cache

echo "▶️  Iniciando servicios..."
sudo docker compose up -d

# Mostrar estado
echo "📊 Estado de los contenedores:"
sudo docker compose ps

echo "✅ LeonExpress está corriendo!"
echo "🌐 Frontend: http://localhost"
echo "🔧 Backend API: http://localhost:4000"
echo "🗄️  Base de datos: Servidor remoto configurado en .env"

# Mostrar logs en tiempo real
read -p "¿Quieres ver los logs en tiempo real? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    sudo docker compose logs -f
fi