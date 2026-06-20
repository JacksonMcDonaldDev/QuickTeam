# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Status:** QuickTeam is mid-rebuild into v1 — accountless, capability-URL shared lists
> (htmx, server-rendered). The old account/password/team app has been torn down (slice 1).
> See issue #1 for the full PRD and the slice issues (#2…) for the incremental plan.

## Commands

- `npm start` — runs the server via `nodemon server.js` (auto-restarts on file changes). No build step.
- `npm test` — runs the test suite via Node's built-in runner (`node --test`), discovering `*.test.js`. No extra test framework; assertions use `node:assert/strict`.
- No linter is configured.

The server reads config from `config/.env` (gitignored); see `config/.env.example`. Variables:
- `PORT` — port for `app.listen`
- `DB_STRING` — MongoDB connection URI (used by `config/database.js`)
- `COOKIE_SECRET` — secret used to sign identity cookies (member + owner tokens)

## Architecture

QuickTeam is a server-rendered (EJS) Express + MongoDB/Mongoose app. A **list is a secret
capability URL** (`/l/<token>`): anyone with the link can view and participate, with no account
and no password. There is no login. (The old `User`/`SubUser`/Passport/bcrypt stack has been
removed — do not reintroduce it.)

- **`app.js`** builds and exports the Express app (middleware + routes) *without* connecting to a
  DB or binding a port. This is the supertest seam — tests call `createApp()` directly.
- **`server.js`** is the production entrypoint: load `.env`, `connectDB()`, then `app.listen()`.
- Standard layering: `routes/` → `controllers/` → Mongoose `models/`. Views in `views/`, static
  assets in `public/`. `routes/main.js` (`/`) currently serves the landing page.
- **Identity is via signed cookies**, not sessions — `cookieParser(process.env.COOKIE_SECRET)`.
- **htmx is vendored** at `public/js/htmx.min.js` (committed, served locally — never CDN, never
  package-installed) to keep the app build-free and runnable unchanged for years.

### Testing

Single seam: **supertest driving the Express app over HTTP, backed by an ephemeral
`mongodb-memory-server`** (`tests/helpers/db.js` exposes `connect`/`disconnect`/`clear`). Tests
assert on externally observable behavior — the rendered HTML/htmx fragment, HTTP status,
redirects, and resulting DB state — never on internal function shapes or template internals.
Identity-bearing flows should use a supertest `agent` so cookies are exercised like a browser.

### Direction (not yet built)

Upcoming slices add: list creation → capability URL + owner cookie; name-gate join + per-device
member identity; live polling of the items region (~3s, add-input kept outside the swap); Tier 0
actions (add/check/uncheck) for everyone; Tier 1 actions (assign, subtasks, delete, reorder)
behind a menu; owner-only list delete; caps + rate-limiting + 90-day inactivity expiry. The list
will be modeled as **one Mongo document with embedded `members[]` and `items[]`**.
