# syntax=docker/dockerfile:1
# Build context: repo root. The image tag must match @playwright/test in e2e/package.json.

FROM mcr.microsoft.com/playwright:v1.64.1-noble
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=1
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY e2e/package.json e2e/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @um/e2e --ignore-scripts
COPY tsconfig.base.json ./
COPY e2e e2e
WORKDIR /repo/e2e
CMD ["pnpm", "exec", "playwright", "test"]
