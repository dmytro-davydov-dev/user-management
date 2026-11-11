# Future improvements

This doc lists what would have to change before the app could run in production with real users. Each item names the current gap (with the file that shows it), why it matters, and a proposed change. The short list of known limitations is in [decisions.md](decisions.md#known-limitations). This doc adds detail, adds gaps found in the code that aren't listed there, and sets priorities.

The app already has a solid base. These are in place and are **not** repeated below: Argon2id hashing, an HttpOnly `SameSite=Lax` session cookie behind a BFF, an Origin / `Sec-Fetch-Site` check, row-locked session creation, strict Zod validation, one error format, non-root multi-stage images with healthchecks, Swagger disabled in production, graceful shutdown hooks, and CI that runs unit, integration and E2E tests.

## Priorities

| Priority | Meaning |
| --- | --- |
| **P0** | Must fix before real users or real data |
| **P1** | Needed to run and support the service confidently |
| **P2** | Improves scale, product or developer experience |

## Summary

| # | Improvement | Area | Priority |
| --- | --- | --- | --- |
| 1 | [Roles and authorization (RBAC)](#1-roles-and-authorization-rbac) | Security | P0 |
| 2 | [Rate limiting and account lockout](#2-rate-limiting-and-account-lockout) | Security | P0 |
| 3 | [Security headers and CSP](#3-security-headers-and-csp) | Security | P0 |
| 4 | [Session hardening](#4-session-hardening) | Security | P0 |
| 5 | [Timeouts on BFF → API calls](#5-timeouts-on-bff--api-calls) | Reliability | P0 |
| 6 | [Secrets and database roles](#6-secrets-and-database-roles) | Security / Ops | P0 |
| 7 | [Audit trail](#7-audit-trail) | Security / Compliance | P1 |
| 8 | [Account lifecycle: email verification, password reset, MFA](#8-account-lifecycle-email-verification-password-reset-mfa) | Product / Security | P1 |
| 9 | [Structured logging and request IDs](#9-structured-logging-and-request-ids) | Observability | P1 |
| 10 | [Metrics, tracing and error tracking](#10-metrics-tracing-and-error-tracking) | Observability | P1 |
| 11 | [Liveness and readiness probes](#11-liveness-and-readiness-probes) | Ops | P1 |
| 12 | [Delivery pipeline](#12-delivery-pipeline) | CI/CD | P1 |
| 13 | [Supply-chain security](#13-supply-chain-security) | CI/CD / Security | P1 |
| 14 | [Backups and safe migrations](#14-backups-and-safe-migrations) | Data | P1 |
| 15 | [Concurrent edits (optimistic locking)](#15-concurrent-edits-optimistic-locking) | Correctness | P1 |
| 16 | [Soft delete and data retention](#16-soft-delete-and-data-retention) | Data / Compliance | P2 |
| 17 | [Scaling the read path](#17-scaling-the-read-path) | Performance | P2 |
| 18 | [Search, sort and filter](#18-search-sort-and-filter) | Product | P2 |
| 19 | [Test coverage reporting and further tests](#19-test-coverage-reporting-and-further-tests) | Quality | P2 |
| 20 | [API versioning and client generation](#20-api-versioning-and-client-generation) | API | P2 |
| 21 | [Frontend polish](#21-frontend-polish) | UX | P2 |

---

## Security

### 1. Roles and authorization (RBAC)

**Gap.** Every signed-in user can create, edit and delete every user, including other admins. The challenge asks for this, but no real back office can work this way. The API has authentication (`SessionGuard`) but no authorization layer.

**Proposal.**
- Add a `role` column (`ADMIN`, `OPERATOR`, `VIEWER`) and a `@Roles()` decorator checked by a second global guard after `SessionGuard`.
- Make public sign-up create a non-admin user, or remove public sign-up and let admins invite users.
- Stop a user from deleting or deactivating the last remaining admin, and require a confirmation step before acting on your own account.
- Hide actions in the UI based on role, while the API stays the authority.

### 2. Rate limiting and account lockout

**Gap.** `POST /auth/sign-in`, `/auth/sign-up` and `/sessions` have no rate limit, so anyone can try passwords as fast as the server answers. Argon2 makes each attempt costly, which also means a flood of attempts can tie up the API's CPU.

**Proposal.**
- Add `@nestjs/throttler` with a Redis store, so limits apply across replicas. Use tight limits on auth routes (for example 5 per minute per IP and per email) and looser global limits elsewhere.
- After N failed attempts for an account, block it for a short, growing period. Return the same `401` so the response doesn't reveal that the account exists.
- Return `429` with `Retry-After` and add `RATE_LIMITED` to the shared error codes.
- Add a CAPTCHA or proof-of-work only on the auth pages, and only after repeated failures.

### 3. Security headers and CSP

**Gap.** Neither app sets security headers. The API doesn't use `helmet`, and [`next.config.ts`](../apps/web/next.config.ts) has no `headers()`. There is no Content-Security-Policy, HSTS, `X-Frame-Options` / `frame-ancestors`, `Referrer-Policy` or `Permissions-Policy`.

**Proposal.**
- **Web:** set a strict CSP in middleware with a per-request nonce. The inline theme script (`ThemeInitScript`) and Emotion styles need the nonce, so pass it through. Also set `frame-ancestors 'none'`, HSTS (with `COOKIE_SECURE=true` behind TLS), `Referrer-Policy: strict-origin-when-cross-origin` and `X-Content-Type-Options: nosniff`.
- **API:** add `helmet()` in `main.ts`. The API is internal only, but headers cost nothing and protect it if it's ever exposed.
- Read the allowed origins for the cross-site check from config (`ALLOWED_ORIGINS`) instead of deriving them from `Host` / `X-Forwarded-Host` in [`lib/server/http.ts`](../apps/web/src/lib/server/http.ts). Trust forwarded headers only from a known proxy.

### 4. Session hardening

**Gap** (partly listed in [decisions.md](decisions.md#known-limitations)):
- Session IDs are stored in plain text. Anyone who can read the database or a backup can use every live session.
- IDs never rotate, and ended sessions are never purged.
- Deactivating a user doesn't end their open sessions.
- The 24 h expiry is fixed, with no idle timeout.

**Proposal.**
- Store `sha256(sessionId)` in the database and look sessions up by hash. The cookie keeps the raw ID.
- Issue a new session ID on role or password changes, and end all of a user's sessions on deactivation, password reset or role change. That's one `UPDATE … SET terminated_at = now() WHERE user_id = ?` in the same transaction.
- Add an idle timeout (for example 30 minutes, sliding) alongside the absolute expiry. Store `last_seen_at` and update it at most once a minute to keep writes low.
- Add a scheduled job that deletes sessions ended more than N days ago.
- Add a "Your sessions" page that lists active sessions and lets the user end the others. `DELETE /sessions/:id` already supports this.
- Use the `__Host-` cookie prefix (`__Host-sid`) in production. It forces `Secure`, `Path=/` and no `Domain`.

### 5. Timeouts on BFF → API calls

**Gap.** `upstreamFetch` in [`lib/server/http.ts`](../apps/web/src/lib/server/http.ts) calls `fetch` with no timeout. If the API hangs (a stuck query or lock wait), web requests hang with it, and connections and memory pile up in the web server.

**Proposal.**
- Pass `signal: AbortSignal.timeout(API_TIMEOUT_MS)` (for example 5 s) and map an abort to `504 GATEWAY_TIMEOUT` or the existing `503`.
- Add a database `statement_timeout` and Prisma `transactionOptions.timeout`, so a slow query fails instead of holding a row lock. This matters most for the `FOR UPDATE` in `createForUser`.
- Set the Prisma connection pool size and queue timeout explicitly to match the database's `max_connections` and the number of replicas.

### 6. Secrets and database roles

**Gap.**
- Secrets come from `.env` and Compose defaults (`POSTGRES_PASSWORD:-localdev`).
- `migrate` and `api` connect as the same database user, which owns the schema. A compromised API can run `DROP TABLE`.

**Proposal.**
- Load secrets from a secret manager (AWS Secrets Manager, Vault, Kubernetes secrets with sealed or external secrets). Remove default passwords, so a missing secret stops the service at startup. The Zod environment schema already supports failing fast.
- Use two roles: a migration role that owns the schema, and a runtime role with only `SELECT/INSERT/UPDATE/DELETE` on the two tables.
- Require TLS to the database (`sslmode=verify-full`).

---

## Product and compliance

### 7. Audit trail

**Gap.** Nothing records who created, changed, deactivated or deleted a user. Because deletion is permanent, the information is lost completely.

**Proposal.**
- Add an append-only `audit_events` table (`actor_user_id`, `action`, `target_user_id`, `changes` JSON with before and after, `ip`, `user_agent`, `request_id`, `at`). Write to it in the same transaction as the change.
- Add an admin-only audit view, filterable by actor, target and date.
- Record sign-in successes and failures, which also helps with item 2.

### 8. Account lifecycle: email verification, password reset, MFA

**Gap.** There's no email verification, no "forgot password", no way to change a password or email, and no second factor. An admin who creates a user has to send them the password some other way.

**Proposal.**
- Add an email provider (SES, Postmark) behind an interface, with a local mail catcher (Mailpit) in Compose.
- Invite flow: an admin creates a user with no password, and the user sets one through a single-use, short-lived, hashed token link.
- Password reset with the same token approach. A reset ends all of the user's sessions.
- Optional TOTP or WebAuthn MFA, required for admins.
- Check new passwords against known breaches (HIBP k-anonymity API), not just length.

---

## Observability and operations

### 9. Structured logging and request IDs

**Gap.**
- The API uses Nest's default text `Logger`; the BFF uses `console.warn`.
- No logs are written per request, and no ID ties a browser request to its BFF call, API call and database queries.

**Proposal.**
- Use `nestjs-pino` in the API and `pino` in the web server, with JSON output and one log line per request (method, route, status, duration, user ID, never the session ID).
- Create or accept an `X-Request-Id` in the BFF, forward it to the API, include it in every log line and in error responses, and show it in the UI's error alert so users can quote it to support.
- Redact sensitive fields (`password`, `x-session-id`, `cookie`) centrally in the logger config.

### 10. Metrics, tracing and error tracking

**Gap.** There are no metrics, no tracing, and no error reporting beyond logs.

**Proposal.**
- **Tracing:** OpenTelemetry SDK in both apps (HTTP, fetch and Prisma instrumentation), exported to Tempo, Jaeger or a vendor.
- **Metrics:** Prometheus metrics for request rate, errors and latency per route, sign-in successes and failures, active sessions, database pool usage and Argon2 timing.
- **Error tracking:** Sentry or similar for both server and browser errors, linked to the request ID.
- **Alerts and SLOs:** for example 99.9% availability and p95 under 300 ms on `/users`, with alerts on error rate, latency, failed sign-in spikes and database health.

### 11. Liveness and readiness probes

**Gap.**
- The API's single `/health` checks the database. Used as a liveness probe, a database outage would make Kubernetes restart every API pod, which fixes nothing and adds load during recovery.
- The web healthcheck requests `/sign-in`, so every check renders a page, and the check doesn't show whether the API is reachable.

**Proposal.**
- API: `/health/live` (the process is up, no dependencies checked) and `/health/ready` (database reachable, migrations applied).
- Web: a light `/api/health` route that checks it can reach the API's readiness endpoint, with a short timeout.
- On shutdown, report not-ready first and let in-flight requests finish before exiting.

### 12. Delivery pipeline

**Gap.**
- CI builds the images only to run E2E. Nothing is pushed to a registry, versioned or deployed.
- Migrations run as a Compose one-shot service.
- There's no staging environment and no rollback plan.

**Proposal.**
- On `main`, build once, tag images with the commit SHA and a semantic version, push them to a registry (GHCR, ECR), and deploy the **same** images to staging and then production.
- Run migrations as a separate pipeline step or a Kubernetes Job before the new version starts. Never run them from app replicas.
- Provide Kubernetes manifests or a Helm chart (or Terraform for ECS / Cloud Run), with resource limits, HPA, PodDisruptionBudget, and probes from item 11.
- Run a post-deploy smoke test (a subset of the Playwright suite) against staging. Roll back automatically if it fails.

### 13. Supply-chain security

**Gap.**
- GitHub Actions are pinned by tag (`actions/checkout@v4`), not by commit SHA.
- There are no automated dependency updates, no vulnerability scanning of dependencies or images, and no SBOM.

**Proposal.**
- Add Renovate or Dependabot for npm, Docker base images and Actions. Pin Actions by SHA.
- Add CodeQL or Semgrep for code scanning, `pnpm audit` in CI, and Trivy or Grype on the built images, failing on high-severity findings.
- Generate an SBOM (Syft) and sign images (cosign). Pin base images by digest.

### 14. Backups and safe migrations

**Gap.**
- Nothing backs up the database; the Compose volume is the only copy.
- There are no rules for migrations that can run while the old version is still serving.

**Proposal.**
- Use managed PostgreSQL (RDS, Cloud SQL) with automated backups and point-in-time recovery, and test restores on a schedule.
- Use expand-and-contract migrations: add a column, deploy code that writes both, backfill, then remove the old column in a later release. Run a migration lint step in CI (for example squawk) to block locking changes such as `ALTER … NOT NULL` without a default on a large table.
- Add a read replica if reporting or audit queries grow.

---

## Correctness and data

### 15. Concurrent edits (optimistic locking)

**Gap.** Two admins can edit the same user at the same time, and the last save silently overwrites the other. `PATCH /users/:id` doesn't check whether the record changed since it was loaded.

**Proposal.**
- Return `ETag` (for example from `updatedAt`) on user responses and require `If-Match` on `PATCH` and `DELETE`. Respond `412 Precondition Failed` (a new `STALE_RESOURCE` code) when it doesn't match.
- In the edit dialog, show "This user was changed by someone else", with the option to reload.

### 16. Soft delete and data retention

**Gap.** `DELETE /users/:id` removes the row and its sessions permanently. A mistaken delete can't be undone, and there's no history for investigations.

**Proposal.**
- Add `deleted_at` and filter it out by default. Use a partial unique index on email (`WHERE deleted_at IS NULL`) so the address can be registered again.
- Add a restore action for admins, and a retention job that permanently deletes or anonymizes users after N days, to support GDPR erasure.
- Document what personal data is stored, why, and for how long.

### 17. Scaling the read path

**Gap.**
- Every protected request reads the session from the database.
- Every `/users` page runs `COUNT(*)` plus an offset query, which gets slower as page numbers grow.

**Proposal.**
- Cache resolved sessions in Redis for a short time (for example 30 s), and clear the entry on termination or user change. Alternatively, accept the database read and rely on the session primary key and connection pooling (PgBouncer), which scales a long way.
- Switch to cursor (keyset) pagination on `(created_at, id)` for large tables. The index already exists. Keep page numbers in the UI only if exact totals are needed, and consider an estimated count.
- Run several API and web replicas. Both are stateless (sessions live in the database), so this works today once rate limiting (item 2) uses a shared store.

---

## Product, quality and developer experience

### 18. Search, sort and filter

**Gap.** The dashboard can only page through users, newest first. Finding one user among thousands means paging through all of them.

**Proposal.** Add `q` (name or email search, using a `pg_trgm` index), `status` filter and `sort` parameters to `GET /users`, validated by the shared schema and kept in the URL like `page`. Add bulk actions (deactivate or delete selected users) with confirmation.

### 19. Test coverage reporting and further tests

**Gap.**
- Tests cover the main flows well, but coverage isn't measured or enforced; no Vitest config sets coverage thresholds.
- There are no load tests and no security scans of the running app.

**Proposal.**
- Turn on `vitest --coverage` (v8) in each package, set minimum thresholds, and publish the reports from CI.
- Add contract tests: check API responses against the generated OpenAPI spec, so the BFF and the API can't drift apart.
- Run k6 load tests on sign-in and `/users` to size Argon2 parameters, the connection pool and replica counts.
- Run an OWASP ZAP baseline scan against the E2E stack in CI.
- Add Playwright accessibility checks (axe) on each page. Today they run only in component tests.

### 20. API versioning and client generation

**Gap.**
- Routes have no version (`/users`), so a breaking change hits every client at once.
- The web client is written by hand, though typed by the shared schemas.

**Proposal.**
- Prefix routes with `/v1` (NestJS URI versioning) and agree a deprecation policy.
- Publish the OpenAPI spec as a CI artifact. Generate clients from it for any consumer outside the monorepo.

### 21. Frontend polish

**Gap and proposal.**
- **Internationalization:** all text is hard-coded English. Use `next-intl`, and format dates and numbers by locale (dates already use the browser's locale).
- **Avatars:** the challenge leaves them out. Add upload to object storage with signed URLs, size and type checks, and image resizing.
- **Session expiry warning:** warn before the 24 h expiry or idle timeout, and offer to stay signed in.
- **Offline and failure states:** show a banner when the API is unreachable, instead of separate per-action errors.
- **Web performance:** set Lighthouse / Web Vitals budgets in CI, and measure the MUI bundle size.

---

## Suggested order

1. **Before real users:** 1, 2, 3, 4, 5, 6.
2. **Before the first production deploy:** 9, 11, 12, 13, 14, then 10 and 7.
3. **As usage grows:** 15, 16, 8, 17, 18, then 19 to 21 as ongoing work.
