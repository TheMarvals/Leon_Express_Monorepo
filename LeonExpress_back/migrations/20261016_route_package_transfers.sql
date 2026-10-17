-- Run scripts/migrate-route-transfers.js --check before applying. Stop the backend while migrating.
ALTER TABLE route_packages
  ADD COLUMN released_at DATETIME NULL,
  ADD COLUMN release_reason VARCHAR(32) NULL,
  ADD COLUMN released_by_user_id VARCHAR(36) NULL,
  ADD COLUMN status_at_release VARCHAR(40) NULL,
  ADD COLUMN transferred_to_route_id VARCHAR(36) NULL,
  ADD INDEX idx_route_packages_active (package_id, released_at);

-- Preserve previous assignments. Do not invent delivery/incident outcomes for legacy rows.
-- The preflight rejects ambiguous latest timestamps before any ALTER TABLE.
CREATE TEMPORARY TABLE route_transfer_latest AS
SELECT rp.package_id, rp.route_id, rp.route_package_id, rp.created_at
FROM route_packages rp
JOIN (SELECT package_id, MAX(created_at) AS latest_at FROM route_packages GROUP BY package_id) latest
  ON latest.package_id = rp.package_id AND latest.latest_at = rp.created_at;

UPDATE route_packages previous
JOIN route_transfer_latest latest ON latest.package_id = previous.package_id
SET previous.released_at = latest.created_at,
    previous.release_reason = 'ASIGNACION_ANTERIOR',
    previous.status_at_release = 'SIN_ESTADO_HISTORICO',
    previous.transferred_to_route_id = latest.route_id
WHERE previous.route_package_id <> latest.route_package_id;

DROP TEMPORARY TABLE route_transfer_latest;

UPDATE route_packages rp
JOIN packages p ON p.package_id = rp.package_id
SET rp.released_at = COALESCE(p.received_at_warehouse_datetime, CURRENT_TIMESTAMP),
    rp.release_reason = 'RECIBIDO_EN_ALMACEN', rp.status_at_release = p.status
WHERE rp.released_at IS NULL AND p.status IN ('RECIBIDO_EN_ALMACEN', 'DEVUELTO_ALMACEN');

ALTER TABLE route_packages
  ADD COLUMN active_assignment_marker TINYINT
    GENERATED ALWAYS AS (CASE WHEN released_at IS NULL THEN 1 ELSE NULL END) STORED,
  ADD UNIQUE INDEX uq_route_packages_active_package (package_id, active_assignment_marker);

-- Database guards also cover stored procedures and concurrent requests.
-- If legacy duplicates exist, these statements fail rather than deleting financial history.
ALTER TABLE deliveries
  ADD COLUMN successful_delivery_marker TINYINT
    GENERATED ALWAYS AS (CASE WHEN status_at_delivery = 'ENTREGADO' THEN 1 ELSE NULL END) STORED,
  ADD UNIQUE INDEX uq_deliveries_successful_package (package_id, successful_delivery_marker);

ALTER TABLE payout_items
  ADD COLUMN base_delivery_payment_marker TINYINT
    GENERATED ALWAYS AS (CASE WHEN item_description LIKE 'Entrega - %' THEN 1 ELSE NULL END) STORED,
  ADD UNIQUE INDEX uq_payout_items_delivery_package (package_id, base_delivery_payment_marker);

-- The migration runner also replaces the legacy uniq_route_package index when present.
-- A package may revisit a route; the active-assignment index enforces one current owner.
