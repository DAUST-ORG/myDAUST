# Build from repo root: docker build -f apps/api/Dockerfile -t daust-api .
FROM node:24-slim AS build
# The slim image starts without a CA bundle. Bootstrap Debian's GPG-signed
# repositories over HTTPS, then install the certificates used by Prisma/runtime.
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
  && apt-get -o Acquire::https::Verify-Peer=false update \
  && apt-get -o Acquire::https::Verify-Peer=false install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# DATABASE_URL is a dummy: prisma generate only needs the schema, not a live DB.
RUN pnpm --filter @mydaust/shared run build \
  && DATABASE_URL=postgresql://x:x@localhost:5432/x pnpm --filter @mydaust/db run build \
  && pnpm --filter @mydaust/api run build
# Produce a self-contained runtime instead of copying the entire monorepo and
# its dev dependencies. Prisma + tsx remain because ECS runs migrations and the
# idempotent SIS reference loader from this same, freshly built image.
RUN pnpm --filter @mydaust/api deploy --prod --legacy /runtime/api \
  && cd /runtime/api \
  && DATABASE_URL=postgresql://x:x@localhost:5432/x node node_modules/prisma/build/index.js generate --schema=node_modules/@mydaust/db/prisma/schema.prisma

FROM node:24-slim AS runtime
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
  && apt-get -o Acquire::https::Verify-Peer=false update \
  && apt-get -o Acquire::https::Verify-Peer=false install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY --from=build /runtime/api /app
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["node", "dist/main.js"]
