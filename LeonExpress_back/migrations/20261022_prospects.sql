-- Idempotente. Las postulaciones no crean usuarios ni clientes.
CREATE TABLE IF NOT EXISTS prospects (
  prospect_id VARCHAR(36) NOT NULL PRIMARY KEY,
  dedupe_key VARCHAR(64) NOT NULL UNIQUE,
  company VARCHAR(120) NOT NULL,
  contact_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  commune VARCHAR(100) NOT NULL,
  volume VARCHAR(40) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('NEW','CONTACTED','CLOSED') NOT NULL DEFAULT 'NEW',
  email_status ENUM('PENDING','SENT','FAILED','NOT_CONFIGURED') NOT NULL DEFAULT 'PENDING',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_prospects_status_date (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
