-- Fall 2026 sections for the project sequence.
--
-- Design Project I-IV and Engineering Project I are recommended to 167 students
-- by the academic office's Fall 2026 plan, but no section exists for them in the
-- term, so those recommendations would render as "not offered" with nothing to
-- register into.
--
-- Created CLOSED with an explicit 'TBA' schedule rather than a plausible-looking
-- meeting time: every other Fall 2026 section carries a real day pattern and
-- start time, and inventing one would present a fabricated timetable to students
-- as fact. The registrar sets the real schedule and flips status to 'open'.
--
-- Capacity is the number of matched students each course is recommended to.
--
-- Idempotent: ON CONFLICT against the existing
-- @@unique([courseId, termId, sectionCode]).
INSERT INTO "Section" (
  "id", "courseId", "termId", "sectionCode", "capacity",
  "days", "startTime", "endTime", "room", "status", "recommended"
)
SELECT
  gen_random_uuid(),
  c."id",
  t."id",
  'A',
  v."capacity",
  'TBA',
  'TBA',
  'TBA',
  NULL,
  'closed',
  false
FROM (VALUES
  ('ENGR 1161', 14),
  ('ENGR 1261', 57),
  ('ENGR 2351', 33),
  ('ENGR 2441', 28),
  ('ENGR 3521', 30)
) AS v("code", "capacity")
JOIN "Course" c ON c."code" = v."code"
JOIN "Term" t ON t."name" = 'Fall 2026'
ON CONFLICT ("courseId", "termId", "sectionCode") DO NOTHING;
