# Testing

Each business rule is tested at the cheapest layer that can prove it. Integration tests use a real PostgreSQL, because the rules that matter most (row locks, cascades, conditional updates) live in the database. The full case-by-case matrix (U1–U5, I1–I14, C1–C7, E1–E6) is in the [detailed implementation plan](user-management-detailed-implementation-plan.md#test-matrix).

## Layers

| Layer | Runner | Where | What it covers |
| --- | --- | --- | --- |
| Shared contracts | Vitest | `packages/shared/src/*.test.ts` | Trimming, email normalization, strict update schema, password confirmation, page-size cap |
| API unit | Vitest + SWC | `apps/api/src/**/*.test.ts`, `apps/api/test/unit/` | Exception mapping, validation pipe, password hashing, public-user mapper, `SessionGuard`, session expiry, env parsing, `/health` |
| API integration | Vitest + Supertest | `apps/api/test/integration/` | Every endpoint against a real database: pagination boundaries, timestamps, inactive rules, cascade, concurrency (I9, I10), guard coverage, OpenAPI completeness |
| Web unit / component | Vitest (node + jsdom), React Testing Library | `apps/web/src/**/*.test.{ts,tsx}` | BFF proxy and auth handlers (cookie flags, header injection, allowlist, CSRF checks, 401/503 handling), middleware redirects, API client and the central 401 redirect, sign-up/sign-in forms (validation, server-error mapping, pending state, redirect), users dashboard (pagination, URL page, loading/empty/error, create/edit/delete, own-account rules), axe-core checks of the auth pages and dashboard |
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
- **C1, password mismatch:** the sign-up form shows "Passwords do not match" and `fetch` is never called.
- **Auth pages, axe:** both pages are rendered inside the auth layout and checked with axe-core (zero violations). `color-contrast` is disabled there because jsdom has no layout; contrast is left to the Playwright run.
- **C3–C6, dashboard:** 13 users → pages of 6 / 6 / 1 with `?page=` in the URL; skeleton, empty and error-with-retry states; names disabled for Inactive users and re-enabled live; delete needs confirmation, and deleting the last row of a page moves back one page. A failed delete leaves the table unchanged and triggers no refetch.
- **C7, theme:** `resolveThemeMode()`; the real `ThemeInitScript` markup is executed in jsdom to prove it applies a saved mode, falls back to the OS preference, and prefers the saved mode over the OS; the provider starts from storage or the OS, and a toggle writes `theme` to `localStorage` and updates the `<html>` class.
- **T8.3, card layout:** `UserCardList` shows one card per user with every table field, wires Edit/Delete to the right user, shows six busy skeleton cards, and has no axe violations; `UsersTable` shows the table and keeps the cards hidden by default.
- **T8.4, dialog focus:** each dialog focuses its first useful control (Delete focuses Cancel); Escape/Cancel returns focus to the opening button; after a delete, focus lands on the "Users" heading. The last check was confirmed to fail with the fix disabled.
- **BFF cookie flags:** `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` from the TTL, and `Secure` only when `COOKIE_SECURE=true`. The session ID never appears in a BFF response body.

## Conventions

- Tests live next to the code (`*.test.ts`), except API tests that need the HTTP app or the database (`apps/api/test/`).
- Web tests run in Node by default; component tests opt into the DOM with `// @vitest-environment jsdom`.
- `server-only` is aliased to an empty module in the web Vitest config so server modules can be imported in tests.
- The web BFF tests stub `fetch` (the BFF → API hop) with helpers from `src/test/bff.ts`.
- Dashboard tests use `installUsersApi()` (`src/test/users-api.ts`): an in-memory `/api/users` that keeps state across requests, so "mutate, then refetch" shows the real outcome. `failNext()` and `hold()` simulate errors and slow responses.
- `src/test/navigation.ts` stands in for `next/navigation`: `useSearchParams` follows `window.location`, and `history.pushState`/`replaceState` re-render it, as in Next.js. Load it with `vi.mock('next/navigation', async () => (await import('@/test/navigation')).navigationMock)`.
- An open MUI dialog marks the page behind it `aria-hidden`; query the background with `{ hidden: true }`.
- Component tests render through `renderWithProviders()` (`src/test/render.tsx`: theme + a fresh query client), stub `fetch` for the browser → BFF hop and mock `next/navigation`'s `useRouter`.
