# User Management

Full-stack back-office app for managing users and their sessions: sign-up / sign-in, a protected dashboard with paginated user CRUD, and a persisted light/dark theme. Runs with a single `docker compose up`.

> **Status:** work in progress. Phases 1–5 (bootstrap, persistence, users API, auth & sessions, web shell & BFF) are done; see the [detailed implementation plan](docs/user-management-detailed-implementation-plan.md) for current progress.

## Architecture

```text
Browser
  │  same-origin requests, HttpOnly cookie "sid"
  ▼
Next.js web :3000 (App Router + BFF route handlers)
  │  server-side, adds X-Session-Id header
  ▼
NestJS api :4000 (REST, session guard, validation)
  │  Prisma
  ▼
PostgreSQL :5432
```

- **web** — Next.js 15, MUI, React Hook Form + Zod, TanStack Query. Its BFF keeps the session ID in an HttpOnly cookie and forwards it to the API on every request, so the browser never sees the API host or the session ID.
- **api** — NestJS 11 REST API: users CRUD, auth (sign-up / sign-in), session create / terminate, global session guard, consistent `{ code, message, details? }` errors.
- **db** — PostgreSQL 16 via Prisma migrations.
- **shared** — Zod schemas and inferred TypeScript types used by both apps.

Only `web` is published to the host; `api` and `db` stay on the Compose network.

## Repository layout

```text
apps/
  api/            NestJS REST API
  web/            Next.js app + BFF
packages/
  shared/         Zod contracts and types (@um/shared)
docs/             Implementation plans
```

## Domain rules

- **User:** id, firstName, lastName, email, status (`ACTIVE` / `INACTIVE`), loginsCount, createdAt (immutable), updatedAt (bumped on every change).
- **Session:** id, userId, createdAt, terminatedAt, expiresAt.
- Inactive users can't change their names or start sessions.
- Successful sign-up or sign-in creates a session and increments `loginsCount` in one transaction.
- Passwords are hashed with Argon2id and never returned.
- The dashboard shows six users per page.
- Any signed-in user acts as admin (challenge simplification; production would need RBAC).

## API overview

| Method | Path                    | Auth        |
| ------ | ----------------------- | ----------- |
| POST   | `/auth/sign-up`         | Public      |
| POST   | `/auth/sign-in`         | Public      |
| GET    | `/auth/me`              | Session     |
| POST   | `/sessions`             | Credentials |
| DELETE | `/sessions/:id`         | Session     |
| GET    | `/users?page=1&limit=6` | Session     |
| POST   | `/users`                | Session     |
| PATCH  | `/users/:id`            | Session     |
| DELETE | `/users/:id`            | Session     |

Users endpoints: `GET /users` returns `{ data, pagination: { page, limit, total, totalPages } }`, newest first; `limit` is capped at 6. `PATCH /users/:id` accepts only `firstName`, `lastName` and `status`; the status change is applied first, so reactivating and renaming in one request works, while deactivating and renaming is rejected with `403 USER_INACTIVE`. `DELETE /users/:id` returns 204 and removes the user's sessions.

Auth endpoints: sign-up, sign-in and `POST /sessions` return `{ id, user }`, where `id` is the session ID to send as `X-Session-Id` on every protected request (missing, unknown, terminated or expired → `401 UNAUTHORIZED`). Sign-up counts as the first login. Bad credentials return one generic `401 INVALID_CREDENTIALS` (unknown emails take the same argon2 path); inactive users get `403 USER_INACTIVE` and no session. `POST /sessions` takes `{ email, password }` only. `DELETE /sessions/:id` ends one of the caller's own sessions (another user's → 404) and is idempotent: repeating it with the same, already-ended session returns 204. Sessions last `SESSION_TTL_HOURS` (default 24 h, no sliding renewal).

Interactive API docs (Swagger UI) are served at `http://localhost:4000/docs` outside production; schemas are generated from the shared Zod contracts.

## Tech stack

Node 22 · TypeScript 5.9 (strict) · pnpm workspaces · Next.js 15 · NestJS 11 · Prisma · PostgreSQL 16 · Vitest · Supertest · React Testing Library · Playwright · Docker Compose

## Getting started

Prerequisites: Node 22 (`.nvmrc`), pnpm 10 (via Corepack), Docker.

```bash
corepack enable
pnpm install
cp .env.example .env

pnpm typecheck
pnpm lint
pnpm test
```

Run the stack on the host (database in Docker, apps with hot reload):

```bash
docker compose up -d db
pnpm --filter @um/api db:migrate      # apply migrations
pnpm --filter @um/api dev             # API on http://localhost:4000 (Swagger at /docs)
pnpm --filter @um/web dev             # web on http://localhost:3000
```

Both apps read the repo-root `.env`.

Web tests (BFF route handlers, middleware, API client):

```bash
pnpm --filter @um/web test
```

API tests:

```bash
pnpm --filter @um/api test       # unit tests
pnpm --filter @um/api test:int   # integration tests against real PostgreSQL
```

Integration tests never touch the dev database: they use `TEST_DATABASE_URL`, or `DATABASE_URL` with `_test` appended to the database name, which the test setup creates and migrates automatically. Start the database first (`docker compose up -d db`).

Docker Compose (once the services land):

```bash
docker compose up --build -d   # app at http://localhost:3000
docker compose down            # add -v to wipe the database
```

## Web app and BFF

The browser only ever talks to the Next.js app. Its route handlers act as a backend-for-frontend:

| BFF route                     | Does                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `POST /api/auth/sign-up`      | Calls the API, stores the returned session ID in the `sid` cookie, returns `{ user }` |
| `POST /api/auth/sign-in`      | Same as sign-up                                                                       |
| `POST /api/auth/sign-out`     | `DELETE /sessions/:id` on the API, then clears the cookie (even if the API is down)   |
| `GET /api/auth/me`            | Current `{ user }`; the session object is stripped                                    |
| `/api/users[/:id]`            | Proxied as-is with `X-Session-Id` taken from the cookie                               |
| `GET /api/auth/clear-session` | Drops a stale cookie and redirects to `/sign-in` or `/sign-up`                        |

- The `sid` cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` = `SESSION_TTL_HOURS`, and `Secure` when `COOKIE_SECURE=true`. Browser JavaScript can never read the session ID, and the API host is never exposed.
- Only `users` routes are proxied generically; anything that returns a session ID has a dedicated handler. State-changing requests from another origin (`Origin` / `Sec-Fetch-Site`) are rejected with 403 on top of `SameSite=Lax`.
- When the API answers 401, the BFF clears the cookie, and the client redirects to `/sign-in`. A wrong password on sign-in (`INVALID_CREDENTIALS`) does not redirect.
- `middleware.ts` routes optimistically on cookie presence (`/dashboard` without a cookie → `/sign-in`; auth pages with a cookie → `/dashboard`). The protected layout and `/` always confirm the session with `GET /auth/me` before rendering.

## Environment variables

See [`.env.example`](.env.example): `POSTGRES_PASSWORD`, `DATABASE_URL`, `API_PORT`, `SESSION_TTL_HOURS` (API session TTL and web cookie lifetime), `API_INTERNAL_URL` (server-side only), `COOKIE_SECURE`.

## Conventions

- Conventional Commits; lint and format run on pre-commit (Husky + lint-staged).
- Errors use `{ code, message, details? }`; dates are ISO 8601 UTC.
