FROM node:24-alpine

# The labels the Home Assistant docs ask for when an image is not built by
# their GitHub builder. BUILD_VERSION and BUILD_ARCH are supplied by Supervisor.
ARG BUILD_VERSION=dev
ARG BUILD_ARCH=amd64
LABEL io.hass.version="${BUILD_VERSION}" \
      io.hass.type="app" \
      io.hass.arch="${BUILD_ARCH}"

# Delivery times are shown in the local time zone, which Supervisor passes as TZ.
RUN apk add --no-cache tzdata

ENV NODE_ENV=production \
    PORT=8099 \
    DATA_DIR=/data \
    INGRESS_ONLY=1

# dist/ is built from the sources in this repository (npm run build) and
# committed, so installing needs no package downloads.
WORKDIR /app
COPY dist/ ./

CMD ["node", "server.mjs"]
