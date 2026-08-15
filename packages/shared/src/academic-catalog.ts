import { z } from "zod";

export const AcademicCatalogLevelInput = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(80),
  creditCeiling: z.number().int().min(0).max(1000),
});

export const AcademicCatalogRequirementInput = z.object({
  category: z.string().trim().min(1).max(120),
  requiredCredits: z.number().int().min(1).max(1000),
});

export const AcademicCatalogProgramInput = z.object({
  programId: z.string().uuid(),
  programCode: z.string().trim().min(1).max(40),
  programName: z.string().trim().min(1).max(160),
  progressionMode: z.enum(["default", "custom"]),
  customLevels: z.array(AcademicCatalogLevelInput).max(40),
  requirements: z.array(AcademicCatalogRequirementInput).max(80),
});

function validateLevels(
  levels: AcademicCatalogLevel[],
  ctx: z.RefinementCtx,
  path: (string | number)[],
) {
  const codes = new Set<string>();
  let previous = -1;
  levels.forEach((level, index) => {
    const code = level.code.toLocaleLowerCase();
    if (codes.has(code)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Level codes must be unique",
        path: [...path, index, "code"],
      });
    }
    codes.add(code);
    if (level.creditCeiling <= previous) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Credit ceilings must increase from one level to the next",
        path: [...path, index, "creditCeiling"],
      });
    }
    previous = level.creditCeiling;
  });
}

export const AcademicCatalogDraftInput = z
  .object({
    yearLabel: z.string().trim().min(4).max(40),
    startsOn: z.string().date().nullable(),
    endsOn: z.string().date().nullable(),
    defaultLevels: z.array(AcademicCatalogLevelInput).min(1).max(40),
    programs: z.array(AcademicCatalogProgramInput).max(500),
    reason: z.string().trim().min(1).max(1000),
    activateYear: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.startsOn && value.endsOn && value.startsOn > value.endsOn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The catalog end date must be on or after its start date",
        path: ["endsOn"],
      });
    }
    validateLevels(value.defaultLevels, ctx, ["defaultLevels"]);
    const programIds = new Set<string>();
    value.programs.forEach((program, index) => {
      if (programIds.has(program.programId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A programme can appear only once",
          path: ["programs", index, "programId"],
        });
      }
      programIds.add(program.programId);
      const categories = new Set<string>();
      program.requirements.forEach((requirement, requirementIndex) => {
        const category = requirement.category.toLocaleLowerCase();
        if (categories.has(category)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Requirement categories must be unique within a programme",
            path: [
              "programs",
              index,
              "requirements",
              requirementIndex,
              "category",
            ],
          });
        }
        categories.add(category);
      });
      if (program.progressionMode === "custom") {
        if (program.customLevels.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "A custom progression needs at least one level",
            path: ["programs", index, "customLevels"],
          });
        }
        validateLevels(program.customLevels, ctx, [
          "programs",
          index,
          "customLevels",
        ]);
      }
      const total = program.requirements.reduce(
        (sum, requirement) => sum + requirement.requiredCredits,
        0,
      );
      const levels =
        program.progressionMode === "custom"
          ? program.customLevels
          : value.defaultLevels;
      if (total > 0 && (levels.at(-1)?.creditCeiling ?? 0) < total) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Progression levels must cover all ${total} required credits`,
          path: ["programs", index, "customLevels"],
        });
      }
    });
  });

export type AcademicCatalogLevel = z.infer<typeof AcademicCatalogLevelInput>;
export type AcademicCatalogRequirement = z.infer<
  typeof AcademicCatalogRequirementInput
>;
export type AcademicCatalogProgram = z.infer<
  typeof AcademicCatalogProgramInput
>;
export type AcademicCatalogDraft = z.infer<typeof AcademicCatalogDraftInput>;

export interface AcademicLevelBand extends AcademicCatalogLevel {
  minimumCredits: number;
}

export interface AcademicProgress {
  earnedCredits: number;
  requiredCredits: number | null;
  inProgressCredits: number;
  level: AcademicLevelBand | null;
  maximumLevel: AcademicLevelBand | null;
  catalog: {
    academicYearId: string;
    label: string;
    revision: number;
    fallback: boolean;
  } | null;
}

export interface InProgressCourse {
  enrollmentId: string;
  courseCode: string;
  title: string;
  credits: number;
  term: string;
  sectionCode: string;
}

export function academicLevelBands(
  levels: AcademicCatalogLevel[],
): AcademicLevelBand[] {
  return levels.map((level, index) => ({
    ...level,
    minimumCredits: index === 0 ? 0 : levels[index - 1]!.creditCeiling + 1,
  }));
}

export function deriveAcademicLevel(
  levels: AcademicCatalogLevel[],
  earnedCredits: number,
  requiredCredits: number | null,
): { level: AcademicLevelBand | null; maximumLevel: AcademicLevelBand | null } {
  const bands = academicLevelBands(levels);
  if (bands.length === 0) return { level: null, maximumLevel: null };
  const maximumLevel =
    requiredCredits === null
      ? bands.at(-1)!
      : (bands.find((band) => requiredCredits <= band.creditCeiling) ??
        bands.at(-1)!);
  const raw =
    bands.find((band) => earnedCredits <= band.creditCeiling) ?? bands.at(-1)!;
  const maximumIndex = bands.findIndex(
    (band) => band.code === maximumLevel.code,
  );
  const rawIndex = bands.findIndex((band) => band.code === raw.code);
  return {
    level: rawIndex > maximumIndex ? maximumLevel : raw,
    maximumLevel,
  };
}
