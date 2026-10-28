# Python sin dependencias + las órdenes del sistema que usa el código de red:
# la tabla de vecinos (ip), ping y el descubrimiento de equipos (avahi-browse,
# que habla con el avahi del anfitrión por su socket de D-Bus). El código va
# montado desde ./app, así que cambiarlo no pide reconstruir la imagen.
FROM python:3.13-alpine
RUN apk add --no-cache iproute2 iputils avahi-tools && pip install --no-cache-dir paramiko==3.5.1
COPY app /app
WORKDIR /app
CMD ["python", "/app/casalab_red.py"]
