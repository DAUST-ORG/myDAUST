# Contributing

## Commit format — Conventional Commits

This repository follows [Conventional Commits](https://www.conventionalcommits.org/) with a
**required scope**. Every commit subject line is parsed by tooling and decides whether the next
release is a `feat` (minor), `fix` (patch), or no bump at all.

```
<type>(<scope>): <subject>
```

`type` is one of:

`feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `style`, `build`, `ci`, `release`.

A scope is required when one applies (most production commits) and follows the package or
domain name. Common scopes in this repo:

- `api` — `apps/api` (NestJS service code)
- `portal` — `apps/portal` (Next.js authenticated UI)
- `vitrine` — `apps/vitrine` (public Next.js site)
- `db` — `packages/db` (Prisma schema, migrations, seed)
- `shared` — `packages/shared` (Zod contracts, domain logic)
- `finance`, `academics`, `admissions`, `comms`, `infirmary`, `it`, `dining`, … — domain
  folders under `apps/api/src/`
- `ci` / `docs` / `infra` / `data` — global concerns (use as type, scope optional)

The full set of scopes for a release-please group heading is defined in
`release-please-config.json`.

## The `(AI-generated)` suffix

Since 2026-08-15, every commit authored by an AI agent on behalf of a human carries the literal
suffix `(AI-generated)` at the end of the subject line. The `commit:check` script strips this
suffix before validating the rest of the line, so it never causes a parse failure.

## The `release:` promotion prefix

Promotion PRs from `develop` to `main` (and the release-please PRs that result from them) use
a `release:` prefix instead of a Conventional Commit shape:

```
release: api v0.2.0
```

`commit:check` accepts any `release:` subject without parsing it as a Conventional Commit, and
`release-please-config.json` sets `pull-request-header-pattern: "^release:\\s*"` so release-please
PR titles merge cleanly.

## Validating a subject before committing

This repo deliberately does **not** wire a pre-commit hook (see `phase-0-release-please.md` §"Risks"
and `AGENTS.md` §17). Run the checker explicitly:

```bash
pnpm commit:check "feat(api): add foo"
pnpm commit:check "release: api v0.2.0"
```

The script prints a one-sentence hint on failure and exits non-zero, so it slots into any
external automation you prefer.
