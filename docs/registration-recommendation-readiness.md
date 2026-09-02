# Registration recommendation readiness audit

The registration recommendation audit is production-safe and read-only. It
does not create, update, or delete database rows and has no confirmation or
write mode.

Build the API before running it so the compiled CLI matches the source:

```bash
pnpm --filter @mydaust/shared run build
DATABASE_URL="postgresql://..." pnpm --filter @mydaust/db run build
pnpm --filter @mydaust/api run build
DATABASE_URL="postgresql://..." pnpm --filter @mydaust/api run audit:registration-readiness
```

The command emits one redacted JSON record. It includes only aggregate student,
recommendation, availability, curriculum, section, and transcript counts; it
does not emit student ids or names.

Exit codes:

- `0`: no blockers. An intentional `termId: null` closure may still produce a
  warning.
- `2`: the audit completed and found one or more readiness blockers.
- `1`: configuration, connection, or runtime failure prevented the audit.

Blockers cover malformed or missing registration configuration, a missing or
closed target term, no target-term sections, non-ready student recommendation
contexts, unlinked official transcript entries, duplicate or malformed
curriculum data in approved snapshots, scheduled or prerequisite recommendations
with no target-term section, and per-student evaluation failures. The transcript
totals cover every non-void unlinked row, with a separate active-student subset,
so inactive or pending records cannot silently escape the preactivation audit.
The audit also resolves every approved curriculum course against the live course
catalog and blocks on missing ids, changed codes, or current-credit totals that
no longer reconcile to the approved program requirements. For each approved
academic-year/program pair, `curriculumMaps` also reports deterministic counts
and SHA-256 digests for the approved snapshot and relational `CurriculumEntry`
map. A missing legacy snapshot map, missing relational map, invalid map, count
drift, or digest drift is a blocker.

`candidateCurriculumMaps` separately reports the same count-and-digest evidence
for the latest draft or pending revision in each academic year. Candidate
mismatches are kept separate from readiness blocker totals so the operator can
still review the proposed map even when a legacy approved snapshot is expected
to fail its comparison.

The audit setting is the `AppSetting` row keyed by `academics.registration`:

```json
{
  "termId": "term UUID",
  "recommendationsEnabled": true
}
```

No row preserves legacy current-term selection and keeps recommendations off.
A present row with `termId: null` and `recommendationsEnabled: false`
intentionally closes student self-service registration. Enabling
recommendations while `termId` is null is rejected.

## Activation and rollback

1. Complete and validate the full curriculum in an Academic Years draft; do not
   update an approved year through the legacy Curriculum page.
2. Configure the intended term in staging with
   `recommendationsEnabled: false`, then run the readiness audit. Require every
   relevant `candidateCurriculumMaps[].matches` value to be true before
   submission.
3. Submit the revision for director approval. Rerun the audit and require the
   corresponding `curriculumMaps[].matches` values to be true after approval.
4. Resolve every remaining blocker, exercise student registration in staging,
   and then enable the flag there.
5. In production, retain the recommendation flag off while the approved
   revision and target-term configuration are verified. Run the read-only audit
   again against production and save its redacted output with the release
   evidence.
6. Enable `recommendationsEnabled: true` only after the production re-audit is
   blocker-free.

Rollback does not require changing the term or academic records. PATCH the same
configuration with `recommendationsEnabled: false` and retain `termId`; normal
registration remains on the designated term while the recommendation panel is
disabled. Use `termId: null` only when student self-service registration itself
must close.
