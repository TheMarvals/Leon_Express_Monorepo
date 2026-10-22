-- Migración para permitir NULL en scanned_at_origin_datetime para paquetes en PENDIENTE_RECOLECCION
ALTER TABLE packages MODIFY COLUMN scanned_at_origin_datetime DATETIME NULL DEFAULT NULL;
