# 🔄 Cambios Implementados - Sistema de Manejo de Duplicados

**Fecha:** 22 de octubre de 2025  
**Sprint:** Smart OCR System - Fase 1.5  
**Objetivo:** Permitir códigos de seguimiento duplicados y manejarlos inteligentemente

---

## 📝 Archivos Modificados

### 1. `/migrations/20251022_smart_ocr_system.sql`
**Cambio:** Agregados campos para tracking de duplicados en `ocr_processing_queue`

```sql
-- Nuevos campos
is_duplicate BOOLEAN DEFAULT FALSE,
duplicate_of_package_id VARCHAR(36),
duplicate_reason TEXT,
```

### 2. `/migrations/20251022_remove_unique_constraint.sql` ⭐ NUEVO
**Contenido:**
- Remove constraint UNIQUE de `external_tracking_code`
- Crear índice NO único para performance
- Agregar campos `duplicate_handling`, `duplicate_notes`, `duplicate_reviewed_by`, `duplicate_reviewed_at`
- Crear índices para búsquedas de duplicados

**Ejecutar:**
```bash
mysql -u root -p leon_express < migrations/20251022_remove_unique_constraint.sql
```

### 3. `/models/index.js`
**Cambio:** Modelo `Package` actualizado

```javascript
// ANTES
external_tracking_code: { type: DataTypes.STRING(100), unique: true },

// DESPUÉS
external_tracking_code: { type: DataTypes.STRING(100) }, // unique: true REMOVIDO
duplicate_handling: { 
  type: DataTypes.ENUM('pending', 'error_return', 'multi_part', 'confirmed_unique'),
  defaultValue: null 
},
duplicate_notes: { type: DataTypes.TEXT },
duplicate_reviewed_by: { type: DataTypes.STRING(36) },
duplicate_reviewed_at: { type: DataTypes.DATE },
```

### 4. `/utils/ocrProcessingQueue.js`
**Cambios:**
- **Nuevo paso 2/5**: Verificación de duplicados antes de crear paquete
- **createPackage()** ahora detecta external_tracking_code duplicados
- Si hay duplicado:
  - Crea el paquete de todas formas
  - Marca `duplicate_handling = 'pending'`
  - Agrega notas automáticas
  - Cambia status a `needs_review`
- Return value cambiado: `{ package_id, is_duplicate }`

**Logs mejorados:**
```
🔍 [2/5] Verificando duplicados...
⚠️  DUPLICADO DETECTADO!
   External tracking: L4414
   Paquete existente: LE982341
   Creado: 2025-10-20
```

### 5. `/docs/DUPLICATE_HANDLING.md` ⭐ NUEVO
Documentación completa del sistema de manejo de duplicados

---

## 🎯 Funcionalidad Implementada

### Detección Automática de Duplicados

1. Durante procesamiento OCR, después de extraer datos
2. Antes de crear el paquete, busca en DB:
   ```sql
   SELECT * FROM packages 
   WHERE external_tracking_code = 'L4414'
   ORDER BY created_at DESC
   LIMIT 1
   ```
3. Si encuentra coincidencia → marca como duplicado
4. Crea el paquete pero con `duplicate_handling = 'pending'`
5. Cambia status de OCR a `needs_review`

### Estados de Manejo

| Estado | Significado | Acción Backend |
|--------|-------------|----------------|
| `NULL` | No duplicado | Procesar normalmente |
| `pending` | ⚠️ Detectado, pendiente revisión | Requiere decisión humana |
| `error_return` | ❌ Error del cliente | No cobrar/pagar, devolver |
| `multi_part` | ✅ Envío en partes | Procesar normalmente |
| `confirmed_unique` | ✅ No era duplicado | Procesar normalmente |

---

## 🔄 Flujo Actualizado

```
┌─────────────────────────────────────────────────┐
│ ANTES (Con unique constraint)                   │
├─────────────────────────────────────────────────┤
│ 1. OCR extrae código "L4414"                    │
│ 2. Intenta crear paquete                        │
│ 3. ❌ ERROR: Duplicate entry 'L4414'            │
│ 4. Paquete NO creado                            │
│ 5. Status: needs_review (sin paquete creado)    │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ AHORA (Sin unique constraint)                   │
├─────────────────────────────────────────────────┤
│ 1. OCR extrae código "L4414"                    │
│ 2. Verifica si existe                           │
│ 3. ⚠️ Existe LE982341 con "L4414"               │
│ 4. ✅ Crea paquete LE020686                     │
│ 5. Marca: duplicate_handling = 'pending'        │
│ 6. Status: needs_review (paquete sí creado)     │
│ 7. Driver/Admin revisa en dashboard             │
│ 8. Decide: error_return o multi_part            │
└─────────────────────────────────────────────────┘
```

---

## 📊 Casos de Uso

### Caso 1: Error del Cliente ❌
**Situación:** Cliente envía misma caja dos veces por confusión

**Flujo:**
1. Primera caja → Paquete LE982341, código externo "L4414"
2. Segunda caja (error) → Paquete LE020686, detecta duplicado
3. Admin revisa, ve que son idénticos
4. Marca: `duplicate_handling = 'error_return'`
5. Sistema:
   - No cobra al cliente por LE020686
   - No paga al driver por LE020686
   - Genera etiqueta de devolución
6. Driver devuelve paquete al cliente en próxima recolección

### Caso 2: Envío Multi-Parte ✅
**Situación:** Cliente divide envío grande en 3 cajas

**Flujo:**
1. Caja 1 → LE100001, código externo "MP9999"
2. Caja 2 → LE100002, detecta duplicado "MP9999"
3. Caja 3 → LE100003, detecta duplicado "MP9999"
4. Admin revisa, ve que son 3 cajas diferentes del mismo pedido
5. Marca los 3 como: `duplicate_handling = 'multi_part'`
6. Sistema:
   - Cobra normalmente los 3 paquetes
   - Paga normalmente al driver por los 3
   - Procesa entregas independientemente

---

## ⚠️ Migraciones Pendientes

### IMPORTANTE: Ejecutar ANTES de probar

```bash
cd /home/marval/Proyects/Leon_Express/LeonExpress_back

# Verificar contenedor MySQL corriendo
docker ps | grep mysql

# Ejecutar migración
mysql -u root -p leon_express < migrations/20251022_remove_unique_constraint.sql

# O si usas Docker:
docker exec -i leon_express_mysql mysql -uroot -ppassword leon_express < migrations/20251022_remove_unique_constraint.sql
```

### Verificar cambios:
```sql
-- Ver estructura de tabla packages
DESCRIBE packages;

-- Verificar que unique constraint fue removido
SHOW INDEXES FROM packages WHERE Column_name = 'external_tracking_code';

-- Debe mostrar un índice NO único
```

---

## 🧪 Testing Sugerido

### Test 1: Crear duplicado
```bash
# 1. Escanear etiqueta con código "L4414"
# 2. Ver logs del backend
# 3. Verificar en DB:

SELECT 
  tracking_code,
  external_tracking_code,
  duplicate_handling,
  duplicate_notes,
  status
FROM packages
WHERE external_tracking_code = 'L4414'
ORDER BY created_at;

# Debe mostrar 2 paquetes:
# - LE982341 (original) duplicate_handling=NULL
# - LE020686 (nuevo) duplicate_handling='pending'
```

### Test 2: Verificar OCR queue
```sql
SELECT 
  id,
  filename,
  status,
  is_duplicate,
  duplicate_reason,
  package_id
FROM ocr_processing_queue
WHERE is_duplicate = TRUE
ORDER BY created_at DESC
LIMIT 5;
```

---

## 📱 Frontend - Próximos Pasos (Fase 2)

### Dashboard de Revisión de Duplicados

**Ruta:** `/packages/duplicate-review`

**Componente:** `src/pages/packages/DuplicateReviewDashboard.vue`

**API Endpoints a crear:**

1. `GET /api/packages/duplicates/pending`
   - Lista paquetes con `duplicate_handling = 'pending'`
   - Include: paquete original, datos del cliente, fotos OCR

2. `POST /api/packages/:package_id/resolve-duplicate`
   - Body: `{ resolution: 'error_return' | 'multi_part' | 'confirmed_unique', notes: string }`
   - Actualiza `duplicate_handling`, `duplicate_notes`, `duplicate_reviewed_by`, `duplicate_reviewed_at`

3. `GET /api/packages/:package_id/duplicate-history`
   - Lista todos los paquetes con mismo `external_tracking_code`
   - Para comparación lado a lado

---

## 💡 Notas Adicionales

### Performance
- Índice en `external_tracking_code` mantiene búsquedas rápidas
- Query de detección usa `ORDER BY created_at DESC` para encontrar el más reciente

### Seguridad
- Solo usuarios con rol `ADMIN` o `DISPATCHER` pueden resolver duplicados
- `duplicate_reviewed_by` registra quién tomó la decisión
- `duplicate_reviewed_at` registra cuándo

### Facturación
- Modificar consultas de facturación para excluir:
  ```sql
  WHERE duplicate_handling NOT IN ('error_return') 
     OR duplicate_handling IS NULL
  ```

### Pagos a Drivers
- Modificar cálculo de earnings para excluir:
  ```sql
  WHERE duplicate_handling NOT IN ('error_return')
     OR duplicate_handling IS NULL
  ```

---

## ✅ Checklist de Implementación

- [x] Actualizar migración de OCR queue
- [x] Crear migración para remover unique constraint
- [x] Actualizar modelo Package
- [x] Modificar createPackage() para detectar duplicados
- [x] Actualizar logs de procesamiento
- [x] Crear documentación completa
- [ ] Ejecutar migraciones en DB
- [ ] Reiniciar backend
- [ ] Probar con etiqueta duplicada
- [ ] Crear dashboard de revisión (Fase 2)
- [ ] Crear API endpoints de resolución (Fase 2)
- [ ] Actualizar cálculos de facturación (Fase 2)
- [ ] Actualizar cálculos de pagos (Fase 2)

---

## 🚀 Próximo Comando a Ejecutar

```bash
# 1. Ejecutar migración
docker exec -i leon_express_mysql mysql -uroot -ppassword leon_express < /path/to/migrations/20251022_remove_unique_constraint.sql

# 2. Reiniciar backend para cargar nuevo modelo
# (nodemon debería hacerlo automáticamente si detecta cambios en models/)

# 3. Probar escaneando etiqueta duplicada
```

---

**Estado:** ✅ Código implementado, pendiente ejecución de migración y testing  
**Próximo paso:** Ejecutar migración SQL y probar con etiqueta "L4414"
