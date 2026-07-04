# Build from repo root: docker build -f apps/api/Dockerfile -t daust-api .
FROM node:24-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# DATABASE_URL is a dummy: prisma generate only needs the schema, not a live DB.
RUN pnpm --filter @mydaust/shared run build \
  && DATABASE_URL=postgresql://x:x@localhost:5432/x pnpm --filter @mydaust/db run build \
  && pnpm --filter @mydaust/api run build

FROM node:24-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
