# Changelog

All notable changes to this project are documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Dates are `YYYY-MM-DD`.

## [Unreleased]

### Added
- CI workflow (typecheck, lint, test, build via Turborepo) on push to `main` and on pull requests.
- Changelog policy: a PR check that comments (non-blocking) when code changes don't touch this file.
- Secret scanning (gitleaks) on push and pull requests.
- Route-access audit script (`.github/scripts/audit-routes.mjs`) that lists every API endpoint and flags fully public routes and mutating routes with no role restriction, for manual review.

## [0.1.0] - 2026-06-28

### Added
- Initial monorepo scaffold: pnpm workspaces + Turborepo, `apps/api` (NestJS), `apps/portal`, `apps/vitrine` (Next.js), `packages/db` (Prisma), `packages/shared` (Zod contracts).
- Auth: email + password login (Passport local → JWT httpOnly cookie), `RolesGuard` + `@Roles`/`@Public` decorators, ownership checks in services.
- Academics: course catalog, term offerings, seat-locked enrollment (`SELECT ... FOR UPDATE`), prerequisite checks, add/drop, gradebook, attendance, assignments & submissions, faculty insights/advisees.
- Finance: invoices, payment plans/installments, PayTech (Wave / Orange Money / card) integration with IPN webhook, A/R aging, director cost-center overview, refunds, reconciliation.
- Admissions (public apply flow + applicant funnel), Student Affairs (housing, roommate matching, conduct cases, clubs, co-curricular budget), Dining (meal plans, weekend orders, entrance scanning), Innovation Studio project tracker, HR-lite (leave requests, room bookings), internal messaging, campus events & library catalog, announcements.
- Public marketing/admissions site (`vitrine`).
