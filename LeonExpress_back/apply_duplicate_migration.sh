#!/bin/bash

# Script para ejecutar la migración de duplicados
# Uso: ./apply_duplicate_migration.sh

echo "🔧 Aplicando migración de sistema de duplicados..."
echo ""

# Verificar si existe el archivo de migración
MIGRATION_FILE="migrations/20251022_remove_unique_constraint.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ Error: No se encontró el archivo $MIGRATION_FILE"
  exit 1
fi

echo "📁 Archivo encontrado: $MIGRATION_FILE"
echo ""

# Solicitar credenciales de MySQL
read -p "Host de MySQL [localhost]: " MYSQL_HOST
MYSQL_HOST=${MYSQL_HOST:-localhost}

read -p "Puerto de MySQL [3306]: " MYSQL_PORT
MYSQL_PORT=${MYSQL_PORT:-3306}

read -p "Usuario de MySQL [root]: " MYSQL_USER
MYSQL_USER=${MYSQL_USER:-root}

read -sp "Contraseña de MySQL: " MYSQL_PASS
echo ""

read -p "Base de datos [leon_express]: " MYSQL_DB
MYSQL_DB=${MYSQL_DB:-leon_express}

echo ""
echo "🔌 Conectando a MySQL..."
echo "   Host: $MYSQL_HOST:$MYSQL_PORT"
echo "   Usuario: $MYSQL_USER"
echo "   Base de datos: $MYSQL_DB"
echo ""

# Ejecutar la migración
mysql -h"$MYSQL_HOST" -P"$MYSQL_PORT" -u"$MYSQL_USER" -p"$MYSQL_PASS" "$MYSQL_DB" < "$MIGRATION_FILE"

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Migración aplicada exitosamente!"
  echo ""
  echo "📊 Verificando cambios..."
  
  # Verificar que los campos existan
  mysql -h"$MYSQL_HOST" -P"$MYSQL_PORT" -u"$MYSQL_USER" -p"$MYSQL_PASS" "$MYSQL_DB" -e "
    SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = '$MYSQL_DB' 
      AND TABLE_NAME = 'packages' 
      AND COLUMN_NAME IN ('duplicate_handling', 'duplicate_notes', 'duplicate_reviewed_by', 'duplicate_reviewed_at')
    ORDER BY ORDINAL_POSITION;
  "
  
  echo ""
  echo "🎯 Próximos pasos:"
  echo "   1. El backend se reiniciará automáticamente (nodemon)"
  echo "   2. Prueba escaneando una etiqueta con el mismo código externo"
  echo "   3. Verifica que se detecte como duplicado en los logs"
  echo ""
else
  echo ""
  echo "❌ Error al aplicar la migración"
  echo "   Verifica las credenciales y que la base de datos exista"
  exit 1
fi
