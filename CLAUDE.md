# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm start` — runs the server via `nodemon server.js` (auto-restarts on file changes). There is no separate dev/build step.
- No test suite exists (`npm test` is a placeholder that exits 1).
- No linter is configured.

The server reads config from `config/.env` (gitignored). Required variables:
- `PORT` — port for `app.listen`
- `DB_STRING` — MongoDB connection URI (used by `config/database.js`)

## Architecture

QuickTeam is a server-rendered (EJS) Express + MongoDB/Mongoose to-do app where todos are shared across a **team**. `server.js` wires up sessions (stored in Mongo via `connect-mongo`), Passport, flash, and mounts two routers: `routes/main.js` (`/`) for auth/landing and `routes/todos.js` (`/todos`) for todo CRUD. Standard layering: routes → `controllers/` → Mongoose `models/`. Views in `views/`, static assets in `public/`.

### The team model is the core concept (read `models/User.js` + `config/passport.js`)

There are **two distinct user types**, defined as separate Mongoose models in `models/User.js`:
- **`User`** — a full account with email + bcrypt-hashed password. The person who signs up becomes an admin.
- **`SubUser`** — a passwordless team member who joins via an invite link. Authenticated by a `passKey` (a UUID), never a password.

Both share an **`adminId`** field that ties everyone into one team:
- On first save, a `User`/`SubUser` with no `adminId` sets `adminId = _id` (so the admin's own `adminId` equals their id). See the `pre('save')` hooks.
- A `SubUser` is created with `adminId` set to the admin's id, so the whole team shares the admin's `adminId`.

**Team membership is therefore expressed purely by matching `adminId`** — there is no separate Team collection. Todos are scoped by `adminId` (`Todo.find({ adminId: req.user.adminId })`), so every member of a team sees the same todo list.

### Dual-identity auth (Passport)

`config/passport.js` uses a single `LocalStrategy` (email/password) for `User` login only. The non-obvious part is `serializeUser`/`deserializeUser`: the session stores **both an id and a `type`** (`'User'` or `'SubUser'`), and `deserializeUser` branches on `type` to load from the correct collection. Any code touching login/session must preserve this `{ id, type }` shape, because `SubUser`s have no password and can only be hydrated this way.

SubUsers are logged in directly via `req.logIn()` (no LocalStrategy) — in `getAddSubUser` (existing SubUser revisiting the invite link) and `postAddSubUser` (new SubUser). Invite links have the shape `/addSubUser/:adminId/:passKey`. The `passKey` shown on the todos page is a freshly generated UUID (`getTodos` in `controllers/todos.js`).

### Request flow notes

- `middleware/auth.js` exports `ensureAuth` (redirects unauthenticated users to `/`). Note `routes/main.js` imports a non-existent `ensureGuest` from this module — it's unused, so it's `undefined` rather than an error.
- Todo mutations from the browser (`public/js/main.js`) hit JSON endpoints (`markComplete`, `markIncomplete`, `deleteTodo` use `todoIdFromJSFile` in the body; `assignTodo` uses URL params) and then `location.reload()`. `createTodo` is a form POST that redirects.
- `req.user.adminId` and `req.user.id` are the two values controllers key off of constantly — `adminId` for "the whole team", `id` for "this specific person" (e.g. counting todos assigned to the current user).
