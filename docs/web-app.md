# Web app and BFF

Next.js 15 (App Router) in `apps/web`. It renders the UI and acts as a **backend-for-frontend (BFF)**: the browser talks only to the web app, which holds the session in an HttpOnly cookie and calls the API server-side. API endpoints are in [api.md](api.md); the session model is in [auth-and-sessions.md](auth-and-sessions.md).

> Status: shell, BFF, route protection and theming are done (Phase 5); sign-up/sign-in forms are done (Phase 6). The users table and dialogs land in Phase 7.

## Routes

| Route | Kind | Behaviour |
| --- | --- | --- |
| `/` | Server component | Confirms the session with the API → `/dashboard` if valid, else `/sign-up` |
| `/sign-up`, `/sign-in` | `(auth)` group | Centered card with the sign-up / sign-in form ([Auth forms](#auth-forms)). Redirected to `/dashboard` by middleware when a session cookie exists |
| `/dashboard` | `(protected)` group | Rendered only after `requireUser()` confirms the session; wrapped in the app shell (user name, theme toggle, sign out) |
| `/api/*` | Route handlers | The BFF (below) |

Route groups in parentheses don't appear in URLs; they only share layouts.

## BFF routes

| Route | Does |
| --- | --- |
| `POST /api/auth/sign-up` | Forwards to `POST /auth/sign-up`. On success, stores the returned session ID in the `sid` cookie and responds with `{ user }` only |
| `POST /api/auth/sign-in` | Same, for `POST /auth/sign-in` |
| `POST /api/auth/sign-out` | Calls `DELETE /sessions/:id` with the cookie's session, then clears the cookie, even if the API is unreachable (204 either way) |
| `GET /api/auth/me` | `GET /auth/me`, but returns only `{ user }`: the session object contains the ID and is stripped |
| `GET /api/auth/clear-session?next=` | Clears a stale cookie and redirects (303) to `/sign-in` or `/sign-up` (allowlisted; anything else goes to `/sign-in`) |
| `GET/POST/PATCH/DELETE /api/users[/:id]` | Generic proxy: path, query, method and JSON body forwarded; status and body relayed back |

Rules shared by all handlers ([`lib/server/http.ts`](../apps/web/src/lib/server/http.ts)):

- **Allowlist, not a catch-all.** The generic proxy forwards only `users` and `users/<id>`; anything else is a 404. `/auth/*` and `/sessions` responses contain session IDs, so they only go through the dedicated handlers.
- **Nothing from the browser is forwarded except the body.** Cookies and other headers never reach the API; the session travels only as `X-Session-Id`.
- **No cookie → 401** without calling the API.
- **API says 401 → the cookie is cleared** in the same response, so a dead session cannot linger.
- **API unreachable → 503 `SERVICE_UNAVAILABLE`.**
- **Cross-site mutations are rejected (403)** when `Sec-Fetch-Site: cross-site` or the `Origin` host differs from the request host. This includes sign-in/sign-up (login CSRF). It is defense in depth on top of `SameSite=Lax`.
- `API_INTERNAL_URL` is read on the server at request time and never sent to the browser.

## Session cookie

| Attribute | Value | Why |
| --- | --- | --- |
| Name | `sid` | |
| `HttpOnly` | yes | JavaScript (including injected scripts) cannot read the session ID |
| `SameSite` | `Lax` | Not sent on cross-site `POST`/`PATCH`/`DELETE`; top-level navigations still work |
| `Secure` | when `COOKIE_SECURE=true` | Enable behind HTTPS; off for plain-HTTP local dev |
| `Path` | `/` | |
| `Max-Age` | `SESSION_TTL_HOURS × 3600` | Matches the API session expiry |

## Route protection

Two layers, because the cookie alone proves nothing:

1. **`middleware.ts` (optimistic, Edge):** looks at cookie *presence* only. No cookie on `/dashboard/**` → `/sign-in`; cookie on `/sign-in` or `/sign-up` → `/dashboard`. Cheap, and it avoids rendering the wrong page first.
2. **Server check (authoritative):** the `(protected)` layout calls `requireUser()`, which calls `GET /auth/me` with the cookie's session ID (`getCurrentAuth()`, deduplicated per request with React `cache`). `/` does the same check.

### Stale cookies

If the cookie exists but the API rejects it (expired, terminated, user deleted), the two layers would disagree forever: middleware sends `/sign-in` → `/dashboard`, and the dashboard sends it back to `/sign-in`. Server components cannot modify cookies, so they redirect to `/api/auth/clear-session`, a route handler that **can**:

```mermaid
sequenceDiagram
  participant B as Browser (stale sid)
  participant M as middleware
  participant L as (protected) layout
  participant C as /api/auth/clear-session
  B->>M: GET /sign-in
  M-->>B: 307 /dashboard (cookie present)
  B->>L: GET /dashboard
  L->>L: GET /auth/me → 401
  L-->>B: 307 /api/auth/clear-session?next=/sign-in
  B->>C: GET
  C-->>B: 303 /sign-in + Set-Cookie sid=; Max-Age=0
  B->>M: GET /sign-in (no cookie) → page renders
```

## Auth forms

Client components in [`components/auth/`](../apps/web/src/components/auth/), built with React Hook Form + `zodResolver` and the shared schemas, so client and API validate with the same rules.

| | Sign-up (`SignUpForm`) | Sign-in (`SignInForm`) |
| --- | --- | --- |
| Schema | `SignUpFormSchema` (adds `confirmPassword` + `refine` on match) | `SignInInputSchema` |
| Fields → `autocomplete` | first/last name → `given-name`/`family-name`; email → `email`; both passwords → `new-password` | email → `username`; password → `current-password` |
| Sent to the BFF | Parsed output (trimmed names, lower-cased email) **without** `confirmPassword` | Parsed output (lower-cased email) |
| Field-level server errors | `409 EMAIL_TAKEN` → email field; `400` `details[{ path }]` → matching fields | `400` `details[{ path }]` → matching fields |
| Form-level messages (`Alert`) | anything else, e.g. 503 "service unavailable" | `401 INVALID_CREDENTIALS` → "Invalid email or password." (never says which field); `403 USER_INACTIVE` → "This account is inactive…"; network/5xx → "unavailable". The password is cleared and focused for the retry; the email is kept |

Behaviour shared by both:

- **Validation before the network.** Errors show on blur (`mode: 'onTouched'`) and on submit; the first invalid field is focused. A password mismatch never sends a request (C1).
- **No double submit.** The submit button is disabled (and relabelled "Creating account…" / "Signing in…") from submit until navigation; the submit handler also ignores Enter-key resubmits while busy.
- **On success** (`useAuthSuccess`): invalidate `['me']`, then `router.replace('/dashboard')`. `replace` swaps out the form's history entry, so Back from the dashboard goes to the page *before* the form. Middleware would bounce an authenticated user off the auth pages anyway.
- **Accessibility.** Native `<form noValidate>` with an accessible name, labelled MUI `TextField`s with `aria-invalid` and helper-text errors, a real submit button (Enter submits), error `Alert`s with `role="alert"`, cross-links between the two pages. An axe-core check runs in the component tests.
- Server-error mapping lives in one helper, `applyServerError()` (`form-errors.ts`), with the copy in `AUTH_ERROR_MESSAGES`.

## Client data layer

- **`apiClient`** ([`lib/client/api-client.ts`](../apps/web/src/lib/client/api-client.ts)) is a typed wrapper over `fetch('/api/…')` with `auth.*` and `users.*` methods. Non-2xx responses throw `ApiClientError { status, code, message, details }`, parsed from the shared error shape. Network failures become `status 0, SERVICE_UNAVAILABLE`.
- **Central 401 handling:** a `401 UNAUTHORIZED` from any request runs one handler, installed by `<UnauthorizedRedirect />`: clear the query cache, `router.replace('/sign-in')`. A `401 INVALID_CREDENTIALS` (wrong password) does **not** redirect, so the sign-in form can show the error.
- **TanStack Query** (`createQueryClient`): 30 s `staleTime`, no refetch on window focus, 4xx errors are never retried, other failures retried twice, mutations never retried. Query keys live in `queryKeys` (`['me']`, `['users', page]`).

## UI and theming

- **MUI 6** with `AppRouterCacheProvider` (Emotion styles rendered on the server, no unstyled flash) and `CssBaseline`.
- **Themes:** `createAppTheme('light' | 'dark')` in [`theme/theme.ts`](../apps/web/src/theme/theme.ts). The palette, 10 px radius, a system font stack (no web-font download at build time) and flat components are set there.
- **Mode switching:** `ThemeModeProvider` / `useThemeMode()` hold the mode in React state. Persistence across browser restarts (localStorage plus a cookie so the server renders the right mode without a flash) is Phase 8.
- **Errors:** `app/error.tsx` shows a retry screen, for example when the API is down during server rendering.

## Configuration

Read on the server at request time by [`lib/server/env.ts`](../apps/web/src/lib/server/env.ts) (Zod-validated):

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_INTERNAL_URL` | `http://localhost:4000` | Where the BFF reaches the API |
| `COOKIE_SECURE` | `false` | Adds `Secure` to the session cookie |
| `SESSION_TTL_HOURS` | `24` | Cookie `Max-Age` |

For host-side dev, `next.config.ts` loads the repo-root `.env`; real environment variables always win. The build uses `output: 'standalone'` for the Docker image (Phase 10).

## Code map

```text
src/
  app/
    layout.tsx, providers.tsx   root layout; MUI cache, theme, query client, 401 redirect
    page.tsx                    / redirect logic
    (auth)/                     sign-in, sign-up
    (protected)/                layout with requireUser(); dashboard
    api/[...path]/route.ts      generic users proxy
    api/auth/*/route.ts         sign-up, sign-in, sign-out, me, clear-session
    error.tsx, icon.svg
  components/
    layout/app-shell.tsx
    auth/                       sign-up / sign-in forms, FormTextField, server-error mapping, useAuthSuccess
  lib/
    session-cookie.ts           cookie name (Edge-safe, used by middleware)
    bff-types.ts                BFF response types
    server/                     env, upstream fetch + cookie helpers, auth-routes, current-user
    client/                     api-client, query client + keys, UnauthorizedRedirect
  theme/                        themes, ThemeModeProvider
  middleware.ts
```
