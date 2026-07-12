# myDAUST

Campus platform for DAUST. Monorepo (pnpm + Turborepo). Full plan: see the approved build plan in `~/.claude/plans/`; open work is tracked in `TODO.md`.

Current state — **Phases 1–5 built and verified locally** (deploy/Track B not started):

- **Payments (P1)** — PayTech (Wave / Orange Money / card), signature-verified idempotent IPN, payment plans/installments, reconciliation cron, collections dashboard, receipts (email), refunds, A/R aging, 8 canned reports, director money-in/out by cost center.
- **Academics (P2)** — course catalog, seat-locked enrollment (concurrency-safe), prerequisites, faculty gradebook/attendance/assignments + submission grading, insights (grade distribution, at-risk), advising, schedule grids, GPA ring, printable transcript & enrollment verification, messaging/inbox, events, library.
- **Admissions + Vitrine (P3)** — public marketing site (`apps/vitrine`, :3001) with anonymous Apply → applicant funnel + confirmation email; BAC merit-scholarship auto-award; fee structure; transactional email seam (Resend or dev-log).
- **Dining + Student Affairs (P4)** — student dining pass (signed QR), weekend orders, meal plans; scanner station + orders kanban + menus + settlement console; housing assignment, roommate matching (weighted heuristic), conduct SLA workflow, clubs, co-curricular budget.
- **Innovation + HR-lite + Student ID (P5)** — 7-phase project tracker (student roadmap/tasks/submissions + admin review queue/grading); faculty payslips (derived from salary records), leave, room booking; student ID card with campus QR.

**Not yet built:** AWS/OpenTofu infra, CI/CD, Sentry/PostHog, Google OIDC, the Phase-6 AI upgrades, and the test suite — see `TODO.md`.

## Layout

```
apps/
  api/        NestJS — auth, finance, academics, comms, campus, admissions,
              dining, affairs, innovation, hr, uploads, mail
  portal/     Next.js (:3000) — role areas: /student /faculty /admin /dining /affairs /innovation
  vitrine/    Next.js (:3001) — public site + anonymous Apply
packages/
  shared/     Zod contracts (XOF money, cost centers, payment/academic/dining DTOs, fees, scholarships)
  db/         Prisma schema + client + seed
  tsconfig/   shared TS configs
design/       7 throwaway design prototypes (source of truth for screens)
infra/        OpenTofu (planned — not started)
```

## Run locally

```bash
pnpm install
docker compose up -d                 # Postgres on :5432

export DATABASE_URL="postgresql://mydaust:mydaust@localhost:5432/mydaust?schema=public"
pnpm --filter @mydaust/db exec prisma migrate dev   # apply migrations
pnpm --filter @mydaust/db run seed                  # cost centers, users, academics, dining, affairs, innovation

# terminal 1 — api (:4000)   (reads the gitignored root .env)
pnpm --filter @mydaust/api dev

# terminal 2 — portal (:3000)
pnpm --filter @mydaust/portal dev

# terminal 3 — vitrine (:3001)
pnpm --filter @mydaust/vitrine dev
```

Open http://localhost:3000/login (portal) and http://localhost:3001 (public site).

### Real payments
Set `PAYTECH_API_KEY`, `PAYTECH_API_SECRET` (sandbox), and `PAYTECH_IPN_URL` /
`PAYTECH_SUCCESS_URL` / `PAYTECH_CANCEL_URL` in a gitignored `.env`. For local IPN delivery,
expose the api with a tunnel: `cloudflared tunnel --url http://localhost:4000`.

### Transactional email
Optional: set `RESEND_API_KEY` (+ `MAIL_FROM`) to send real email; without it, emails are
logged to the api console (`[dev-mail]`).

## Auth

Email + password login (NestJS Passport: `passport-local` → `passport-jwt`, bcrypt hashes,
HS256 JWT in an httpOnly cookie). Google Workspace SSO replaces the login step later; the
session/guard/role machinery stays.

Seeded users share dev password **`daust-dev-2026`** — students `aissatou.diallo@daust.edu`,
`mamadou.sy@daust.edu`, `bineta.faye@daust.edu`; staff `amadou.ba@daust.edu` (faculty),
`admin@daust.edu`, `registrar@daust.edu`, `bursar@daust.edu`, `hr@daust.edu`,
`studentaffairs@daust.edu`, `dining@daust.edu`, `innovation@daust.edu`, `it@daust.edu`.
Sign in at `/login` — each role lands on its own portal area.

Production guards: passwordless paths removed; cookies get `Secure` when `NODE_ENV=production`;
boot fails if `SESSION_SECRET` is left at its dev default in production.

## Branches & deploys

- `develop` → auto-deploys **staging** (`daust-staging.azt.dev` app · `daust.azt.dev` vitrine · demo seed).
- `main` → auto-deploys **prod** (`my.daust.net` app · `daust.net` vitrine · real data, bootstrap via `pnpm --filter @mydaust/db run bootstrap:prod`).
- Flow: feature branch → PR into `develop` (CI: typecheck + tests) → verify on staging → merge `develop` into `main`.
- CI auth is GitHub OIDC (`infra/global/`); workflows only bump images / sync the vitrine — infrastructure changes are operator-run OpenTofu (pass the currently-running image tags when applying manually).
