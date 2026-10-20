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
pnpm dev:db                # start the local Postgres container
pnpm migrate               # apply schema + seed the video pool
pnpm dev                   # shared (watch) + api (:18752) + web dev server (:18759)
curl localhost:18752/health # {"status":"ok","uptime":...}
```

Dev and test fall back to the local Compose stack, so a bare checkout boots with zero config; copy `.env.example` to `.env` only to override.

## Common commands

| Command          | Description                                                          |
| ---------------- | -------------------------------------------------------------------- |
| `pnpm dev`       | Run shared (watch), the API, and the web dev server.                 |
| `pnpm dev:db`    | Start the local Postgres container.                                  |
| `pnpm build`     | Build all packages (`shared` → `web` / `api`).                       |
| `pnpm typecheck` | Type-check every package.                                            |
| `pnpm lint`      | ESLint across the workspace.                                         |
| `pnpm format`    | Format with Prettier (`format:check` to verify only).                |
| `pnpm test`      | Unit/component tests (Vitest). `pnpm e2e` for Playwright.            |
| `pnpm migrate`   | Apply pending migrations (idempotent).                               |
| `pnpm knip`      | Report unused files, dependencies, and exports.                      |
| `pnpm icon`      | Re-render the app icon PNGs and `favicon.ico` (Mac with Xcode only). |

## Database

Schema lives in ordered, timestamp-named TypeScript migrations under `apps/api/migrations/`, applied by Kysely's `FileMigrationProvider` (run at boot via `tsx`). The `db` singleton and its hand-written table types live in `apps/api/src/db/kysely.ts` and reuse the shared enum unions so the type layer stays single-source. better-auth manages its own tables separately.

## App icon

The app icon's source is the Icon Composer document `apps/web/src/assets/brand/ViralOderEgal.icon`. Its fill is a red-500 to red-700 gradient, given as Display P3 values converted from Tailwind's oklch tokens. The white peak bar and the four bars at 60% white are separate glass groups.

`pnpm icon` (`apps/web/scripts/export-icon.ts`) renders the document through the `ictool` bundled in Xcode's Icon Composer, so it runs only on a Mac with Xcode installed. It writes `apps/web/public/apple-touch-icon.png`, its corners filled because iOS paints a touch icon's transparent corners black. Beside the document it writes `logo.png`, the transparent 512 px app icon for use outside the app. Both keep the render's Display P3 profile, so the red is not clipped to sRGB. Nothing checks the PNGs against the document, so re-render them in the same commit as any edit to it.

`favicon.svg`, the header in `App.vue`, and `og-image.svg` draw the same five bars flat, in neutral grey with the red peak, without the squircle, the gradient, or the glass. `pnpm icon` also rasterizes `favicon.svg` into `favicon.ico`, so a browser that skips the SVG favicon shows the same flat mark in its tab. Re-run it after any edit to `favicon.svg`.

## Deployment

`docker build .` produces a single image that runs migrations on start, then serves the SPA, REST, and WebSocket on one port. `/health` backs the container healthcheck. `docker compose up` starts the dev Postgres alone. `docker compose -f docker-compose.prod.yml up` runs the image against its own Postgres, published on `127.0.0.1:${HOST_PORT:-18752}` for a TLS-terminating reverse proxy in front of it.

## License

Released under the [MIT License](LICENSE).
