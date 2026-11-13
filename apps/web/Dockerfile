# Next.js customer + admin site (standalone output). Build from the repo root:
#   docker build -f apps/web/Dockerfile --build-arg WEB_URL=https://yourdomain.com --build-arg ADMIN_DOMAIN=admin.yourdomain.com .
FROM node:22-alpine AS build
ARG WEB_URL=http://localhost:3000
ARG ADMIN_DOMAIN=admin.localhost:3000
ARG APP_NAME=Panel
# Values Next.js reads while building (sitemap, metadata, admin host routing, API rewrite target).
ENV WEB_URL=${WEB_URL} ADMIN_DOMAIN=${ADMIN_DOMAIN} APP_NAME=${APP_NAME} API_URL=http://api:4000 NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @smm/web build

FROM node:22-alpine
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER node
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/web/server.js"]
