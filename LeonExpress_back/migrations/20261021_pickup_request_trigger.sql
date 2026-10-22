-- Una solicitud puede crearse antes de asignar el conductor.
-- Los retiros asignados conservan la validación de vehículo y el cálculo de costo.
DELIMITER $$
DROP TRIGGER IF EXISTS trg_before_pickup_insert$$
CREATE TRIGGER trg_before_pickup_insert BEFORE INSERT ON pickups FOR EACH ROW
BEGIN
    DECLARE v_has_free_pickups BOOLEAN;
    DECLARE v_base_delivery_cost DECIMAL(10,2);
    DECLARE v_vehicle_count INT;

    IF NEW.user_id IS NULL THEN
        SET NEW.pickup_cost = 0.00;
    ELSE
        SELECT COUNT(*) INTO v_vehicle_count FROM vehicles WHERE user_id = NEW.user_id;
        IF v_vehicle_count = 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El conductor no tiene un vehículo asignado.';
        END IF;

        SELECT vt.base_delivery_cost INTO v_base_delivery_cost
        FROM vehicles v
        JOIN vehicle_types vt ON v.type_id = vt.type_id
        WHERE v.user_id = NEW.user_id
        ORDER BY v.created_at DESC
        LIMIT 1;

        SELECT has_free_pickups INTO v_has_free_pickups
        FROM clients WHERE client_id = NEW.client_id;

        IF v_has_free_pickups THEN
            SET NEW.pickup_cost = 0.00;
        ELSE
            SET NEW.pickup_cost = COALESCE(v_base_delivery_cost, 0.00);
        END IF;
    END IF;
END$$
DELIMITER ;
