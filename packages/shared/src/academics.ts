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
