# Full-Stack User Management — Implementation Plan

**Source:** supplied back-office full-stack challenge PDF (Google Drive).  
**Deliverable:** Git repository, fully runnable using Docker Compose.  
**Naming:** Use generic project branding only; do not mention the hiring company in code, README, UI, or public repository.

## 1. Requirements checklist

- Node.js >=22, TypeScript >=5, Next.js >=15, Playwright >=1.50.
- Backend REST API: create/list/update/delete users; create/terminate sessions.
- User fields: ID, firstName, lastName, status (active/inactive), loginsCount, createdAt, updatedAt.
- Session fields: ID, userId, createdAt, terminatedAt.
- Immutable createdAt; updatedAt changes on every successful user modification.
- Inactive users cannot change firstName/lastName or create sessions.
- Signup/signin with passwords; confirm password on client before request; successful signup/signin starts session.
- Session identifier returned from auth is sent with every subsequent authenticated backend request.
- Dashboard accessible only to authenticated users; CRUD users; six users per page.
- Theme light/dark persisted across browser restarts.
- Automated tests, README, containerization, meaningful Git history.

## 2. Recommended architecture

**Monorepo:** pnpm workspaces (or npm workspaces) with two TypeScript apps and shared API types.

- **web:** Next.js 15+ App Router, React, MUI, React Hook Form + Zod, TanStack Query (or RTK Query). Next.js provides signup, signin and dashboard routes; client fetches API through same-origin `/api/*` reverse proxy or Next rewrites.
- **api:** NestJS on Node 22 (Express adapter), REST controllers, services, DTO validation, centralized errors, authentication guard.
- **db:** PostgreSQL 16+ via Prisma ORM/migrations.
- **tests:** Vitest/Jest + Supertest for backend; React Testing Library for UI; Playwright for end-to-end.
- **runtime:** Docker Compose with `web`, `api`, `db`, and optional `e2e` profile.

```text
Browser
  |
  v
Next.js web :3000 -- /api/* proxy --> NestJS api :4000 --> PostgreSQL :5432
  |                                   |
  +-- signup / signin / dashboard     +-- users / sessions / auth
  +-- theme preference                +-- validation + session guard
```

**Why separate services?** Clear API ownership and straightforward isolated tests; Next.js remains the required UI framework. An integrated Next.js backend would also be valid, but a separate NestJS service makes the Node REST requirement explicit.

## 3. Suggested repository layout

```text
user-management/
  apps/
    web/
      app/(auth)/sign-up/page.tsx
      app/(auth)/sign-in/page.tsx
      app/(protected)/dashboard/page.tsx
      components/{auth,users,layout}/
      lib/{api-client,session,theme}/
      tests/
      Dockerfile
    api/
      src/modules/{auth,users,sessions}/
      src/common/{guards,filters,validation}/
      prisma/{schema.prisma,migrations/,seed.ts}
      test/
      Dockerfile
  packages/shared/src/
  e2e/{auth.spec.ts,users.spec.ts,theme.spec.ts}
  compose.yaml
  .env.example
  playwright.config.ts
  pnpm-workspace.yaml
  README.md
```

## 4. Data model and invariants

**User**

| Field | Database definition | Notes |
|---|---|---|
| id | UUID PK | Server-generated |
| first_name / last_name | varchar(100) NOT NULL | Trim; reject empty |
| email | varchar(255) UNIQUE NOT NULL | Additional field required to identify signin account |
| password_hash | text NOT NULL | Additional field; never returned in API |
| status | enum ACTIVE/INACTIVE | Default ACTIVE |
| logins_count | integer NOT NULL DEFAULT 0 | Increment only on successful signin/session creation; define signup behavior explicitly |
| created_at | timestamptz DEFAULT now() | Immutable |
| updated_at | timestamptz | Updated on successful user mutation |

**Session**

| Field | Database definition | Notes |
|---|---|---|
| id | UUID PK | Opaque session identifier |
| user_id | UUID FK -> users.id | Define deletion behavior |
| created_at | timestamptz DEFAULT now() | Immutable |
| terminated_at | timestamptz NULL | NULL means active; also consider expiry |
| expires_at | timestamptz | Recommended additional security field |

Indexes: `users(email)` unique, `users(created_at,id)` for stable pagination, `sessions(user_id,terminated_at)`. Store password with Argon2id (or bcrypt). Never persist plaintext passwords.

**Critical transactional rules:** create session and increment loginsCount in one DB transaction; reject inactive users atomically (guard against status change race). Update user using a conditional `WHERE status='ACTIVE'` when changing names, or use a transaction with appropriate concurrency protection. Terminating a session sets `terminatedAt` only once; repeated termination can return 204 for idempotency. Delete user transactionally and decide whether sessions cascade or are explicitly revoked; recommend revoke/delete associated sessions. Exclude `createdAt`, `updatedAt`, `loginsCount`, `passwordHash` from general update DTO.

## 5. REST API contract

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/auth/sign-up` | Register, create session, return session ID | Public |
| POST | `/auth/sign-in` | Verify email/password, create session, return session ID | Public |
| GET | `/auth/me` | Current session + safe user profile | Session |
| POST | `/sessions` | Create session for authenticated/verified identity | See note |
| DELETE | `/sessions/:id` | Terminate own session / log out | Session |
| GET | `/users?page=1&limit=6` | Paginated list | Session |
| POST | `/users` | Admin creates user | Session |
| PATCH | `/users/:id` | Update allowed fields/status | Session |
| DELETE | `/users/:id` | Delete user | Session |

**Session creation note:** The challenge asks for `POST /sessions`, but exposing arbitrary user-ID session creation would permit impersonation. Implement `/auth/sign-in` as a credential-verified entry point that internally invokes SessionService, and expose `POST /sessions` only with verified credentials or an authenticated, authorized flow. Never accept just a `userId` from an unauthenticated caller.

**Authentication transport:** Return `{ id: sessionId, user: {...} }` from signup/signin as the challenge specifies. Send `X-Session-Id: <uuid>` on authenticated API requests (or `Authorization: Session <id>`), validate active/non-expired session on every request, and use an HttpOnly Secure SameSite cookie in a production hardening iteration. For browser security, avoid localStorage for session secrets. Prefer a same-origin Next.js BFF that sets an HttpOnly cookie and forwards the session ID header server-side; this still ensures the backend receives the identifier on each authenticated request. Document the choice explicitly.

Response shape for list:

```json
{
  "data": [{ "id": "uuid", "firstName": "Ada", "lastName": "Lovelace", "status": "ACTIVE", "loginsCount": 1, "createdAt": "...", "updatedAt": "..." }],
  "pagination": { "page": 1, "limit": 6, "total": 17, "totalPages": 3 }
}
```

Use stable sorting `createdAt DESC, id DESC`, enforce `limit=6` for dashboard requests, validate page >= 1. Return 400 for invalid input, 401 for missing/invalid session, 403 for inactive/disallowed operations, 404 for missing resources, 409 for duplicate email; consistent `{ code, message, details? }` error contract. Never expose hashes.

## 6. Frontend flow

1. On app entry, call `/auth/me` via the BFF. If authenticated redirect to `/dashboard`; otherwise show `/sign-up` (as explicitly requested). Provide link to `/sign-in`.
2. Signup form: first/last name, email, password, confirm password; client Zod cross-field match check before request; server validates all fields independently.
3. Signin form: email + password. On success establish session, invalidate auth cache, navigate to dashboard.
4. Dashboard: paginated table with exactly 6 users per page; columns name, email, status, login count, created/updated; create/edit dialogs and delete confirmation; loading, empty, error and optimistic/non-optimistic mutation states.
5. Disallow editing first/last names for inactive users in UI **and** API. Allow status change back to ACTIVE as an explicit administrative action; then names may be edited.
6. Logout calls session termination, clears cookie, redirects to `/sign-in`. Expired/terminated sessions trigger consistent 401 handling and redirect.
7. MUI ThemeProvider with light/dark switch; persist only theme choice to localStorage; avoid SSR hydration flash by initializing preference carefully (cookie or pre-hydration script).

**Authorization caveat:** The challenge explicitly assumes any logged-in user is the server admin. State this as a deliberate exercise simplification; production would require roles/permissions and server-side RBAC.

## 7. Docker Compose runtime

Create `compose.yaml` with three primary services:

- `db`: `postgres:16-alpine`; named volume `postgres_data`; `pg_isready` healthcheck; internal port 5432.
- `api`: multi-stage Node 22 Alpine image; build workspace and Prisma client; expose 4000 internally; `DATABASE_URL=postgresql://...@db:5432/...`; depends on healthy db; startup executes `prisma migrate deploy` **before** API startup (or separate one-shot `migrate` service to avoid migration races).
- `web`: multi-stage Node 22 image; Next.js standalone output; publish `3000:3000`; proxy API to `http://api:4000` on Docker network; depends on healthy API.

Example service skeleton (adapt workspace build contexts/scripts to actual implementation):

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-localdev}
      POSTGRES_DB: user_management
    volumes: [postgres_data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d user_management"]
      interval: 5s
      retries: 10

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://app:${POSTGRES_PASSWORD:-localdev}@db:5432/user_management
      PORT: 4000
    depends_on:
      db: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      retries: 10

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    environment:
      NODE_ENV: production
      API_INTERNAL_URL: http://api:4000
      PORT: 3000
    ports: ["3000:3000"]
    depends_on:
      api: { condition: service_healthy }

volumes:
  postgres_data:
```

**Important:** This is an architectural skeleton, not a runnable Compose file until Dockerfiles, API health endpoint, migrations and application code exist. For Next.js BFF use server-only `API_INTERNAL_URL` rather than exposing `api` hostname to the browser. Avoid exposing Postgres and API ports by default. Use `.dockerignore`, non-root runtime user, locked dependency versions, and a multi-stage build.

Developer commands to document in README:

```bash
cp .env.example .env
docker compose up --build -d
docker compose ps
docker compose logs -f api web
docker compose down
# destructive reset (document warning): docker compose down -v
```

Use a one-shot migration service or an API entrypoint that runs `prisma migrate deploy` before boot. Add an optional seed command to create sample users; never ship shared credentials in public production configuration.

## 8. Testing strategy

**Backend unit tests:** name validation, inactive-user restrictions, immutable timestamps, login counter, credential verification, session expiry/termination, DTO sanitization.

**Backend integration tests (real test PostgreSQL):** signup creates user+session; signin increments count exactly once; inactive signin forbidden; pagination boundary (0/6/7/13 users); update timestamps; delete revokes sessions; concurrent session creation; duplicate email conflict; unauthenticated requests rejected.

**Frontend component tests:** password mismatch blocks network call; form validation; loading/errors; six rows/page; disabled name inputs for inactive users; theme toggle persists; delete confirmation.

**Playwright E2E (>=1.50):** unauthenticated route protection; signup -> dashboard -> logout -> signin; CRUD operations; 7+ users yields second page; theme persists after reload; terminated session no longer works; inactive user cannot sign in; mobile viewport smoke test.

Use deterministic isolated test DB, factory-generated users, test cleanup, and run Playwright against Docker Compose stack or dedicated test profile. Aim for meaningful domain coverage, not arbitrary 100% coverage. CI gates: lint, typecheck, unit/integration, Playwright smoke, Docker build.

## 9. Execution plan and commit sequence

| Stage | Implementation | Example commit |
|---|---|---|
| 1 | Initialize monorepo, lint, TS strict, shared contracts, env sample | `chore: bootstrap TypeScript monorepo` |
| 2 | Prisma schema, migration, seed, Postgres Compose | `feat(api): add user and session persistence` |
| 3 | Users REST endpoints + validation + integration tests | `feat(api): implement user management` |
| 4 | Signup/signin, password hashing, session guard, logout | `feat(auth): implement session authentication` |
| 5 | Next.js shell, MUI theme, API BFF/cookie handling | `feat(web): add app shell and session integration` |
| 6 | Signup/signin UX, redirects and protected dashboard | `feat(web): add authentication flows` |
| 7 | Paginated user table and create/edit/delete dialogs | `feat(web): implement user dashboard` |
| 8 | Theme persistence and UI refinements | `feat(web): persist theme preference` |
| 9 | E2E suite and CI | `test: cover core user journeys with Playwright` |
| 10 | Production Dockerfiles, Compose verification, README | `docs: document Docker Compose setup and tradeoffs` |

**Suggested priority:** Complete vertical slice (signup -> signin -> dashboard -> logout) early, then CRUD and polish. Commit after each verified slice. Reserve final time for cold-start Compose and E2E verification.

## 10. Definition of done

- `docker compose up --build` works from clean checkout with `.env` prepared; migrations apply; UI reachable at `http://localhost:3000`.
- All listed endpoints implemented and documented with sample requests or OpenAPI.
- Passwords securely hashed; session ID checked on every authenticated request; logout invalidates session.
- No inactive user can create a session or change names; createdAt cannot be edited; updatedAt maintained.
- Exactly six users per dashboard page, including proper total/page navigation.
- Light/dark theme persists after browser restart.
- Unit, integration and Playwright tests pass in a documented reproducible workflow.
- README includes architecture, prerequisites, env vars, setup, commands, tests, design decisions, known limitations, future improvements.
- Repository history has granular, meaningful commits; no hiring-company branding anywhere.

## 11. Tradeoffs and future improvements (explicit README section)

- Session-ID contract is challenge-specific; production should use hardened HttpOnly cookies, CSRF protection for cookie-authenticated state-changing requests, rotation, revocation and expiration policy.
- Treat-all-users-as-admin is required exercise behavior, **not** production authorization; add RBAC, audit trails and least privilege.
- Add rate limiting to signin/signup, email verification, password reset, account lockout safeguards and security event logs.
- Offset pagination is adequate for this small admin UI; consider cursor pagination for very large datasets.
- Add structured logs, request IDs, metrics/traces, health/readiness, backup/restore and CI vulnerability scans for production.
- Clarify ambiguous semantics in README: whether signup increments loginsCount (recommended: yes, when its session is created), whether user deletion hard-deletes (exercise) or soft-deletes (production), whether admins may reactivate inactive users (recommended: yes).
- Document failure behavior: database unavailable -> 503; invalid session -> 401; simultaneous update conflicts -> conditional update or optimistic version field.
