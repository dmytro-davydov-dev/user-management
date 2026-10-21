# REST API reference

NestJS API on port `4000` (internal in Docker Compose). Interactive docs (Swagger UI) are served at **`/docs`** and the raw OpenAPI JSON at **`/docs-json`** whenever `NODE_ENV` is not `production`. Their schemas are generated from the shared Zod contracts, so they always match validation.

For how sessions work behind these endpoints, see [auth-and-sessions.md](auth-and-sessions.md).

## Conventions

- **Content type:** JSON in, JSON out. Dates are ISO 8601 UTC strings.
- **Authentication:** every endpoint except `/health`, sign-up, sign-in and `POST /sessions` requires the header `X-Session-Id: <session uuid>`.
- **Validation:** bodies and queries are strict. Unknown fields are a 400, not silently ignored.
- **Users are admins:** any signed-in user can manage all users (exercise simplification; see [decisions.md](decisions.md)).

## Endpoints

| Method | Path | Auth | Success |
| --- | --- | --- | --- |
| `POST` | [`/auth/sign-up`](#post-authsign-up) | Public | `201 { id, user }` |
| `POST` | [`/auth/sign-in`](#post-authsign-in) | Public | `200 { id, user }` |
| `GET` | [`/auth/me`](#get-authme) | Session | `200 { session, user }` |
| `POST` | [`/sessions`](#post-sessions) | Public (credentials) | `201 { id, user }` |
| `DELETE` | [`/sessions/:id`](#delete-sessionsid) | Session (may be ended) | `204` |
| `GET` | [`/users`](#get-users) | Session | `200 { data, pagination }` |
| `POST` | [`/users`](#post-users) | Session | `201 User` |
| `PATCH` | [`/users/:id`](#patch-usersid) | Session | `200 User` |
| `DELETE` | [`/users/:id`](#delete-usersid) | Session | `204` |
| `GET` | `/health` | Public | `200 { status: "ok", database: "up" }`, `503` if the DB is down (not in Swagger) |

### The `User` object

```json
{
  "id": "6f1c2b8e-3c1a-4d0e-9f53-2b1f8f7f4a10",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "email": "ada@example.com",
  "status": "ACTIVE",
  "loginsCount": 1,
  "createdAt": "2026-10-20T17:00:00.000Z",
  "updatedAt": "2026-10-20T17:00:00.000Z"
}
```

It never contains the password or its hash.

## Auth and sessions

### `POST /auth/sign-up`

Creates the user and its first session in one transaction. Sign-up counts as the first login (`loginsCount: 1`).

```bash
curl -X POST localhost:4000/auth/sign-up -H 'content-type: application/json' \
  -d '{"firstName":"Ada","lastName":"Lovelace","email":"ada@example.com","password":"correct-horse"}'
```

```json
{ "id": "0b6f9c3e-6d2a-4f61-8a57-3c9e1d2f4b80", "user": { "…": "User" } }
```

`id` is the **session ID**. Send it as `X-Session-Id` on later requests.

| Error | When |
| --- | --- |
| `400 VALIDATION_ERROR` | Missing/invalid fields, password < 8 chars, unknown fields (e.g. `confirmPassword`; confirmation is a client-side check) |
| `409 EMAIL_TAKEN` | Email already registered (case-insensitive) |

### `POST /auth/sign-in`

Body: `{ "email": "...", "password": "..." }`. Returns `200 { id, user }` and increments `loginsCount`.

| Error | When |
| --- | --- |
| `400 VALIDATION_ERROR` | Malformed body |
| `401 INVALID_CREDENTIALS` | Unknown email **or** wrong password (same body, similar timing) |
| `403 USER_INACTIVE` | Correct password, inactive account (no session is created) |

### `GET /auth/me`

Returns the caller's session and user:

```json
{
  "session": {
    "id": "0b6f9c3e-…",
    "userId": "6f1c2b8e-…",
    "createdAt": "2026-10-20T17:00:00.000Z",
    "terminatedAt": null,
    "expiresAt": "2026-10-21T17:00:00.000Z"
  },
  "user": { "…": "User" }
}
```

### `POST /sessions`

Same contract as sign-in (`{ email, password }` → `201 { id, user }`). It exists because the requirements call for a sessions resource. It is credential-verified: a body with only a `userId` (or any extra field) is a `400`, so nobody can mint a session for someone else.

### `DELETE /sessions/:id`

Terminates one of the caller's own sessions (any session of the same user, not only the current one). Sets `terminatedAt` once.

- **Idempotent:** this route accepts an already-ended session in `X-Session-Id`, so signing out twice with the same session returns `204` both times. Every other route rejects that session with 401.
- `404 NOT_FOUND` for an unknown session or one owned by another user (IDs cannot be probed).
- `400` for a malformed `:id`.

```bash
curl -X DELETE localhost:4000/sessions/$SID -H "x-session-id: $SID"   # 204
```

## Users

### `GET /users`

Query: `page` (integer ≥ 1, default 1), `limit` (1–6, default 6). Newest first, ordered by `createdAt DESC, id DESC`, so pages are stable even when timestamps collide.

```json
{
  "data": [{ "…": "User" }],
  "pagination": { "page": 1, "limit": 6, "total": 13, "totalPages": 3 }
}
```

A page beyond the last returns `data: []` with correct totals. `limit` above 6 is a `400` rather than being silently reduced.

### `POST /users`

Body: `firstName`, `lastName`, `email`, `password`, optional `status` (default `ACTIVE`). Names are trimmed and the email is lower-cased. Returns `201` with the user (`loginsCount: 0`). Duplicate email → `409 EMAIL_TAKEN`.

### `PATCH /users/:id`

Body: any non-empty subset of `firstName`, `lastName`, `status`. Everything else (`email`, `password`, `createdAt`, `updatedAt`, `loginsCount`, …) is a `400`.

**Status is applied first**, then names, in one transaction:

| Request | Result |
| --- | --- |
| Rename an `ACTIVE` user | `200`, `updatedAt` bumped, `createdAt` unchanged |
| Rename an `INACTIVE` user | `403 USER_INACTIVE`, nothing written |
| `{ "status": "ACTIVE", "firstName": "…" }` on an inactive user | `200`: reactivated and renamed |
| `{ "status": "INACTIVE", "firstName": "…" }` on an active user | `403 USER_INACTIVE`, nothing written (status change rolled back) |
| Status change only | `200` |

Deactivating a user does not end their existing sessions; it blocks new ones (see [decisions.md](decisions.md#open-decisions)).

### `DELETE /users/:id`

Deletes the user and, through the foreign-key cascade, all of its sessions. `204`, or `404` if the user does not exist. Deleting yourself works too; your next request is a `401`.

## Errors

Every error has the same shape:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "details": [{ "path": "email", "message": "Invalid email address" }]
}
```

`details` is present only for validation errors: one entry per failing field.

| Status | Code | Typical cause |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Invalid body/query/UUID, unknown fields, malformed JSON |
| 401 | `UNAUTHORIZED` | Missing, malformed, unknown, terminated or expired session (one generic message for all) |
| 401 | `INVALID_CREDENTIALS` | Wrong email/password on sign-in |
| 403 | `USER_INACTIVE` | Inactive user signs in or is renamed |
| 403 | `FORBIDDEN` | Other disallowed operations (web BFF: cross-site requests) |
| 404 | `NOT_FOUND` | Unknown user or session |
| 409 | `EMAIL_TAKEN` / `CONFLICT` | Duplicate email / other unique conflicts |
| 503 | `SERVICE_UNAVAILABLE` | Database unreachable |
| 500 | `INTERNAL_ERROR` | Anything unexpected (details are logged, never returned) |

The mapping lives in [`api-exception.filter.ts`](../apps/api/src/common/api-exception.filter.ts): `ApiException` bodies pass through, Prisma `P2002` → 409, `P2025` → 404, connection errors (Prisma `P1001`/`P1002`/`P1008`/`P1017`, initialization errors, pg `ECONNREFUSED` and similar) → 503.
