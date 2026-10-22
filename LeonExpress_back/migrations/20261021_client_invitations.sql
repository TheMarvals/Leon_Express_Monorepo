-- Migración: Tabla de Invitaciones de Clientes con Token Privado
-- Fecha: 2026-10-21

CREATE TABLE IF NOT EXISTS client_invitations (
  invitation_id VARCHAR(36) PRIMARY KEY,
  client_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  base_price DECIMAL(10,2) NOT NULL,
  has_free_pickups BOOLEAN NOT NULL DEFAULT FALSE,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  used_at DATETIME NULL,
  created_by VARCHAR(36) NULL,
  client_id VARCHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_invitations_token (token),
  INDEX idx_invitations_email (email),
  INDEX idx_invitations_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
