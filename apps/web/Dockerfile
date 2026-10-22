# syntax=docker/dockerfile:1
# Build context: repo root (`docker build -f apps/web/Dockerfile .`).

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

# --- build: Next.js standalone bundle ---
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @um/web...
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @um/shared build && pnpm --filter @um/web build

# --- runtime: only the traced server files and static assets ---
FROM node:22-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=10 \
  CMD wget -qO /dev/null http://127.0.0.1:3000/sign-in || exit 1
CMD ["node", "apps/web/server.js"]
