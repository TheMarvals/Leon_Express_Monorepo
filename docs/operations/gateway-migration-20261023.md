# Gateway de Mercado Libre: cambio de servidor

Fecha: 2026-10-23.

## Destino

- URL de consumo: https://gateway.leonexpress.cl
- VPS: 65.75.201.175, aplicación Coolify `ecccp7vg39d23jp5pkgo6onq`.
- MariaDB interna: `vlt5jplnm3dd64izvf504nvo`, base `ml_gateway`.
- Conserva las seis cuentas, sus identificadores, tokens cifrados y clave de cifrado.
- La copia inicial y el delta final se conservaron en `/root/ml-gateway-migration-20261023/`, con permisos privados.
- Se compararon los totales de las cuatro tablas y las huellas de todas las credenciales cifradas después de detener los escritores del origen. Las seis cuentas superaron `/users/me` en Mercado Libre desde el VPS.

## Dominio único y retirada del puente

León Express, LeónImport y el gateway utilizan únicamente
`https://gateway.leonexpress.cl` en producción.

El propietario confirmó los siguientes ajustes en la aplicación existente de Mercado Libre:

- Redirect URI: `https://gateway.leonexpress.cl/ml/auth/callback`.
- URL de notificaciones: `https://gateway.leonexpress.cl/ml/webhooks`.

Se conservan el mismo ID de aplicación, secretos y cuentas vinculadas. `ML_REDIRECT_URI` ya fue actualizado en Coolify y desplegado. Se verificó que la URL OAuth generada utiliza el callback nuevo. La API consultada no permite administrar la configuración externa de Mercado Libre (403); los cambios futuros allí requieren acceso al panel del propietario.

En `192.168.1.250`, el proxy `ml-gateway` quedó detenido el 23 de octubre de 2026 a las 14:46:53 de Chile (17:46:53 UTC), con reinicio automático desactivado. El anterior proceso Node también sigue detenido como `ml-gateway-rollback-20261023`, con reinicio automático y autodespliegue desactivados. No iniciarlo contra la base antigua: sus tokens pueden haber sido renovados en el VPS.

El hostname antiguo fue retirado de la aplicación en Coolify/Traefik y devuelve HTTP 404. Se confirmó la llegada de notificaciones después de apagar el puente, acceso HTTP 200 al gateway desde ambas aplicaciones consumidoras y autorización válida de las seis cuentas mediante `/users/me` en Mercado Libre.

Queda la limpieza externa de su publicación/DNS en Cloudflare a cargo del propietario; no volver a publicarlo en el túnel del VPS. Los enlaces emitidos con el dominio anterior dejaron de abrirse; generar nuevos enlaces de vinculación con el dominio canónico cuando sea necesario. Las cuentas ya vinculadas conservan sus tokens.

Una reversión posterior requiere copiar los datos y tokens actuales del VPS al destino de reversión, con un único proceso encargado de renovar credenciales. La copia inicial por sí sola ya no garantiza tokens vigentes.

## Datos de envíos

La migración conserva `ml_shipments`, sus marcas de importación y los webhooks. León Express todavía consulta ese almacén; LeónImport obtiene detalles de Mercado Libre directamente usando credenciales del gateway.

Reducir la persistencia del gateway requiere sustituir la consulta de pendientes y mover el control de importación a cada aplicación. Mantener credenciales, vínculos, estado OAuth y procesamiento fiable de eventos; definir una retención acotada para caché y logs antes de eliminar históricos.
