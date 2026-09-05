import { z } from "zod";

export const EnrollmentStatus = z.enum(["enrolled", "dropped", "completed"]);
export type EnrollmentStatus = z.infer<typeof EnrollmentStatus>;

export const EnrollInput = z.object({ sectionId: z.string().uuid() });
export type EnrollInput = z.infer<typeof EnrollInput>;

export const DropInput = z.object({ enrollmentId: z.string().uuid() });
export type DropInput = z.infer<typeof DropInput>;

// The active grading scheme is database-configured. The API validates submitted
// values against that section's scheme, so the contract must not freeze one list.
export const LetterGrade = z.string().trim().min(1).max(20);
export type LetterGrade = z.infer<typeof LetterGrade>;

export const SubmitGradesInput = z.object({
  grades: z.array(
    z.object({
      enrollmentId: z.string().uuid(),
      grade: LetterGrade.nullable(),
    }),
  ),
  finalize: z.boolean().default(false),
});
export type SubmitGradesInput = z.infer<typeof SubmitGradesInput>;

export const AttendanceStatus = z.enum(["present", "late", "absent"]);
export type AttendanceStatus = z.infer<typeof AttendanceStatus>;

export const MarkAttendanceInput = z.object({
  date: z.string().date(),
  records: z.array(
    z.object({ enrollmentId: z.string().uuid(), status: AttendanceStatus }),
  ),
});
export type MarkAttendanceInput = z.infer<typeof MarkAttendanceInput>;

export const AssignmentType = z.enum(["homework", "quiz", "exam", "project"]);
export type AssignmentType = z.infer<typeof AssignmentType>;

export const CreateAssignmentInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  type: AssignmentType.default("homework"),
  maxPoints: z.number().int().positive().max(1000).default(100),
  weight: z.number().int().min(0).max(100).default(0),
  dueDate: z.string().datetime({ offset: true }).or(z.string().date()),
});
export type CreateAssignmentInput = z.infer<typeof CreateAssignmentInput>;

export const UpdateAssignmentInput = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  type: AssignmentType.optional(),
  maxPoints: z.number().int().positive().max(1000).optional(),
  weight: z.number().int().min(0).max(100).optional(),
  dueDate: z
    .string()
    .datetime({ offset: true })
    .or(z.string().date())
    .optional(),
});
export type UpdateAssignmentInput = z.infer<typeof UpdateAssignmentInput>;

export const SubmitAssignmentInput = z
  .object({
    text: z.string().max(20000).optional(),
    fileUrl: z.string().max(500).optional(),
    fileName: z.string().max(255).optional(),
  })
  .refine((v) => Boolean(v.text?.trim()) || Boolean(v.fileUrl), {
    message: "Provide submission text or a file",
  });
export type SubmitAssignmentInput = z.infer<typeof SubmitAssignmentInput>;

export const GradeSubmissionInput = z.object({
  // Nullable so a score can be cleared: a mistyped grade had no way back before.
  score: z.number().int().min(0).max(1000).nullable(),
  // Absent means "leave the existing comment"; an empty string clears it. Without the
  // distinction every score correction would silently wipe the instructor's feedback.
  feedback: z.string().max(5000).optional(),
});

export type GradeSubmissionInput = z.infer<typeof GradeSubmissionInput>;

/**
 * Gates that block student self-registration in enroll(). The set is mirrored exactly by
 * the order checks appear in AcademicsService.enroll(); keep this in sync when adding a new
 * gate there. Duplicate enrollment, closed section and term-ended are intentionally NOT
 * waivable -- they reflect hard invariants, not policy.
 */
export const EnrollmentGate = z.enum([
  "prerequisite",
  "corequisite",
  "capacity",
  "holds",
  "credit_cap",
  "standing",
  "major_restriction",
  "record_status",
  "add_deadline",
]);
export type EnrollmentGate = z.infer<typeof EnrollmentGate>;

/** Per-gate data the request stores alongside the failure code so the registrar can act on
 * a specific reason instead of a generic 'gates failed' label. */
export const EnrollmentGateFailure = z.discriminatedUnion("gate", [
  z.object({
    gate: z.literal("prerequisite"),
    courses: z.array(
      z.object({ code: z.string(), minGrade: z.string().nullable() }),
    ),
  }),
  z.object({
    gate: z.literal("corequisite"),
    courses: z.array(z.string()),
  }),
  z.object({
    gate: z.literal("capacity"),
    taken: z.number().int().min(0),
    capacity: z.number().int().min(1),
  }),
  z.object({
    gate: z.literal("holds"),
    kinds: z.array(z.string()),
  }),
  z.object({
    gate: z.literal("credit_cap"),
    currentCredits: z.number().int().min(0),
    afterAdd: z.number().int().min(0),
    ceiling: z.number().int().min(1),
  }),
  z.object({
    gate: z.literal("standing"),
    required: z.string(),
    actual: z.number().int(),
  }),
  z.object({
    gate: z.literal("major_restriction"),
    required: z.string(),
  }),
  z.object({
    gate: z.literal("record_status"),
    status: z.string(),
  }),
  z.object({
    gate: z.literal("add_deadline"),
    closedOn: z.string().date(),
  }),
]);
export type EnrollmentGateFailure = z.infer<typeof EnrollmentGateFailure>;

/** Faculty members may only waive academic gates. Institutional gates (holds, standing,
 * record_status) require admin/registrar authority. */
export const FACULTY_WAIVABLE_GATES: ReadonlySet<EnrollmentGate> = new Set([
  "prerequisite",
  "corequisite",
  "capacity",
  "credit_cap",
  "major_restriction",
  "add_deadline",
]);

/**
 * A registrar placing a student on a roster directly waives the academic gates
 * but not the physical ones. capacity would overfill a room, holds and
 * record_status are administrative facts the registrar can clear at source
 * rather than step over, and the hard invariants (timetable clash, duplicate
 * enrollment, closed section, ended term) are not gates at all — they throw.
 */
export const REGISTRAR_WAIVABLE_GATES: ReadonlySet<EnrollmentGate> = new Set([
  "prerequisite",
  "corequisite",
  "credit_cap",
  "standing",
  "major_restriction",
  "add_deadline",
]);

/** Student submits when enroll() rejected them. Stored on ApprovalRequest.afterJson. */
export const EnrollmentOverrideRequestInput = z.object({
  sectionId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v.split(/\s+/).filter(Boolean).length <= 50, {
      message: "Maximum 50 words",
    })
    .refine((v) => v.split(/\s+/).filter(Boolean).length >= 1, {
      message: "At least 1 word",
    }),
  /** Gates the student is asking the registrar to waive. The registrar still picks
   * independently on approval; this is a hint, not a constraint. */
  requestedWaivers: z.array(EnrollmentGate).min(1),
});
export type EnrollmentOverrideRequestInput = z.infer<
  typeof EnrollmentOverrideRequestInput
>;

/** Admin approves by ticking each gate to waive. Capacity waiver auto-bumps section
 * capacity on apply. */
export const EnrollmentOverrideApproveInput = z.object({
  waivedGates: z.array(EnrollmentGate).min(1),
  note: z.string().trim().max(1000).optional(),
});
export type EnrollmentOverrideApproveInput = z.infer<
  typeof EnrollmentOverrideApproveInput
>;

/** Faculty approve — same as admin but restricted to FACULTY_WAIVABLE_GATES. */
export const FacultyOverrideDecideInput = z.object({
  waive: z.boolean(),
  waivedGates: z.array(EnrollmentGate).min(1).optional(),
  note: z.string().trim().max(1000).optional(),
});
export type FacultyOverrideDecideInput = z.infer<
  typeof FacultyOverrideDecideInput
>;
