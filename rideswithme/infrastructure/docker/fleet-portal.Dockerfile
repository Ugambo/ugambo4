# syntax=docker/dockerfile:1.7
# Fleet portal (Next.js standalone server).
# Build from the monorepo root: docker build -f infrastructure/docker/fleet-portal.Dockerfile .

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --offline
RUN pnpm turbo run build --filter=@rideswithme/fleet-portal...

FROM ${NODE_IMAGE} AS fleet-portal
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3003 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/fleet-portal/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/fleet-portal/.next/static ./apps/fleet-portal/.next/static
USER node
EXPOSE 3003
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3003/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/fleet-portal/server.js"]
