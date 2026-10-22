# Comprobación de la API de producción

## Inventario y contratos

```sh
node scripts/audit-api-contracts.cjs --check
```

Compara las llamadas HTTP con rutas literales o plantillas en los servicios y componentes Vue con las rutas montadas de Express. Incluye los uploads por lotes. Finaliza con error si un método o una ruta no tiene implementación correspondiente.

El análisis estático no comprueba los cuerpos de las solicitudes, el orden de los middlewares, el contenido de respuestas ni las URLs construidas en variables arbitrarias. Se complementa con pruebas HTTP y de navegador.

## Comprobación HTTP en producción

Configurar `API_AUDIT_USERNAME` y `API_AUDIT_PASSWORD` en el entorno con una cuenta ADMIN. No guardar las credenciales en el repositorio ni en el informe.

```sh
API_AUDIT_OUTPUT=/tmp/leon-api-live-audit.json node scripts/check-production-api.cjs
```

La URL predeterminada es `https://leonexpress.cl`; se puede cambiar con `API_AUDIT_BASE_URL`.

La comprobación realiza:

- Inicio de sesión del administrador.
- Consultas GET estáticas usadas por el frontend y consultas de detalle con registros existentes obtenidos de las listas.
- Llamadas sin token a las rutas protegidas, esperando 401 o 403 antes de ejecutar operaciones.
- Prueba de la ruta DELETE de clientes únicamente después de confirmar mediante GET que el identificador de prueba no existe. La respuesta esperada es 404 JSON con `Cliente no encontrado`.
- Verificación del tipo JSON y del código HTTP esperado; un 403 de la ruta de Mercado Libre exclusiva de clientes es esperado al usar ADMIN.

El informe incluye las solicitudes omitidas por falta de una muestra, invitación válida o lote activo. No incluye tokens, contraseñas ni los cuerpos de las respuestas exitosas. Una respuesta inesperada hace fallar el comando.

## Alcance de las operaciones que cambian datos

No se crean ni eliminan clientes, paquetes, pagos o liquidaciones reales durante la comprobación. Las operaciones de escritura se revisan con el inventario, el rechazo sin autenticación y las pruebas de regresión con servicios y datos controlados. Esto no equivale a ejecutar cada operación de negocio de extremo a extremo contra producción.

La autorización OAuth de Mercado Libre, el envío de OTP/correos, las cargas de fotos que crean paquetes y las operaciones financieras requieren sus escenarios de integración específicos. Las pruebas de navegador se ejecutan sin extensiones para distinguir los errores de la app de scripts inyectados, como `200.js`.
