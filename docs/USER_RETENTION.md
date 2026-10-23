# Usuarios desactivados: eliminación y archivo

Cada día a las 04:15, en horario de Chile, se revisan los usuarios que llevan tres meses calendario continuos desactivados.

- Sin registros asociados: se elimina el usuario y se registra la limpieza en auditoría.
- Con registros asociados: se marca como archivado, conservando el mismo ID, nombre y asociaciones. No se borran rutas, paquetes, recolecciones, vehículos, auditorías, correcciones OCR ni liquidaciones.
- Las identidades vinculadas a clientes se archivan para evitar que el aprovisionamiento por OTP recree un acceso desactivado.
- Los usuarios activos o desactivados hace menos de tres meses no se procesan. La reactivación limpia las fechas de desactivación y archivo; una desactivación posterior inicia un plazo nuevo.

En Usuarios, la lista habitual oculta los archivados. Administración puede usar **Ver archivados** y reactivar uno conservando su historial.

La limpieza examina las claves foráneas de la base de datos y las columnas de actores utilizadas por registros antiguos sin FK. Cada decisión bloquea el usuario y se confirma junto con su auditoría en una transacción; una reactivación anterior al bloqueo impide eliminarlo.

## Despliegue y revisión

`docker-entrypoint.sh` aplica la migración idempotente `20261022_user_retention.sql` antes de arrancar la app. Añade `deactivated_at` y `archived_at`. Para usuarios que ya estaban desactivados, el último `updated_at` se usa como inicio conservador del plazo, manteniendo su valor.

Desde `LeonExpress_back`, con las variables de conexión habituales:

```sh
# Solo previsualiza cantidades, sin cambiar registros.
node scripts/user-retention.js

# Aplica la misma regla que la tarea diaria.
node scripts/user-retention.js --apply
```

Las comprobaciones con MySQL desechable están incluidas en `tests/route-transfers.test.js`: borrado sin referencias, archivo con historial, referencias antiguas sin FK, reactivación concurrente, vista de archivados, recuperación y migración repetible.
