# 🔧 Fix Aplicado - Vista v_pending_review

## ❌ Error Original
```
#1054 - Unknown column 'p.driver_id' in 'on clause'
```

## 🔍 Causa
La tabla `pickups` usa `user_id` para el driver, **NO** `driver_id`.

### Estructura de pickups:
```sql
CREATE TABLE `pickups` (
  `pickup_id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL COMMENT 'Driver asignado',  <-- ✅ CORRECTO
  `client_id` varchar(36) NOT NULL,
  -- ... otros campos
)
```

## ✅ Corrección Aplicada

### ANTES (❌ Incorrecto):
```sql
LEFT JOIN users u ON p.driver_id = u.user_id  -- ❌ driver_id no existe
```

### DESPUÉS (✅ Correcto):
```sql
LEFT JOIN users u ON p.user_id = u.user_id  -- ✅ user_id es correcto
```

## 📝 Vista Corregida Completa

```sql
CREATE OR REPLACE VIEW v_pending_review AS
SELECT 
  q.id,
  q.pickup_id,
  q.batch_id,
  q.filename,
  q.image_path,
  q.extracted_data,
  q.confidence_scores,
  q.overall_confidence,
  q.parser_used,
  q.created_at,
  p.pickup_scheduled_date,
  c.client_name,
  u.username as driver_name
FROM ocr_processing_queue q
JOIN pickups p ON q.pickup_id = p.pickup_id
JOIN clients c ON p.client_id = c.client_id
LEFT JOIN users u ON p.user_id = u.user_id  -- ✅ CORREGIDO
WHERE q.status = 'needs_review'
ORDER BY q.created_at ASC;
```

## ✅ Ya Puedes Ejecutar

El archivo `migrations/20251022_smart_ocr_system.sql` ha sido actualizado.

**Ahora sí puedes ejecutarlo en phpMyAdmin sin errores!** 🚀

---

## 📋 Nota sobre batch_metadata

La tabla `batch_metadata` SÍ tiene su propio campo `driver_id` (opcional) que está bien:

```sql
CREATE TABLE batch_metadata (
  batch_id VARCHAR(36) PRIMARY KEY,
  pickup_id VARCHAR(36) NOT NULL,
  driver_id VARCHAR(36),  -- ✅ Este está bien, es opcional
  -- ...
  FOREIGN KEY (driver_id) REFERENCES users(user_id) ON DELETE SET NULL
)
```

Este campo es independiente y sirve para cachear el driver del batch.
