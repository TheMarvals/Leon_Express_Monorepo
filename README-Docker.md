# LeonExpress Docker Setup

## 📦 Estructura Docker

Este proyecto incluye una configuración completa de Docker con:

- **Frontend**: Vue.js + Vite servido con Nginx
- **Backend**: Node.js + Express API
- **Base de datos**: MySQL remoto (configurado externamente)

## 🚀 Inicio Rápido

### 1. Configurar variables de entorno:
```bash
cp .env.example .env
nano .env  # Configura tu base de datos remota
```

### 2. Ejecutar con el script automático:
```bash
./deploy.sh
```

### 3. O usando Docker Compose directamente:
```bash
# Construir y ejecutar todos los servicios
docker-compose up --build -d

# Ver logs
docker-compose logs -f

# Detener servicios
docker-compose down
```

## 🌐 Acceso a los servicios

- **Frontend**: http://localhost (puerto 80)
- **Backend API**: http://localhost:4000
- **MySQL**: Servidor remoto (configurado en .env)

## 📁 Volúmenes

- `./LeonExpress_back/uploads`: Archivos subidos (fotos de entrega, etc.)

## 🔧 Variables de entorno

El backend usa las siguientes variables de entorno (configuradas en el archivo .env):

```env
# Base de datos remota
DB_HOST=tu-servidor-mysql.com
DB_PORT=3306
DB_NAME=leon_express
DB_USER=tu_usuario_mysql
DB_PASSWORD=tu_password_mysql

# Seguridad
JWT_SECRET=tu_jwt_secret_super_seguro
VAPID_PUBLIC_KEY=tu_vapid_public_key
VAPID_PRIVATE_KEY=tu_vapid_private_key

# Entorno
NODE_ENV=production
```

## 🛠️ Comandos útiles

```bash
# Ver estado de contenedores
docker-compose ps

# Acceder al contenedor del backend
docker-compose exec backend sh

# Verificar variables de entorno del backend
docker-compose exec backend env | grep DB_

# Reconstruir solo un servicio
docker-compose build backend
docker-compose up -d backend

# Limpiar todo (contenedores, imágenes, volúmenes)
docker-compose down --rmi all --volumes --remove-orphans
```

## 📋 Notas importantes

1. **Base de datos remota**: Asegúrate de configurar correctamente las credenciales en el archivo `.env`
2. **Conectividad**: El servidor debe poder acceder a tu base de datos MySQL remota
3. **Uploads**: Las fotos de entrega se almacenan en `./LeonExpress_back/uploads`
4. **Seguridad**: Usa credenciales seguras y conexiones SSL para la base de datos en producción

## 🐛 Troubleshooting

- Si el puerto 80 está ocupado, cambia el mapeo en docker-compose.yml: `"8080:80"`
- Para probar conexión a base de datos: `docker-compose logs backend`
- Para ver logs específicos: `docker-compose logs backend` o `docker-compose logs frontend`
- Si hay problemas de conexión DB, verifica las variables en `.env`