### Fase 1: Configuración y Gestión de Entidades Maestras (Base)
### Estas son las entidades que raramente cambian y son esenciales para que el sistema funcione.
### Roles (Control de Acceso)

--- GET /api/roles: Obtener todos los roles.
--- GET /api/roles/{id}: Obtener un rol por ID.
--- POST /api/roles: Crear un nuevo rol.
--- PUT /api/roles/{id}: Actualizar un rol existente.
--- DELETE /api/roles/{id}: Eliminar un rol.

### Nota: Para un sistema de producción, la eliminación y actualización de roles podría ser muy restringida.
### Almacenes (warehouses)
--- GET /api/warehouses: Obtener todos los almacenes.
--- GET /api/warehouses/{id}: Obtener un almacén por ID.
--- POST /api/warehouses: Crear un nuevo almacén.
--- PUT /api/warehouses/{id}: Actualizar un almacén existente.
--- DELETE /api/warehouses/{id}: Eliminar un almacén.


### Tipos de Vehículo (vehicle_types)
GET /api/vehicle-types: Obtener todos los tipos de vehículo.
GET /api/vehicle-types/{id}: Obtener un tipo de vehículo por ID.
POST /api/vehicle-types: Crear un nuevo tipo de vehículo.
PUT /api/vehicle-types/{id}: Actualizar un tipo de vehículo.
DELETE /api/vehicle-types/{id}: Eliminar un tipo de vehículo.

### Usuarios (users)
GET /api/users: Obtener todos los usuarios.
GET /api/users/{id}: Obtener un usuario por ID.
POST /api/users: Crear un nuevo usuario (con hashing de contraseña).
PUT /api/users/{id}: Actualizar un usuario existente.
DELETE /api/users/{id}: Eliminar un usuario.
PUT /api/users/{id}/deactivate: Desactivar un usuario (mejor que eliminar si hay datos históricos).
Consideración clave: Rutas para autenticación (login) y gestión de sesiones/tokens.
POST /api/auth/login: Autenticar usuario.
POST /api/auth/logout: Cerrar sesión.
GET /api/auth/me: Obtener información del usuario autenticado.


### Fase 2: Gestión de Entidades Operacionales Clave

## Estas son las entidades centrales de tu negocio de paquetería.
### Clientes (clients)
GET /api/clients: Obtener todos los clientes.
GET /api/clients/{id}: Obtener un cliente por ID.
POST /api/clients: Crear un nuevo cliente.
PUT /api/clients/{id}: Actualizar un cliente existente.
DELETE /api/clients/{id}: Eliminar un cliente (considerar desactivación si hay histórico).

### Vehículos (vehicles)
GET /api/vehicles: Obtener todos los vehículos.
GET /api/vehicles/{id}: Obtener un vehículo por ID.
POST /api/vehicles: Crear un nuevo vehículo.
PUT /api/vehicles/{id}: Actualizar un vehículo existente.
DELETE /api/vehicles/{id}: Eliminar un vehículo.
PUT /api/vehicles/{id}/assign-driver: Asignar un conductor a un vehículo.
PUT /api/vehicles/{id}/unassign-driver: Desasignar un conductor de un vehículo.

### Precios por Cliente (client_pricing)
GET /api/clients/{clientId}/pricing: Obtener precios personalizados para un cliente.
GET /api/client-pricing/{id}: Obtener una entrada de precio específico.
POST /api/client-pricing: Crear una nueva regla de precio para un cliente.
PUT /api/client-pricing/{id}: Actualizar una regla de precio.
DELETE /api/client-pricing/{id}: Eliminar una regla de precio.

### Fase 3: Flujo de Negocio Principal (Recolección y Paquetes)

### Aquí es donde comienza el movimiento de la logística.
### Pickups (pickups)
GET /api/pickups: Obtener todas las recolecciones.
GET /api/pickups/{id}: Obtener una recolección por ID.
POST /api/pickups: Crear una nueva recolección (asigna driver, cliente, fecha).
PUT /api/pickups/{id}/status: Actualizar el estado de una recolección (ASIGNADO_A_RECOLECTOR, EN_PROCESO_RECOLECCION, etc.).
PUT /api/pickups/{id}/complete-driver: Marcar como completada por el driver.
PUT /api/pickups/{id}/arrive-warehouse: Marcar como llegada al almacén.
PUT /api/pickups/{id}/verify-warehouse: Marcar como verificada en almacén.
PUT /api/pickups/{id}/cancel: Cancelar una recolección.
GET /api/pickups/driver/{userId}: Obtener recolecciones asignadas a un driver.
GET /api/pickups/client/{clientId}: Obtener recolecciones de un cliente.

### Paquetes (packages)
GET /api/packages: Obtener todos los paquetes (con filtros de estado, tracking_code).
GET /api/packages/{id}: Obtener un paquete por ID.
GET /api/packages/tracking/{trackingCode}: Obtener un paquete por código de seguimiento.
POST /api/pickups/{pickupId}/packages: Añadir un paquete a una recolección existente (o simplemente POST /api/packages si el paquete se puede crear fuera de una recolección inicial).
PUT /api/packages/{id}/status: Actualizar el estado de un paquete (RECIBIDO_EN_ALMACEN, ASIGNADO_A_RUTA, etc.).
PUT /api/packages/{id}: Actualizar detalles de un paquete (dirección, destinatario).


### Fase 4: Flujo de Negocio Avanzado (Rutas y Entregas)

### Esta fase construye sobre las anteriores para la etapa final de entrega.
### Rutas (routes)
GET /api/routes: Obtener todas las rutas.
GET /api/routes/{id}: Obtener una ruta por ID.
POST /api/routes: Crear una nueva ruta (asigna driver, vehículo, almacén, fecha de inicio).
PUT /api/routes/{id}/status: Actualizar el estado de una ruta (EN_PROGRESO, FINALIZADA).
PUT /api/routes/{id}/add-package: Añadir un paquete a una ruta (/api/routes/{routeId}/packages).
DELETE /api/routes/{routeId}/packages/{packageId}: Quitar un paquete de una ruta.
GET /api/routes/driver/{userId}: Obtener rutas asignadas a un driver.
GET /api/routes/{id}/packages: Obtener paquetes de una ruta específica.

### Entregas (deliveries)
GET /api/deliveries: Obtener todos los intentos de entrega.
GET /api/deliveries/{id}: Obtener un intento de entrega por ID.
POST /api/packages/{packageId}/deliveries: Registrar un nuevo intento de entrega para un paquete.
GET /api/deliveries/package/{packageId}: Obtener historial de intentos de entrega de un paquete.

### Fotos de Entregas (delivery_photos)
POST /api/deliveries/{deliveryId}/photos: Subir una foto para un intento de entrega. 
(Esto generalmente implica subir el archivo y guardar la URL).
GET /api/deliveries/{deliveryId}/photos: Obtener URLs de fotos para un intento de entrega.

### Fase 5: Finanzas y Auditoría

### Esenciales para la operación del negocio.
### Facturas (invoices)
GET /api/invoices: Obtener todas las facturas (con filtros por cliente, estado, fecha).
GET /api/invoices/{id}: Obtener una factura por ID.
POST /api/invoices: Crear una nueva factura (esto podría ser una operación manual o disparada por un proceso batch).
GET /api/invoices/{id}/items: Obtener ítems de una factura.
POST /api/invoices/{invoiceId}/items: Añadir un ítem (paquete) a una factura.
PUT /api/invoices/{id}/status: Actualizar estado de factura (ej. 'CANCELADA').
GET /api/clients/{clientId}/invoices: Obtener facturas de un cliente.

### Pagos (payments)
GET /api/payments: Obtener todos los pagos.
GET /api/payments/{id}: Obtener un pago por ID.
POST /api/invoices/{invoiceId}/payments: Registrar un pago para una factura.

### Pagos a Conductores (driver_payouts)
GET /api/driver-payouts: Obtener todos los pagos a conductores.
GET /api/driver-payouts/{id}: Obtener un pago a conductor por ID.
POST /api/driver-payouts: Crear un nuevo pago a conductor.
PUT /api/driver-payouts/{id}/status: Actualizar estado del pago (ej. 'PAGADO').
GET /api/driver-payouts/{id}/items: Obtener ítems de un pago a conductor.
POST /api/driver-payouts/{payoutId}/items: Añadir un ítem (paquete/recolección) a un pago.
GET /api/users/{userId}/driver-payouts: Obtener pagos para un conductor específico.

### Auditoría (audit_log)
GET /api/audit-log: Obtener registros de auditoría (posiblemente con filtros por usuario, tabla, acción).
### Nota: Esta tabla generalmente se llena a través de triggers o lógica de negocio en el backend, no directamente a través de rutas API para escritura.

### Fase 6: Vistas y Reportes (Lectura)
### Estas son rutas para consumir los datos de las vistas que ya definiste.

### Viaje Completo del Paquete (vw_full_package_journey)
GET /api/reports/package-journey: Obtener el viaje completo de todos los paquetes (con filtros de tracking code, cliente, driver, etc.).
GET /api/reports/package-journey/{packageId}: Obtener el viaje de un paquete específico.

### Resumen de Cobros a Clientes (vw_client_billing_summary)
GET /api/reports/client-billing-summary: Obtener resumen de cobros por cliente.
GET /api/reports/client-billing-summary/{clientId}: Obtener resumen de cobros para un cliente específico.

### Resumen de Ganancias de Conductores (vw_driver_earnings_summary)
GET /api/reports/driver-earnings-summary: Obtener resumen de ganancias por conductor.
GET /api/reports/driver-earnings-summary/{userId}: Obtener resumen de ganancias para un conductor específico.
