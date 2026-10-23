# Etiquetas manuales y logos

Desde **Mis envíos** o el dashboard del cliente, **Personalizar etiqueta** permite subir, reemplazar o quitar el logo de su empresa. León Express siempre aparece. El logo guardado se utiliza al generar y volver a imprimir etiquetas; cambiarlo no modifica los datos ni el historial de los paquetes. Las etiquetas oficiales obtenidas de Mercado Libre no se modifican.

La vista previa del paquete y la página de impresión usan `PackageShippingLabel.vue`: mismo diseño, medidas de 100 × 150 mm, fuente, QR y datos obtenidos de `/packages/by-code/:trackingCode`. En pantallas pequeñas se escala la etiqueta completa. La generación espera a que fuentes, imágenes y QR estén listos. Las observaciones admiten hasta 120 caracteres, con contador en el formulario y validación en la API al crear o editar. La etiqueta no se extiende ni se escala para introducir más texto. Si una etiqueta antigua supera ese límite o sus datos no caben, se solicita corregirlos antes de imprimir, sin recortar información silenciosamente. Al imprimir o guardar como PDF, usar papel 100 × 150 mm, escala 100 %, sin márgenes ni encabezados del navegador; los ajustes del controlador de la impresora pueden alterar el resultado físico.

`GET/PUT/DELETE /api/client-label` requiere una sesión CLIENT y verifica que el usuario y el cliente sigan activos y asociados. El identificador se obtiene exclusivamente de la sesión. PUT acepta multipart con un archivo `logo` PNG/JPG/WebP (hasta 2 MB, 16 MP, sin animación). El servidor comprueba y decodifica la imagen y la reexporta como PNG en escala de grises, fondo blanco, máximo 900 × 450 px, sin deformarla ni conservar metadatos. No se aceptan URLs ni SVG de usuarios.

El PNG se almacena en MySQL en `client_label_branding`, separado de los listados de clientes y con FK en cascada. Así persiste entre despliegues sin depender del filesystem del contenedor. La migración idempotente `LeonExpress_back/migrations/20261023_client_label_branding.sql` se aplica automáticamente desde el entrypoint Docker, antes de arrancar el backend. En instalaciones sin Docker, aplicarla antes de iniciar esta versión. No requiere migrar los clientes existentes: ausencia de configuración significa solo logo León Express.

Validación: pruebas HTTP de aislamiento de clientes, cuentas inactivas, subida/reemplazo/borrado y archivos inválidos; migración aplicada dos veces en MySQL desechable con collation distinta; revisión de vista previa móvil/escritorio y PDF de una página, con y sin logo, observaciones de 120 caracteres y COD, decodificando el QR del PDF rasterizado a 203 dpi.

## Edición y eliminación por el cliente

En Mis envíos, el dashboard y el detalle aparecen acciones para envíos propios **manuales** en `PENDIENTE_RECOLECCION`. El cliente puede corregir destinatario, teléfono, dirección/comuna, observaciones de hasta 120 caracteres y COD. Debe volver a imprimir la etiqueta después de editar. La eliminación requiere confirmar y deja inválido el código anterior.

`PUT/DELETE /api/client-packages/:id` comprueba la cuenta activa, propiedad y estado actual dentro de una transacción. No acepta cambios de cliente, tracking, tarifas, costos ni estado. Bloquea envíos de ML y cualquier envío con escaneos, movimientos operativos o financieros. Mantiene auditoría transaccional con los datos anteriores incluso tras eliminar; si no puede registrar la auditoría, revierte el cambio. No elimina dependencias de rutas, facturas ni entregas.

El escáner y las modificaciones del cliente bloquean el paquete por su clave primaria y releen el registro. Si el escaneo gana, la edición/eliminación responde 409; si la eliminación gana, el escáner no confirma un registro inexistente. La interfaz actualiza la lista al detectar conflictos.

Pruebas de concurrencia en MySQL local desechable: `TEST_CLIENT_PACKAGES_DB_PORT=<puerto> node --test LeonExpress_back/tests/client-packages-sql.test.js`. La prueba usa exclusivamente `127.0.0.1`, base `client_packages_test` y credenciales de prueba; reconstruye esa base.
