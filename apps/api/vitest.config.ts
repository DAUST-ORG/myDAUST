import { defineConfig } from "vitest/config";

/**
 * Integration suites each create a throwaway schema and shell out to
 * `prisma migrate deploy` against one shared PostgreSQL. Run in parallel they
 * contend on migration locks and fail in `beforeAll` — a failure mode that looks
 * like broken code but is only the harness. So when a database is configured,
 * files run one at a time. Without one every DB-backed suite self-skips and the
 * remaining unit tests are free to parallelise.
 */
const hasDatabase = Boolean(
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
);

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    fileParallelism: !hasDatabase,
    testTimeout: hasDatabase ? 120_000 : 5_000,
    hookTimeout: hasDatabase ? 180_000 : 10_000,
  },
});
