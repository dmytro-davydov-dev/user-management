# Testing

Each business rule is tested at the cheapest layer that can prove it. Integration tests use a real PostgreSQL, because the rules that matter most (row locks, cascades, conditional updates) live in the database. The full case-by-case matrix (U1–U5, I1–I14, C1–C7, E1–E6) is in the [detailed implementation plan](user-management-detailed-implementation-plan.md#test-matrix).

## Layers

| Layer | Runner | Where | What it covers |
| --- | --- | --- | --- |
| Shared contracts | Vitest | `packages/shared/src/*.test.ts` | Trimming, email normalization, strict update schema, password confirmation, page-size cap |
| API unit | Vitest + SWC | `apps/api/src/**/*.test.ts`, `apps/api/test/unit/` | Exception mapping, validation pipe, password hashing, public-user mapper, `SessionGuard`, session expiry, env parsing, `/health` |
| API integration | Vitest + Supertest | `apps/api/test/integration/` | Every endpoint against a real database: pagination boundaries, timestamps, inactive rules, cascade, concurrency (I9, I10), guard coverage, OpenAPI completeness |
| Web unit / component | Vitest (node + jsdom), React Testing Library | `apps/web/src/**/*.test.{ts,tsx}` | BFF proxy and auth handlers (cookie flags, header injection, allowlist, CSRF checks, 401/503 handling), middleware redirects, API client and the central 401 redirect |
| End to end | Playwright | Phase 9 | User journeys against the Compose stack |

## Running

```bash
pnpm test                            # shared + API unit + web (builds shared first)
pnpm --filter @um/shared test
pnpm --filter @um/api test           # API unit
pnpm --filter @um/api test:int       # API integration (needs PostgreSQL)
pnpm --filter @um/web test           # web unit + component
```

Run one file or test: `pnpm --filter @um/api exec vitest run src/auth/session.guard.test.ts -t "malformed"`.

## Integration test database

Integration tests truncate tables, so they **never use the dev database**:

- `TEST_DATABASE_URL` if set, otherwise `DATABASE_URL` with `_test` appended to the database name (`user_management` → `user_management_test`).
- The Vitest global setup creates that database if it's missing and runs `prisma migrate deploy` once per run. Set `SKIP_TEST_DB_MIGRATE=1` to skip the migration step.
- Files run sequentially (`fileParallelism: false`), and each test starts from `TRUNCATE sessions, users`.
- `createTestApp()` boots the full `AppModule` and listens on a random port; `createAuthSession()` inserts a user plus an active session and returns the `X-Session-Id` header to use.

Start the database first: `docker compose up -d db`.

## Notable tests

- **I9, concurrency:** 10 parallel sign-ins → `loginsCount` grows by exactly 10, with 10 distinct sessions.
- **I10, race:** an uncommitted deactivation holds the user row while a sign-in starts; the sign-in must wait and get 403. This was checked by removing `FOR UPDATE`, which makes the test fail.
- **I13, guard coverage:** every protected route returns 401 without a session header.
- **I14 and the mapper test:** no response body anywhere contains `password` or an Argon2 hash.
- **OpenAPI completeness:** the generated document contains exactly the 9 public endpoints.
- **BFF cookie flags:** `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` from the TTL, and `Secure` only when `COOKIE_SECURE=true`. The session ID never appears in a BFF response body.

## Conventions

- Tests live next to the code (`*.test.ts`), except API tests that need the HTTP app or the database (`apps/api/test/`).
- Web tests run in Node by default; component tests opt into the DOM with `// @vitest-environment jsdom`.
- `server-only` is aliased to an empty module in the web Vitest config so server modules can be imported in tests.
- The web BFF tests stub `fetch` (the BFF → API hop) with helpers from `src/test/bff.ts`.
