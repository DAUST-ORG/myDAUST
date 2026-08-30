# Phase 1 · Admissions applicant notes

## Why

Admissions officers need to capture qualitative context about an
applicant that does not fit the structured fields (GPA, exam scores,
program). Currently no note model exists, no notes UI lives under
`apps/portal/src/app/admissions/`, and no admissions-only edit history
exists for free-form records.

This branch adds a per-applicant notes thread, scoped to the admissions
team, with author attribution and a soft edit history. Notes follow the
user's request: "they would like to be able to add notes for each
student to know certain stuff."

Per the user's scoping decisions earlier in this session, the model
applies to **applicants** (the pre-acceptance pipeline). Post-acceptance
student records keep their existing surfaces untouched.

## Scope

### Schema

New model `AdmissionNote`:

```prisma
model AdmissionNote {
  id          String     @id @default(uuid())
  applicantId String
  applicant   Applicant  @relation(fields: [applicantId], references: [id], onDelete: Cascade)
  authorId    String
  author      Person     @relation("AdmissionNoteAuthor", fields: [authorId], references: [id], onDelete: Restrict)
  kind        String     @default("general")  // general | financial | academic | followup
  body        String
  pinned      Boolean    @default(false)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  editedAt    DateTime?

  @@index([applicantId, createdAt])
  @@index([applicantId, pinned])
}
```

Hand-authored migration `<ts>_admission_notes`:

```sql
CREATE TABLE "AdmissionNote" (
    "id"          TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "authorId"    TEXT NOT NULL,
    "kind"        TEXT NOT NULL DEFAULT 'general',
    "body"        TEXT NOT NULL,
    "pinned"      BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    "editedAt"    TIMESTAMP(3),
    CONSTRAINT "AdmissionNote_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AdmissionNote" ADD CONSTRAINT "AdmissionNote_applicantId_fkey"
    FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdmissionNote" ADD CONSTRAINT "AdmissionNote_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "Person"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdmissionNote" ADD CONSTRAINT "AdmissionNote_kind_check"
    CHECK ("kind" IN ('general', 'financial', 'academic', 'followup'));

CREATE INDEX "AdmissionNote_applicantId_createdAt_idx"
    ON "AdmissionNote"("applicantId", "createdAt");

CREATE INDEX "AdmissionNote_applicantId_pinned_idx"
    ON "AdmissionNote"("applicantId", "pinned");
```

`onDelete: Restrict` on `authorId` mirrors AGENTS.md §8's stance:
losing an admissions officer should never silently orphan a note.

### API

`apps/api/src/admissions/applicant-notes.controller.ts` (new file):

- `GET /api/admissions/applicants/:id/notes?limit=&cursor=` —
  `@Roles("admissions", "admin")`. Returns notes oldest-first within
  a pagination window of 50. Pinned notes always returned first
  regardless of cursor.
- `POST /api/admissions/applicants/:id/notes` —
  `@Roles("admissions", "admin")`. Body: `{ kind?, body }`. Writes
  an audit log row inside the transaction.
- `PATCH /api/admissions/applicants/:id/notes/:noteId` —
  `@Roles("admissions", "admin")`. Body: `{ body?, kind?, pinned? }`.
  Author may edit their own notes. Admins may edit any. Sets
  `editedAt = now()`. Audit logged.
- `DELETE /api/admissions/applicants/:id/notes/:noteId` —
  `@Roles("admissions", "admin")`. Hard delete. Audit logged.

### Portal UI

`apps/portal/src/app/admissions/applicants/[id]/notes/page.tsx` (new
file): a notes thread under the applicant detail page.

- Pinned notes appear first, flagged with a `Pin` icon.
- Each note shows author avatar, name, timestamp, kind chip,
  edited indicator if `editedAt`.
- "Add note" composer at the bottom (textarea + kind selector +
  pin toggle, admin only).
- "Edit" / "Delete" buttons visible if the note is the user's own
  or the user is admin.
- Empty state: "No notes yet. Add the first one."

`apps/portal/src/lib/api.ts` gets an `applicantNotes` wrapper.

`PAGE_META['/admissions/applicants/[id]/notes'] = { title: 'Notes',
crumb: 'Admissions › Applicants › {name}' }`.

Nav: none — notes are a tab inside the existing applicant detail
page, not a top-level nav entry.

## Acceptance criteria

1. `pnpm --filter @mydaust/db run build` succeeds.
2. `pnpm -r typecheck` passes.
3. New unit test `apps/api/src/admissions/applicant-notes.test.ts`:
   - POST creates a note with the right author and defaults.
   - GET returns pinned-first then oldest-first.
   - PATCH by the original author succeeds; PATCH by a different
     admissions user without admin role returns 403.
   - DELETE by an admin succeeds; DELETE by an admissions user on a
     note they did not write returns 403.
   - Audit log rows exist for create / patch / delete.
4. AGENTS.md §8 gains a one-paragraph note about the notes feature.

## Out of scope

- Student-side notes (post-acceptance).
- A `readByApplicant` flag.
- Markdown rendering.
- Notification on note creation.

## Risks

- **Hard delete.** Deleted notes are gone forever. The audit log
  retains metadata (who, when, which applicant) but not the body.
- **Plain-text storage.** Matches AGENTS.md §8's stance that
  admissions content is internal-only.
- **Cross-officer editing.** Admissions officers can edit each
  other's notes. This is intentional — handover requires it.
  The edit indicator (`editedAt`) makes this visible.
