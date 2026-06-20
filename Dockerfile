# syntax=docker/dockerfile:1

# Single image that runs apps/api and serves the built apps/web. glibc base (bookworm) matches the tsx
# prebuilds (musl/Alpine would pull source builds). Pinned by digest for reproducible builds — bump the
# digest deliberately to pick up base image (security) updates.
FROM node:22-bookworm-slim@sha256:d9f850096136edbc402debdd8729579a288aac64574ada0ff4db26b6ae58b0b2 AS base
WORKDIR /app

FROM base AS build
# pnpm is a build-only tool — kept out of the runner stage so it never ships in the production image.
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate
# Copy only the manifests first so the install layer caches across source-only changes.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
# Builds @viraloderegal/shared first, then api + web.
RUN pnpm -r build
# Self-contained production bundle: flattens the shared workspace dep, drops devDeps but keeps tsx (the
# migrations are uncompiled .ts run at boot), copies dist + migrations. --legacy is required on pnpm 11.
RUN pnpm --filter @viraloderegal/api deploy --prod --legacy /app/deploy

FROM base AS runner
ENV NODE_ENV=production
ENV WEB_DIST_DIR=/app/web
WORKDIR /app/api
COPY --from=build /app/deploy ./
COPY --from=build /app/apps/web/dist /app/web
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
# Documents the default PORT; the runtime honors $PORT if overridden.
EXPOSE 3000
USER node
ENTRYPOINT ["/app/docker-entrypoint.sh"]
