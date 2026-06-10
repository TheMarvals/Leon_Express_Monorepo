#!/bin/bash

# Script para ejecutar la migración de loading_status
# Uso: ./apply_loading_status_migration.sh

echo "🔧 Aplicando migración de loading_status a la tabla routes..."
echo ""

# Verificar si existe el archivo de migración
MIGRATION_FILE="migrations/add_loading_status_to_routes.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ Error: No se encontró el archivo $MIGRATION_FILE"
  exit 1
fi

echo "📁 Archivo encontrado: $MIGRATION_FILE"
echo ""

# Usar variables de entorno si están disponibles, sino solicitar
if [ -z "$DB_HOST" ]; then
  read -p "Host de MySQL [127.0.0.1]: " MYSQL_HOST
  MYSQL_HOST=${MYSQL_HOST:-127.0.0.1}
else
  MYSQL_HOST=$DB_HOST
  echo "Usando DB_HOST de entorno: $MYSQL_HOST"
fi

if [ -z "$DB_PORT" ]; then
  read -p "Puerto de MySQL [3306]: " MYSQL_PORT
  MYSQL_PORT=${MYSQL_PORT:-3306}
else
  MYSQL_PORT=$DB_PORT
  echo "Usando DB_PORT de entorno: $MYSQL_PORT"
fi

if [ -z "$DB_USER" ]; then
  read -p "Usuario de MySQL [root]: " MYSQL_USER
  MYSQL_USER=${MYSQL_USER:-root}
else
  MYSQL_USER=$DB_USER
  echo "Usando DB_USER de entorno: $MYSQL_USER"
fi

if [ -z "$DB_PASSWORD" ]; then
  read -sp "Contraseña de MySQL: " MYSQL_PASS
  echo ""
else
  MYSQL_PASS=$DB_PASSWORD
  echo "Usando DB_PASSWORD de entorno"
fi

if [ -z "$DB_NAME" ]; then
  read -p "Base de datos [leon_express]: " MYSQL_DB
  MYSQL_DB=${MYSQL_DB:-leon_express}
else
  MYSQL_DB=$DB_NAME
  echo "Usando DB_NAME de entorno: $MYSQL_DB"
fi

echo ""
echo "🔌 Conectando a MySQL..."
echo "   Host: $MYSQL_HOST:$MYSQL_PORT"
echo "   Usuario: $MYSQL_USER"
echo "   Base de datos: $MYSQL_DB"
echo ""

# Verificar si el campo ya existe
echo "🔍 Verificando si el campo loading_status ya existe..."
FIELD_EXISTS=$(mysql -h"$MYSQL_HOST" -P"$MYSQL_PORT" -u"$MYSQL_USER" -p"$MYSQL_PASS" "$MYSQL_DB" -sN -e "
  SELECT COUNT(*) 
  FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = '$MYSQL_DB' 
    AND TABLE_NAME = 'routes' 
    AND COLUMN_NAME = 'loading_status';
" 2>/dev/null)

if [ "$FIELD_EXISTS" = "1" ]; then
  echo "⚠️  El campo loading_status ya existe en la tabla routes."
  read -p "¿Deseas continuar de todas formas? (s/N): " CONTINUE
  if [ "$CONTINUE" != "s" ] && [ "$CONTINUE" != "S" ]; then
    echo "❌ Migración cancelada."
    exit 0
  fi
fi

echo ""
echo "📝 Ejecutando migración..."

# Ejecutar la migración
mysql -h"$MYSQL_HOST" -P"$MYSQL_PORT" -u"$MYSQL_USER" -p"$MYSQL_PASS" "$MYSQL_DB" < "$MIGRATION_FILE" 2>&1

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Migración aplicada exitosamente!"
  echo ""
  echo "📊 Verificando cambios..."
  
  # Verificar que el campo exista
  mysql -h"$MYSQL_HOST" -P"$MYSQL_PORT" -u"$MYSQL_USER" -p"$MYSQL_PASS" "$MYSQL_DB" -e "
    SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = '$MYSQL_DB' 
      AND TABLE_NAME = 'routes' 
      AND COLUMN_NAME = 'loading_status';
  " 2>/dev/null
  
  echo ""
  echo "🎯 Próximos pasos:"
  echo "   1. Reinicia el backend para cargar los nuevos endpoints"
  echo "   2. Prueba el flujo completo de escaneo de paquetes"
  echo ""
else
  echo ""
  echo "❌ Error al aplicar la migración"
  echo "   Revisa los mensajes de error arriba"
  exit 1
fi

