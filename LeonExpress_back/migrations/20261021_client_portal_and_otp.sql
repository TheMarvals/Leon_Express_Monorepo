-- Migración: Portal de Clientes, Autenticación OTP, Colectas Solicitadas y Valor de Colecta
-- Fecha: 2026-10-21

-- 1. Rol CLIENT en la tabla roles
INSERT INTO roles (role_id, role_name, created_at)
SELECT 'c5f3b50c-9d1f-4fd0-9c4e-0cdde756f002', 'CLIENT', NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM roles WHERE role_name = 'CLIENT'
);

-- 2. Permitir warehouse_id NULL en users (los usuarios clientes no pertenecen a un almacén)
ALTER TABLE users MODIFY COLUMN warehouse_id VARCHAR(36) NULL;

-- 3. Agregar client_id a users si no existe
SET @col_users_client = (
  SELECT COUNT(*) 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'users' 
    AND COLUMN_NAME = 'client_id'
);

SET @sql_users_client = IF(@col_users_client = 0,
  'ALTER TABLE users ADD COLUMN client_id VARCHAR(36) NULL AFTER role_id, ADD CONSTRAINT fk_users_client_id FOREIGN KEY (client_id) REFERENCES clients(client_id) ON DELETE SET NULL',
  'SELECT "Columna client_id ya existe en users"'
);
PREPARE stmt1 FROM @sql_users_client;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

-- 4. Tabla de OTPs para inicio de sesión de clientes
CREATE TABLE IF NOT EXISTS client_otps (
  otp_id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(100) NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_client_otps_email (email),
  INDEX idx_client_otps_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Permitir user_id NULL en pickups (cuando el cliente solicita una colecta antes de tener conductor asignado)
ALTER TABLE pickups MODIFY COLUMN user_id VARCHAR(36) NULL;

-- 6. Agregar estado 'SOLICITADA' al ENUM de pickups.status si no está presente
SET @pickup_enum = (
  SELECT COLUMN_TYPE 
  FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
    AND TABLE_NAME = 'pickups' 
    AND COLUMN_NAME = 'status'
);

SET @sql_pickup_enum = IF(@pickup_enum NOT LIKE '%SOLICITADA%',
  'ALTER TABLE pickups MODIFY COLUMN status ENUM(\'SOLICITADA\', \'ASIGNADO_A_RECOLECTOR\', \'EN_PROCESO_RECOLECCION\', \'RECOLECCION_FINALIZADA_DRIVER\', \'ENTREGADO_EN_ALMACEN\', \'VERIFICADO_EN_ALMACEN\', \'CANCELADO\') NOT NULL DEFAULT \'ASIGNADO_A_RECOLECTOR\'',
  'SELECT "Estado SOLICITADA ya existe en pickups.status"'
);
PREPARE stmt2 FROM @sql_pickup_enum;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

-- 7. Permitir pickup_id NULL en packages (para paquetes manuales creados antes de asignar colecta)
ALTER TABLE packages MODIFY COLUMN pickup_id VARCHAR(36) NULL;

