# Migración: Agregar campo loading_status a routes

## 📋 Descripción

Esta migración agrega el campo `loading_status` a la tabla `routes` para rastrear el estado de carga de paquetes en las rutas.

## 🚀 Opción 1: Ejecutar dentro del contenedor (Recomendado)

Si el contenedor del backend está corriendo:

```bash
# Copiar el archivo de migración al contenedor
docker cp LeonExpress_back/migrations/add_loading_status_to_routes.sql leonexpress_backend:/app/migrations/

# Ejecutar la migración dentro del contenedor
docker exec -i leonexpress_backend sh -c "mysql -h127.0.0.1 -P3306 -uroot -p'${DB_PASSWORD}' ${DB_NAME} < /app/migrations/add_loading_status_to_routes.sql"
```

O usando el script:

```bash
docker exec -it leonexpress_backend sh -c "cd /app && ./migrations/apply_loading_status_migration.sh"
```

## 🚀 Opción 2: Ejecutar desde el host

Si tienes acceso directo a la base de datos desde el host:

```bash
cd LeonExpress_back
mysql -h127.0.0.1 -P3306 -u<usuario> -p<password> <nombre_bd> < migrations/add_loading_status_to_routes.sql
```

O usando el script interactivo:

```bash
cd LeonExpress_back
./migrations/apply_loading_status_migration.sh
```

## 🚀 Opción 3: Ejecutar cuando el contenedor se inicie

Puedes agregar la migración al script de inicialización del contenedor para que se ejecute automáticamente.

## ✅ Verificación

Después de ejecutar la migración, verifica que el campo se haya creado correctamente:

```sql
DESCRIBE routes;
-- O
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = 'leon_express' 
  AND TABLE_NAME = 'routes' 
  AND COLUMN_NAME = 'loading_status';
```

## 📝 Notas

- El campo `loading_status` tiene los siguientes valores posibles:
  - `NOT_STARTED`: Carga no iniciada (valor por defecto)
  - `LOADING`: Conductor está cargando paquetes
  - `LOADING_COMPLETED`: Conductor finalizó la carga
  - `APPROVED`: Admin aprobó la carga

- Las rutas existentes que ya tienen paquetes asignados se marcarán automáticamente como `APPROVED` para mantener compatibilidad.

