# Phase 0 · Notification infrastructure

## Why

The notifications module (`apps/api/src/notifications/`) is already built and
running in production as an in-app only delivery channel. Four academic
notification kinds exist (`grade_posted`, `assignment_created`, `work_graded`,
`material_published`) and the nav badge endpoint already consumes it. The upcoming
Phase 1 features (infirmary, admissions applicant notes, helpdesk) all need to
write to it, and Phase 1's emergency-paging requirement implies email as a
secondary channel for cases where the recipient is not actively in the portal.

This branch extends the existing module rather than introducing a parallel one.
Reusing the same table, kind enum and reader endpoints keeps the badge counter
and the `/notifications` list honest — a notification that lands in a parallel
table would not show up where the user expects.

## Scope

### Additive changes

1. **Extend `NotificationKind`** in `apps/api/src/notifications/notifications.service.ts`
   to include the kinds the next phases will emit:

   - `infirmary_visit_logged` — student was seen by infirmary staff
   - `infirmary_emergency_flagged` — emergency paging event (see below)
   - `helpdesk_ticket_created` — a helpdesk ticket the recipient owns or routed to
   - `helpdesk_ticket_updated` — status / assignment / comment change on a ticket the
     recipient can see
   - `applicant_note_added` — admissions team added a note to an applicant the
     recipient can see

   No existing kind is renamed or removed. Existing readers tolerate unknown
   kinds (the kind field is opaque to the UI today).

2. **Recipient resolver** at
   `apps/api/src/notifications/recipient-resolver.ts`:

   ```ts
   export interface NotificationRecipient {
     readonly personId: string;
     readonly channels: ReadonlyArray<"in_app" | "email">;
   }

   export async function resolveRecipients(
     prisma: PrismaService,
     audience: NotificationAudience,
   ): Promise<NotificationRecipient[]>;
   ```

   `NotificationAudience` is a discriminated union covering the audiences the
   upcoming features need: `personIds(string[])`, `role(role: string)`,
   `appSetting(key: string)` (parsed as a JSON array of personIds; missing or
   malformed → empty array, never throws), `studentGuardians(studentId)`,
   `infirmaryEmergencyList` (reads `AppSetting["infirmary.emergencyRecipients"]`,
   returns [] when missing). Each audience is small and indexed; this is called
   inside the same transaction as the action it notifies about, never on a hot
   path. Email channel membership is derived once per call by reading
   `AppSetting["notifications.emailEnabled"]` — feature-flag so prod can ship
   without SMTP configured.

3. **Optional Mail hand-off** at
   `apps/api/src/notifications/mail-delivery.ts`:

   ```ts
   export async function deliverByMail(
     notifications: NewNotification[],
   ): Promise<{ attempted: number; sent: number; deferred: number }>;
   ```

   - Reads `AppSetting["notifications.emailEnabled"]`; if `false`, returns
     `{ attempted: 0, sent: 0, deferred: 0 }` without touching Mail.
   - When enabled, calls into the existing `MailService` (already wired into
     `app.module.ts`). Mail errors never throw out of `deliverByMail` — they are
     logged and counted as `deferred`. A failed email cannot roll back a
     notification write.
   - The first prod attempt to deliver by mail with SMTP creds unconfigured
     surfaces a structured warning to logs; this is acceptable per AGENTS.md §4
     ("PI-SPI creds fail at use, not at boot").
   - No retry queue in this branch. The cron in §6 of the existing infra
     eventually retries deferred notifications by re-reading them; that retry is
     scoped to a follow-up branch.

4. **Service-layer emit method** at
   `apps/api/src/notifications/notifications.service.ts`:

   ```ts
   async emitForAudience(
     audience: NotificationAudience,
     template: Omit<NewNotification, "personId">,
   ): Promise<{ created: number; mailed: number }>;
   ```

   Resolves recipients, writes one row per recipient via `createMany`, then
   calls `deliverByMail` for any recipient whose channels include `email`.
   Returns counts so callers can log. Never throws.

### Schema changes

A new hand-authored migration under
`packages/db/prisma/migrations/<ts>_notification_kinds_and_email_status`:

```sql
-- Additive. No existing data moves.
ALTER TYPE "NotificationKind" ADD VALUE 'infirmary_visit_logged';
ALTER TYPE "NotificationKind" ADD VALUE 'infirmary_emergency_flagged';
ALTER TYPE "NotificationKind" ADD VALUE 'helpdesk_ticket_created';
ALTER TYPE "NotificationKind" ADD VALUE 'helpdesk_ticket_updated';
ALTER TYPE "NotificationKind" ADD VALUE 'applicant_note_added';

-- Track mail delivery so we can retry later without re-sending successfully mailed rows.
ALTER TABLE "Notification"
    ADD COLUMN "emailStatus" "NotificationEmailStatus" NOT NULL DEFAULT 'not_attempted',
    ADD COLUMN "emailAttemptedAt" TIMESTAMP(3),
    ADD COLUMN "emailError" TEXT;

CREATE INDEX "Notification_emailStatus_idx" ON "Notification"("emailStatus")
    WHERE "emailStatus" IN ('deferred', 'failed');
```

`NotificationEmailStatus` enum: `not_attempted | sent | deferred | failed`.
The partial index keeps the retry path cheap.

The existing migration `20260820120000_notifications` does not need to change;
its data shape is preserved.

### Seed updates

`packages/db/prisma/seed.ts` adds `AppSetting` rows:

- `notifications.emailEnabled = "false"` — default off; admin flips per env
- `infirmary.emergencyRecipients = "[]"` — empty until infirmary phase wires a real list

Both keys are read by code added in this branch, so missing keys would crash
resolvers. Seed-first protects against that.

### Role / portal changes

None. The notifications module stays self-scoped: `NotificationsController`
already gates every route to the caller's own personId and has no `@Roles`
decorator (intentionally — see AGENTS.md §4 reasoning in the comment block at
the top of the existing controller).

## Acceptance criteria

1. `pnpm --filter @mydaust/shared run build` and
   `pnpm --filter @mydaust/db run build` succeed after the schema changes.
2. `pnpm -r typecheck` passes with no new errors.
3. New unit test `apps/api/src/notifications/recipient-resolver.test.ts` covers
   each `NotificationAudience` variant and asserts:
   - `personIds` returns one entry per id, channels = `["in_app"]`.
   - `role` reads `Person.roles` and returns matching rows; missing role
     returns `[]` not an error.
   - `appSetting` returns `[]` for a missing or malformed value.
   - `appSetting` returns parsed personIds when value is `["p1","p2"]`.
   - `infirmaryEmergencyList` reads the AppSetting and returns personIds; missing
     key returns `[]`.
4. New integration test
   `apps/api/src/notifications/emit-for-audience.integration.test.ts` (skipped
   without `TEST_DATABASE_URL` per AGENTS.md §13) covers:
   - `emitForAudience` writes the right rows.
   - With `notifications.emailEnabled = "false"`, no Mail calls are made and
     `emailStatus = "not_attempted"`.
   - With `notifications.emailEnabled = "true"` and Mail mocked to succeed, rows
     transition to `emailStatus = "sent"`.
   - With Mail mocked to throw, rows transition to `emailStatus = "deferred"`
     and the function still returns successfully.
5. AGENTS.md §17 "Still unbuilt and safe to assume absent" entry for
   "notification model" is removed.
6. AGENTS.md §4 audit-logging section is unchanged.
7. The vit badge counter (`GET /api/nav/context`) increments for a recipient
   whose notification was just emitted; verified via the existing nav-badge
   integration test plus a new one asserting the new kinds count.

## Out of scope

- Mail retry queue / cron (follow-up branch).
- Push notifications, SMS, or any non-Mail secondary channel.
- Client-side notification preferences UI.
- The actual writers in infirmary, helpdesk, and admissions-notes — those ship
  with their respective Phase 1 branches. This branch only adds the kinds,
  resolvers, and a smoke-test writer behind a feature flag in `app.module.ts`
  that the Phase 1 branches will replace.

## Risks

- **AGENTS.md §4 / §17 invariants**: this branch preserves them. `RolesGuard`
  semantics are not touched. No new fail-open route.
- **AGENTS.md §3 build order**: `packages/shared` is not touched here; only
  `apps/api` and `packages/db`. `pnpm --filter @mydaust/db run build` is part of
  the merge checklist.
- **AGENTS.md §11 enum migrations**: per the file's own rule, adding enum values
  must commit in their own migration. This branch ships exactly one migration
  for the kind enum and one for the new status enum; the migration names make
  this explicit.
- **Backward compat**: existing notification readers tolerate unknown kinds
  because `kind` is a free-form string in the UI (title drives display). A
  reader that does a `switch (kind)` exhaustively would break; the existing
  badge counter and list endpoint do not switch.
