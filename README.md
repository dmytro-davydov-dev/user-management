# User Management

Full-stack back-office app for managing users and their sessions: sign-up / sign-in, a protected dashboard with paginated user CRUD, and a persisted light/dark theme. Runs with a single `docker compose up`.

> **Status:** work in progress. Phases 1–3 (bootstrap, persistence, users API) are done; see the [detailed implementation plan](docs/user-management-detailed-implementation-plan.md) for current progress.

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

## Environment variables

See [`.env.example`](.env.example): `POSTGRES_PASSWORD`, `DATABASE_URL`, `API_PORT`, `SESSION_TTL_HOURS`, `API_INTERNAL_URL`, `COOKIE_SECURE`.

## Conventions

- Conventional Commits; lint and format run on pre-commit (Husky + lint-staged).
- Errors use `{ code, message, details? }`; dates are ISO 8601 UTC.
