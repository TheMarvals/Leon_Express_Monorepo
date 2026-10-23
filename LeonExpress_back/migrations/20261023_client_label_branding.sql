-- Idempotente. El logo se almacena separado de los listados y sesiones de clientes.
-- Igualar la codificación de la clave existente antes de crear su FK.
SELECT CHARACTER_SET_NAME, COLLATION_NAME INTO @label_charset, @label_collation
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'client_id';
SET @label_sql = CONCAT('CREATE TABLE IF NOT EXISTS client_label_branding (
  client_id VARCHAR(36) CHARACTER SET ', @label_charset, ' COLLATE ', @label_collation, ' NOT NULL PRIMARY KEY,
  logo_data_url MEDIUMTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_label_branding_client FOREIGN KEY (client_id) REFERENCES clients(client_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
PREPARE label_statement FROM @label_sql;
EXECUTE label_statement;
DEALLOCATE PREPARE label_statement;
