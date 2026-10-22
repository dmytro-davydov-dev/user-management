# syntax=docker/dockerfile:1
# Build context: repo root (`docker build -f apps/api/Dockerfile .`).

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# --- build: install the API's workspace slice, compile shared + API ---
FROM base AS build
# `prisma generate` (postinstall) evaluates prisma.config.ts, which needs a URL; nothing connects.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma apps/api/prisma
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @um/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @um/shared build && pnpm --filter @um/api build
# Production node_modules only (workspace packages copied, not linked).
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @um/api deploy --prod --legacy --ignore-scripts /out \
 && node apps/api/scripts/prune-deploy.mjs /out

# --- migrate: one-shot `prisma migrate deploy` (needs the Prisma CLI, a dev dependency) ---
# Also runs the dev seed (`prisma db seed` → tsx) for the Compose `seed` profile.
FROM build AS migrate
WORKDIR /repo/apps/api
ENV DATABASE_URL= PATH=/repo/apps/api/node_modules/.bin:$PATH
# Sources keep their host file modes; make them readable for the non-root user.
RUN find /repo/apps/api /repo/packages -path '*/node_modules' -prune -o -exec chmod a+rX {} +
USER node
CMD ["prisma", "migrate", "deploy"]

# --- runtime ---
FROM node:22-alpine AS runtime
ENV NODE_ENV=production API_PORT=4000
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=10 \
  CMD wget -qO /dev/null http://127.0.0.1:4000/health || exit 1
CMD ["node", "dist/main.js"]
