# Build from repo root: docker build -f apps/portal/Dockerfile -t daust-portal .
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @mydaust/shared run build
# Build-time ONLY: inlined into client chunks; changing it requires an image rebuild.
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @mydaust/portal run build

FROM node:24-slim AS runtime
WORKDIR /app
COPY --from=build /app/apps/portal/.next/standalone ./
COPY --from=build /app/apps/portal/.next/static ./apps/portal/.next/static
# next standalone omits public/ by design; the server serves it from ./public next to server.js
COPY --from=build /app/apps/portal/public ./apps/portal/public
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["node", "apps/portal/server.js"]
