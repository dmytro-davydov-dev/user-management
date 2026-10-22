# Development guide

Setting up, running and working on the project locally. For testing details see [testing.md](testing.md).

## Prerequisites

- Node **22** (`.nvmrc`)
- pnpm **10** via Corepack (`corepack enable`; the version is pinned in `package.json` → `packageManager`)
- Docker with Compose v2.24+ (PostgreSQL for host-side dev, the full stack, and E2E)

## First run

```bash
corepack enable
pnpm install                      # also generates the Prisma client
cp .env.example .env              # one .env at the repo root, read by both apps

docker compose up -d db           # PostgreSQL on 127.0.0.1:5433
pnpm --filter @um/api db:migrate  # apply migrations
pnpm --filter @um/api db:seed     # optional: admin + 13 sample users

pnpm --filter @um/api dev         # API  → http://localhost:4000  (Swagger: /docs)
pnpm --filter @um/web dev         # web  → http://localhost:3000
```

Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env` (once the sign-in form lands in Phase 6), or sign up a new user.

## Environment variables

All variables are listed in [`.env.example`](../.env.example). Both apps validate their environment with Zod at startup (API) or per request (web) and fail with a readable message.

| Variable | Used by | Default | Purpose |
| --- | --- | --- | --- |
| `POSTGRES_PASSWORD` | Compose `db` | `localdev` | Database password |
| `POSTGRES_PORT` | Compose `db` | `5433` | Host port (5433 avoids clashing with a local Postgres on 5432) |
| `DATABASE_URL` | API, Prisma, seed, tests | — (required) | `postgresql://…` connection string |
| `TEST_DATABASE_URL` | Integration tests | `DATABASE_URL` + `_test` | Override the test database |
| `API_PORT` | API | `4000` | Listen port |
| `SESSION_TTL_HOURS` | API, web | `24` | Session expiry and session-cookie `Max-Age` |
| `NODE_ENV` | API, seed | `development` | `production` disables Swagger and the seed |
| `API_INTERNAL_URL` | web (server only) | `http://localhost:4000` | Where the BFF reaches the API |
| `COOKIE_SECURE` | web | `false` | `true` behind HTTPS |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | seed | `admin@example.com`, `change-me-locally` | Dev admin account |
| `WEB_PORT` | Compose `web` | `3000` | Host port for the web container |
| `E2E_BASE_URL` | Playwright | `http://localhost:3000` | Stack the E2E suite runs against |

## Commands

From the repo root:

| Command | Does |
| --- | --- |
| `pnpm build` | Build every package (shared → api, web) |
| `pnpm typecheck` | Build shared, then typecheck all packages (web runs `next typegen` first) |
| `pnpm lint` | ESLint across the repo |
| `pnpm format` / `pnpm format:check` | Prettier write / check |
| `pnpm test` | Unit and component tests for all packages |
| `pnpm e2e` | Playwright against `E2E_BASE_URL` |
| `pnpm e2e:docker` | Playwright against a fresh, isolated Compose stack (as in CI) |

Per app:

| Command | Does |
| --- | --- |
| `pnpm --filter @um/api dev` | API with watch mode |
| `pnpm --filter @um/api test:int` | API integration tests |
| `pnpm --filter @um/api db:generate` | Regenerate the Prisma client |
| `pnpm --filter @um/api db:migrate` | `prisma migrate deploy` |
| `pnpm --filter @um/api db:migrate:dev --name <x>` | Create a new migration from schema changes |
| `pnpm --filter @um/api db:seed` | Seed dev data (idempotent) |
| `pnpm --filter @um/web dev` | Next.js dev server on :3000 |
| `pnpm --filter @um/web build` | Production build (`.next/standalone`) |

## Docker Compose

`compose.yaml` runs the full stack: `db` (healthchecked, named volume `postgres_data`), a one-shot `migrate` (`prisma migrate deploy`), `api` (starts after `migrate` completes, healthchecked on `/health`) and `web` (starts once `api` is healthy, published on `WEB_PORT`). Only `web` is meant for the browser; `db` is also bound to `127.0.0.1:5433` for host-side dev and integration tests. The `e2e` profile adds the Playwright runner.

```bash
docker compose up --build -d   # app at http://localhost:3000
docker compose ps              # all services healthy, migrate exited (0)
docker compose up -d db        # database only, for host-side dev
docker compose down            # keeps data
docker compose down -v         # destructive: wipes the database volume
pnpm e2e:docker                # E2E in a separate, throwaway project (see testing.md)
```

Images (build context is the repo root, see `.dockerignore`): `apps/api/Dockerfile` has `migrate` and `runtime` targets (`pnpm deploy --prod`, non-root); `apps/web/Dockerfile` ships the Next standalone server (non-root); `e2e/Dockerfile` is based on the Playwright image.

## Working on the code

- **Change a request or response shape:** edit the Zod schema in `packages/shared`, then run `pnpm build:shared`. The API validation, the OpenAPI docs and the web client types all follow from it.
- **Add an API endpoint:** controller method with `ZodValidationPipe` and Swagger decorators (`ApiJsonBody`, `ApiJsonResponse`, `ApiErrors` from `src/docs/openapi.ts`). Routes are protected by default; add `@Public()` only on purpose. Extend the OpenAPI completeness test.
- **Expose an endpoint to the browser:** add it to the BFF allowlist (`PROXIED_PATH` in `app/api/[...path]/route.ts`) only if its response never contains a session ID. Otherwise write a dedicated handler.
- **Throw errors** with `ApiException(status, code, message, details?)` so they match the shared error shape.

## Conventions

- Conventional Commits (`feat(api): …`, `fix(web): …`, `docs: …`), one verified task group per commit.
- The pre-commit hook (Husky + lint-staged) runs ESLint `--fix` and Prettier on staged files.
- TypeScript strict with `noUncheckedIndexedAccess`; type-only imports are enforced (`consistent-type-imports`).
- Errors use `{ code, message, details? }`; dates are ISO 8601 UTC.
- No hiring-company branding anywhere in code, docs or history.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Invalid environment configuration` on API start | Check `DATABASE_URL` in the root `.env` |
| `/health` returns 503 | Database not running: `docker compose up -d db` |
| Cannot find module `../generated/prisma/client` | `pnpm --filter @um/api db:generate` |
| Web typecheck complains about missing route types | `pnpm --filter @um/web typecheck` runs `next typegen` first; don't call `tsc` directly |
| Port 5432 already in use | Compose uses host port 5433 by default (`POSTGRES_PORT`) |
| Stuck redirecting between `/sign-in` and `/dashboard` | Shouldn't happen (see [web-app.md](web-app.md#stale-cookies)). Clear the `sid` cookie and report it |
