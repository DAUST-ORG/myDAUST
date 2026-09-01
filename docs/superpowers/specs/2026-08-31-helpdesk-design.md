# In-app Helpdesk with Explicit IT Backlog Routing

**Date:** 2026-08-31  
**Status:** Approved design for implementation planning  
**Project:** myDAUST

## 1. Goal and boundary

Add a native, authenticated helpdesk for user-facing support requests. The helpdesk is the system of record for support tickets; the existing GitHub Issues IT backlog remains the system of record for internal engineering work.

The helpdesk covers:

- **Admissions:** application status, onboarding, acceptance, and payment questions.
- **Academics:** registration, transcript, grades, courses, and academic-record issues.
- **Student Affairs:** housing, dining, student-life, and general student-support issues.
- **IT / Portal Support:** account access, portal errors, and user-facing technical problems.
- **Other:** requests that do not fit the first four categories.

The existing `/it/backlog` route remains available for internal feature requests, software fixes, tasks, and direct GitHub filing. A helpdesk request is not automatically copied to GitHub. A support staff member explicitly reclassifies a ticket as an engineering request; that action triggers a server-side attempt to create a linked GitHub Issue.

## 2. Access and ownership

### Requesters

Every authenticated person can create and track their own helpdesk requests.

- A student is always associated with their own `Student` record. The client cannot override this context.
- A parent may optionally select one child from their existing `GuardianStudent` links. The server validates that the selected child is linked to the parent.
- A staff member may submit without a student record.
- Requesters can view status, priority, category, public replies, and attachment metadata for their own tickets. They can add public replies.
- Requesters cannot change status, priority, category, routing type, or assignment.
- Internal staff notes are never returned to requesters.

### Support staff

The shared support queue is available to `registrar`, `admissions`, `dining`, `it_admin`, and `admin` roles. Every member of this group can see all submitted tickets and can filter by category, status, priority, assignee, and text search.

Support staff can:

- change status through the approved state machine;
- raise or lower priority;
- change category;
- assign or unassign an active staff `Person`;
- add public replies and internal notes;
- reclassify a support request as an engineering request and trigger GitHub sync;
- retry a failed GitHub sync.

The browser is not an authorization boundary. The controller role guards and service ownership checks enforce these rules.

## 3. Ticket model

### Enumerated values

Categories:

```text
admissions | academics | student_affairs | it_portal | other
```

Priorities:

```text
low | normal | high
```

Statuses:

```text
new | in_progress | waiting_on_requester | resolved
```

Routing types:

```text
support | engineering
```

The initial routing type is `support`. Only support staff can set it to `engineering`.

### Fields

A ticket stores:

- ID, requester, and optional linked student;
- title and description;
- category, priority, status, and routing type;
- optional assignee;
- created, updated, and resolved timestamps;
- public replies and staff-only internal notes;
- attachment metadata;
- GitHub issue number, URL, sync state, and redacted last error;
- version information where needed to prevent stale concurrent staff updates. Staff updates carry the ticket `version` as `baseRevision`; a mismatch returns `409` and applies nothing.

### Status transitions

```text
new → in_progress
new → waiting_on_requester
in_progress → waiting_on_requester
in_progress → resolved
waiting_on_requester → in_progress
waiting_on_requester → resolved
resolved → in_progress
```

A `new` ticket cannot transition directly to `resolved`. A resolved ticket can only be reopened by transitioning to `in_progress`.

## 4. Persistence and migration

Add an additive hand-authored migration and corresponding Prisma models. Never edit an applied migration.

The helpdesk data is separate from the existing `MaintenanceTicket`, notifications, and GitHub Issues:

- `HelpdeskTicket` owns the ticket fields and relationships.
- `HelpdeskComment` stores author, body, `isInternal`, and timestamps.
- `HelpdeskAttachment` stores ticket, uploader, upload URL/name/size, and timestamps.
- GitHub sync fields are nullable so ordinary support requests have no external dependency.

Foreign keys must preserve support history when people are deleted. The migration must not cascade-delete ticket history as a side effect of person deletion. Person deletion behavior is explicitly chosen per relationship (`Restrict` or `SetNull`) in the migration.

Indexes support:

- requester ticket lists ordered by creation time;
- optional student lookups;
- shared staff queue filters by status/category/routing type and creation time;
- GitHub issue-number lookup and sync retry;
- comment and attachment ordering by ticket and creation time.

## 5. Shared contract and API

Create `packages/shared/src/helpdesk.ts` for the stable contract:

- create and update inputs;
- comment input;
- category, priority, status, and routing constants/types;
- requester ticket read model;
- staff queue item and ticket detail read model;
- attachment metadata;
- GitHub sync state.

Keep the API’s deliberate no-global-`ValidationPipe` convention. Controllers receive `@Body() body: unknown` and parse it with the API-local Zod instance. Validation returns the existing `{ message, issues }` response through `ZodExceptionFilter`.

### Routes

```text
GET    /helpdesk/mine
POST   /helpdesk/tickets
GET    /helpdesk/tickets/:id
POST   /helpdesk/tickets/:id/comments
GET    /helpdesk/queue
PATCH  /helpdesk/tickets/:id
POST   /helpdesk/tickets/:id/github-sync
GET    /helpdesk/attachments/:id
POST   /helpdesk/attachments
```

Route rules:

- `GET /helpdesk/mine` and ticket creation: any authenticated person.
- Ticket detail: requester, linked child’s requester, or support staff.
- Public comments: requester or support staff.
- Queue/update/assignment/engineering actions: support staff only.
- Parent child selection is checked against `GuardianStudent`.
- Student ticket creation forces the authenticated student’s own `studentId`.
- Attachment access checks the ticket relationship and current role, not merely possession of a URL. Requesters, including parents, may attach screenshots; attachment access is checked against the ticket relationship and current role.

Validation limits:

- title: trimmed, 3–160 characters;
- description/comment: trimmed, 1–8,000 characters;
- category: one supported category;
- priority: `low`, `normal`, or `high`;
- status: a state-machine-valid transition for staff updates;
- routing: `support` or `engineering`, with engineering assignment restricted to support staff.

## 6. GitHub synchronization

Add a server-only `GitHubSyncService` using the GitHub REST API and a server-side token. No token is sent to the browser.

Required environment variables:

```text
GITHUB_TOKEN
GITHUB_REPOSITORY
```

Optional configuration may target the existing backlog label:

```text
GITHUB_IT_LABEL
```

The API is not booted solely to require GitHub configuration. If the token or repository is missing, the ticket remains local and its sync state is `pending`.

When staff set `routingType = engineering`:

1. Claim the ticket sync operation in the database to prevent duplicate issue creation.
2. Create one GitHub Issue with the ticket title, plain-text description, category, priority, and a reference to the local ticket.
3. Store the issue number, canonical URL, and `linked` state.
4. On a transport/API error, store a redacted error and `failed` state. The local ticket remains valid and usable.
5. Write an audit record for the attempt and outcome.
6. Permit support staff to retry the operation manually.

The browser-facing response uses a generic sync-failed message. Credentials and raw GitHub response bodies are not exposed. GitHub creation is idempotent under the ticket’s sync claim. Automatic background retries are out of scope for this first version; the failed state remains visible and actionable.

## 7. Notifications

Reuse the existing `NotificationsService` and `MailDelivery` seam.

- Ticket creation notifies support staff in-app.
- A public staff reply notifies the requester in-app.
- A public requester reply notifies support staff in-app.
- Status, assignment, or routing changes notify the requester when relevant.
- Internal notes never generate notifications.
- Mail is attempted only when the existing `notifications.emailEnabled` setting is true.
- A notification or mail failure never rolls back the ticket/comment write.
- Notification bodies contain only safe title/summary text and a ticket link; ticket bodies and internal notes are not interpolated into email HTML.

## 8. Portal experience and MyDAUST design system

Add the shared route `apps/portal/src/app/helpdesk/page.tsx` and add `Helpdesk` to every portal sidebar in `apps/portal/src/lib/nav.ts`. Add:

```text
PAGE_META["/helpdesk"] = { title: "Helpdesk", crumb: "Support" }
```

This is not a new portal area or role. The route runs inside the existing authenticated `PortalShell` and uses the normal portal-nav fallback behavior. It is reachable from student, parent, faculty, registrar, admissions, dining, IT, and other role sidebars.

The UI follows the existing MyDAUST visual language:

- navy, orange, steel, and surface tokens from `globals.css`;
- `PageHeader`, `Card`, `Badge`, `Button`, `Input`, `Select`, `Modal`, `EmptyState`, and table primitives;
- requester view with a “New request” form and “My requests” list;
- staff view with a responsive queue/detail layout;
- category, status, priority, assignee, and search filters;
- status controls, assignment, public reply composer, and internal-note toggle;
- visible GitHub sync state, issue link, and retry action.

The helpdesk route does not use the GitHub link as its primary support destination. The existing `/it/backlog` page remains the explicit engineering backlog surface.

Attachments are screenshots only in the first release. They use the existing upload/storage boundary, magic-byte checks, and size limits. The helpdesk attachment route carries explicit authenticated-user authorization, while the generic `/uploads` authorization is not widened. The helpdesk endpoint authorizes the ticket relationship before returning attachment metadata or bytes.

## 9. Errors and security

- `400`: invalid input or invalid status transition.
- `403`: role or ownership violation.
- `404`: missing ticket/comment.
- `409`: stale concurrent update or sync claim; safe to retry.
- `502`: GitHub transport/API failure to the staff client; local ticket remains valid.
- Ordinary support requests are never sent to GitHub unless staff explicitly classify them as engineering work.
- Internal notes are excluded from requester reads and notification payloads.
- Attachment downloads and metadata are authorized against the ticket.
- GitHub credentials stay server-side and use a least-privilege repository token.
- Every protected ticket mutation writes an inline `AuditLog` entry; mutations inside a transaction use `tx.auditLog.create` so they roll back together.

## 10. Testing and verification

Add tests for observable contracts, not implementation plumbing.

### Contract and service tests

- Shared schemas accept valid values and reject invalid values/lengths.
- Status transitions reject direct `new → resolved` and permit reopening only through `in_progress`.
- Requester creation and `mine` are ownership-scoped.
- Parent child selection accepts only a linked child.
- Student requests are forced to the authenticated student record.
- Requester cannot see another user’s ticket or internal note.
- Support staff can see the shared queue; non-support roles cannot.
- Support staff can change status, assign, add internal notes, and reclassify engineering work.
- Requester cannot assign, reclassify, or change status.
- Attachment access is ticket-scoped.
- GitHub sync is idempotent and preserves a local ticket on failure.
- Mutations create audit records; notification/mail failure does not roll back writes.

### Portal and end-to-end checks

- Run the existing portal build and workspace typecheck.
- With the local dev environment available, browser-drive the authenticated `/helpdesk` route for requester creation/tracking and staff queue/detail interactions.
- Verify navigation from each role sidebar, empty states, filters, internal-note privacy, and GitHub retry-state display.
- Verify the existing `/it/backlog` route still works and still links to GitHub.

Database-backed tests use `TEST_DATABASE_URL` when available. The implementation must not assume CI’s known absence of database services; skipped tests are reported, not treated as proof of database behavior.

## 11. First PR scope

Included:

- additive schema and migration;
- shared helpdesk contracts;
- `HelpdeskModule`, controller, service, and GitHub sync service;
- ticket/queue/comment API and attachment authorization;
- portal API wrappers and authenticated `/helpdesk` page;
- navigation and page metadata;
- MyDAUST-style requester/staff UI;
- tests and GitHub environment/operator documentation;
- existing notification/mail integration.

Excluded:

- replacing or deleting the IT backlog;
- new roles or a new portal area;
- anonymous/public submissions;
- advanced SLA timers, watchers, macros, templates, or configurable routing rules;
- automatic background GitHub retries;
- changes to generic upload authorization or the existing GitHub backlog workflow.
