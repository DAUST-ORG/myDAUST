# myDAUST

Campus platform for DAUST. Monorepo (pnpm + Turborepo). Full plan: see the approved build plan in `~/.claude/plans/`.

Current state:
- **Phase 1 — payments**: students pay tuition (PayTech: Wave / Orange Money / card), bursar tracks collections. Email+password auth (Passport + bcrypt + JWT cookie).
- **Phase 2 — academic core (in progress)**: course catalog, term offerings, **seat-locked enrollment** (concurrency-safe), prerequisite checks, add/drop, student registration page, faculty rosters.

Infra (OpenTofu/AWS) and remaining modules (grades, attendance, transcripts, admissions, student-life, dining) are planned but not yet built.

## Layout

```
apps/
  api/        NestJS — finance module, PayTech provider, IPN webhook
  portal/     Next.js — student billing + bursar tracking
packages/
  shared/     Zod contracts (XOF money, cost centers, payment DTOs)
  db/         Prisma schema + client + seed
  tsconfig/   shared TS configs
infra/        OpenTofu (planned)
```

## Run locally

```bash
pnpm install
docker compose up -d                 # Postgres on :5432

export DATABASE_URL="postgresql://mydaust:mydaust@localhost:5432/mydaust?schema=public"
pnpm --filter @mydaust/db exec prisma migrate dev   # apply migrations
pnpm --filter @mydaust/db run seed                  # cost centers + demo student/invoice

# terminal 1 — api (:4000)
DATABASE_URL=$DATABASE_URL PORT=4000 PORTAL_ORIGIN=http://localhost:3000 \
  pnpm --filter @mydaust/api dev

# terminal 2 — portal (:3000)
pnpm --filter @mydaust/portal dev
```

Open http://localhost:3000 → Student billing (pay) / Bursar (track).

### Real payments
Set `PAYTECH_API_KEY`, `PAYTECH_API_SECRET` (sandbox), and `PAYTECH_IPN_URL` /
`PAYTECH_SUCCESS_URL` / `PAYTECH_CANCEL_URL` in a gitignored `.env`. For local IPN delivery,
expose the api with a tunnel: `cloudflared tunnel --url http://localhost:4000`.

## Auth

Email + password login (NestJS Passport: `passport-local` → `passport-jwt`, bcrypt hashes,
HS256 JWT in an httpOnly cookie). Google Workspace SSO replaces the login step later; the
session/guard/role machinery stays.

Seeded users share dev password **`daust-dev-2026`** — e.g. `aissatou.diallo@daust.edu`
(student), `bursar@daust.edu`, `admin@daust.edu`, `registrar@daust.edu`. Sign in at `/login`.

Production guards: passwordless paths removed; cookies get `Secure` when `NODE_ENV=production`;
boot fails if `SESSION_SECRET` is left at its dev default in production.
