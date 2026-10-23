# User Management

Full-stack back-office app for managing users and their sessions: sign-up / sign-in, a protected dashboard with paginated user CRUD, and a persisted light/dark theme. Runs with a single `docker compose up`.

**What's in it**

- **Backend:** REST API for users and sessions, covering create, list (paginated), update, delete, sign-up, sign-in and session termination. It enforces the domain rules: `createdAt` is immutable, `updatedAt` is always bumped, inactive users can't be renamed or start sessions.
- **Sign-up / sign-in:** sign-up is the landing page, with links between it and sign-in. Passwords are typed twice and checked in the browser before the request goes out. Both flows start a session and open the dashboard, which takes the place of the welcome page and greets you with `Hello, <first name>`. A visit with an active session goes straight there. The session ID goes with every later request, and "Sign out" ends the session and returns to sign-in.
- **Dashboard:** only for signed-in users. Six users per page, with create, edit and delete; it switches to cards on phones.
- **Themes:** a light/dark toggle (the OS setting applies until you choose), remembered across browser restarts without a flash of the wrong theme.
- **Tests:** unit, component, API integration (real PostgreSQL) and Playwright E2E, all run in CI.
- **Containers:** `docker compose up --build` starts PostgreSQL, a one-shot migration, the API and the web app, with non-root images and healthchecks.

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

### Run it with Docker (only Docker needed)

Requires Docker with Compose v2.24+.

```bash
cp .env.example .env                  # defaults work as-is
docker compose up --build -d --wait   # db → migrate → api → web, waits until healthy
```

Open <http://localhost:3000> (set `WEB_PORT` in `.env` if 3000 is taken). You land on the sign-up page. Create an account, or load the sample data and sign in as `admin@example.com` / `change-me-locally`:

```bash
docker compose --profile seed run --rm --build seed   # admin + 13 sample users (idempotent)
docker compose ps                                     # db, api, web healthy; migrate exited (0)
docker compose down                                   # stop; add -v to wipe the database
```

Only the web app is published on the host. The browser talks to the Next.js server, which calls the API on the internal Compose network.

### Run it and develop on the host

Requires Node 22 (`.nvmrc`), pnpm 10 (via Corepack) and Docker for PostgreSQL.

```bash
corepack enable
pnpm install
cp .env.example .env

pnpm db:up                            # PostgreSQL on 127.0.0.1:5433
pnpm --filter @um/api db:migrate      # apply migrations
pnpm --filter @um/api db:seed         # optional sample data
pnpm --filter @um/api dev             # API on http://localhost:4000
pnpm --filter @um/web dev             # web on http://localhost:3000
```

Checks:

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm --filter @um/api test:int        # API integration tests (real PostgreSQL)
pnpm e2e:docker                       # Playwright E2E against a fresh Compose stack
```

Environment variables, every command and troubleshooting tips: [docs/development.md](docs/development.md). Test layers and the test database: [docs/testing.md](docs/testing.md).

## Testing

| Layer              | Tool                                | What it proves                                                                                                              |
| ------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Unit (API, shared) | Vitest                              | Validation, password hashing, session guard, error mapping                                                                  |
| Component (web)    | Vitest + React Testing Library      | Forms (including the password match check before any request), table and pagination, loading/empty/error states, theme      |
| Integration (API)  | Vitest + Supertest, real PostgreSQL | Every endpoint, domain rules, `loginsCount` under concurrent sign-ins, a deactivation racing a sign-in                      |
| End-to-end         | Playwright (Chromium + Pixel 7)     | Redirects, sign-up → dashboard → sign-out → sign-in, CRUD, pagination, theme after restart, revoked sessions, mobile layout |

CI (`.github/workflows/ci.yml`) runs lint, format, typecheck, unit and integration tests, then builds the images and runs the E2E suite against a fresh Compose stack. Details: [docs/testing.md](docs/testing.md).

## Tradeoffs, limitations and possible improvements for production

Full list with alternatives in [docs/decisions.md](docs/decisions.md). The main points:

- **Everyone is an admin.** The challenge asks for it. Production needs roles, server-side authorization and an audit trail.
- **Sessions are database rows.** That means instant revocation, at the cost of one query per request. IDs are stored as-is, never rotated and never purged. Next steps: hash them at rest, rotate on privilege changes, add a cleanup job and maybe a cache.
- **Account security is basic.** Argon2id hashing, an HttpOnly `SameSite=Lax` cookie and an Origin check in the BFF are in place. Missing: rate limiting, lockout, email verification and password reset.
- **Deactivating a user keeps their open sessions** until sign-out or the 24 h expiry; only new sessions are refused. Revoking at once would be a one-line change if needed.
- **Offset pagination.** Fine for a page-numbered UI at this scale; large or fast-changing tables would want cursor pagination.
- **Operations:** no structured logging, request IDs, metrics, tracing or backups yet. Migrations run as a one-shot Compose service; a real deployment would run them from the release pipeline.
- **Not implemented** because the challenge doesn't ask for them: avatars, search and sorting, i18n.

## Tech stack

Node 22 · TypeScript 5.9 (strict) · pnpm workspaces · Next.js 15 · NestJS 11 · Prisma 7 · PostgreSQL 16 · MUI 6 · TanStack Query · Zod 4 · Vitest · Supertest · React Testing Library · Playwright · Docker Compose

## Conventions

- Conventional Commits; lint and format run on pre-commit (Husky + lint-staged).
- Errors use `{ code, message, details? }`; dates are ISO 8601 UTC.
- Design tradeoffs and known limitations are tracked in [docs/decisions.md](docs/decisions.md).
