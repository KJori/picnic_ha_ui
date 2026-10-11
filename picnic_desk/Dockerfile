FROM python:3.13-slim

# The labels the Home Assistant docs ask for when an image is not built by
# their GitHub builder. BUILD_VERSION and BUILD_ARCH are supplied by Supervisor.
ARG BUILD_VERSION=dev
ARG BUILD_ARCH=amd64
LABEL io.hass.version="${BUILD_VERSION}" \
      io.hass.type="app" \
      io.hass.arch="${BUILD_ARCH}"

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8099 \
    DATA_DIR=/data \
    INGRESS_ONLY=1

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY app/ .

CMD ["python", "server.py"]
