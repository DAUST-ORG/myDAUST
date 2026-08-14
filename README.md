# myDAUST

Campus platform for DAUST. Monorepo (pnpm + Turborepo). See [`docs/production-status.md`](docs/production-status.md) for the current production handoff and [`TODO.md`](TODO.md) for the broader backlog.

Current state — **core portals and AWS production infrastructure are live**; Phases 1–5 are implemented, and recent academics, payment, and media work is summarized in the production status document.

- **Payments (P1)** — resumable Wave, Orange Money, and bank proof submissions; PI-SPI request-to-pay; Finance verification; director audit; payment plans/installments; collections dashboard; receipts; internal refunds; A/R aging; reports; and money-in/out by cost center.
- **Academics (P2)** — course catalog, seat-locked enrollment (concurrency-safe), prerequisites, faculty gradebook/attendance/assignments + submission grading, insights (grade distribution, at-risk), advising, schedule grids, GPA ring, printable transcript & enrollment verification, messaging/inbox, events, library.
- **Admissions + Vitrine (P3)** — public marketing site (`apps/vitrine`, :3001) with anonymous Apply → applicant funnel + confirmation email; BAC merit-scholarship auto-award; fee structure; transactional email seam (Resend or dev-log).
- **Dining + Student Affairs (P4)** — student dining pass (signed QR), weekend orders, meal plans; scanner station + orders kanban + menus + settlement console; housing assignment, roommate matching (weighted heuristic), conduct SLA workflow, clubs, co-curricular budget.
- **Innovation + HR-lite + Student ID (P5)** — 7-phase project tracker (student roadmap/tasks/submissions + admin review queue/grading); faculty payslips (derived from salary records), leave, room booking; student ID card with campus QR.

**Current priorities:** deploy and smoke-test the local faculty-management/schedule/gradebook fixes, resolve the duplicate Moussa Thiao identity and Fall 2026 instructor gaps, configure wire transfers, backfill missing legacy media, and turn the substantial local worktree into reviewed, reproducible commits. Longer-term integration and product gaps remain in `TODO.md`.

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

### Payment methods

Finance configures Wave, Orange Money, and bank-transfer instructions in the Payment Reviews workspace. Proof and QR files use `WIRE_PROOFS_BUCKET` when configured, with local private storage in development. PI-SPI remains independently environment-configured.

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
