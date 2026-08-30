# Phase 1 · Infirmary sickness-flag → notify → mark absence

## Why

The infirmary portal (PR #97, PR #106/#107) handles the clinical side of
a visit: `Consultation`, prescriptions, vitals, follow-ups, pharmacy,
appointments. It does NOT close the loop with the rest of the institution.
A student seen today for a fever is not flagged as absent, faculty do not
learn they were sick, and there is no in-portal channel to escalate an
emergency to a named paging list.

This branch adds the **absence + notification + paging** layer. The
clinical surface is untouched. The user's intent ("if a student is sick
the faculty or student affairs can be notified so they can put down his
absense as sick and know his status incase of an emergency") is
implemented end-to-end.

Per the user's role decision: there is no `student_affairs` role in
`packages/shared/src/roles.ts`. v1 notifies the student's **faculty of
today** plus the **admin** role (who acts as student-affairs). A future
branch can add the role and tighten the routing.

## Scope

### Schema additions

`Consultation` gains three new fields:

```prisma
model Consultation {
  // ... existing columns ...
  sickFlagged       Boolean   @default(false)
  sickFlaggedAt     DateTime?
  sickFlaggedById   String?
  sickFlaggedBy     Person?   @relation("ConsultationSickFlagger", fields: [sickFlaggedById], references: [id], onDelete: SetNull)
}
```

`AttendanceRecord` gains three sibling optional columns (status enum is
NOT extended, AGENTS.md §11):

```prisma
model AttendanceRecord {
  // ... existing columns ...
  reason    String?   // null | "sick" | "infirmary_emergency" | "admin_override"
  source    String    @default("faculty") // faculty | infirmary | admin
  notedById String?
  notedBy   Person?   @relation("AttendanceNotedBy", fields: [notedById], references: [id], onDelete: SetNull)
}
```

Hand-authored migration `<ts>_infirmary_sickness_flag`:

```sql
ALTER TABLE "Consultation"
    ADD COLUMN "sickFlagged" BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN "sickFlaggedAt" TIMESTAMP(3),
    ADD COLUMN "sickFlaggedById" TEXT;

ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_sickFlaggedById_fkey"
    FOREIGN KEY ("sickFlaggedById") REFERENCES "Person"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Consultation_sickFlagged_idx" ON "Consultation"("sickFlagged")
    WHERE "sickFlagged" = TRUE;

ALTER TABLE "AttendanceRecord"
    ADD COLUMN "reason" TEXT,
    ADD COLUMN "source" TEXT NOT NULL DEFAULT 'faculty',
    ADD COLUMN "notedById" TEXT;

ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_notedById_fkey"
    FOREIGN KEY ("notedById") REFERENCES "Person"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_reason_check"
    CHECK ("reason" IS NULL OR "reason" IN ('sick', 'infirmary_emergency', 'admin_override'));

ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_source_check"
    CHECK ("source" IN ('faculty', 'infirmary', 'admin'));
```

### API

`apps/api/src/infirmary/infirmary.controller.ts`:

- New endpoint `@Post("consultations/:id/flag-sick")` (gated
  `@Roles("infirmary", "admin")`). Body:
  `{ isEmergency: boolean, notes?: string }`. Idempotent: a second flag
  updates the existing record rather than creating a new one.
- New endpoint `@Delete("consultations/:id/flag-sick")` (admin only) to
  clear a sick-flag. Audit logged.
- New endpoint `@Get("consultations/flagged")` listing all flagged
  consultations today (gated `@Roles("infirmary", "admin", "registrar")`).

`apps/api/src/infirmary/infirmary.service.ts`:

`flagSick(consultationId, isEmergency, notes, actor)` runs in a single
`prisma.$transaction`:

1. Read consultation, find all `Enrollment` rows for the student where
   the section runs today.
2. Upsert each today's `AttendanceRecord` to
   `status: 'absent', reason: 'sick'` (or `'infirmary_emergency'`),
   `source: 'infirmary'`, `notedById: actor.personId`. The
   `@@unique([enrollmentId, date])` constraint handles conflicts with
   existing faculty-recorded attendance — **sick flag wins** (overrides
   any source). The infirmary record is the authoritative source for the
   day's status when sick-flagged.
3. Set `Consultation.sickFlagged = true`, `sickFlaggedAt = now()`,
   `sickFlaggedById = actor.personId`.
4. Resolve recipients:
   - Faculty-of-today: every distinct `enrollment.section.facultyId` for
     the student where the section runs today.
   - Admin: every `Person` with `roles` containing `admin`.
   - If `isEmergency`, also include the
     `AppSetting['infirmary.emergencyRecipients']` parsed as JSON
     personIds.
5. Emit one `Notification` row per recipient with
   `kind: isEmergency ? 'infirmary_emergency_flagged' : 'infirmary_visit_logged'`,
   `title` and `body` from a small template, `href: '/infirmary/consultations/{id}'`.
6. Write `AuditLog { entity: 'Consultation', entityId: consultation.id,
   action: 'flag_sick', actorId, data: { isEmergency, recipientCount,
   studentId } }` inside the transaction.

Recipient resolution uses the inlined approach for this branch
(directly via `NotificationsService.emit` with one entry per resolved
personId) so the branch is independent of the
`utachicodes/notification-infra` PR. A future refactor can switch the
infirmary service over to `NotificationsService.emitForAudience` once
that PR merges.

`clearSick(consultationId, actor)` (admin only): sets the consultation's
sick flag back to false, deletes today's infirmary-source attendance
rows (`reason IN ('sick', 'infirmary_emergency') AND source = 'infirmary'
AND notedById = actor.personId`) only if the consultation was sick-
flagged in the same UTC day, and writes an `infirmary_visit_logged`
notification with body "Cleared by {actor.name}". Audit logged.

`listFlaggedToday()` returns consultations flagged today plus a count of
distinct students and a count of distinct faculty notified. Read-only.

### Portal UI

`apps/portal/src/app/infirmary/consultations/page.tsx`:

- Each consultation row gains two buttons: "Flag sick" (primary) and
  "Flag sick + emergency" (orange, only visible to `infirmary` and
  `admin`). A confirmation modal asks for the absence notification
  audience.
- A new `/infirmary/consultations/[id]` page shows the visit plus the
  list of who got notified, with timestamps, and a "Clear flag" button
  for admins.
- A new `/infirmary/consultations/flagged` page (admin + registrar +
  infirmary) shows the day's flagged consultations in a table.

New portal-side composables in
`apps/portal/src/lib/api.ts` for the new endpoints.

### Nav updates

`apps/portal/src/lib/nav.ts`:

- `INFIRMARY_NAV` gains an entry: `Flagged today` →
  `/infirmary/consultations/flagged` with a `Flag` icon (lucide-react).
  `PAGE_META['/infirmary/consultations/flagged'] = { title: 'Flagged
  today', crumb: 'Infirmary' }`.

### AGENTS.md updates

§11b (Dining) is extended to a new §11c (Infirmary sickness flow) noting
the new endpoints, the `AttendanceRecord.reason` enum, the
AppSetting-driven emergency list, and the audit invariant.

## Acceptance criteria

1. `pnpm --filter @mydaust/db run build` succeeds.
2. `pnpm -r typecheck` passes.
3. New integration test
   `apps/api/src/infirmary/sickness-flag.integration.test.ts` (skipped
   without `TEST_DATABASE_URL` per AGENTS.md §13) covers:
   - Flag a sick consultation → attendance rows created for today's
     sections with `status: 'absent', reason: 'sick', source: 'infirmary'`.
   - Same-day double-flag does not duplicate rows.
   - Faculty-of-today receives a `Notification` with
     `kind: 'infirmary_visit_logged'`.
   - Admin receives the same notification.
   - Emergency flag includes `AppSetting['infirmary.emergencyRecipients']`
     recipients and uses `kind: 'infirmary_emergency_flagged'`.
   - AuditLog row exists inside the transaction.
   - A pre-existing faculty-recorded attendance for today is overwritten
     by the infirmary sick flag.
   - Clear flag (admin) removes today's infirmary-source attendance
     rows.
   - Non-admin calling clear returns 403.
4. AGENTS.md §11c is added.

## Out of scope

- The `student_affairs` role. v1 routes notifications to admin.
- Public/student-facing read of sick status.
- An SMS or push channel for emergencies.
- Historical consultation flagging. Only flags for the current day.

## Risks

- **Faculty-overwrites-faculty.** Sick flag overwrites faculty-recorded
  attendance for the same day. This is the intent; PR description calls
  it out.
- **Day-boundary correctness.** Comparisons for "today" use
  `toDakarDateKey(visitedAt) === toDakarDateKey(now)` per AGENTS.md §6.
- **Race with same-day faculty attendance.** Two concurrent writes hit
  the unique constraint; the infirmary write wins (it commits last).
- **Privacy.** Sick-flagged notifications expose the student's identity
  to all faculty-of-today. Per the user's framing this is the desired
  behavior. Body text does not include the diagnosis or clinical notes.
