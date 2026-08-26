-- Student-initiated enrollment override requests. A student who is blocked from a section
-- (missing prereq, full section, holds, etc.) can submit a request; an admin approves by
-- ticking which gates to waive. The apply path then runs enroll() with the selected gates
-- skipped, and auto-bumps Section.capacity if the override waives the seat-count gate so
-- the section's capacity field stays truthful.
--
-- Per AGENTS.md §11, enum additions are isolated into their own migration because PG
-- requires the ADD VALUE to commit before the new value is usable. No table changes here:
-- the request reuses the existing ApprovalRequest + ApprovalEvent rows.

ALTER TYPE "ApprovalRequestKind" ADD VALUE 'student_enrollment_override';
