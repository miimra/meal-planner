# PocketBase-backed content + login-gated editing

**Status:** approved, ready for implementation plan
**Date:** 2026-08-07

## Problem

Today all content (the 12 categories, their dishes) is hardcoded in
`app/lib/categories.ts` and editable-but-only-locally via `localStorage`
(`app/lib/store.ts`). There's no login, no server, no shared/persistent
storage across devices.

Goal: introduce PocketBase as the backend. Categories and dishes move into
PocketBase and become server-persisted. The main app (Today / Week /
Rotation / Dishes, read-only) stays publicly viewable with no login. Editing
(dishes, category fields) requires being logged in. No roles — one account,
logged in or not.

## Non-goals

- No user roles/permissions tiers — a single login account, full edit access
  once authenticated.
- No signup flow in the app. The one account is created manually via
  PocketBase's Admin UI (`/_/`) after first deploy.
- The 2-week rotation schedule (`app/lib/rotation.ts`'s `WEEK_1`/`WEEK_2`
  day→category tables) stays hardcoded in code — it's business logic, not
  content, and isn't part of this change.
- `lastCooked` marks and the Sunday kabab/stew choice stay in `localStorage`
  exactly as today — per-device daily interaction state, not shared content.
- No realtime sync between devices/tabs (PocketBase supports it, but a
  single editor doesn't need it yet — plain fetch + refetch after a mutation
  is enough).
- No migration of any existing browser localStorage dish data — confirmed
  nothing custom has been added yet, so PocketBase is seeded fresh from
  today's `categories.ts` defaults.

## Architecture

**Single container.** PocketBase (prebuilt Go binary, bundles SQLite +
REST/realtime API + built-in auth) serves both the JSON API and the static
frontend from one process on one port. Any files under PocketBase's
`pb_public/` directory are served automatically by the same HTTP server —
so the Next.js static export output becomes `pb_public/`.

This requires switching Next.js from `output: "standalone"` to
`output: "export"`. This is valid for this codebase: every route (`/`,
`/week`, `/rotation`, `/dishes`) is already a `"use client"` component, no
Route Handlers, cookies, redirects, or dynamic routes are in use.

Because API and static site are same-origin, the frontend talks to
PocketBase with relative URLs — no CORS configuration needed in production.

```
┌─────────────────────────── one container ───────────────────────────┐
│  pocketbase serve --http=0.0.0.0:8090                                │
│    ├─ pb_public/         (Next.js static export = "out/")            │
│    ├─ pb_data/           (SQLite, volume-mounted, persists)          │
│    └─ pb_migrations/     (JS migrations: schema + seed, auto-run)    │
└────────────────────────────────────────────────────────────────────┘
```

## Data model

### `categories` collection

Mirrors today's `Category` type in `app/lib/categories.ts`.

| field | type | notes |
|---|---|---|
| `catId` | number | unique, 1–12 — stable id `rotation.ts` keeps referencing |
| `name_en` | text | |
| `name_fa` | text | |
| `emoji` | text | |
| `style` | select (`iranian`/`international`/`either`) | |
| `effort` | select (`quick`/`medium`/`medium-heavy`/`heavy`) | |
| `effort_min` | number | minutes |
| `effort_max` | number | minutes |
| `weekend_only` | bool | optional |
| `prep_ahead` | bool | optional |
| `notes` | text | optional |

Rules: `listRule`/`viewRule` = `""` (public read). `updateRule` =
`@request.auth.id != ''` (logged-in only). `createRule`/`deleteRule` =
**disabled (null)** — the set of 12 categories is fixed; only their fields
are editable. This protects `rotation.ts`'s hardcoded `catId` references
from breaking.

### `dishes` collection

| field | type | notes |
|---|---|---|
| `catId` | number | matches a `categories.catId`; plain number, not a PB relation (simpler — categories can't be deleted anyway) |
| `name` | text | required |
| `notes` | text | optional |

Rules: `listRule`/`viewRule` = `""` (public read). `createRule`/`updateRule`/
`deleteRule` = `@request.auth.id != ''` (logged-in only) — same capability
the Dishes screen already offers today, just server-backed.

### Auth

PocketBase's built-in `users` auth collection, used as-is. One record,
created manually via the Admin UI post-deploy. Login = email + password via
`pb.collection('users').authWithPassword(...)`. No custom fields, no roles.

## Frontend changes

- `app/lib/categories.ts` — becomes a thin fetch from PocketBase instead of
  a hardcoded array (or is replaced by a `useCategories()` hook alongside
  `useDishes()`).
- `app/lib/store.ts` (`useDishes`) — same public shape (`dishes`,
  `forCategory`, `add`, `update`, `remove`, `markCooked`,
  `resetToDefaults`… `resetToDefaults` may go away since PocketBase is now
  the source of truth), but backed by `pb.collection('dishes')` calls
  instead of `localStorage`. `markCooked` keeps writing to `localStorage`
  (see Non-goals).
- New `app/lib/auth.ts` — wraps `pb.authStore`: `login(email, pw)`,
  `logout()`, and a `useAuth()` hook that re-renders on auth state change.
- New minimal login UI — a lock/account icon in `BottomNav` opens an
  email+password form; once authenticated it shows "Log out" instead.
- `app/dishes/page.tsx` — add/edit/delete controls (already exists) become
  conditionally rendered on `useAuth().isLoggedIn`; gains inline editing for
  category fields (name/emoji/effort/notes), also gated on login.
- New `app/lib/pb.ts` — the shared `PocketBase` client instance. Base URL:
  same-origin in the production container; `NEXT_PUBLIC_PB_URL` env var
  override for local dev against a separately-running PocketBase.

## Packaging

**`next.config.ts`**: `output: "export"` (was `"standalone"`).

**`Dockerfile`** (two stages):
1. `node:22-alpine` — `npm ci && npm run build` → produces `/app/out`.
2. Minimal base (alpine) with a pinned PocketBase release binary downloaded
   at build time. `COPY` the Next `out/` into `./pb_public`, `COPY`
   `pb_migrations/` into `./pb_migrations`. `VOLUME /pb/pb_data`. `EXPOSE
   8090`. `CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]`.

**`pb_migrations/*.js`**: PocketBase JS migrations (run automatically on
first boot, tracked in `pb_data` so they don't re-run). Create the
`categories` and `dishes` collections with the rules above, then seed all
12 categories and their current default dishes — values ported directly
from today's `categories.ts`.

No `docker-compose.yml` needed — it's one container, one volume:
```
docker run -p 8090:8090 -v pb_data:/pb/pb_data <image>
```
README gets this run command plus a note to create the login account at
`/_/` after first start.

**Local dev**: `npm run dev` (Next dev server) needs a PocketBase to talk
to — document running the downloaded binary (or the same Docker image)
locally on port 8090, with `NEXT_PUBLIC_PB_URL=http://localhost:8090` for
the dev server.

## Error handling

- Logged-out users attempting a mutation never see the controls in the
  first place (gated in UI); PocketBase's API rules are the real
  enforcement layer regardless (defense in depth — a direct API call
  without auth gets rejected server-side too).
- Network/PocketBase-unreachable on page load: existing pages should fail
  soft — show the page shell with an inline "couldn't load" state rather
  than a blank crash, consistent with the app's calm/no-guilt design ethos.
- Failed login: inline error under the form ("wrong email or password"),
  no page reload.

## Testing

- A runnable smoke check for the migrations: after `pocketbase serve`
  starts against a fresh `pb_data`, verify (script or documented manual
  steps) that `categories` has 12 records and `dishes` has the expected
  seeded count, and that an unauthenticated `POST` to `/api/collections/
  dishes/records` is rejected while an authenticated one succeeds.
- Manual verification: build the Docker image, run it, confirm the app
  loads at `/`, is read-only when logged out, and that logging in at the
  nav's login control unlocks the Dishes edit controls.

## Open items for the implementation plan

- Exact PocketBase version to pin.
- Whether `useDishes`/`useCategories` do a simple fetch-on-mount or add a
  light loading/error state to each page.
