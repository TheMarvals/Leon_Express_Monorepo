# Etapa de construcción
FROM node:20-alpine as build-stage

# Establecer el directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar todas las dependencias (incluidas las de desarrollo)
RUN NODE_ENV=development npm ci --legacy-peer-deps --ignore-scripts

# Copiar el código fuente
COPY . .

# Variables de construcción para Vite
ARG VITE_API_BASE_URL=/api
ARG VITE_VAPID_PUBLIC_KEY

# Exponer las variables a Vite en tiempo de build
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_VAPID_PUBLIC_KEY=${VITE_VAPID_PUBLIC_KEY}

# Construir la aplicación para producción
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN NODE_ENV=development npm run build:ci

# Etapa de producción
FROM nginx:alpine as production-stage

# Copiar los archivos construidos desde la etapa anterior
COPY --from=build-stage /app/dist /usr/share/nginx/html

# Copiar configuración personalizada de nginx (opcional)
COPY nginx.conf /etc/nginx/nginx.conf

# Exponer el puerto
EXPOSE 80

# Comando por defecto
CMD ["nginx", "-g", "daemon off;"]