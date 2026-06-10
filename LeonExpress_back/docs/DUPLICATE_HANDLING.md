# Sistema de Manejo de Duplicados - Smart OCR

## 📋 Descripción

El sistema Smart OCR ahora **permite códigos de seguimiento externos duplicados** para manejar dos escenarios comunes:

### Escenarios

1. **❌ Error - Duplicado Inconsciente**
   - Cliente envía el mismo paquete dos veces por error
   - Debe devolverse al vendedor
   - **No se cobra al cliente**
   - **No se paga al driver**
   - Estado: `duplicate_handling = 'error_return'`

2. **✅ Válido - Envío Multi-Parte**
   - Cliente divide un envío grande en varias entregas
   - Cada parte tiene el mismo código externo pero son paquetes diferentes
   - Se procesan como paquetes normales
   - Se cobra y paga normalmente
   - Estado: `duplicate_handling = 'multi_part'`

---

## 🔧 Cambios en Base de Datos

### 1. Constraint UNIQUE removido
```sql
-- Antes
external_tracking_code: { type: DataTypes.STRING(100), unique: true }

-- Ahora
external_tracking_code: { type: DataTypes.STRING(100) }
```

### 2. Nuevos campos en tabla `packages`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `duplicate_handling` | ENUM | `'pending'`, `'error_return'`, `'multi_part'`, `'confirmed_unique'` |
| `duplicate_notes` | TEXT | Notas sobre el duplicado (auto-generadas o manuales) |
| `duplicate_reviewed_by` | VARCHAR(36) | User ID quien revisó |
| `duplicate_reviewed_at` | TIMESTAMP | Fecha de revisión |

### 3. Nuevos campos en tabla `ocr_processing_queue`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `is_duplicate` | BOOLEAN | Marca si se detectó duplicado |
| `duplicate_of_package_id` | VARCHAR(36) | ID del paquete original |
| `duplicate_reason` | TEXT | Razón del duplicado |

---

## 🔄 Flujo de Procesamiento

```
1. OCR extrae datos de etiqueta
   ↓
2. Sistema verifica si external_tracking_code ya existe
   ↓
3a. NO DUPLICADO                    3b. DUPLICADO DETECTADO
    ↓                                   ↓
    Crear paquete normal                Crear paquete con:
    duplicate_handling = NULL           - duplicate_handling = 'pending'
    ↓                                   - duplicate_notes = auto-generadas
    Status: auto_approved               ↓
                                        Status: needs_review ⚠️
                                        ↓
4. Driver/Admin revisa en dashboard
   ↓
5. Marca como:
   - 'error_return' → Se devuelve, no se cobra/paga
   - 'multi_part' → Se procesa normalmente
   - 'confirmed_unique' → No era duplicado (código corregido)
```

---

## 💻 Implementación Backend

### Detección Automática

```javascript
// En ocrProcessingQueue.js -> createPackage()

if (extractedData.external_tracking_code) {
  const duplicatePackage = await Package.findOne({
    where: { external_tracking_code: extractedData.external_tracking_code }
  });
  
  if (duplicatePackage) {
    // Crear con duplicate_handling = 'pending'
    // Marcar status como 'needs_review'
  }
}
```

### Datos del Paquete

```javascript
{
  duplicate_handling: isDuplicate ? 'pending' : null,
  duplicate_notes: isDuplicate 
    ? `Duplicado de ${duplicatePackage.tracking_code}. Revisar si es error o envío multi-parte.`
    : null
}
```

---

## 📊 Estados de `duplicate_handling`

| Estado | Descripción | Acción |
|--------|-------------|--------|
| `NULL` | No es duplicado | Procesar normalmente |
| `'pending'` | ⚠️ Detectado, pendiente de revisión | Mostrar en dashboard de revisión |
| `'error_return'` | ❌ Confirmado como error | Devolver al cliente, no cobrar/pagar |
| `'multi_part'` | ✅ Confirmado como envío multi-parte | Procesar normalmente |
| `'confirmed_unique'` | ✅ Revisado, no era duplicado | Procesar normalmente |

---

## 🎯 Queries Útiles

### Listar paquetes duplicados pendientes
```sql
SELECT 
  tracking_code,
  external_tracking_code,
  recipient_name,
  duplicate_notes,
  created_at
FROM packages
WHERE duplicate_handling = 'pending'
ORDER BY created_at DESC;
```

### Encontrar todos los paquetes con mismo código externo
```sql
SELECT 
  tracking_code,
  external_tracking_code,
  recipient_name,
  duplicate_handling,
  created_at
FROM packages
WHERE external_tracking_code = 'L4414'
ORDER BY created_at;
```

### Estadísticas de duplicados
```sql
SELECT 
  duplicate_handling,
  COUNT(*) as total,
  SUM(CASE WHEN duplicate_handling = 'error_return' THEN client_price ELSE 0 END) as saved_cost
FROM packages
WHERE duplicate_handling IS NOT NULL
GROUP BY duplicate_handling;
```

---

## 🚀 Migraciones a Ejecutar

### 1. Primera migración (ya ejecutada)
```bash
mysql -u root -p leon_express < migrations/20251022_smart_ocr_system.sql
```

### 2. Segunda migración (NUEVA - ejecutar ahora)
```bash
mysql -u root -p leon_express < migrations/20251022_remove_unique_constraint.sql
```

---

## 📱 Frontend - Dashboard de Revisión (Fase 2)

### Vista pendiente de implementar:

**Ruta:** `/packages/duplicate-review`

**Componente:** `DuplicateReviewDashboard.vue`

**Funcionalidades:**
- Listar paquetes con `duplicate_handling = 'pending'`
- Mostrar lado a lado: paquete nuevo vs paquete original
- Botones de acción:
  - ✅ "Es envío multi-parte" → `duplicate_handling = 'multi_part'`
  - ❌ "Es error, devolver" → `duplicate_handling = 'error_return'`
  - ℹ️ "No es duplicado" → `duplicate_handling = 'confirmed_unique'`
- Campo de notas adicionales

**Mockup:**
```
┌─────────────────────────────────────────────────────┐
│ 🔍 Revisión de Duplicados                          │
├─────────────────────────────────────────────────────┤
│                                                      │
│ NUEVO: LE020686                ORIGINAL: LE982341   │
│ Código externo: L4414          Código externo: L4414│
│ TRINIDAD CELIS                 TRINIDAD CELIS       │
│ PLAZA DEL RETIRO 3845          PLAZA DEL RETIRO 3845│
│ LO BARNECHEA                   LO BARNECHEA         │
│                                                      │
│ Creado: 22/10/2025 12:38      Creado: 20/10/2025    │
│                                                      │
│ [✅ Envío Multi-Parte] [❌ Error/Devolver]          │
│ [ℹ️ No es Duplicado]                                │
│                                                      │
│ Notas: _________________________________             │
│                                                      │
└─────────────────────────────────────────────────────┘
```

---

## ⚠️ Consideraciones Importantes

1. **Tracking Code Interno (LE######)**: Siempre único, generado por el sistema
2. **External Tracking Code**: Puede repetirse, viene de la etiqueta del cliente
3. **Auto-Aprobación**: Los duplicados se crean pero se marcan para revisión
4. **Notificaciones**: Se debe notificar al driver cuando hay duplicados detectados
5. **Facturación**: Los paquetes con `duplicate_handling = 'error_return'` no deben incluirse en facturación
6. **Pago a Drivers**: No se paga por paquetes marcados como `error_return`

---

## 📝 TODO - Próximos Pasos

- [ ] Ejecutar migración `20251022_remove_unique_constraint.sql`
- [ ] Reiniciar backend para cargar cambios en modelo
- [ ] Probar creación de paquete duplicado
- [ ] Verificar logs de detección de duplicado
- [ ] Implementar dashboard de revisión (Fase 2)
- [ ] Agregar filtros en listado de paquetes
- [ ] Crear endpoint para actualizar `duplicate_handling`
- [ ] Modificar cálculo de facturación para excluir `error_return`
- [ ] Modificar cálculo de pagos a drivers para excluir `error_return`

---

## 🧪 Testing

### Caso de prueba 1: Duplicado inconsciente
```
1. Escanear etiqueta con código "L4414"
2. Sistema crea paquete LE020686
3. Volver a escanear misma etiqueta
4. Sistema detecta duplicado
5. Crear paquete LE123456 con duplicate_handling='pending'
6. Verificar status='needs_review'
```

### Caso de prueba 2: Envío multi-parte
```
1. Cliente tiene envío grande dividido en 3 cajas
2. Las 3 tienen código "MP9999"
3. Sistema detecta duplicados después de la primera
4. Admin revisa y marca las 3 como 'multi_part'
5. Se procesan y facturan normalmente
```

---

## 📧 Contacto

Para dudas sobre el sistema de duplicados, contactar al equipo de desarrollo.
