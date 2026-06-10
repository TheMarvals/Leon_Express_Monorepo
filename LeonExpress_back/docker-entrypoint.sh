#!/bin/bash
set -e

# Esperar a que la base de datos esté lista
wait_for_db() {
    echo "⏳ Esperando a que la base de datos en $DB_HOST este lista..."
    for i in {1..60}; do
        if mariadb-admin ping -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl; then
            echo "✅ Base de datos conectada"
            return 0
        fi
        echo "Intentando conectar a $DB_HOST... ($i/60)"
        sleep 2
    done
    echo "❌ No se pudo conectar a la base de datos en $DB_HOST"
    return 1
}

# Inicializar base de datos
setup_database() {
    # Crear base de datos si no existe (con root sería mejor, pero intentamos con usuario normal)
    # Nota: Si el usuario no tiene permisos de CREATE DATABASE, esto fallará pero asumimos que la DB ya existe en el NAS
    # mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null || true

    # Verificar si hay tablas
    TABLE_COUNT=$(mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl -D "$DB_NAME" -e "SHOW TABLES;" 2>/dev/null | wc -l || echo "0")
    
    if [ "$TABLE_COUNT" -le "1" ] && [ -f "/app/initdb/leon_express (1).sql" ]; then
        echo "📥 Base de datos vacía, importando backup..."
        mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl "$DB_NAME" < "/app/initdb/leon_express (1).sql" && {
            echo "✅ Backup importado"
        } || {
            echo "⚠️  Error al importar SQL"
        }
    fi
    
    # IMPORTANTE: Siempre actualizar Stored Procedures
    if [ -f "/app/migrations/update_stored_procedures.sql" ]; then
        echo "🔄 Actualizando Procedimientos Almacenados..."
        if mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl "$DB_NAME" < "/app/migrations/update_stored_procedures.sql" 2>&1; then
            echo "✅ Procedimientos Almacenados actualizados"
        else
            echo "❌ Error al actualizar Stored Procedures"
            exit 1
        fi
    fi
    
    # Ejecutar migraciones pendientes
    run_pending_migrations
}

run_pending_migrations() {
    echo "🔍 Verificando migraciones pendientes..."
    
    FIELD_EXISTS=$(mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl -D "$DB_NAME" -sN -e "
        SELECT COUNT(*) 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = '$DB_NAME' 
          AND TABLE_NAME = 'routes' 
          AND COLUMN_NAME = 'loading_status';
    " 2>/dev/null || echo "0")
    
    FIELD_EXISTS_MANUAL=$(mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl -D "$DB_NAME" -sN -e "
        SELECT COUNT(*) 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = '$DB_NAME' 
          AND TABLE_NAME = 'packages' 
          AND COLUMN_NAME = 'is_delivery_cost_manual';
    " 2>/dev/null || echo "0")
    
    if [ "$FIELD_EXISTS_MANUAL" = "0" ]; then
        echo "📝 Añadiendo columna is_delivery_cost_manual a packages..."
        mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl "$DB_NAME" -e "ALTER TABLE packages ADD COLUMN is_delivery_cost_manual BOOLEAN DEFAULT FALSE;" 2>&1 || true
    fi
    
    if [ "$FIELD_EXISTS" = "0" ] && [ -f "/app/migrations/add_loading_status_to_routes.sql" ]; then
        echo "📝 Aplicando migración: add_loading_status_to_routes.sql"
        mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl "$DB_NAME" < "/app/migrations/add_loading_status_to_routes.sql" 2>&1 && {
            echo "✅ Migración aplicada exitosamente"
        } || {
            echo "⚠️  Error al aplicar migración"
        }
    else
        echo "✅ Schema verificado"
    fi
    
    # --- Migración: Tablas de Aprendizaje OCR ---
    LEARNING_TABLE_EXISTS=$(mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl -D "$DB_NAME" -sN -e "
        SELECT COUNT(*) 
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = '$DB_NAME' 
          AND TABLE_NAME = 'ocr_corrections';
    " 2>/dev/null || echo "0")
    
    if [ "$LEARNING_TABLE_EXISTS" = "0" ] && [ -f "/app/migrations/create_learning_tables.sql" ]; then
        echo "Aplicando migración: create_learning_tables.sql (Sistema de Aprendizaje OCR)"
        mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl "$DB_NAME" < /app/migrations/create_learning_tables.sql 2>&1 && {
            echo "Tablas de aprendizaje OCR creadas"
        } || {
            echo "Error al crear tablas de aprendizaje"
        }
    fi

    # --- Migración: Agregar PENDIENTE_RECOLECCION al ENUM de packages.status ---
    HAS_PENDIENTE=$(mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl -D "$DB_NAME" -sN -e "
        SELECT COLUMN_TYPE 
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = '$DB_NAME' 
          AND TABLE_NAME = 'packages' 
          AND COLUMN_NAME = 'status';
    " 2>/dev/null || echo "")

    if echo "$HAS_PENDIENTE" | grep -q "PENDIENTE_RECOLECCION"; then
        echo "PENDIENTE_RECOLECCION ya existe en packages.status"
    else
        echo "Agregando PENDIENTE_RECOLECCION al ENUM de packages.status..."
        mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl "$DB_NAME" -e "
            ALTER TABLE packages MODIFY COLUMN status ENUM('PENDIENTE_RECOLECCION','RECOLECTADO_EN_ORIGEN','RECIBIDO_EN_ALMACEN','ASIGNADO_A_RUTA','EN_RUTA_ENTREGA','ENTREGADO','INCIDENCIA_ENTREGA','REPROGRAMADO','DEVUELTO_ALMACEN','EN_RUTA_DEVOLUCION','DEVUELTO_A_CLIENTE','CANCELADO') NOT NULL DEFAULT 'RECOLECTADO_EN_ORIGEN';
        " 2>&1 && {
            echo "PENDIENTE_RECOLECCION agregado exitosamente"
        } || {
            echo "Error al agregar PENDIENTE_RECOLECCION"
        }
    fi
}

# Flujo principal
wait_for_db
setup_database

echo "🚀 Iniciando aplicación..."
exec "$@"
