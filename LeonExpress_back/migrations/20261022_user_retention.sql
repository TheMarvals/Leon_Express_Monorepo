-- Track continuous inactivity separately from profile edits; preserve all historical identities.
SET @retention_col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'deactivated_at');
SET @retention_sql = IF(@retention_col = 0, 'ALTER TABLE users ADD COLUMN deactivated_at DATETIME NULL', 'SELECT 1');
PREPARE retention_stmt FROM @retention_sql;
EXECUTE retention_stmt;
DEALLOCATE PREPARE retention_stmt;
SET @retention_col = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'archived_at');
SET @retention_sql = IF(@retention_col = 0, 'ALTER TABLE users ADD COLUMN archived_at DATETIME NULL', 'SELECT 1');
PREPARE retention_stmt FROM @retention_sql;
EXECUTE retention_stmt;
DEALLOCATE PREPARE retention_stmt;
-- Legacy records: the last profile modification is a conservative inactivity starting point.
UPDATE users SET deactivated_at = COALESCE(updated_at, created_at, UTC_TIMESTAMP()), updated_at = updated_at
WHERE is_active = 0 AND deactivated_at IS NULL;
SET @retention_index = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_retention');
SET @retention_sql = IF(@retention_index = 0, 'ALTER TABLE users ADD INDEX idx_users_retention (is_active, archived_at, deactivated_at)', 'SELECT 1');
PREPARE retention_stmt FROM @retention_sql;
EXECUTE retention_stmt;
DEALLOCATE PREPARE retention_stmt;
