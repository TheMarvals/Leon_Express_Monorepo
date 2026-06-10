#!/bin/bash
# Script temporal para actualizar manualmente el procedimiento almacenado

mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" --skip-ssl "$DB_NAME" << 'EOSQL'

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_generate_weekly_driver_payouts`$$
CREATE PROCEDURE `sp_generate_weekly_driver_payouts` (IN `p_start_date` DATE, IN `p_end_date` DATE)   BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_user_id VARCHAR(36);
    DECLARE v_payout_id VARCHAR(36);
    DECLARE cur_drivers CURSOR FOR
        SELECT DISTINCT u.user_id FROM users u JOIN roles r ON u.role_id = r.role_id WHERE r.role_name = 'DRIVER';
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    OPEN cur_drivers;
    read_loop: LOOP
        FETCH cur_drivers INTO v_user_id;
        IF done THEN
            LEAVE read_loop;
        END IF;
        CALL sp_get_or_create_weekly_payout(v_user_id, p_end_date, v_payout_id);
        
        -- Inserts de entregas (deliveries)
        INSERT INTO payout_items (payout_item_id, payout_id, package_id, item_description, amount)
        SELECT UUID(), v_payout_id, p.package_id, CONCAT('Entrega - ', p.tracking_code), p.delivery_cost
        FROM packages p JOIN deliveries d ON p.package_id = d.package_id
        WHERE d.user_id = v_user_id AND d.status_at_delivery = 'ENTREGADO'
          AND DATE(d.attempted_at) BETWEEN p_start_date AND p_end_date
          AND NOT EXISTS (SELECT 1 FROM payout_items pi WHERE pi.package_id = p.package_id AND pi.payout_id = v_payout_id);
        
        -- Inserts de recolecciones (pickups)
        INSERT INTO payout_items (payout_item_id, payout_id, pickup_id, item_description, amount)
        SELECT UUID(), v_payout_id, pi.pickup_id, CONCAT('Recolección - Cliente ', c.client_name), pi.pickup_cost
        FROM pickups pi JOIN clients c ON pi.client_id = c.client_id
        WHERE pi.user_id = v_user_id AND pi.status = 'VERIFICADO_EN_ALMACEN'
          AND DATE(pi.verified_at_warehouse_at) BETWEEN p_start_date AND p_end_date
          AND NOT EXISTS (SELECT 1 FROM payout_items p_it WHERE p_it.pickup_id = pi.pickup_id AND p_it.payout_id = v_payout_id);
        
        -- Inserts de costos del conductor (CORRECCIÓN: especificar columnas explícitamente)
        INSERT INTO payout_items (payout_item_id, payout_id, package_id, pickup_id, item_description, amount)
        SELECT UUID(), v_payout_id, pc.package_id, NULL, c.cost_name, pc.applied_value
        FROM package_costs pc JOIN costs c ON pc.cost_id = c.cost_id
        JOIN packages p ON pc.package_id = p.package_id JOIN deliveries d ON p.package_id = d.package_id
        WHERE d.user_id = v_user_id AND pc.cost_type = 'DRIVER_CREDIT'
          AND DATE(d.attempted_at) BETWEEN p_start_date AND p_end_date
          AND NOT EXISTS (SELECT 1 FROM payout_items pi WHERE pi.package_id = pc.package_id AND pi.payout_id = v_payout_id AND pi.amount = pc.applied_value);
    END LOOP;
    CLOSE cur_drivers;
END$$

DELIMITER ;

EOSQL

echo "✅ Procedimiento sp_generate_weekly_driver_payouts actualizado correctamente"
