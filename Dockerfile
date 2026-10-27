#
# GMAI — container image (audit F17/F18). Hosting-independent: no Vercel.
#
#   docker build -t gmai:release .
#   docker run --env-file .env.production -p 3000:3000 -v gmai-data:/app/data gmai:release
#
# Node 22 (package.json engines), pinned by digest. The lockfile is installed
# with `npm ci` — reproducible, never `npm install`.
# APP_TIER is read at build time by statically rendered pages AND at run time
# by the server: build and run with the same value (public by default).
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:3ed98443660ff48413b5af19ecefce3b9d50845a901a43420d47cc63a9fddbe9

FROM ${NODE_IMAGE} AS deps
# better-sqlite3 (internal knowledge base, review store) compiles a native
# addon: build tools are needed in this stage only, not in the runtime image.
# APT_HTTPS=1 (with a CA file at ops/build-ca/ca.pem) is for networks that allow
# only HTTPS egress through a TLS-inspecting proxy; a normal build leaves it at 0.
# Plain COPY instead of a BuildKit secret mount, so the image also builds with the
# classic builder (Google Cloud Build's default docker step).
ARG APT_HTTPS=0
COPY ops/build-ca/ /tmp/build-ca/
RUN if [ "$APT_HTTPS" = 1 ]; then \
      sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources; \
      if [ -f /tmp/build-ca/ca.pem ]; then install -m 644 /tmp/build-ca/ca.pem /tmp/apt-ca.crt; echo 'Acquire::https::CAInfo "/tmp/apt-ca.crt";' > /etc/apt/apt.conf.d/99ca; fi; \
    fi; \
    apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/* /etc/apt/apt.conf.d/99ca /tmp/apt-ca.crt
WORKDIR /app
COPY package.json package-lock.json ./
# Optional corporate CA (ops/build-ca/ca.pem); absent in a normal build.
RUN if [ -f /tmp/build-ca/ca.pem ]; then export NODE_EXTRA_CA_CERTS=/tmp/build-ca/ca.pem npm_config_cafile=/tmp/build-ca/ca.pem; fi; \
    npm ci --no-audit --no-fund

FROM deps AS build
ARG APP_TIER=public
ENV APP_TIER=${APP_TIER} NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS run
ARG APP_TIER=public
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 APP_TIER=${APP_TIER} PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app ./
# Writable state (counter store, review store, internal knowledge base) lives
# in /app/data — mount a volume there; the image itself stays read-only data.
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
