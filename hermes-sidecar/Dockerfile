# Sidecar image layered on top of the stock Hermes image. Builds the TypeScript
# server, installs tini, and wires both processes under a single entrypoint.
#
# Build with:
#   docker build \
#     --build-arg HERMES_BASE_IMAGE=prisma/hermes:stable \
#     -t prisma/hermes:whatsapp-sidecar \
#     -f hermes-sidecar/Dockerfile .
#
# Expects the repo root as build context so `hermes-sidecar/` is copyable.

ARG HERMES_BASE_IMAGE=prisma/hermes:stable

FROM node:20-bookworm-slim AS builder
WORKDIR /build
COPY hermes-sidecar/package.json hermes-sidecar/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY hermes-sidecar/tsconfig.json ./tsconfig.json
COPY hermes-sidecar/src ./src
RUN npm run build

FROM ${HERMES_BASE_IMAGE} AS runtime

USER root

# tini gives us a real PID 1 that reaps children and forwards signals so neither
# the Hermes gateway nor the sidecar become zombies if one crashes.
RUN set -eux; \
    if command -v apt-get >/dev/null 2>&1; then \
      apt-get update; \
      apt-get install -y --no-install-recommends tini; \
      rm -rf /var/lib/apt/lists/*; \
    elif command -v apk >/dev/null 2>&1; then \
      apk add --no-cache tini; \
    else \
      echo "unsupported base image: missing apt-get and apk" >&2; exit 1; \
    fi

# Node.js runtime for the sidecar. Skip install if the base image already has it.
RUN set -eux; \
    if ! command -v node >/dev/null 2>&1; then \
      if command -v apt-get >/dev/null 2>&1; then \
        apt-get update; \
        apt-get install -y --no-install-recommends curl ca-certificates gnupg; \
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -; \
        apt-get install -y --no-install-recommends nodejs; \
        rm -rf /var/lib/apt/lists/*; \
      elif command -v apk >/dev/null 2>&1; then \
        apk add --no-cache nodejs npm; \
      fi; \
    fi

WORKDIR /opt/hermes-sidecar
COPY hermes-sidecar/package.json hermes-sidecar/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi
COPY --from=builder /build/dist ./dist

COPY hermes-sidecar/docker-entrypoint.sh /usr/local/bin/hermes-entrypoint.sh
RUN chmod +x /usr/local/bin/hermes-entrypoint.sh

ENV NODE_ENV=production \
    SIDECAR_PORT=8643 \
    SIDECAR_HOST=0.0.0.0 \
    WHATSAPP_SESSION_PATH=/var/lib/hermes/whatsapp-session \
    SIDECAR_MANAGE_GATEWAY=true

RUN mkdir -p /var/lib/hermes/whatsapp-session && chmod 700 /var/lib/hermes/whatsapp-session

EXPOSE 8642 8643

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/hermes-entrypoint.sh"]
CMD ["both"]
