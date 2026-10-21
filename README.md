# User Management

Full-stack back-office app for managing users and their sessions: sign-up / sign-in, a protected dashboard with paginated user CRUD, and a persisted light/dark theme. Runs with a single `docker compose up`.

> **Status:** work in progress. Phases 1–7 (bootstrap, persistence, users API, auth & sessions, web shell & BFF, sign-up/sign-in, users dashboard) are done; see the [detailed implementation plan](docs/user-management-detailed-implementation-plan.md) for current progress.

## Documentation

| Doc                                                                         | Covers                                                                                              |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [Architecture](docs/architecture.md)                                        | Components, request lifecycle, shared contracts, repository layout, tech stack                      |
| [Data model](docs/data-model.md)                                            | Tables, indexes, invariants and how they're enforced, migrations, seed data                         |
| [REST API reference](docs/api.md)                                           | All endpoints with examples, validation rules, the error format and codes                           |
| [Authentication & sessions](docs/auth-and-sessions.md)                      | Passwords, sign-up/sign-in, session lifecycle, the session guard, race conditions                   |
| [Web app & BFF](docs/web-app.md)                                            | Next.js routes, BFF handlers, session cookie, route protection, client data layer, theming          |
| [Testing](docs/testing.md)                                                  | Test layers, how to run them, the integration test database, notable tests                          |
| [Development guide](docs/development.md)                                    | Setup, environment variables, commands, working on the code, troubleshooting                        |
| [Design decisions](docs/decisions.md)                                       | Key choices and alternatives, open-decision defaults, version pins, known limitations               |
| [Implementation plan](docs/user-management-detailed-implementation-plan.md) | Phases, tasks, test matrix, progress ([original plan](docs/user-management-implementation-plan.md)) |

## Architecture at a glance

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

- **web**: Next.js 15, MUI, TanStack Query. Its BFF keeps the session ID in an HttpOnly cookie and adds it to every API call server-side, so the browser never sees the API host or the session ID. → [web-app.md](docs/web-app.md)
- **api**: NestJS 11 REST API: users CRUD, sign-up / sign-in, session create / terminate, a global session guard and one `{ code, message, details? }` error format. → [api.md](docs/api.md), [auth-and-sessions.md](docs/auth-and-sessions.md)
- **db**: PostgreSQL 16 via Prisma migrations. → [data-model.md](docs/data-model.md)
- **shared**: Zod schemas and types used by both apps for validation, OpenAPI and client types. → [architecture.md](docs/architecture.md#shared-contracts-packagesshared)

## Domain rules

- **User:** id, firstName, lastName, email, status (`ACTIVE` / `INACTIVE`), loginsCount, createdAt (immutable), updatedAt (bumped on every change).
- **Session:** id, userId, createdAt, terminatedAt, expiresAt.
- Inactive users can't change their names or start sessions.
- Successful sign-up or sign-in creates a session and increments `loginsCount` in one transaction.
- Passwords are hashed with Argon2id and never returned.
- The dashboard shows six users per page.
- Any signed-in user acts as admin (exercise simplification; production would need RBAC).
- **Your own account:** you can rename, deactivate or delete yourself. Deleting yourself ends all your sessions and signs you out. Deactivating yourself keeps your current session until you sign out, but you can't sign in again (or rename yourself) until someone reactivates you; the UI warns before both. Details: [web-app.md](docs/web-app.md#your-own-account).

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

Full reference with examples: [docs/api.md](docs/api.md). Swagger UI runs at `http://localhost:4000/docs` outside production.

## Quick start

Prerequisites: Node 22 (`.nvmrc`), pnpm 10 (via Corepack), Docker.

```bash
corepack enable
pnpm install
cp .env.example .env

docker compose up -d db               # PostgreSQL
pnpm --filter @um/api db:migrate      # apply migrations
pnpm --filter @um/api db:seed         # optional sample data
pnpm --filter @um/api dev             # API on http://localhost:4000
pnpm --filter @um/web dev             # web on http://localhost:3000
```

Checks:

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @um/api test:int        # API integration tests (real PostgreSQL)
```

Full stack in Docker Compose (once the services land in Phase 10):

```bash
docker compose up --build -d          # app at http://localhost:3000
docker compose down                   # add -v to wipe the database
```

Environment variables, every command and troubleshooting tips: [docs/development.md](docs/development.md). Test layers and the test database: [docs/testing.md](docs/testing.md).

## Tech stack

Node 22 · TypeScript 5.9 (strict) · pnpm workspaces · Next.js 15 · NestJS 11 · Prisma 7 · PostgreSQL 16 · MUI 6 · TanStack Query · Zod 4 · Vitest · Supertest · React Testing Library · Playwright · Docker Compose

## Conventions

- Conventional Commits; lint and format run on pre-commit (Husky + lint-staged).
- Errors use `{ code, message, details? }`; dates are ISO 8601 UTC.
- Design tradeoffs and known limitations are tracked in [docs/decisions.md](docs/decisions.md).
