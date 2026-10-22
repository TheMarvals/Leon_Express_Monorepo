-- Migración: Comprobantes de Pago y Flujo de Revisión de Facturas
-- Fecha: 2026-10-21

-- 1. Actualizar ENUM de estado de facturas para incluir EN_REVISION
ALTER TABLE invoices MODIFY COLUMN status ENUM('PENDIENTE', 'EN_REVISION', 'PAGADA', 'VENCIDA', 'CANCELADA') NOT NULL DEFAULT 'PENDIENTE';

-- 2. Agregar columnas a la tabla payments si no existen
SET @col_receipt = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'receipt_url'
);

SET @sql_receipt = IF(@col_receipt = 0,
  'ALTER TABLE payments ADD COLUMN receipt_url VARCHAR(255) NULL AFTER notes,
   ADD COLUMN status ENUM(\'PENDIENTE_APROBACION\', \'APROBADO\', \'RECHAZADO\') NOT NULL DEFAULT \'APROBADO\' AFTER receipt_url,
   ADD COLUMN created_by VARCHAR(36) NULL AFTER status,
   ADD COLUMN approved_by VARCHAR(36) NULL AFTER created_by,
   ADD COLUMN approved_at DATETIME NULL AFTER approved_by,
   ADD COLUMN rejection_reason TEXT NULL AFTER approved_at,
   ADD COLUMN updated_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER rejection_reason',
  'SELECT "Columnas de comprobante ya existen en payments"'
);

PREPARE stmt_receipt FROM @sql_receipt;
EXECUTE stmt_receipt;
DEALLOCATE PREPARE stmt_receipt;
