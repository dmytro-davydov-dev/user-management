# Web app and BFF

Next.js 15 (App Router) in `apps/web`. It renders the UI and acts as a **backend-for-frontend (BFF)**: the browser talks only to the web app, which holds the session in an HttpOnly cookie and calls the API server-side. API endpoints are in [api.md](api.md); the session model is in [auth-and-sessions.md](auth-and-sessions.md).

> Status: shell, BFF, route protection and theming (Phase 5), sign-up/sign-in forms (Phase 6), the users dashboard (Phase 7), theme persistence and the mobile card layout (Phase 8) are done.

## Routes

| Route | Kind | Behaviour |
| --- | --- | --- |
| `/` | Server component | Confirms the session with the API → `/dashboard` if valid, else `/sign-up` |
| `/sign-up`, `/sign-in` | `(auth)` group | Centered card with the sign-up / sign-in form ([Auth forms](#auth-forms)). Redirected to `/dashboard` by middleware when a session cookie exists |
| `/dashboard[?page=N]` | `(protected)` group | Rendered only after `requireUser()` confirms the session; wrapped in the app shell (`Hello, <first name>` greeting, which replaces the challenge's welcome page; theme toggle; sign out). The users table and dialogs ([Users dashboard](#users-dashboard)) |
| `/api/*` | Route handlers | The BFF (below) |
| anything else | `not-found.tsx` | 404 page with a link to `/` |

Route groups in parentheses don't appear in URLs; they only share layouts.

## BFF routes

| Route | Does |
| --- | --- |
| `POST /api/auth/sign-up` | Forwards to `POST /auth/sign-up`. On success, stores the returned session ID in the `sid` cookie and responds with `{ user }` only |
| `POST /api/auth/sign-in` | Same, for `POST /auth/sign-in` |
| `POST /api/auth/sign-out` | Calls `DELETE /sessions/:id` with the cookie's session, then clears the cookie, even if the API is unreachable (204 either way) |
| `GET /api/auth/me` | `GET /auth/me`, but returns only `{ user }`: the session object contains the ID and is stripped |
| `GET /api/auth/clear-session?next=` | Clears a stale cookie and redirects (303) to `/sign-in` or `/sign-up` (allowlisted; anything else goes to `/sign-in`). The `Location` is relative: behind Docker, `request.url` holds the bind address (`http://0.0.0.0:3000`), not the host the browser used |
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

## Users dashboard

`UsersDashboard` ([`components/users/`](../apps/web/src/components/users/)) is a client component; the server page only passes the current user's ID (from the layout's cached `requireUser()`).

- **Page in the URL.** `usePageParam()` reads `?page=` (missing or invalid → 1; page 1 is the bare `/dashboard`) and writes it with `history.pushState`, which Next.js syncs into `useSearchParams` without a server round trip. Back/Forward move between pages; links to a page are shareable. A page past the end (stale link, rows deleted elsewhere) replaces itself with the last page.
- **Data.** `useQuery(['users', page])` with `keepPreviousData`, so switching pages keeps the old rows (plus a thin progress bar) instead of flashing a skeleton. Columns: name (your own row is tagged "You"), email, status chip, logins, created, updated. Dates use the viewer's locale inside `<time dateTime>`; they render only in the browser, so there is no hydration mismatch.
- **States.** First load: 6 skeleton rows (`aria-busy`). No users: empty state with a create action. Error: `Alert` with Retry.
- **Narrow screens (< 600 px).** The table becomes a list of cards (`UserCardList`, a `<ul aria-label="Users">`): name, "You" and status chips, email, then logins / created / updated, with the same Edit / Delete buttons and labels as the table. Both layouts are rendered and CSS breakpoints show one, so the server-rendered page already matches the viewport (no swap after hydration). The rule is desktop-first, so jsdom (no media queries) sees only the table. Long names and emails wrap inside the card. Pagination shows fewer siblings and smaller buttons; it renders only after the client-side fetch, so `useMediaQuery` is safe there.
- **Mutations are not optimistic.** The table changes only after the API confirms: success closes the dialog, shows a snackbar and invalidates `['users']`. A failure keeps the dialog open with the error and leaves the table untouched.

| Dialog | Behaviour |
| --- | --- |
| **New user** | Names, email, password, status (`CreateUserInputSchema`). 409 → email field. On success, goes to page 1, where the newest user is first |
| **Edit user** | Status, first/last name, read-only email and created date. Names are **disabled while the status is Inactive** and re-enabled as soon as it's set to Active; switching to Inactive discards unsaved name edits. `buildUpdate()` sends only changed fields and never sends names for a user who ends up Inactive (the API would reject the whole request); reactivate + rename go in one request because the API applies status first. No changes → closes without a request. 403 `USER_INACTIVE` → form error; 404 → closes, snackbar, refetch |
| **Delete** | Confirmation required ("Cancel" is focused). Deleting the last row of a page moves to the previous page. 404 counts as success (already gone) |

### Your own account

| Action | What happens |
| --- | --- |
| Rename yourself | Saved like any user, then `router.refresh()` re-renders the server-side app bar, so the greeting shows the new name |
| Deactivate yourself | The edit dialog warns first. Your current session **stays valid** until you sign out (the API's default, see [decisions](decisions.md#open-decisions)); you can't sign in again or rename yourself until someone reactivates you |
| Delete yourself | The dialog says you'll be signed out. The API deletes your sessions with the account; the app then calls sign-out (clears the cookie), clears the query cache and goes to `/sign-in` |

## Client data layer

- **`apiClient`** ([`lib/client/api-client.ts`](../apps/web/src/lib/client/api-client.ts)) is a typed wrapper over `fetch('/api/…')` with `auth.*` and `users.*` methods. Non-2xx responses throw `ApiClientError { status, code, message, details }`, parsed from the shared error shape. Network failures become `status 0, SERVICE_UNAVAILABLE`.
- **Central 401 handling:** a `401 UNAUTHORIZED` from any request runs one handler, installed by `<UnauthorizedRedirect />`: clear the query cache, `router.replace('/sign-in')`. A `401 INVALID_CREDENTIALS` (wrong password) does **not** redirect, so the sign-in form can show the error.
- **TanStack Query** (`createQueryClient`): 30 s `staleTime`, no refetch on window focus, 4xx errors are never retried, other failures retried twice, mutations never retried. Query keys live in `queryKeys` (`['me']`, `['users', page]`).

## UI and theming

- **MUI 6** with `AppRouterCacheProvider` (Emotion styles rendered on the server, no unstyled flash) and `CssBaseline`.
- **Theme:** one `appTheme` in [`theme/theme.ts`](../apps/web/src/theme/theme.ts) with **both** color schemes as CSS variables (`cssVariables`, `colorSchemes.light/dark`). The palettes, 10 px radius, a system font stack (no web-font download at build time) and flat components are set there.
- **Persistence:** the chosen mode is saved in `localStorage` under `theme` (`light` / `dark`), so it survives closing and reopening the browser. With nothing saved, the app follows the OS (`prefers-color-scheme`) and keeps following it live. MUI also syncs the choice across open tabs.
- **No flash:** the server renders the same HTML for both modes. `ThemeInitScript` (MUI's `InitColorSchemeScript`), the first script in `<body>`, reads the saved mode or the OS preference and sets `class="light|dark"` on `<html>` before any content is parsed; CSS variables do the rest. The toggle's sun/moon icon is also picked by CSS (`theme.applyStyles('dark', …)`), not by state, so nothing changes at hydration. `<html>` has `suppressHydrationWarning` because the script changes its class.
- **Switching:** `useThemeMode()` returns the resolved `mode` (`undefined` until mounted) and `toggleMode()`; a toggle stores an explicit `light`/`dark`, replacing "follow the OS". Storage keys and the `<html>` class strategy live in one `THEME_CONFIG`, shared by the provider and the script.
- **Errors:** `app/error.tsx` shows a retry screen, for example when the API is down during server rendering. `app/not-found.tsx` handles unknown URLs.
- **Page titles:** `"<page> · User Management"` from the root layout's title template: Sign in, Create account, Users, Page not found. `error.tsx` is a client component and can't export `metadata`, so it renders a `<title>` element, which React 19 moves into `<head>`.
- **Dialog focus:** each dialog focuses its first useful control on open (New user → first name; Edit → status; Delete → **Cancel**, so Enter never deletes) and traps focus while open. On close, MUI returns focus to the button that opened it. If that button's row is gone after the refetch (deleted, or the user no longer exists), the dashboard moves focus to the "Users" heading (`tabIndex={-1}`) instead of leaving it on `<body>`.

## Configuration

Read on the server at request time by [`lib/server/env.ts`](../apps/web/src/lib/server/env.ts) (Zod-validated):

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_INTERNAL_URL` | `http://localhost:4000` | Where the BFF reaches the API |
| `COOKIE_SECURE` | `false` | Adds `Secure` to the session cookie |
| `SESSION_TTL_HOURS` | `24` | Cookie `Max-Age` |

For host-side dev, `next.config.ts` loads the repo-root `.env`; real environment variables always win. The build uses `output: 'standalone'`; the Docker image (`apps/web/Dockerfile`) runs only the traced `server.js` plus static assets.

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
    error.tsx, not-found.tsx, icon.svg
  components/
    layout/app-shell.tsx
    auth/                       sign-up / sign-in forms, FormTextField, server-error mapping, useAuthSuccess
    users/                      UsersDashboard, UsersTable, create / edit / delete dialogs
  lib/
    session-cookie.ts           cookie name (Edge-safe, used by middleware)
    bff-types.ts                BFF response types
    server/                     env, upstream fetch + cookie helpers, auth-routes, current-user
    client/                     api-client, query client + keys, UnauthorizedRedirect, usePageParam
  theme/                        theme, THEME_CONFIG, ThemeModeProvider, ThemeInitScript
  middleware.ts
```
