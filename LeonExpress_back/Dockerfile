# Usar Node.js LTS como imagen base
FROM node:18-alpine

# Instalar MariaDB (compatible con MySQL) y dependencias necesarias
RUN apk add --no-cache \
    mariadb \
    mariadb-client \
    bash \
    tzdata \
    python3 \
    make \
    g++

# Establecer el directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install --omit=dev

# Copiar el código de la aplicación
COPY . .

# Copiar script de inicio y configuración de MariaDB
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
COPY my.cnf /etc/my.cnf

# Crear directorio para uploads y datos de MariaDB
RUN mkdir -p uploads/delivery-photos /var/lib/mysql /run/mysqld && \
    chown -R mysql:mysql /var/lib/mysql /run/mysqld

# Exponer el puerto
EXPOSE 4100 3306

# Usar script de entrada
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "start"]