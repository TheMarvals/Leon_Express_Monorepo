# OCR independiente de León Express

El OCR tiene su propio proyecto Compose, imagen y volumen de modelos. Un despliegue de la aplicación principal no debe construir ni reiniciar este servicio.

## Preparar el servidor

Crear una vez la red privada compartida antes de desplegar cualquiera de los dos recursos:

```sh
docker network create leonexpress_ocr_network
```

## Desplegar el OCR

En Coolify, crear un recurso Docker Compose independiente con el mismo repositorio, directorio base `/LeonExpress_ocr` y archivo `/docker-compose.yml`. Desactivar el despliegue automático por cada commit general o limitarlo a cambios de `LeonExpress_ocr/**`. No asignar un dominio público ni publicar el puerto 8000 en el host.

También puede administrarse directamente por SSH desde una copia de esta carpeta:

```sh
docker compose build ocr-engine
docker compose up -d --no-build ocr-engine
docker compose ps
```

El proyecto se llama `leonexpress-ocr`; no debe iniciarse con el nombre del proyecto de la aplicación. La imagen inicial es `leonexpress-ocr:1.0.0`. Para publicar otra versión, configurar `OCR_IMAGE` y construirla en el recurso OCR.

El volumen `leonexpress_ocr_models` se inicializa con los modelos incluidos en la imagen. No se descargan modelos al arrancar. La carga en RAM ocurre una vez por proceso. Al actualizar EasyOCR o los idiomas, preparar también la versión compatible de los modelos antes de cambiar el volumen; no eliminar el volumen durante despliegues normales.

## Conectar la aplicación

La aplicación principal usa `docker-compose.yaml` en Coolify. El backend se conecta a la red externa y utiliza:

```dotenv
OCR_PROVIDER=local
OCR_LOCAL_URL=http://leonexpress-ocr:8000/parse/image
OCR_NETWORK_NAME=leonexpress_ocr_network
```

Los Compose de desarrollo y producción también conectan el backend a esa red. El frontend y NGINX no necesitan acceso al OCR.

Primero iniciar y validar el recurso OCR; después desplegar la aplicación sin el antiguo servicio `leonexpress_ocr`. Conservar el OCR anterior hasta comprobar una lectura real desde el backend. El antiguo contenedor puede retirarse después de verificar el cambio.

## Comprobar disponibilidad

```sh
docker compose exec -T ocr-engine python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health').read().decode())"
```

`/health` devuelve `ready: true` únicamente con el modelo cargado. Las peticiones conservan el formato OCR.space que consume el backend. La inferencia se ejecuta fuera del bucle HTTP y se limita a una lectura simultánea por proceso para mantener disponible la comprobación de salud.

## Pruebas

```sh
python -m unittest discover -s tests -v
```

Las pruebas HTTP usan un lector simulado para comprobar el contrato, la carga única del modelo y la disponibilidad de `/health` durante una lectura. La verificación del modelo real se realiza con una etiqueta de prueba en el servidor.
