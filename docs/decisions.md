# Design decisions and tradeoffs

Why the system looks the way it does, which defaults were chosen where the requirements are open, and what a production version would change. Details live in the linked docs.

## Key decisions

| Decision | Choice | Why | Alternatives considered |
| --- | --- | --- | --- |
| Service split | Separate NestJS API + Next.js web | Explicit REST contract, isolated API tests, any client can use it | Next.js route handlers only: fewer moving parts, but the API would be tied to the UI |
| Session transport | Opaque DB session ID in `X-Session-Id`; browser holds it in an HttpOnly cookie via a BFF | Meets the "send the session ID on every request" requirement without exposing it to JavaScript | localStorage + header: simpler, but readable by XSS. JWT: harder to revoke, and the requirements call for terminatable sessions |
| Sessions | Database rows, checked on every request | Immediate revocation (sign-out, user delete); simple to reason about | Signed tokens or a cache: faster, but revocation needs extra machinery |
| Concurrency | `SELECT … FOR UPDATE` on the user row when creating a session | Guarantees "inactive users get no session" and exact `loginsCount` under races | Optimistic version column: more retries and code. `SERIALIZABLE`: heavier, needs retry handling |
| Inactive rename | Conditional `UPDATE … WHERE status = 'ACTIVE'` in the same transaction as any status change | Race-free without an explicit lock | Read-then-write check: racy |
| Validation | Shared Zod schemas (`.strict()`) for API pipes, OpenAPI and web | One source of truth; unknown fields rejected | class-validator DTOs: a second copy of the rules |
| Passwords | Argon2id | Current OWASP recommendation | bcrypt |
| ORM | Prisma 7 with the `pg` driver adapter | Typed client, migration history | Drizzle, TypeORM |
| Errors | One `{ code, message, details? }` shape, closed list of codes | Clients branch on `code`, not on message text | Framework defaults |
| Pagination | Offset (`page`, `limit ≤ 6`), ordered `createdAt DESC, id DESC` | Matches a page-numbered UI and is fine at this scale; `id` keeps pages stable | Cursor pagination (better for large or fast-changing sets) |
| User deletion | Hard delete; sessions cascade | Simple and matches the exercise | Soft delete (production, for audit) |

## Open decisions

Where the requirements leave a choice open, these defaults are implemented.

| Question | Default | Notes |
| --- | --- | --- |
| Does sign-up count as a login? | **Yes**: `loginsCount = 1` after sign-up | Sign-up creates a session, and every session counts |
| Can admins reactivate inactive users? | **Yes** | `PATCH { status: "ACTIVE" }`; renaming in the same request works because status is applied first |
| What happens to sessions when a user is deactivated? | **They stay valid** until sign-out or expiry; new sessions are refused | Alternative: revoke immediately (one extra `UPDATE` in the status change) |
| Can you deactivate or delete yourself? | **Yes**. Deleting yourself ends your session at once; deactivating keeps it | UI behaviour is settled in Phase 7 (T7.8) |
| Session lifetime | **24 h**, fixed, no sliding renewal | `SESSION_TTL_HOURS` |
| `limit` above 6 | **400**, not silently reduced | Makes client bugs visible |
| `POST /sessions` | Requires email + password, never a bare `userId` | A bare `userId` would let anyone impersonate any user |
| Repeated sign-out | **204** every time | `DELETE /sessions/:id` accepts an already-ended caller session |

## Version pins

| Package | Pin | Reason |
| --- | --- | --- |
| TypeScript | `~5.9` | typescript-eslint doesn't support TS 7 yet; meets ≥ 5 |
| NestJS | `^11` | v12 is ESM-only |
| Prisma | `7.10.1` | v8 is a release candidate |
| Next.js | `15.5.x` | Required ≥ 15; 16 renames middleware and was not needed |
| MUI | `6.x` | Locked in the plan; `@mui/material-nextjs` v6 supports Next 15 |

## Known limitations

- **Authorization:** every signed-in user is an admin (exercise requirement). Production needs roles, server-side RBAC and an audit trail.
- **Account security:** no rate limiting on sign-in/sign-up, no lockout, no email verification or password reset.
- **Sessions:** IDs are stored as-is (production would store a hash), there is no rotation, and ended sessions are never purged.
- **CSRF:** `SameSite=Lax` plus an Origin / `Sec-Fetch-Site` check in the BFF. A production system would add CSRF tokens if it ever needed `SameSite=None`.
- **Operations:** no structured logs, request IDs, metrics, tracing or backups yet.
- **Pagination:** offset-based; rows inserted while paging can shift later pages.
