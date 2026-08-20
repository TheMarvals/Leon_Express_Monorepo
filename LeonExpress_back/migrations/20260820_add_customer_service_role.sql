-- Rol de atención al cliente. La autorización de módulos se controla en la aplicación.
INSERT INTO roles (role_id, role_name, created_at)
SELECT 'c5f3b50c-9d1f-4fd0-9c4e-0cdde756f001', 'CUSTOMER_SERVICE', NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM roles WHERE role_name = 'CUSTOMER_SERVICE'
);
