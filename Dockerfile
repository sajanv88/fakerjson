# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24-alpine
ARG PNPM_VERSION=12.3.4

# ---- Dependencies --------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
ARG PNPM_VERSION
RUN npm install --global --no-fund --no-audit pnpm@${PNPM_VERSION} && npm cache clean --force
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---- Build ---------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
COPY web ./web
# API to dist/, landing page (React + nuvui, built by Vite) to public/.
RUN pnpm build \
 && pnpm prune --prod --ignore-scripts

# ---- Runtime -------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS="--enable-source-maps"
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/public ./public

# Non-root; the app writes nothing to disk, so the root filesystem can be read-only.
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Node handles SIGTERM itself (enableShutdownHooks), so no init wrapper is needed.
# instrumentation.js starts OpenTelemetry before the app loads; it does nothing unless
# OTEL_EXPORTER_OTLP_ENDPOINT is set.
CMD ["node", "--import", "./dist/instrumentation.js", "dist/main.js"]
