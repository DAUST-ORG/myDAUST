# Phase 0 · IT portal backlog (GitHub Issues integration)

## Why

The IT team needs a public-by-default backlog visible to anyone in the
portal, not just `it_admin`. GitHub Issues is the system of record: zero
new infrastructure, no second source of truth, free text search, labels,
assignments, and history out of the box. The portal surfaces a filtered
view and a submission form so users do not have to know the URL.

This branch does NOT add an in-SIS ticket model. If GitHub Issues turns
out to be the wrong tool after 30 days, the integration is a single
portal page and a few env vars, not a schema migration.

## Scope

### GitHub side (`.github/`)

1. **Labels** committed as a one-shot script
   `scripts/seed-it-labels.sh` (run by the operator with `gh auth login`):

   - `it-backlog` (color `#1d76db`) — the catch-all for IT portal backlog
     items
   - `it-bug` (color `#d73a4a`) — IT-tracked bug reports
   - `it-task` (color `#fbca04`) — IT-tracked operational tasks

   Existing label conventions in the repo are not changed; new labels
   are additive. The script is idempotent.

2. **Issue templates** under `.github/ISSUE_TEMPLATE/`:

   - `it-bug-report.yml` — name, summary, steps to reproduce, expected
     vs actual, environment. Defaults to label `it-bug`.
   - `it-feature-request.yml` — problem, proposed solution,
     alternatives, impact. Defaults to label `it-backlog`.
   - `it-task.yml` — short description, acceptance criteria,
     dependencies. Defaults to label `it-task`.

   Each template's `body` is plain Markdown.

3. **Repository settings** that cannot be configured from files (label
   descriptions, default repo permissions for triage): documented in
   `docs/operator-runbooks/it-portal-backlog-setup.md` as a checklist.

### Portal side (`apps/portal/src/app/it/backlog/`)

1. **Server-rendered page** at `app/it/backlog/page.tsx` that resolves
   the external URL via env and renders the link. No data fetching
   from GitHub inside the SIS — clicking the link leaves the portal.

2. **`it-backlog` filtered issues URL** computed from
   `process.env.NEXT_PUBLIC_IT_BACKLOG_URL` (default
   `https://github.com/DAUST-ORG/myDAUST/issues?q=is%3Aopen+label%3Ait-backlog`).

3. **`/it` landing verification.** AGENTS.md §12 says `it_admin`
   lands on `/director/users`; verify the existing
   `apps/portal/src/lib/nav.ts` `ROLE_PORTALS` entry for `it_admin`
   still routes correctly. No code change expected. Add a 3-line
   comment pointing at AGENTS.md §12 so future agents do not delete it.

4. **`/it/backlog` page** displays:

   - A primary "Open the IT backlog" CTA linking to the filtered
     issues URL.
   - Three secondary "File a bug / request a feature / log a task"
     CTAs linking to `github.com/DAUST-ORG/myDAUST/issues/new?template=<name>`.
   - A short blurb explaining the system.
   - A tip noting that any portal session can submit.

5. **Nav entry** added to `it`'s `PortalNav` in
   `apps/portal/src/lib/nav.ts`. `PAGE_META["/it/backlog"] = { title:
   "IT backlog", crumb: "IT" }`.

## Acceptance criteria

1. The three new issue template files exist and pass `gh issue create
   --template <name>` syntax validation.
2. The three new labels exist (verified by `gh label list`).
3. `pnpm --filter @mydaust/portal run build` succeeds.
4. `pnpm -r typecheck` passes.
5. Loading `/it/backlog` renders the CTAs and the explanatory blurb.
6. AGENTS.md §12 entry for `it_admin` is intact.

## Out of scope

- API-based issue creation from inside the portal.
- Server-side rate limiting on the GitHub links.
- Per-user issue attribution.
- Notifications when issues change state.

## Risks

- **Public-by-default.** Anything filed under `it-backlog` is visible
  to anyone with the repo URL. The portal page warns about putting
  PII in issue bodies.
- **GitHub auth.** Filing an issue requires the user to be signed in
  to GitHub. Documented in the PR description.
- **Repo rename.** The hardcoded default is a fallback; the env
  override lets the operator retarget without a code change.
