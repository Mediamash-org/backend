# syntax=docker/dockerfile:1.7

# ── Build: install deps, compile plugins + server ───────────────────────────
FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY plugins ./plugins

# Skip postinstall here — plugins are compiled once in the build step below.
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
COPY config ./config
COPY public ./public

RUN npm run build \
  && npm prune --omit=dev \
  && npm cache clean --force

# ── Runtime: lean image, non-root ───────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl dumb-init \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 10001 omss \
  && useradd --system --uid 10001 --gid omss --home-dir /app --shell /usr/sbin/nologin omss

COPY --from=build --chown=omss:omss /app/package.json /app/package-lock.json ./
COPY --from=build --chown=omss:omss /app/node_modules ./node_modules
COPY --from=build --chown=omss:omss /app/dist ./dist
COPY --from=build --chown=omss:omss /app/public ./public
COPY --from=build --chown=omss:omss /app/config ./config
COPY --from=build --chown=omss:omss /app/plugins ./plugins
COPY --chown=omss:omss scripts/docker-healthcheck.sh /app/scripts/docker-healthcheck.sh

RUN chmod +x /app/scripts/docker-healthcheck.sh

USER omss

# Default listen port; override at runtime with PORT=…
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["/app/scripts/docker-healthcheck.sh"]

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
