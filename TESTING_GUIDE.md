# 🧪 Guía de Pruebas Locales - OCR Batch Diferido

## ✅ Estado Actual
- **Backend**: Corriendo en `http://localhost:4000` con algunos warnings de YAML (no afectan funcionalidad)
- **Frontend**: Corriendo en `http://localhost:5173`

## 🎯 Funcionalidades a Probar

### 1. **Modo Captura Rápida (Nuevo)**
Este es el flujo diferido para conductores:

1. **Navega al frontend**: http://localhost:5173
2. **Inicia sesión** como driver
3. **Ve a una recolección** activa
4. **Añade un paquete** - verás el formulario con opciones de cámara
5. **Activa "Captura Rápida (Procesar Después)"** - aparece UI azul
6. **Abre la cámara** (debería tener menos zoom ahora)
7. **Toma varias fotos** - se almacenan localmente
8. **Pulsa "Subir X Fotos"** - se envían al servidor
9. **Observa el estado** - debería mostrar "Procesando en segundo plano..."

### 2. **Modo Batch OCR (Existente)**
El flujo original para procesamiento inmediato:

1. **Activa "Modo Batch OCR"**
2. **Toma fotos**
3. **Pulsa "Procesar OCR Lote"**
4. **Ve los resultados inmediatamente**

## 🔧 Mejoras en la Cámara
- **Resolución reducida**: 640x480 máx (antes era 1080x1920)
- **Aspecto**: 4:3 en lugar de 9:16
- **Tamaño**: Max 360px de ancho
- **Zoom**: Intento automático de reducir zoom al mínimo

## 📁 Archivos Creados
Durante las pruebas del modo diferido se crean:
- `LeonExpress_back/uploads/batch-photos/batch_[PICKUP_ID]_[TIMESTAMP]/`
  - `photo_1.jpg`, `photo_2.jpg`, etc.
  - `batch_metadata.json` con estado del procesamiento

## 🐛 Debug
- **Backend logs**: Terminal donde corre `npm run dev` en LeonExpress_back
- **Frontend logs**: Consola del navegador (F12)
- **Network**: Pestaña Network en DevTools para ver requests

## 📋 Puntos de Verificación
- [ ] Cámara se ve más pequeña y con menos zoom
- [ ] Botón "Captura Rápida" aparece solo en contexto de recolección
- [ ] Fotos se suben correctamente al backend
- [ ] Estado de procesamiento se actualiza automáticamente
- [ ] Procesamiento OCR funciona en background
- [ ] Resultados aparecen cuando está completado

## 🚨 Problemas Conocidos
- Warnings de YAML en backend (no afectan funcionalidad)
- TypeScript warnings en zoom (funcionalidad intacta)

## 🎮 Comandos de Control
- Backend: Ctrl+C en terminal backend para detener
- Frontend: Ctrl+C en terminal frontend para detener
- Logs: `tail -f LeonExpress_back/uploads/batch-photos/*/batch_metadata.json`