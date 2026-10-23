#!/bin/bash
set -e

# Normalizar DB_HOST si contiene protocolo o puerto
if [[ "$DB_HOST" =~ ^[a-zA-Z]+:// ]]; then
    # Extraer host, puerto, etc de una URL
    DB_HOST_TEMP="${DB_HOST#*://}"
    DB_HOST_TEMP="${DB_HOST_TEMP#*@}"
    DB_HOST_TEMP="${DB_HOST_TEMP%%/*}"
    if [[ "$DB_HOST_TEMP" == *":"* ]]; then
        DB_PORT="${DB_HOST_TEMP#*:}"
        DB_HOST="${DB_HOST_TEMP%:*}"
    else
        DB_HOST="$DB_HOST_TEMP"
    fi
elif [[ "$DB_HOST" == *":"* ]]; then
    DB_PORT="${DB_HOST#*:}"
    DB_HOST="${DB_HOST%:*}"
fi

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

# Evitar recrear un trigger que ya está instalado con la misma definición.
# MySQL con binlog exige privilegios adicionales al crear triggers.
apply_pickup_request_trigger() {
    local migration_file="$1"
    local expected_definition
    local installed_definition

    expected_definition=$(sed -n '/^BEGIN$/,/^END\$\$/p' "$migration_file" | sed 's/^END\$\$/END/')
    if [ -z "$expected_definition" ]; then
        echo "❌ No se pudo leer la definición del trigger de colectas"
        return 1
    fi
    installed_definition=$(mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl --default-character-set=utf8mb4 -D "$DB_NAME" --batch --raw --skip-column-names -e "
        SELECT ACTION_STATEMENT FROM information_schema.TRIGGERS
        WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = 'trg_before_pickup_insert';
    ")

    if [ "$installed_definition" = "$expected_definition" ]; then
        echo "✅ Validación de solicitudes de colecta ya actualizada"
        return 0
    fi

    echo "Actualizando validación de solicitudes de colecta..."
    mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl --default-character-set=utf8mb4 "$DB_NAME" < "$migration_file"
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

    # --- Migración: Rol de Servicio al Cliente ---
    CUSTOMER_SERVICE_EXISTS=$(mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl -D "$DB_NAME" -sN -e "
        SELECT COUNT(*) FROM roles WHERE role_name = 'CUSTOMER_SERVICE';
    " 2>/dev/null || echo "0")

    if [ "$CUSTOMER_SERVICE_EXISTS" = "0" ] && [ -f "/app/migrations/20260820_add_customer_service_role.sql" ]; then
        echo "Agregando rol CUSTOMER_SERVICE..."
        mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl "$DB_NAME" < "/app/migrations/20260820_add_customer_service_role.sql" 2>&1 && {
            echo "Rol CUSTOMER_SERVICE agregado exitosamente"
        } || {
            echo "Error al agregar el rol CUSTOMER_SERVICE"
        }
    fi

    # --- Migración: Portal de Clientes, OTP y Colectas Solicitadas ---
    CLIENT_ROLE_EXISTS=$(mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl -D "$DB_NAME" -sN -e "
        SELECT COUNT(*) FROM roles WHERE role_name = 'CLIENT';
    " 2>/dev/null || echo "0")

    if [ "$CLIENT_ROLE_EXISTS" = "0" ] && [ -f "/app/migrations/20261021_client_portal_and_otp.sql" ]; then
        echo "Aplicando migración de Portal de Clientes y OTP..."
        mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl "$DB_NAME" < "/app/migrations/20261021_client_portal_and_otp.sql" 2>&1 && {
            echo "Migración de Portal de Clientes aplicada exitosamente"
        } || {
            echo "Error al aplicar migración de Portal de Clientes"
        }
    fi

    # --- Migración: Invitaciones de Clientes con Token Privado ---
    INVITATIONS_TABLE_EXISTS=$(mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl -D "$DB_NAME" -sN -e "
        SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = '$DB_NAME' AND TABLE_NAME = 'client_invitations';
    " 2>/dev/null || echo "0")

    if [ "$INVITATIONS_TABLE_EXISTS" = "0" ] && [ -f "/app/migrations/20261021_client_invitations.sql" ]; then
        echo "Aplicando migración de Invitaciones de Clientes..."
        mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl "$DB_NAME" < "/app/migrations/20261021_client_invitations.sql" 2>&1 && {
            echo "Migración de Invitaciones de Clientes aplicada exitosamente"
        } || {
            echo "Error al aplicar migración de Invitaciones de Clientes"
        }
    fi

    # Permitir solicitudes de colecta pendientes de asignación de conductor.
    if [ -f "/app/migrations/20261021_pickup_request_trigger.sql" ]; then
        apply_pickup_request_trigger "/app/migrations/20261021_pickup_request_trigger.sql"
    fi

    if [ -f "/app/migrations/20261022_user_retention.sql" ]; then
        echo "Aplicando seguimiento de usuarios desactivados y archivados..."
        mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl "$DB_NAME" < "/app/migrations/20261022_user_retention.sql"
    fi

    if [ -f "/app/migrations/20261022_prospects.sql" ]; then
        echo "Preparando solicitudes comerciales de la landing..."
        mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl "$DB_NAME" < "/app/migrations/20261022_prospects.sql"
    fi

    # --- Migración: Comprobantes de Pago y Estado EN_REVISION ---
    if [ -f "/app/migrations/20261021_invoice_payment_voucher.sql" ]; then
        echo "Aplicando migración de Comprobantes de Pago y Estado EN_REVISION..."
        mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl "$DB_NAME" < "/app/migrations/20261021_invoice_payment_voucher.sql" 2>&1 || true
    fi

    # --- Migración: Permitir NULL en scanned_at_origin_datetime ---
    if [ -f "/app/migrations/20261021_allow_null_scanned_at_origin.sql" ]; then
        echo "Aplicando migración scanned_at_origin_datetime NULL..."
        mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl "$DB_NAME" < "/app/migrations/20261021_allow_null_scanned_at_origin.sql" 2>&1 || true
    fi
}

# Flujo principal
wait_for_db
setup_database

echo "🚀 Iniciando aplicación..."
exec "$@"
