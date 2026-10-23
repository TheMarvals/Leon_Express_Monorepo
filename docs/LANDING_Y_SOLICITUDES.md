# Landing y solicitudes comerciales

La página pública está en `/`: una sola portada con foto de fondo completo y un formulario en modal accesible (teclado, Escape y foco contenido). Usa `public/santiago_chile.jpg` y la identidad visual de León Express. Los accesos llevan a `/portal/login` (clientes, OTP de correos registrados) y `/auth/login` (personal, usuario y contraseña). `/auth/signup` redirige al acceso de clientes; enviar un formulario no crea usuarios ni clientes.

## Flujo comercial

1. La empresa completa nombre comercial, contacto, correo, teléfono, comuna, volumen diario y consentimiento de contacto. Puede añadir un mensaje.
2. `POST /api/prospects` valida y guarda la solicitud con estado `NEW`. Limita cinco peticiones por hora y dirección IP, descarta un campo señuelo y evita solicitudes duplicadas del mismo correo durante el día de Chile mediante una clave única en MySQL.
3. Los administradores activos reciben una notificación en el panel. El administrador elegido también recibe un correo con el estilo de la app. Los datos públicos se escapan en el HTML.
4. **Dashboard → Solicitudes de nuevos clientes** permite seleccionar un administrador activo con correo y guardar el receptor. Se conserva su identificador; su dirección actual se resuelve al enviar. No se envía a cuentas desactivadas ni a direcciones arbitrarias enviadas por el visitante.
5. **Solicitudes comerciales** en el menú del administrador permite buscar, filtrar, consultar detalles y marcar como nueva, contactada o cerrada. Acordadas las condiciones, la invitación se envía con el flujo existente de **Partners → Invitar Cliente**.

Las solicitudes se conservan si falla el correo. El detalle distingue enviado, fallido, sin receptor y pendiente. Una credencial de Resend ausente o un error devuelto por el proveedor no se consideran un envío exitoso. La configuración y los cambios de estado quedan en auditoría. Los endpoints de revisión y configuración exigen JWT, rol ADMIN y cuenta administradora actualmente activa.

## Despliegue y validación

El entrypoint ejecuta la migración idempotente `20261022_prospects.sql`. No requiere triggers ni privilegio SUPER. El correo utiliza `FRONTEND_URL` para enlazar al panel y las variables existentes `RESEND_API_KEY` y `EMAIL_FROM`. Después del despliegue hay que elegir el receptor desde el dashboard; mientras tanto, las solicitudes y los avisos internos siguen disponibles.

Pruebas de negocio y permisos: `node --test tests/prospects.test.js` desde el backend. Pruebas de conservación de URLs y separación público/privado: `node --test tests/public-landing-routes.test.cjs` desde el frontend. Las pruebas usan correos simulados y no envían mensajes reales.

Los accesos no muestran pestañas ni enlaces cruzados. El portal de clientes solo ofrece OTP; el personal usa usuario y contraseña. La expiración de una sesión cliente vuelve a `/portal/login`; la del personal vuelve a `/auth/login`. El enlace legado `/auth/login?mode=client` redirige al portal correspondiente. El backend confía en los proxies de redes privadas de Docker/Coolify para resolver la IP pública y evitar que todos los visitantes compartan un límite.
