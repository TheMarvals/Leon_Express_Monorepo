-- Control local de importación. No contiene datos de destinatarios ni credenciales.
CREATE TABLE IF NOT EXISTS ml_imports (
  external_id VARCHAR(32) NOT NULL PRIMARY KEY,
  ml_account_id VARCHAR(36) NOT NULL,
  legacy_shipment_id VARCHAR(36) NULL,
  package_id VARCHAR(36) NULL,
  disposition VARCHAR(16) NOT NULL DEFAULT 'imported',
  imported_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ml_imports_package (package_id),
  UNIQUE KEY ml_imports_legacy (legacy_shipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
