# Repository Guidelines

## Project Structure & Module Organization

This repository is a pnpm/Turborepo monorepo. Application code lives under `apps/`: `api` is the NestJS backend, `portal` is the authenticated Next.js app on port 3000, and `vitrine` is the public Next.js site on port 3001. Reusable Zod contracts and domain helpers belong in `packages/shared`; Prisma schema, migrations, seeds, and the database client belong in `packages/db`. Shared TypeScript presets are in `packages/tsconfig`. Keep design references in `design/` and project documentation at the repository root or in `docs/`.

## Build, Test, and Development Commands

Use Node.js 20+ and pnpm 10.23.0.

- `pnpm install` installs all workspace dependencies.
- `docker compose up -d` starts local PostgreSQL.
- `pnpm dev` starts all development tasks through Turbo; use `pnpm --filter @mydaust/api dev` (or `portal`/`vitrine`) for one app.
- `pnpm build` builds every package and app in dependency order.
- `pnpm typecheck` runs strict TypeScript checks across the workspace.
- `pnpm test` runs all configured Vitest suites.
- `pnpm format` formats TypeScript, TSX, Markdown, and JSON with Prettier.
- `pnpm db:migrate` applies a development migration; `pnpm --filter @mydaust/db seed` loads local seed data.

## Coding Style & Naming Conventions

Write strict TypeScript with two-space indentation, double quotes, and semicolons; run Prettier before committing. Use `PascalCase` for React components and classes, `camelCase` for functions and variables, and kebab-case for NestJS feature filenames such as `paytech.provider.ts`. Keep backend features grouped by domain under `apps/api/src/<domain>/`. Import ESM workspace files with `.js` extensions where existing code does so. Lint scripts are currently placeholders, so typechecking and formatting are required safeguards.

## Testing Guidelines

Vitest discovers `src/**/*.test.ts`. Place tests beside the code they exercise and name them `<subject>.test.ts`. Cover pure shared-domain logic, validation, payment/auth boundaries, and regression cases. Run `pnpm test` and `pnpm typecheck` before opening a PR. No numeric coverage threshold is enforced; new behavior should include focused tests.

## Commit & Pull Request Guidelines

Follow the established Conventional Commit pattern: `feat(scope): summary`, `fix(scope): summary`, `refactor(scope): summary`, or `ci: summary`. Keep commits focused and imperative. Open feature PRs against `develop`; promote verified `develop` changes to `main`. PRs should explain behavior and validation, link relevant issues, call out migrations or environment changes, and include screenshots for portal or vitrine UI updates. Never commit secrets; copy `.env.example` and keep local credentials in the gitignored `.env`.
