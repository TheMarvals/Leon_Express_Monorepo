# Consulta directa de Mercado Libre

## Responsabilidades

- Gateway: OAuth, tokens cifrados, renovación centralizada, vínculos y cola durable de eventos. No consulta ni persiste paquetes. Las rutas antiguas `/api/shipments/*` y de sincronización responden 410.
- León Express: consulta ventas pagadas con envíos activos en Mercado Libre, aplica cobertura y logística, y registra sus propias decisiones de importación en `ml_imports`. El paquete y su marca se confirman en la misma transacción. La PK por ID externo impide dos importaciones simultáneas, incluso entre recolecciones distintas.
- LeónImport: ventas y etiquetas oficiales consultadas directamente en Mercado Libre, con la autorización de la cuenta correspondiente. No requiere `ml_shipments` del gateway.

El historial operativo sigue en las bases de cada aplicación. Los pendientes en León Express usan una caché **en memoria**, con 60 segundos de vigencia después de completar la consulta; no es otra tabla de paquetes. La primera carga es progresiva y la API informa `refreshing`, `complete` y errores por cuenta. Importar o escanear vuelve a consultar el envío exacto. Una búsqueda por código también consulta directamente, sin depender de páginas previas.

## Eventos

El webhook público guarda únicamente cuenta, tema e identificador del recurso. Responde después de confirmar la escritura; ante un fallo devuelve 503 para permitir el reintento de Mercado Libre. La cola reintenta entregas a León Express, conserva pendientes y elimina identificadores entregados después de siete días.

Ambos servicios necesitan el mismo `INTERNAL_WEBHOOK_TOKEN`, generado aleatoriamente y almacenado como secreto en Coolify. No existe secreto predeterminado. `LE_WEBHOOK_URL` en el gateway apunta a `https://leonexpress.cl/api/mercadolibre/webhook/event`.

León Express comprueba la cuenta vinculada, relee Mercado Libre y actualiza el paquete bajo bloqueo. Una notificación repetida no crea dos cancelaciones; un paquete entregado no se revierte. Una reconciliación local acotada cada cinco minutos cubre eventos perdidos durante el corte.

## Orden de corte y conservación

1. Crear `ml_imports` con `LeonExpress_back/migrations/20261023_ml_imports.sql`.
2. Exportar del gateway solo los identificadores/marcas `imported` de `leon-express` y `skipped` aplicables. Pasarlos por stdin a `scripts/migrate-ml-imports.js`; el script es idempotente y no modifica paquetes.
3. Publicar primero León Express y LeónImport. Comprobar consulta directa, selección por cuenta y etiquetas antes de retirar las rutas del gateway.
4. Repetir la transferencia de marcas después de retirar la versión anterior de León Express para cubrir importaciones concurrentes durante el despliegue.
5. Publicar el gateway sin escritores de paquetes. Verificar las seis autorizaciones y la recepción/entrega de eventos.
6. Conservar una copia privada de las tablas históricas antes de retirar su almacenamiento activo. No borrar ni restaurar tokens desde una copia antigua.

La primera transferencia del 23 de octubre incluyó 5.193 marcas. Exportación privada: `/root/le-ml-live-20261023/import-marks.json` en el VPS. Antes de revertir una aplicación antigua, hay que reconciliar las marcas locales nuevas; volver al código anterior sin hacerlo puede reofrecer envíos ya importados. OAuth y las cuentas no se recrean.

## Verificación

- Tests de consultas directas, filtrado, paginación, aislamiento por cuenta y fallos parciales.
- Tests SQL reales de concurrencia, rollback, migración idempotente y cancelación idempotente.
- Tests de cola durable/reintentos y de obtención de etiquetas oficiales con la cuenta correcta.
- Prueba de lectura en el VPS: las cinco cuentas vinculadas a León Express completaron la consulta, con 209 envíos elegibles en esa instantánea. No se importaron paquetes de prueba en producción.

Referencias: [búsqueda y filtros de órdenes](https://developers.mercadolibre.cl/es_ar/pedidos-y-opiniones), [notificaciones](https://developers.mercadolivre.com.br/en_us/products-receive-notifications).

## Corte completado

- León Express: `f2e5356`, seguido por `c76080e` para conservar resultados durante refrescos concurrentes.
- LeónImport: `f4611a2`; etiqueta oficial obtenida directamente desde ML y validada como PDF (58.635 bytes en la prueba).
- Gateway: `a59520d`; health `credentials-and-events`, seis cuentas autorizadas y entrega de eventos verificada sin reintentos en la prueba inicial.
- Se repitió la transferencia de las 5.193 marcas después de sustituir los escritores antiguos; no quedaron marcas adicionales pendientes.
- Retiradas las tablas activas `ml_shipments` (101.954 filas) y `ml_webhook_logs` (2.133.557 filas). La base del gateway ahora tiene solo cuentas, vínculos OAuth y cola de entrega.
- Copia histórica privada, permisos 0600: `/root/le-ml-live-20261023/retired-shipment-storage.sql.gz`. Se verificó el contenido de ambas tablas y la integridad gzip antes de retirarlas. SHA-256: `4d4994688033716f23059d05aae8b5b65625ebd0f12d5cd7edb4d8f0df96556c`.

Los cambios del gateway y LeónImport se prepararon en worktrees aislados para conservar cambios locales previos sin publicarlos. No se reinició el servicio OCR ni se modificó el esquema operativo de LeónImport.
