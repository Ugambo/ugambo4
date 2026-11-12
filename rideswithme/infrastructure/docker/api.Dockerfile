# syntax=docker/dockerfile:1.7
# Builds two images from the monorepo:
#   --target api      the NestJS API
#   --target migrate  the database migration runner (run once per deploy, before the API)
# Build from the monorepo root: docker build -f infrastructure/docker/api.Dockerfile --target api .

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --offline
RUN pnpm turbo run build --filter=@rideswithme/api...
# Self-contained production folders (workspace packages copied in, dev deps dropped).
RUN pnpm --filter=@rideswithme/api deploy --prod --legacy /out/api \
 && pnpm --filter=@rideswithme/database deploy --prod --legacy /out/migrate

FROM ${NODE_IMAGE} AS migrate
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/migrate ./
USER node
CMD ["node", "dist/cli.js", "up"]

FROM ${NODE_IMAGE} AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/api ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
