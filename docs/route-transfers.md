# Rutas abiertas y traspaso de pendientes

Un conductor puede tener varias rutas pendientes o en progreso. Cada paquete tiene una sola asignación vigente. Las rutas se cierran individualmente.

## Uso

- En una ruta abierta, seleccionar paquetes en «Transferir pendientes», elegir otra ruta de entrega de la misma bodega y confirmar el traspaso físico. El conductor de origen puede transferir a otra ruta propia o de otro conductor; un administrador puede gestionar cualquier ruta de origen. El selector se actualiza al abrirse y solo ofrece rutas de entrega pendientes o en progreso de la misma bodega.
- Un conductor también puede escanear un paquete pendiente en su ruta. Si está en otra ruta, debe confirmar que lo tiene físicamente. El traspaso se registra con fecha, usuario y ruta de destino.
- Una ruta en progreso admite nuevas cargas. Los paquetes nuevos pasan directamente a «En ruta de entrega». La aprobación inicial de carga se mantiene.
- La ruta anterior muestra los traspasos en su historial y deja de mostrar esos paquetes como pendientes. La entrega y el pago corresponden al conductor que efectivamente registra la entrega desde la ruta vigente en progreso.
- El monto por cobrar al cliente (COD) y el precio del cliente se conservan. La remuneración automática se ajusta al vehículo de destino; una tarifa manual se respeta. Al registrar la entrega, la remuneración y la retención del dinero COD cobrado se incluyen en la liquidación del conductor de destino. El traspaso no reasigna pagos de entregas históricas.
- Bodega puede confirmar la recepción física de paquetes pendientes o con incidencia. Esto libera la asignación anterior sin borrar su historial.
- «Finalizar ruta» presenta un resumen. Los pendientes deben transferirse o recibirse en bodega antes del cierre. Las incidencias gestionadas pueden quedar pendientes de devolución física a cargo del conductor, como en el flujo existente.
- Las incidencias no entran en el traspaso de pendientes sin gestionar. Para preparar un reintento, confirmar antes su recepción en bodega.

## Puesta en marcha

La migración debe ejecutarse **antes de arrancar este backend**: los modelos y las consultas requieren sus nuevas columnas. Aplicada en producción el 16 de octubre de 2026, con respaldo previo y verificación de cantidades y totales de pago.

1. Respaldar la base de datos y detener las escrituras del backend y los procesos de facturación.
2. Desde `LeonExpress_back`, ejecutar `node scripts/migrate-route-transfers.js --check`. Usa las variables `DB_*` del entorno o de `LeonExpress_back/.env`.
3. Resolver los casos que reporte: varias entregas exitosas, varios pagos base de entrega o asignaciones cuya fecha más reciente no permite determinar una única ruta. El verificador se detiene antes de modificar registros. No elimina ni decide sobre pagos históricos.
4. Ejecutar `node scripts/migrate-route-transfers.js --apply` y desplegar backend y frontend juntos.

La migración conserva las asociaciones antiguas y marca como vigentes las más recientes. Para registros previos no deduce resultados de entrega: muestra «Asignación anterior». También libera paquetes que ya figuran recibidos o devueltos en bodega. Crea restricciones para una asignación vigente, una entrega exitosa y un pago base de entrega por paquete. Los costos adicionales y deducciones conservan su funcionamiento. El script también reemplaza el índice antiguo que impedía registrar varias visitas de un paquete a la misma ruta; mantiene un único responsable vigente.

MySQL hace commits implícitos en los cambios de esquema. Si falla una ejecución parcial, el verificador la detecta; revisar los `ALTER TABLE` aplicados antes de reiniciar o reintentar. El archivo SQL es `LeonExpress_back/migrations/20261016_route_package_transfers.sql`; usar el script para ejecutar primero las verificaciones.

## Pruebas

`tests/route-transfers.test.js` usa los modelos y handlers reales, con notificaciones y auditoría externa sustituidas, contra una base local desechable llamada `route_transfer_test`. **Recrea sus tablas.** No usa las credenciales de la aplicación.

```sh
docker run --detach --rm --name leon-route-transfer-test \
  -e MYSQL_ROOT_PASSWORD=route-test-only -e MYSQL_DATABASE=route_transfer_test \
  -p 127.0.0.1::3306 mysql:8
docker port leon-route-transfer-test 3306
# Esperar a que MySQL esté listo; usar el puerto mostrado arriba:
TEST_ROUTE_DB_PORT=PUERTO node --test tests/route-transfers.test.js
docker stop leon-route-transfer-test
```

Cubre migración con historial previo, rechazo de asignaciones ambiguas, rutas simultáneas del mismo conductor, cierre independiente, permisos, traspaso por lote con rollback, escaneo con confirmación, recepción en bodega, concurrencia, vinculación de entrega a la ruta efectiva, destinos de otros conductores en la misma bodega, tarifas manuales, liquidación de entrega y retención COD para el conductor de destino, generación repetida de liquidaciones y bloqueo de pagos duplicados entre períodos.
