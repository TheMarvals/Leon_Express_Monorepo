# 📱 Guía para usar Iriun Webcam con Leon Express

## ✅ **Estado actual:**
- ✅ Iriun Webcam está funcionando (proceso activo)
- ✅ Dispositivos de video disponibles: `/dev/video0`, `/dev/video1`, `/dev/video2`
- ✅ Frontend ejecutándose en: http://localhost:5174

## 🎥 **Cómo usar la cámara Iriun:**

### 1. **En la aplicación web:**
   - Ve a http://localhost:5174
   - Inicia sesión con usuario: `conductor`, password: `password123123`
   - Ve a la sección de paquetes
   - Haz clic en el botón **"📱 Iriun"** (botón verde)

### 2. **Botones disponibles:**
   - **📱 Iriun** (Verde): Conecta específicamente a la cámara Iriun
   - **Reiniciar** (Gris): Reinicia la conexión de cámara
   - **Solución Rápida** (Azul): Intenta con resolución baja
   - **Diagnóstico** (Naranja): Muestra información técnica en consola

### 3. **En tu teléfono (Iriun App):**
   - Asegúrate que la app Iriun esté abierta
   - Que esté conectado a la misma red WiFi
   - Que no esté siendo usada por otra aplicación

## 🔧 **Comandos útiles:**

### Verificar estado de Iriun:
```bash
ps aux | grep iriun
```

### Verificar dispositivos de video:
```bash
ls /dev/video*
```

### Verificar qué usa la cámara:
```bash
./check_camera_usage.sh
```

### Reiniciar Iriun si es necesario:
```bash
pkill iriunwebcam
iriunwebcam &
```

## 🆘 **Solución de problemas:**

1. **Si no detecta Iriun:**
   - Reinicia la app Iriun en el teléfono
   - Ejecuta: `pkill iriunwebcam && iriunwebcam &`
   - Usa el botón "Diagnóstico" para ver dispositivos

2. **Si da error "NotReadableError":**
   - Cierra otras apps que puedan usar cámara (Chrome, Zoom, etc.)
   - Usa el script: `./check_camera_usage.sh`

3. **Si no aparece video:**
   - Verifica permisos de cámara en el navegador
   - Refresca la página web
   - Usa el botón "📱 Iriun" directamente

## 📋 **Configuración técnica actual:**
- La app busca automáticamente dispositivos con nombres como "iriun", "webcam", "virtual"
- Si encuentra Iriun, lo usa con prioridad
- Resolución preferida: 1280x720 para Iriun
- Fallback automático a otras cámaras si Iriun no está disponible