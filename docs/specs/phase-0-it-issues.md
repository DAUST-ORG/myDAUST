# Phase 0 · IT portal backlog (GitHub Issues integration)

## Why

The IT team needs a public-by-default backlog visible to anyone in the portal,
not just `it_admin`. Per the user's decision, GitHub Issues is the system of
record: zero new infrastructure, no second source of truth, free text search,
labels, assignments, and history out of the box. The portal surfaces a
filtered view and a submission form so users do not have to know the URL.

This branch does NOT add an in-SIS ticket model. If GitHub Issues turns out
to be the wrong tool after 30 days, the integration is a single portal page
and a few env vars, not a schema migration.

## Scope

### GitHub side (`.github/`)

1. **Labels** committed as a one-shot script
   `scripts/seed-it-labels.sh` (run by the operator with a `gh auth login`):

   - `it-backlog` (color `#1d76db`) — the catch-all for IT portal backlog items
   - `it-bug` (color `#d73a4a`) — IT-tracked bug reports
   - `it-task` (color `#fbca04`) — IT-tracked operational tasks

   Existing label conventions in the repo are not changed; new labels are
   additive. The script is idempotent.

2. **Issue templates** under `.github/ISSUE_TEMPLATE/`:

   - `it-bug-report.yml` — name, summary, steps to reproduce, expected vs
     actual, environment. Defaults to label `it-bug`.
   - `it-feature-request.yml` — problem, proposed solution, alternatives,
     impact. Defaults to label `it-backlog`.
   - `it-task.yml` — short description, acceptance criteria, dependencies.
     Defaults to label `it-task`.

   Each template's `body` is plain Markdown (no Liquid / no JS) — AGENTS.md §17
   ("Still unbuilt and safe to assume absent") rules out extra dependencies
   for what's effectively a config file.

3. **Repository settings** that cannot be configured from files (label
   descriptions, default repo permissions for triage): documented in
   `docs/operator-runbooks/it-portal-backlog-setup.md` as a checklist with
   screenshots omitted (the operator runs them once).

### Portal side (`apps/portal/src/app/it/backlog/`)

1. **Server-rendered shell** at `app/it/backlog/page.tsx` that resolves the
   external URL via env and renders a server component with the link. No
   data fetching from GitHub inside the SIS — clicking the link leaves the
   portal. This is deliberate: per AGENTS.md §13, the portal has zero tests
   and zero reasons to start scraping GitHub.

2. **`it-backlog` filtered issues URL** computed from
   `process.env.NEXT_PUBLIC_IT_BACKLOG_URL` (default
   `https://github.com/DAUST-ORG/myDAUST/issues?q=is%3Aopen+label%3Ait-backlog`).
   The `NEXT_PUBLIC_*` prefix is required because the link is a server-rendered
   prop on a client-bundle-friendly URL. The default in code lets prod ship
   without env; the env override lets the org rename the repo without code
   changes.

3. **`/it` landing fix verification.** AGENTS.md §12 says `it_admin` lands
   on `/director/users`; verify the existing
   `apps/portal/src/lib/nav.ts:655` `ROLE_PORTALS` entry still routes
   `it_admin → /it → /director/users` correctly. No code change expected —
   the entry exists (verified during spec writing). Add a 3-line comment
   pointing to AGENTS.md §12 so future agents do not delete it.

4. **`/it/backlog` page** displays:

   - A primary "Open the IT backlog" CTA linking to the filtered issues URL.
   - Three secondary "File a bug / request a feature / log a task" CTAs
     linking to `github.com/DAUST-ORG/myDAUST/issues/new?template=<name>`.
     The three template names match the files added above.
   - A short blurb explaining the system: "All IT work is tracked in GitHub
     Issues. Pick a template, fill it in, and an `it_admin` will triage it."
   - A "view as student / faculty" tip noting that any portal session can
     submit, since the label is org-public.

5. **Nav entry** added to `it`'s `PortalNav` in `apps/portal/src/lib/nav.ts`:

   ```ts
   { label: "IT backlog", href: "/it/backlog", icon: ClipboardList },
   ```

   `PAGE_META["/it/backlog"] = { title: "IT backlog", crumb: "IT" }`.

   The icon import is added at the top of `nav.ts` alongside the existing
   `import { ClipboardList } from "lucide-react"`. `apps/portal/src/lib/nav.ts`
   is the canonical home for nav data per AGENTS.md §9 — no other file is
   edited.

### Out-of-band configuration

- Operator creates the `IT` GitHub team and grants triage access (documented
  in the runbook).
- Operator flips the repo's "Issues" feature on if disabled.

## Acceptance criteria

1. The three new issue template files exist and pass `gh issue create
   --template <name>` syntax validation. (Verified by a shell check on
   `gh issue list --label it-backlog --state all --json number` returning
   `[]` cleanly.)
2. The three new labels exist on at least one test issue each.
3. `pnpm --filter @mydaust/portal run build` succeeds.
4. `pnpm -r typecheck` passes.
5. Loading `/it/backlog` as any authenticated user renders the four CTAs
   and the explanatory blurb. Verified via `curl -i $PORTAL/it/backlog` after
   a portal build (manual QA step; documented in PR description).
6. Loading `/it/backlog` as `it_admin` shows the same page plus the existing
   admin tiles from the `/it` portal — verified by walking the nav.
7. AGENTS.md §12 entry for "hr and it_admin are stranded in the student portal"
   has its `it_admin` portion updated to point at this branch's commit.

## Out of scope

- API-based issue creation from inside the portal (the user clicks through to
  GitHub).
- Server-side rate limiting on the GitHub links (they're just `<a>` tags).
- Per-user issue attribution — GitHub auth is whoever happens to be signed in
  to github.com, not the portal session.
- Notifications when issues change state. The Phase 0 notification infra
  branch could later subscribe to GitHub webhooks, but that's a different
  branch.

## Risks

- **Public-by-default.** Anything filed under `it-backlog` is visible to anyone
  with the repo URL. The README's "code is private" stance is unaffected
  (issues ≠ code), but the team should know that student PII in an issue
  body becomes public. The blurb on the portal page warns about this.
- **GitHub auth.** Filing an issue requires the user to sign in to GitHub,
  which most students will not have. The PR description notes this as a known
  UX gap; the alternative (filing via portal session) requires the GitHub
  auth app flow, which is out of scope.
- **Repo rename / transfer.** The hardcoded `DAUST-ORG/myDAUST` default is a
  fallback; the env override `NEXT_PUBLIC_IT_BACKLOG_URL` lets the operator
  retarget without a code change. Verified during acceptance.
