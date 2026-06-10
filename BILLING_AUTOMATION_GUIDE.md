# 💰 Guía de Automatización Financiera - Leon Express

## 📋 Índice

1. [Introducción](#introducción)
2. [Sistema Automático (CRON)](#sistema-automático-cron)
3. [Sistema Manual (Panel de Administración)](#sistema-manual-panel-de-administración)
4. [Procedimientos Almacenados](#procedimientos-almacenados)
5. [Endpoints de la API](#endpoints-de-la-api)
6. [Flujo Completo](#flujo-completo)
7. [Solución de Problemas](#solución-de-problemas)

---

## 🎯 Introducción

El sistema de automatización financiera de Leon Express gestiona automáticamente:

- ✅ Cierre de períodos semanales
- ✅ Generación de facturas para clientes
- ✅ Generación de pagos para conductores
- ✅ Auditoría completa de operaciones

### **Arquitectura del Sistema**

```
┌─────────────────────────────────────────────────────────┐
│                   SISTEMA HÍBRIDO                        │
├───────────────────────┬─────────────────────────────────┤
│                       │                                  │
│   🤖 AUTOMÁTICO       │      🖱️ MANUAL                  │
│   (CRON Job)          │      (Panel Admin)              │
│                       │                                  │
│   ⏰ Domingos 23:00   │      👤 Cualquier momento       │
│   └─> Cierra período  │      └─> Admin ejecuta          │
│        semanalmente   │           cuando necesite       │
│                       │                                  │
└───────────────────────┴─────────────────────────────────┘
                         │
                         ▼
            ┌─────────────────────────┐
            │  PROCEDIMIENTOS ALMAC.  │
            │  (MySQL Stored Procs)   │
            ├─────────────────────────┤
            │  • sp_close_weekly_     │
            │    period               │
            │  • sp_generate_weekly_  │
            │    invoices             │
            │  • sp_generate_weekly_  │
            │    driver_payouts       │
            └─────────────────────────┘
                         │
                         ▼
            ┌─────────────────────────┐
            │  BASE DE DATOS          │
            │  • billing_periods      │
            │  • invoices             │
            │  • driver_payouts       │
            │  • audit_log            │
            └─────────────────────────┘
```

---

## 🤖 Sistema Automático (CRON)

### **Configuración**

El servicio CRON se inicia automáticamente cuando arranca el servidor:

**Archivo:** `LeonExpress_back/services/billingAutomation.js`

```javascript
// Se ejecuta todos los domingos a las 23:00
cron.schedule('0 23 * * 0', async () => {
  await closeCurrentWeeklyPeriod();
}, {
  timezone: "America/Santiago" // Hora de Chile
});
```

### **¿Qué hace el CRON automáticamente?**

Cada **domingo a las 23:00 (Chile)**:

1. **Obtiene la fecha actual**
2. **Llama a `sp_close_weekly_period(date)`**
   - Este SP internamente llama a:
     - `sp_generate_weekly_invoices(start_date, end_date)`
     - `sp_generate_weekly_driver_payouts(start_date, end_date)`
3. **Registra la operación en `audit_log`**
4. **Marca el período como `CLOSED`**

### **Logs del CRON**

Cuando se ejecuta automáticamente, verás en la consola:

```
🚀 ========================================
🚀 [BILLING AUTOMATION] Ejecutando cierre semanal automático
🚀 ========================================

🔄 [BILLING AUTOMATION] Iniciando cierre de período semanal...
📅 Fecha de referencia: 2025-11-02
✅ [BILLING AUTOMATION] Período semanal cerrado exitosamente
📊 Facturas y pagos generados para la semana

✅ ========================================
✅ [BILLING AUTOMATION] Cierre completado con éxito
✅ ========================================
```

### **Verificar Estado del CRON**

```bash
# Ver logs del servidor
docker-compose logs -f backend

# Buscar logs de BILLING AUTOMATION
docker-compose logs backend | grep "BILLING AUTOMATION"
```

---

## 🖱️ Sistema Manual (Panel de Administración)

### **Acceso al Panel**

1. **Iniciar sesión** como administrador
2. **Ir a:** `/billing` en el menú principal
3. **Verás:**
   - Estado de la automatización
   - Período actual
   - Último cierre realizado
   - Historial de períodos
   - **Botones de acción manual**

### **Botones Disponibles**

#### 1. **Cerrar Período Actual** 🟦

- **Función:** Cierra el período semanal actual inmediatamente
- **Cuándo usar:** Si necesitas cerrar la semana antes del domingo
- **Acción:**
  - Genera facturas para todos los clientes
  - Genera pagos para todos los conductores
  - Marca el período como `CLOSED`

```http
POST /api/billing/close-period
```

#### 2. **Generar Facturas** 🟢

- **Función:** Genera facturas solo para un período específico
- **Cuándo usar:** Si necesitas regenerar facturas o generar para un período pasado
- **Requiere:** Fecha inicio y fecha fin

```http
POST /api/billing/generate-invoices
Body: {
  "startDate": "2025-10-21",
  "endDate": "2025-10-27"
}
```

#### 3. **Generar Pagos** 🟡

- **Función:** Genera pagos a conductores solo para un período específico
- **Cuándo usar:** Si necesitas regenerar pagos o generar para un período pasado
- **Requiere:** Fecha inicio y fecha fin

```http
POST /api/billing/generate-payouts
Body: {
  "startDate": "2025-10-21",
  "endDate": "2025-10-27"
}
```

---

## 🗄️ Procedimientos Almacenados

### **1. sp_close_weekly_period**

**Propósito:** Cierra un período semanal completo

**Parámetros:**
- `p_reference_date` (DATE): Fecha de referencia (cualquier día de la semana)

**Qué hace:**
1. Calcula el inicio y fin de la semana (lunes a domingo)
2. Verifica si el período existe en `billing_periods`
3. Llama a `sp_generate_weekly_invoices`
4. Llama a `sp_generate_weekly_driver_payouts`
5. Marca el período como `CLOSED`

**Ejemplo:**
```sql
CALL sp_close_weekly_period('2025-10-29');
-- Cierra la semana del 28 de oct al 3 de nov
```

---

### **2. sp_generate_weekly_invoices**

**Propósito:** Genera facturas para clientes

**Parámetros:**
- `p_start_date` (DATE): Inicio del período
- `p_end_date` (DATE): Fin del período

**Qué hace:**
1. Encuentra todos los **paquetes entregados** en el período
2. Agrupa por cliente
3. Para cada cliente:
   - Crea una factura en `invoices`
   - Agrega items en `invoice_items`
   - Incluye costos adicionales de `package_costs` (tipo `CLIENT_CHARGE`)
4. Calcula totales automáticamente (triggers)

**Ejemplo:**
```sql
CALL sp_generate_weekly_invoices('2025-10-21', '2025-10-27');
```

---

### **3. sp_generate_weekly_driver_payouts**

**Propósito:** Genera pagos para conductores

**Parámetros:**
- `p_start_date` (DATE): Inicio del período
- `p_end_date` (DATE): Fin del período

**Qué hace:**
1. Encuentra todos los conductores activos
2. Para cada conductor:
   - Crea/obtiene un payout en `driver_payouts`
   - Agrega items por:
     - **Entregas realizadas** (`delivery_cost` por paquete)
     - **Recolecciones completadas** (`pickup_cost` por pickup)
     - **Créditos adicionales** de `package_costs` (tipo `DRIVER_CREDIT`)
     - **Deducciones COD** (montos cobrados en efectivo)
3. Calcula totales automáticamente (triggers)

**Ejemplo:**
```sql
CALL sp_generate_weekly_driver_payouts('2025-10-21', '2025-10-27');
```

---

## 🌐 Endpoints de la API

### **GET /api/billing/status**

Obtiene el estado completo del sistema

**Respuesta:**
```json
{
  "automation": {
    "isActive": true,
    "cronSchedule": "Todos los domingos a las 23:00",
    "timezone": "America/Santiago"
  },
  "currentPeriod": {
    "period_id": "...",
    "start_date": "2025-10-28",
    "end_date": "2025-11-03",
    "status": "ACTIVE",
    "period_number": 44
  },
  "lastClosure": {
    "period_id": "...",
    "start_date": "2025-10-21",
    "end_date": "2025-10-27",
    "total_invoices": 15,
    "total_invoiced": 450000,
    "total_payouts": 8,
    "total_paid_to_drivers": 280000
  }
}
```

---

### **POST /api/billing/close-period**

Cierra el período actual manualmente

**Headers:**
```
Authorization: Bearer <token_admin>
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Período semanal cerrado exitosamente",
  "data": {
    "success": true,
    "date": "2025-10-29"
  },
  "executedBy": "admin"
}
```

---

### **POST /api/billing/generate-invoices**

Genera facturas para un período específico

**Headers:**
```
Authorization: Bearer <token_admin>
```

**Body:**
```json
{
  "startDate": "2025-10-21",
  "endDate": "2025-10-27"
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Facturas generadas exitosamente",
  "data": {
    "success": true,
    "startDate": "2025-10-21",
    "endDate": "2025-10-27"
  },
  "executedBy": "admin"
}
```

---

### **POST /api/billing/generate-payouts**

Genera pagos a conductores para un período específico

**Headers:**
```
Authorization: Bearer <token_admin>
```

**Body:**
```json
{
  "startDate": "2025-10-21",
  "endDate": "2025-10-27"
}
```

---

### **GET /api/billing/periods**

Obtiene el historial de períodos

**Query Params:**
- `limit` (number): Cantidad de períodos a mostrar (default: 10)
- `status` (string): Filtrar por estado (`ACTIVE` o `CLOSED`)

**Ejemplo:**
```http
GET /api/billing/periods?limit=20&status=CLOSED
```

---

### **GET /api/billing/period/:periodId**

Obtiene detalles completos de un período

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "period": { /* ... */ },
    "invoices": [
      {
        "invoice_id": "...",
        "client_name": "Cliente A",
        "total_amount": 150000,
        "status": "PENDIENTE"
      }
    ],
    "payouts": [
      {
        "payout_id": "...",
        "driver_name": "Juan Pérez",
        "total_amount": 95000,
        "status": "PENDIENTE"
      }
    ]
  }
}
```

---

### **GET /api/billing/audit-log**

Obtiene el historial de operaciones

**Query Params:**
- `limit` (number): Cantidad de registros (default: 50)

---

## 🔄 Flujo Completo

### **Flujo Automático (Cada Domingo)**

```
⏰ Domingo 23:00
    │
    ▼
📅 CRON se activa
    │
    ▼
🔍 Obtiene fecha actual (2025-11-02)
    │
    ▼
📞 CALL sp_close_weekly_period('2025-11-02')
    │
    ├─> 📊 Calcula período: 28/oct - 3/nov
    │
    ├─> 📄 sp_generate_weekly_invoices('2025-10-28', '2025-11-03')
    │   │
    │   ├─> Busca paquetes ENTREGADOS en ese período
    │   ├─> Agrupa por cliente
    │   ├─> Crea facturas
    │   └─> Agrega items (paquetes + costos adicionales)
    │
    ├─> 💰 sp_generate_weekly_driver_payouts('2025-10-28', '2025-11-03')
    │   │
    │   ├─> Busca conductores activos
    │   ├─> Para cada conductor:
    │   │   ├─> Pagos por entregas
    │   │   ├─> Pagos por recolecciones
    │   │   ├─> Créditos adicionales
    │   │   └─> Deducciones COD
    │   └─> Crea payouts con sus items
    │
    ├─> 🔒 Marca período como CLOSED
    │
    └─> 📝 Registra en audit_log
```

---

### **Flujo Manual (Desde Panel)**

```
👤 Admin entra a /billing
    │
    ▼
📊 Ve estado actual:
   - Automatización: Activa ✅
   - Período actual: Semana 44 (28/oct - 3/nov)
   - Último cierre: Semana 43 → $450,000 facturado
    │
    ▼
🖱️ Admin presiona "Cerrar Período Actual"
    │
    ▼
⚠️ Confirmación: "¿Estás seguro?"
    │
    ▼
✅ Confirm
    │
    ▼
📡 POST /api/billing/close-period
    │
    ├─> 🔐 Verifica que es admin
    ├─> 📞 Llama sp_close_weekly_period()
    ├─> 📝 Registra quién ejecutó (audit_log)
    └─> ✅ Responde éxito
    │
    ▼
🔔 Notificación: "Período cerrado exitosamente"
    │
    ▼
🔄 Recarga datos:
   - Nuevo período actual: Semana 45
   - Último cierre actualizado: Semana 44
```

---

## 🛠️ Solución de Problemas

### **Problema 1: CRON no se está ejecutando**

**Síntomas:**
- Los domingos pasan pero no se cierran períodos automáticamente

**Solución:**
```bash
# 1. Verificar que el servidor esté corriendo
docker-compose ps

# 2. Ver logs del backend
docker-compose logs backend | grep "BILLING AUTOMATION"

# 3. Debería ver:
# ⏰ [BILLING AUTOMATION] Configurando CRON job automático...
# ✅ [BILLING AUTOMATION] CRON job configurado exitosamente

# 4. Si no aparece, reiniciar el backend
docker-compose restart backend
```

---

### **Problema 2: Error al cerrar período manualmente**

**Síntomas:**
- Error 500 al presionar el botón

**Solución:**
```bash
# 1. Ver logs detallados
docker-compose logs backend -f

# 2. Verificar la base de datos
docker-compose exec db mysql -u root -p leon_express

# 3. Verificar que existan los stored procedures
SHOW PROCEDURE STATUS WHERE Db = 'leon_express';

# 4. Si faltan, ejecutar el script SQL
source /docker-entrypoint-initdb.d/init.sql;
```

---

### **Problema 3: Facturas o pagos duplicados**

**Síntomas:**
- Se generan facturas/pagos dos veces

**Causa:**
- Se ejecutó el cierre manual Y el automático

**Solución:**
```sql
-- Verificar períodos duplicados
SELECT * FROM billing_periods 
WHERE period_number = 44 AND year_number = 2025;

-- Si hay duplicados, eliminar el más reciente
-- (las facturas y payouts se eliminan en cascada)
DELETE FROM billing_periods WHERE period_id = 'ID_DEL_DUPLICADO';
```

---

### **Problema 4: Zona horaria incorrecta**

**Síntomas:**
- El CRON se ejecuta a hora incorrecta

**Solución:**
```javascript
// Cambiar en billingAutomation.js
cron.schedule('0 23 * * 0', async () => {
  // ...
}, {
  timezone: "America/Santiago" // Cambiar aquí
});
```

Zonas horarias comunes:
- Chile: `America/Santiago`
- México: `America/Mexico_City`
- Argentina: `America/Argentina/Buenos_Aires`
- Colombia: `America/Bogota`

---

## 📊 Auditoría

Todas las operaciones quedan registradas en `audit_log`:

```sql
SELECT 
  al.created_at,
  u.username,
  al.action,
  al.details
FROM audit_log al
LEFT JOIN users u ON al.user_id = u.user_id
WHERE al.action LIKE '%PERIOD_CLOSE%'
   OR al.action LIKE '%INVOICE_GENERATION%'
   OR al.action LIKE '%PAYOUT_GENERATION%'
ORDER BY al.created_at DESC
LIMIT 50;
```

**Acciones registradas:**
- `AUTO_WEEKLY_PERIOD_CLOSE`: Cierre automático por CRON
- `MANUAL_WEEKLY_PERIOD_CLOSE`: Cierre manual por admin
- `MANUAL_INVOICE_GENERATION`: Facturas generadas manualmente
- `MANUAL_PAYOUT_GENERATION`: Pagos generados manualmente
- `AUTO_WEEKLY_PERIOD_CLOSE_ERROR`: Error en cierre automático

---

## 🎓 Mejores Prácticas

### ✅ DO (Hacer)

1. **Dejar que el CRON trabaje automáticamente** los domingos
2. **Revisar el panel** cada lunes para verificar que todo se ejecutó bien
3. **Usar el cierre manual** solo en situaciones especiales
4. **Revisar audit_log** periódicamente
5. **Hacer backup** antes de regenerar facturas/pagos

### ❌ DON'T (No Hacer)

1. **No cerrar períodos manualmente** cada semana (usa el automático)
2. **No regenerar** facturas/pagos sin antes verificar que no existan
3. **No modificar** directamente en la BD sin usar los SPs
4. **No cambiar** el horario del CRON sin coordinación con el equipo

---

## 🚀 Deploy

El sistema se activa automáticamente con:

```bash
./deploy_leon_express.sh
```

No requiere configuración adicional. El CRON se inicia cuando arranca el servidor.

---

**Versión:** 1.0  
**Última actualización:** 2025-10-29  
**Autor:** Leon Express Dev Team

