# Escaneo y duplicados de recolección

Revisión de código y consulta de solo lectura en producción: 16 de octubre de 2026.

## Casos contrastados

Los cinco códigos enviados coinciden con 12 registros en la misma recolección
`6aa58a3a-72b7-40a3-8ab0-d8054ba3819f`, creados el 12 de octubre de 2026.

| Código externo | Registros encontrados |
| --- | ---: |
| 48233839764 | 4 |
| 48233999392 | 2 |
| 48233079796 | 2 |
| 48233062609 | 2 |
| 48233864459 | 2 |

Para `48233839764`, dos registros se crearon a las 18:14:50 y 18:14:51 UTC.
Uno tiene una etiqueta OCR con parser `ml-qr-scan`; el otro no tiene registro OCR asociado.
Los otros dos provienen de aprobaciones de fotos a las 19:19:03 y 19:57:55 UTC.
Esto es consistente con solicitudes de importación simultáneas y posteriores aprobaciones sin comprobar duplicados.

Los ocho registros de los otros cuatro códigos tienen fotos con parser `Mercado Libre`,
estado `completed` y fechas de revisión correspondientes a su creación. El código de
aprobación creaba paquetes sin comprobar nuevamente su código externo, incluso si otra
foto del mismo envío ya se había aprobado. Las fotos estaban marcadas con `is_duplicate = 0`.

Las consultas de auditoría por estos códigos y los IDs de los paquetes de esa recolección
no devolvieron registros. No se pudo verificar desde esa auditoría la eliminación mencionada.
No se modificaron ni eliminaron registros en producción.

## Correcciones locales

- Foto disponible desde el inicio y con la cámara de escaneo abierta, sin exigir un QR previo.
- Confirmación de paquetes manuales existentes por código interno o código de barras externo.
- Códigos desconocidos ofrecen foto; errores de pertenencia a otro cliente conservan el rechazo.
- Pausa del lector mientras se confirma un envío o se decide qué hacer con un código desconocido.
- Cámara de fotos espera que la cámara del lector termine de detenerse.
- Android sin `BarcodeDetector` utiliza el decodificador de barras de html5-qrcode.
- Confirmación ML, creación automática OCR y aprobación de fotos comparten un bloqueo transaccional
  de la fila de recolección. La comprobación y creación se realizan dentro de la misma transacción.
- Aprobación de fotos vuelve a comprobar el código externo: si ya existe, responde 409 y marca
  el registro para el flujo explícito de revisión de duplicados. Se conserva la gestión de envíos multi-parte.
- Repetir la aprobación de una misma foto devuelve el paquete ya aprobado.
- Las notificaciones externas al gateway se ejecutan después del commit local.
- Subidas con claves derivadas del contenido; se quitan de la cola local solo las fotos aceptadas.
- Reintentos simultáneos esperan el resultado real del batch; un error de subida permite reintentar
  y no publica imágenes parciales en la cola de procesamiento.

## Validación

- `node --test LeonExpress_back/tests/scanner-dedup.test.js`: solicitudes HTTP y modelos simulados;
  incluye los cinco códigos reportados, revisión repetida, combinación QR/foto y reintentos de subida.
- Desde `LeonExpress_front`: `node --test tests/pickup-scanner.test.cjs` comprueba la lógica real
  del componente compilado y el cargador de fotos con cámara/red simuladas.
- Compilación de producción con Node 22.22.2.

Las pruebas no escriben en producción. La cámara debe verificarse también en un teléfono.
El componente compartido RoutePackageScanner conserva errores de lint previos a estos cambios.
Los cambios requieren desplegar frontend y backend juntos.

## Limpieza autorizada en producción — 16 de octubre de 2026

Por solicitud explícita del usuario, se eliminaron 7 copias de los cinco códigos reportados.
Se conservó el registro más antiguo de cada código: quedaron 5 paquetes, uno por código.
Antes del borrado se comprobó dentro de la transacción que las copias estuvieran en
`RECOLECTADO_EN_ORIGEN`, sin fecha de asignación ni vínculos con rutas, entregas, facturas,
liquidaciones, devoluciones, cancelaciones o incidencias.

Se conservaron las fotos y su historial OCR vinculándolos al paquete superviviente y marcando
las revisiones de las copias como completadas para evitar su reaprobación. Se registraron 7
entradas `DELETE_DUPLICATE_PACKAGE` en auditoría.

Operación: `099adc0a-301e-4f63-9d62-84f57e846fb2`.
Respaldo completo anterior al borrado, verificado localmente:
`/home/marval/.local/state/leon-express/backups/duplicate-cleanup-099adc0a-301e-4f63-9d62-84f57e846fb2.json`.

La limpieza de datos no despliega los cambios de código que previenen futuros duplicados.
