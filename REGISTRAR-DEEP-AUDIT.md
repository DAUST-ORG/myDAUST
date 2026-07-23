# Registrar Portal — deep audit (every screen, every button)

Captured 2026-07-23. All 17 registrar screens audited element-by-element: each interactive
control traced from its handler → client API (`apps/portal/src/lib/api.ts`) → NestJS
controller + service, judged for backend health, design fidelity, and whether it makes
sense. Every severe finding was adversarially re-verified; the headline was confirmed live
on staging.

Full report (screenshots + per-screen cards): https://claude.ai/code/artifact/b916c2ce-5965-4f17-8c55-72e9a13dc8b3

Tally across ~297 elements: **181 OK · 62 cosmetic · 7 missing · 7 broken**.

## Headline (runtime-confirmed)

A **registrar-only** account cannot do its core job and the failure leaks raw JSON.
Enroll/Import student (POST `/finance/admin/students`) and the student-detail Finance
actions (Create link / Remove charge / Save plan) are gated to **bursar + admin** only
(class `@Roles("bursar","admin")` in `admin-finance.controller.ts:68`; only the GET
account read at :137 overrides to include registrar). Clicking Enroll as
`registrar@daust.edu` returns **403** and the UI shows the raw
`403: {"message":"Insufficient role",...}`. Latent for `admin` (also holds `bursar`).

## Confirmed severe findings

- **Students / Admissions — Enroll/Import 403** (above). Also on Admissions detail.
- **Students detail — Finance-tab money actions 403** for registrar (rendered but balance-gated, not role-gated).
- **Students detail — Transcript** is `window.print()` of the on-screen profile (prints app chrome, not a transcript). **Payment reminder** sends nothing, only navigates. Both over-promise.
- **Parents — edit can't reassign children.** `setGuardianChildren` / PATCH `/guardians/:id/children` exist + audited but are unwired; children only settable at creation.
- **Student Success — Following panel has no unfollow.** DELETE watch endpoint exists but isn't wired; a followed-then-improved student becomes un-unfollowable. Also "Warnings sent — this term" counts all-time (no term filter).
- **Admissions detail — hides captured data.** Backend returns DOB/phone/gender/nationality/parent/GPA/statement-of-purpose; the read view shows almost none of it.
- **Messages — no live recipient-count preview** before broadcasting to a program / all students.
- **Course Catalog — no delete-course** (no endpoint at all) and **no co-requisite control** (coreqs ARE enforced server-side). Prereqs edit-only.
- **Faculty & Staff — read-only directory** whose breadcrumb promises "role assignment"; PATCH `/users/:id/roles` exists but is unwired. Errors swallowed; role chips mis-styled/unhumanized.

## Integrity / hardening (functional but risky)

- **Grading Schemes** — delete-row has no confirm + no referential guard → can silently break derived GPA/transcripts.
- **Rule Engine** — Save fires two non-atomic writes (rule PATCH + requisites PUT); partial failure leaves inconsistent state.
- **Settings** — tier-delete has no try/catch (silent unhandled rejection) + no confirm.
- **Client-vs-server validation** mismatches (enrollment cap 0–9999 vs 1000; grade-scale scores). Several screens swallow fetch errors (Dashboard, Staff).

## Healthy screens (wired, audited, faithful)

Dashboard, Departments, Academic Years, Programs & Curriculum, Course Enrollment
(Offerings), Academic Calendar, Rule Engine, Grading Schemes, Grade Approvals, Settings,
Messages, Student Success — all mostly good, with the per-screen cosmetics noted in the
artifact.

## Decisions needed

1. **Registrar money authz (the crux).** Grant registrar POST `/finance/admin/students`; OR route student-creation through a non-money registrar endpoint; OR treat enrollment as a bursar/admin job and hide those controls for registrar-only accounts. All three still need the raw-403 UX fixed. Touches `apps/api/src/finance` — money-path decision.
2. **Faculty & Staff / RBAC** — role assignment was intentionally deferred. Keep deferred (fix the breadcrumb) or build it now (`PATCH /users/:id/roles` exists)?
3. **Course deletion** — add delete-course (needs soft-delete + referential guard) or keep the catalog append-only?

## Method note

The audit workflow read the local working tree; a first authz probe on staging looked
contradictory (400 not 403), which turned out to be a shell/subshell sandbox artifact — a
clean probe and a live click both confirmed the 403. Trust the clean-probe + live-click
evidence.
