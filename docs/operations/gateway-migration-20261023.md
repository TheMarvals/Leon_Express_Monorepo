# Gateway de Mercado Libre: cambio de servidor

Fecha: 2026-10-23.

## Destino

- URL de consumo: https://gateway.leonexpress.cl
- VPS: 65.75.201.175, aplicación Coolify `ecccp7vg39d23jp5pkgo6onq`.
- MariaDB interna: `vlt5jplnm3dd64izvf504nvo`, base `ml_gateway`.
- Conserva las seis cuentas, sus identificadores, tokens cifrados y clave de cifrado.
- La copia inicial y el delta final se conservaron en `/root/ml-gateway-migration-20261023/`, con permisos privados.
- Se compararon los totales de las cuatro tablas y las huellas de todas las credenciales cifradas después de detener los escritores del origen. Las seis cuentas superaron `/users/me` en Mercado Libre desde el VPS.

## Compatibilidad temporal

El callback registrado en Mercado Libre sigue siendo
`https://gateway.themarvals.com/ml/auth/callback`. No cambiarlo sin actualizar también la configuración de la aplicación en Mercado Libre.

En `192.168.1.250`, el contenedor `ml-gateway` ahora es un proxy hacia el dominio nuevo. El anterior proceso Node quedó detenido como `ml-gateway-rollback-20261023`, con reinicio automático y autodespliegue desactivados. No iniciarlo contra la base antigua: sus tokens pueden haber sido renovados en el VPS.

Para retirar esa dependencia, publicar también `gateway.themarvals.com` en el túnel Cloudflare del VPS, hacia `http://localhost:80`. Traefik ya acepta ambos nombres. Verificar `/api/health` y el flujo de vinculación antes de retirar el proxy. Los enlaces temporales siguen sujetos a su vencimiento habitual.

Una reversión posterior requiere copiar los datos y tokens actuales del VPS al destino de reversión, con un único proceso encargado de renovar credenciales. La copia inicial por sí sola ya no garantiza tokens vigentes.

## Datos de envíos

La migración conserva `ml_shipments`, sus marcas de importación y los webhooks. León Express todavía consulta ese almacén; LeónImport obtiene detalles de Mercado Libre directamente usando credenciales del gateway.

Reducir la persistencia del gateway requiere sustituir la consulta de pendientes y mover el control de importación a cada aplicación. Mantener credenciales, vínculos, estado OAuth y procesamiento fiable de eventos; definir una retención acotada para caché y logs antes de eliminar históricos.
