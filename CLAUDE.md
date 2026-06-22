# Viral oder Egal

A browser-based, German-language party game: 2–10 players join an ad-hoc room via a 6-character code and guess YouTube view counts. pnpm monorepo, Node 22, pnpm via Corepack.

## Layout

- `apps/web` — Vue 3 (`<script setup>`) SPA built with Vite. The game UI and a route-guarded `/admin` section (Phase 2).
- `apps/api` — Hono API on Node 22 (`@hono/node-server`): Kysely + Postgres, Zod-validated requests; the single database client. It will own the WebSocket hub and the authoritative game loop.
- `packages/shared` — browser-safe Zod schemas, types, the room-code alphabet, username rules, game constants, and scoring helpers. Ships a built `dist/` via `tsc -b`; consumers build it first.

## Commands & the merge gate

| Command                                                     | Use                                               |
| ----------------------------------------------------------- | ------------------------------------------------- |
| `pnpm dev`                                                  | shared (watch) + web (Vite) + api (Hono) together |
| `pnpm dev:db`                                               | start the local Postgres container                |
| `pnpm build` / `pnpm typecheck` / `pnpm lint` / `pnpm knip` | per-package, topological                          |
| `pnpm test`                                                 | Vitest across packages                            |
| `pnpm e2e`                                                  | Playwright headless smoke (Chromium)              |
| `pnpm --filter @viraloderegal/api migrate`                  | run Kysely migrations                             |

CI runs one `quality` job — build → typecheck → lint → knip → Vitest → migrate → Playwright — and it is the merge gate. **A non-zero exit from any of these (including knip) is a hard gate, not a warning.** If a quality tool is red, fix it or stop.

## Conventions

- **API is the only DB client.** All database access goes through `apps/api`; clients never touch the database, and authorization lives in application code — never rely on Postgres row-level security.
- **DB access.** One `db` singleton from `apps/api/src/db/kysely.ts`, whose table interfaces are hand-written there (no codegen) and reuse the shared enum unions so the type layer stays single-source. Migrations are ordered, timestamp-named `.ts` files in `apps/api/migrations/` (Kysely `FileMigrationProvider`), applied at boot by `docker-entrypoint.sh` via `tsx`. better-auth manages its own tables separately (Phase 2).
- **Server-authoritative game loop.** A single long-lived process owns phase timers and the hidden answer until reveal. `rounds.current_phase`/`phase_end_at` persist on every transition; per-room commands serialize through an in-memory mutex (`apps/api/src/rooms/roomLock.ts`). That mutex is **non-reentrant** — never nest `withRoomLock` for the same room (the inner acquire awaits a tail containing the outer and deadlocks). One boundary per room: a caller acquires the lock and invokes lock-free internals; timer/lifecycle callbacks that have no outer lock acquire it themselves, while code already running under the lock (e.g. `handleJoin` → resume/reschedule paths) must call lock-free helpers. Horizontal scaling is out of scope.
- **Env.** `apps/api/src/env.ts` parses `process.env` with Zod and fails fast in production; dev/test fall back to the local Compose stack so a bare checkout boots with zero config. Never read `process.env` from `packages/shared` — keep it browser-safe.
- **SPA ↔ API.** Same origin: in production the API serves the built SPA (`static.ts`, mounted only in production) and `/health` backs the container healthcheck; in dev Vite serves the SPA on a separate port. API routes are matched before the SPA fallback, so an API route sharing a path with an SPA client route shadows that document on a refresh/deep-link. New API routes that would collide with an SPA route (e.g. the `/admin` section) mount under `/api/` instead; the dev Vite proxy forwards those prefixes to the API.
- **Shared contracts.** Cross-side values both client and server enforce (room-code alphabet, username rules, guess bound, clip-segment bounds, phase durations) live in `packages/shared` so the two cannot drift; server-only operational values live with the code that owns them.
- **i18n / UI.** The UI is German, implemented i18n-ready (vue-i18n), responsive for Chrome desktop and mobile, on a `red-600`-family accent.
- **Testing layers.** CI runs Vitest (`pnpm test`) _before_ `migrate`, so the schema is not applied during Vitest — keep Vitest DB-free (drive the app in-memory via `app.request()`, unit-test pure helpers). DB-backed coverage belongs in Playwright `e2e`, which runs after `migrate`.
- **Supply chain.** Pin GitHub Actions to commit SHAs and the Docker base to a sha256 digest; don't revert to floating tags. Bumping is manual — no dependabot/renovate.
