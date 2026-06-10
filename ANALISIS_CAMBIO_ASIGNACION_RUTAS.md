# Análisis: Cambio en Asignación de Paquetes a Rutas

## 📋 Resumen del Cambio

### Flujo Actual
1. **Admin crea ruta** → Asigna a conductor → Estado: `PENDIENTE`
2. **Admin selecciona paquetes manualmente** desde lista de paquetes en `RECIBIDO_EN_ALMACEN`
3. **Admin asigna paquetes** → Endpoint: `POST /routes/:id/packages` → Paquetes cambian a `ASIGNADO_A_RUTA`
4. **Conductor inicia ruta** → Estado ruta: `EN_PROGRESO` → Paquetes cambian a `EN_RUTA_ENTREGA`

### Flujo Nuevo Deseado
1. **Admin crea ruta** → Asigna a conductor → Estado: `PENDIENTE`
2. **Conductor escanea QR del paquete físico** (que ya está en almacén)
3. **OCR extrae `external_tracking_code`** del QR
4. **Sistema busca paquete** por `external_tracking_code` (debe estar en estado `RECIBIDO_EN_ALMACEN`)
5. **Sistema agrega automáticamente** el paquete a la ruta asignada del conductor
6. **Conductor finaliza la carga** → Indica que terminó de escanear todos los paquetes
7. **Admin aprueba la carga** → Verifica que el número de paquetes sea correcto
8. **Conductor puede iniciar ruta** → Estado ruta: `EN_PROGRESO`

## 🔍 Análisis Técnico

### Estado Actual de la Base de Datos

**Tabla `routes`:**
- `status`: ENUM('PENDIENTE', 'EN_PROGRESO', 'FINALIZADA', 'CANCELADA')
- No hay campo específico para estado de carga

**Tabla `packages`:**
- `external_tracking_code`: VARCHAR(100) - Código de seguimiento externo (del QR/etiqueta)
- `status`: ENUM con múltiples estados incluyendo `RECIBIDO_EN_ALMACEN` y `ASIGNADO_A_RUTA`

**Tabla `route_packages`:**
- Relación muchos-a-muchos entre rutas y paquetes
- `sequence_in_route`: Orden de entrega

### Funcionalidad OCR Existente

El sistema ya tiene:
- ✅ OCR que extrae `external_tracking_code` de etiquetas
- ✅ Parsers específicos para diferentes tipos de etiquetas (Mercado Libre, Envío Flex, Jumpseller, etc.)
- ✅ Búsqueda de paquetes por `external_tracking_code`

**Pregunta clave:** ¿El OCR puede extraer el código de un QR code, o solo de etiquetas de texto?

### Endpoints Existentes Relevantes

1. `POST /routes/:id/packages` - Asigna paquetes a ruta (solo ADMIN)
2. `PUT /routes/:id/status` - Cambia estado de ruta
3. `POST /ocr` - Procesa imagen con OCR
4. `GET /packages/by-code/:trackingCode` - Busca paquete por código interno

## 🎯 Cambios Necesarios

### Backend

#### 1. Nuevo Endpoint: Escanear QR y Agregar a Ruta
```
POST /routes/:id/scan-package
- Permite: DRIVER (solo el conductor asignado a la ruta)
- Body: { image: base64 } o { external_tracking_code: string }
- Lógica:
  1. Verificar que la ruta esté en estado PENDIENTE
  2. Verificar que el usuario sea el conductor asignado
  3. Si viene imagen: procesar con OCR para extraer external_tracking_code
  4. Buscar paquete por external_tracking_code con status RECIBIDO_EN_ALMACEN
  5. Verificar que el paquete no esté ya asignado a otra ruta activa
  6. Agregar paquete a la ruta (crear RoutePackage)
  7. Cambiar estado del paquete a ASIGNADO_A_RUTA
  8. Retornar información del paquete agregado
```

#### 2. Nuevo Endpoint: Finalizar Carga
```
POST /routes/:id/finish-loading
- Permite: DRIVER (solo el conductor asignado)
- Lógica:
  1. Verificar que la ruta esté en estado PENDIENTE
  2. Verificar que tenga al menos un paquete asignado
  3. Marcar ruta como "carga completada" (usar campo adicional o lógica)
  4. Retornar resumen de paquetes cargados
```

#### 3. Nuevo Endpoint: Aprobar Carga
```
POST /routes/:id/approve-loading
- Permite: ADMIN
- Body: { expected_count?: number } (opcional, para verificación)
- Lógica:
  1. Verificar que la ruta esté en estado PENDIENTE y carga completada
  2. Si se proporciona expected_count, verificar que coincida
  3. Marcar ruta como "carga aprobada"
  4. Permitir que el conductor pueda iniciar la ruta
```

#### 4. Modificar Endpoint Existente
```
PUT /routes/:id/status
- Modificar para que solo permita cambiar a EN_PROGRESO si:
  - La carga está aprobada por admin
  - O mantener lógica actual si no se usa el nuevo flujo
```

### Frontend

#### 1. Componente de Escaneo de QR
- Similar al componente de escaneo batch existente
- Integrado en RouteDetailPage para conductores
- Mostrar lista de paquetes escaneados en tiempo real
- Feedback visual cuando se agrega un paquete

#### 2. Vista de Carga
- Mostrar contador de paquetes escaneados
- Lista de paquetes agregados
- Botón "Finalizar Carga"
- Modal de confirmación al finalizar

#### 3. Vista de Aprobación (Admin)
- Mostrar resumen de paquetes cargados
- Campo opcional para número esperado de paquetes
- Botón "Aprobar Carga"
- Después de aprobar, permitir que conductor inicie ruta

### Base de Datos

**Opción 1:** Agregar campo `loading_status` a tabla `routes`
```sql
ALTER TABLE routes ADD COLUMN loading_status ENUM('NOT_STARTED', 'LOADING', 'LOADING_COMPLETED', 'APPROVED') DEFAULT 'NOT_STARTED';
```

**Opción 2:** Usar campo `status` existente con lógica adicional
- Mantener `PENDIENTE` durante la carga
- Agregar campo adicional `loading_completed_at` y `loading_approved_at`

**Recomendación:** Opción 1 es más clara y permite mejor tracking.

## ⚠️ Consideraciones Importantes

1. **Compatibilidad con flujo actual:**
   - El endpoint `POST /routes/:id/packages` debe seguir funcionando para admins
   - Permitir ambos flujos (manual y por escaneo)

2. **Validaciones:**
   - Un paquete no puede estar asignado a múltiples rutas activas
   - Solo paquetes en `RECIBIDO_EN_ALMACEN` pueden ser escaneados
   - Solo el conductor asignado puede escanear para su ruta

3. **OCR y QR:**
   - Verificar si el OCR actual puede leer códigos QR
   - Si no, considerar usar una librería de lectura de QR (como `jsQR` en frontend)
   - El QR podría contener directamente el `external_tracking_code` o necesitar OCR

4. **Estados de paquetes:**
   - `RECIBIDO_EN_ALMACEN` → `ASIGNADO_A_RUTA` (al escanear)
   - `ASIGNADO_A_RUTA` → `EN_RUTA_ENTREGA` (al iniciar ruta)

## 📝 Plan de Implementación

### Fase 1: Backend - Endpoints Base
1. Agregar campo `loading_status` a modelo Route
2. Crear endpoint `POST /routes/:id/scan-package`
3. Crear endpoint `POST /routes/:id/finish-loading`
4. Crear endpoint `POST /routes/:id/approve-loading`
5. Modificar validaciones en `PUT /routes/:id/status`

### Fase 2: Frontend - Interfaz de Escaneo
1. Crear componente de escaneo de QR para rutas
2. Integrar en RouteDetailPage para conductores
3. Agregar vista de lista de paquetes escaneados
4. Agregar botón "Finalizar Carga"

### Fase 3: Frontend - Interfaz de Aprobación
1. Agregar vista de aprobación para admins
2. Agregar validación de número de paquetes
3. Integrar con endpoint de aprobación

### Fase 4: Testing y Ajustes
1. Probar flujo completo
2. Verificar compatibilidad con flujo manual existente
3. Ajustar validaciones según necesidades

## ❓ Preguntas Pendientes

1. **¿Los QR codes contienen directamente el `external_tracking_code` o necesitan OCR?**
   - Si contienen directamente: usar librería de lectura de QR
   - Si necesitan OCR: verificar que el OCR actual pueda leer QR codes

2. **¿Se debe mantener el flujo manual de asignación para admins?**
   - Recomendación: Sí, mantener ambos flujos

3. **¿Qué pasa si el conductor escanea un paquete que no está en almacén?**
   - Mostrar error claro
   - Sugerir verificar el estado del paquete

4. **¿Se debe permitir eliminar paquetes de la ruta después de escanearlos?**
   - Considerar agregar funcionalidad de "remover paquete" antes de finalizar carga

