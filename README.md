# Viral oder Egal

A browser-based, German-language party game: 2–10 players join an ad-hoc room via a 6-character code and compete to guess the total YouTube view count of short clips. A server-authoritative loop drives synchronized rounds; a separate, auth-guarded `/admin` workspace curates the video pool.

The system runs as a single long-lived Node service (Hono HTTP + WebSocket) backed by Postgres, deployed as one container image. The API is the only database client and owns all authorization in application code (no row-level security).

## Package layout

This is a [pnpm](https://pnpm.io) workspace on Node 22:

| Package           | Purpose                                                                        |
| ----------------- | ------------------------------------------------------------------------------ |
| `apps/api`        | Hono server: REST, the WebSocket hub, the authoritative game loop, DB access.  |
| `apps/web`        | Vue 3 + Vite SPA. In production the API serves the built bundle on one port.   |
| `packages/shared` | Types, zod schemas, constants, username rules, and scoring helpers (no drift). |

## Getting started

```sh
pnpm install
pnpm dev:db                 # start the local Postgres container
pnpm migrate               # apply schema + seed the Phase-1 video pool
pnpm dev                   # shared (watch) + api (:3000) + web dev server (:5173)
curl localhost:3000/health # {"status":"ok","uptime":...}
```

Dev and test fall back to the local Compose stack, so a bare checkout boots with zero config; copy `.env.example` to `.env` only to override.

## Common commands

| Command          | Description                                               |
| ---------------- | --------------------------------------------------------- |
| `pnpm dev`       | Run shared (watch), the API, and the web dev server.      |
| `pnpm dev:db`    | Start the local Postgres container.                       |
| `pnpm build`     | Build all packages (`shared` → `web` / `api`).            |
| `pnpm typecheck` | Type-check every package.                                 |
| `pnpm lint`      | ESLint across the workspace.                              |
| `pnpm format`    | Format with Prettier (`format:check` to verify only).     |
| `pnpm test`      | Unit/component tests (Vitest). `pnpm e2e` for Playwright. |
| `pnpm migrate`   | Apply pending migrations (idempotent).                    |
| `pnpm knip`      | Report unused files, dependencies, and exports.           |

## Database

Schema lives in ordered, timestamp-named TypeScript migrations under `apps/api/migrations/`, applied by Kysely's `FileMigrationProvider` (run at boot via `tsx`). The `db` singleton and its hand-written table types live in `apps/api/src/db/kysely.ts` and reuse the shared enum unions so the type layer stays single-source. better-auth manages its own tables separately (Phase 2).

## Deployment

`docker build .` produces a single image that runs migrations on start, then serves the SPA, REST, and WebSocket on one port. `/health` backs the container healthcheck. `docker compose up` runs the app against a local Postgres.

## License

Released under the [MIT License](LICENSE).
