# Phase 0 · Notification infrastructure

## Why

`apps/api/src/notifications/` is already built and running as an in-app
delivery channel. Four academic notification kinds exist (`grade_posted`,
`assignment_created`, `work_graded`, `material_published`), the nav badge
endpoint reads unread counts, and `NotificationsController` gates every
route to the caller's own personId. The upcoming Phase 1 features
(infirmary, admissions applicant notes, helpdesk) all need to write to it,
and emergency-paging implies email as a secondary channel for cases where
the recipient is not actively in the portal.

This branch extends the existing module rather than introducing a parallel
one. Reusing the same table, kind enum, and reader endpoints keeps the
badge counter and the `/notifications` list honest — a notification that
lands in a parallel table would not show up where the user expects.

## Scope

### NotificationKind enum extension

In `apps/api/src/notifications/notifications.service.ts`, add to the
existing union:

- `infirmary_visit_logged`
- `infirmary_emergency_flagged`
- `helpdesk_ticket_created`
- `helpdesk_ticket_updated`
- `applicant_note_added`

No existing kind is renamed or removed. Existing readers tolerate unknown
kinds because the `kind` field is opaque to the UI today (the title drives
display).

### Mail delivery

`apps/api/src/notifications/mail-delivery.ts` (new file):

```ts
export async function deliverByMail(
  notifications: NewNotification[],
): Promise<{ attempted: number; sent: number; deferred: number }>;
```

- Reads `AppSetting["notifications.emailEnabled"]`; if `false`, returns
  `{ attempted: 0, sent: 0, deferred: 0 }` without touching Mail.
- When enabled, calls into the existing `MailService` (already wired into
  `app.module.ts`). Mail errors never throw out of `deliverByMail` — they
  are logged and counted as `deferred`. A failed email cannot roll back
  a notification write.

### emitForAudience method

Add to `NotificationsService`:

```ts
async emitForAudience(
  audience: NotificationAudience,
  template: Omit<NewNotification, "personId">,
): Promise<{ created: number; mailed: number }>;
```

The audience union and resolvers live in `recipient-resolver.ts`. The
emit method resolves recipients, writes one row per recipient via
`createMany`, then calls `deliverByMail` for any recipient whose channels
include `email`. Returns counts so callers can log.

### Recipient resolver

`apps/api/src/notifications/recipient-resolver.ts` (new file):

```ts
export interface NotificationRecipient {
  readonly personId: string;
  readonly channels: ReadonlyArray<"in_app" | "email">;
}

export type NotificationAudience =
  | { kind: "personIds"; personIds: string[] }
  | { kind: "role"; role: string }
  | { kind: "appSetting"; key: string }
  | { kind: "studentGuardians"; studentId: string }
  | { kind: "infirmaryEmergencyList" };

export async function resolveRecipients(
  prisma: PrismaService,
  audience: NotificationAudience,
): Promise<NotificationRecipient[]>;
```

- `personIds` returns one entry per id, channels = `["in_app"]`.
- `role` reads `Person.roles` and returns matching rows; missing role
  returns `[]`, never errors.
- `appSetting` returns `[]` for missing or malformed JSON; parses a
  JSON array of personIds when valid.
- `studentGuardians` reads `GuardianStudent` joins for the student.
- `infirmaryEmergencyList` reads `AppSetting["infirmary.emergencyRecipients"]`
  and returns parsed personIds; missing key returns `[]`.

### Schema

A new hand-authored migration under
`packages/db/prisma/migrations/<ts>_notification_kinds_and_email_status`:

```sql
ALTER TABLE "Notification"
    ADD COLUMN "emailStatus" "NotificationEmailStatus" NOT NULL DEFAULT 'not_attempted',
    ADD COLUMN "emailAttemptedAt" TIMESTAMP(3),
    ADD COLUMN "emailError" TEXT;

CREATE INDEX "Notification_emailStatus_idx" ON "Notification"("emailStatus")
    WHERE "emailStatus" IN ('deferred', 'failed');
```

`NotificationEmailStatus` enum: `not_attempted | sent | deferred | failed`.
Partial index keeps the future retry path cheap.

The existing migration `20260820120000_notifications` is unchanged. The
kind enum values are added by Phase 1 feature branches that need them;
this branch only adds the email status column.

### Seed

`packages/db/prisma/seed.ts` adds:

- `AppSetting["notifications.emailEnabled"] = "false"` — default off.
- `AppSetting["infirmary.emergencyRecipients"] = "[]"` — empty until the
  infirmary branch wires a real list.

Both keys are read by code added in this branch, so missing keys would
crash resolvers. Seed-first protects against that.

## Acceptance criteria

1. `pnpm --filter @mydaust/db run build` succeeds.
2. `pnpm -r typecheck` passes.
3. New unit test `apps/api/src/notifications/recipient-resolver.test.ts`
   covers each `NotificationAudience` variant and asserts:
   - `personIds` returns one entry per id, channels = `["in_app"]`.
   - `role` reads `Person.roles` and returns matching rows; missing
     role returns `[]` not an error.
   - `appSetting` returns `[]` for a missing or malformed value.
   - `appSetting` returns parsed personIds when value is
     `["p1","p2"]`.
   - `infirmaryEmergencyList` reads the AppSetting and returns
     personIds; missing key returns `[]`.
4. Existing notifications tests still pass.

## Out of scope

- Mail retry queue / cron (follow-up branch).
- Push notifications, SMS, or any non-Mail secondary channel.
- Client-side notification preferences UI.
- The actual writers in infirmary, helpdesk, and admissions notes —
   those ship with their respective Phase 1 branches.

## Risks

- **AGENTS.md §4 / §17 invariants** preserved: `RolesGuard` semantics
  untouched, no new fail-open route.
- **AGENTS.md §3 build order**: `packages/shared` is not touched here.
- **AGENTS.md §11 enum migrations**: the new `NotificationEmailStatus`
  enum ships in its own migration per the file's own rule.
