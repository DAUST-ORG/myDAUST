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

export const AcademicStandingToneInput = z.enum([
  "neutral",
  "success",
  "honor",
  "warning",
]);

export const AcademicStandingRuleInput = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]*$/)
    .max(40),
  label: z.string().trim().min(1).max(80),
  minimumGpa: z.number().min(0).max(4),
  order: z.number().int().min(0).max(100),
  tone: AcademicStandingToneInput,
});

export const DEFAULT_ACADEMIC_STANDING_RULES = [
  {
    code: "academic_probation",
    label: "Academic Probation",
    minimumGpa: 0,
    order: 0,
    tone: "warning",
  },
  {
    code: "good_standing",
    label: "Good Standing",
    minimumGpa: 2,
    order: 1,
    tone: "success",
  },
  {
    code: "deans_list",
    label: "Dean's List",
    minimumGpa: 3.7,
    order: 2,
    tone: "honor",
  },
] as const;

export const DEFAULT_NOT_YET_GRADED_STANDING = {
  code: "not_yet_graded",
  label: "Not yet graded",
  tone: "neutral",
} as const;

export const AcademicNotYetGradedStandingInput = z.object({
  code: z.literal("not_yet_graded").default("not_yet_graded"),
  label: z.string().trim().min(1).max(80),
  tone: AcademicStandingToneInput,
});

export const AcademicCatalogProgramInput = z.object({
  programId: z.string().uuid(),
  programCode: z.string().trim().min(1).max(40),
  programName: z.string().trim().min(1).max(160),
  progressionMode: z.enum(["default", "custom"]),
  customLevels: z.array(AcademicCatalogLevelInput).max(40),
  requirements: z.array(AcademicCatalogRequirementInput).max(80),
  standingMode: z.enum(["default", "custom"]).default("default"),
  customStandingRules: z.array(AcademicStandingRuleInput).max(20).default([]),
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

function validateStandingRules(
  rules: AcademicStandingRule[],
  ctx: z.RefinementCtx,
  path: (string | number)[],
) {
  if (rules.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one academic-standing rule is required",
      path,
    });
    return;
  }
  const codes = new Set<string>();
  const orders = new Set<number>();
  const thresholds = new Set<number>();
  for (const [index, rule] of rules.entries()) {
    if (codes.has(rule.code)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Standing codes must be unique",
        path: [...path, index, "code"],
      });
    }
    if (orders.has(rule.order)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Standing order values must be unique",
        path: [...path, index, "order"],
      });
    }
    if (thresholds.has(rule.minimumGpa)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Standing GPA thresholds must be unique",
        path: [...path, index, "minimumGpa"],
      });
    }
    codes.add(rule.code);
    orders.add(rule.order);
    thresholds.add(rule.minimumGpa);
  }
  if (!rules.some((rule) => rule.minimumGpa === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Standing rules must cover GPA 0.00",
      path,
    });
  }
}

export const AcademicCatalogDraftInput = z
  .object({
    yearLabel: z.string().trim().min(4).max(40),
    startsOn: z.string().date().nullable(),
    endsOn: z.string().date().nullable(),
    defaultLevels: z.array(AcademicCatalogLevelInput).min(1).max(40),
    defaultStandingRules: z
      .array(AcademicStandingRuleInput)
      .min(1)
      .max(20)
      .default([...DEFAULT_ACADEMIC_STANDING_RULES]),
    notYetGradedStanding: AcademicNotYetGradedStandingInput.default(
      DEFAULT_NOT_YET_GRADED_STANDING,
    ),
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
    validateStandingRules(value.defaultStandingRules, ctx, [
      "defaultStandingRules",
    ]);
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
      if (program.standingMode === "custom") {
        validateStandingRules(program.customStandingRules, ctx, [
          "programs",
          index,
          "customStandingRules",
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
export type AcademicStandingTone = z.infer<typeof AcademicStandingToneInput>;
export type AcademicStandingRule = z.infer<typeof AcademicStandingRuleInput>;
export type AcademicNotYetGradedStanding = z.infer<
  typeof AcademicNotYetGradedStandingInput
>;

export interface AcademicStanding {
  code: string;
  label: string;
  tone: AcademicStandingTone;
  source: "computed" | "override";
  catalog: AcademicProgress["catalog"];
  override: {
    id: string;
    reason: string;
    expiresAt: string | null;
    createdAt: string;
    createdBy: { name: string; email: string } | null;
  } | null;
}

export function deriveAcademicStanding(
  rules: AcademicStandingRule[],
  notYetGraded: AcademicNotYetGradedStanding,
  gpa: number | null,
  hasGpaCredits: boolean,
): Pick<AcademicStanding, "code" | "label" | "tone"> {
  if (!hasGpaCredits || gpa === null) return notYetGraded;
  const sorted = [...rules].sort(
    (a, b) => a.minimumGpa - b.minimumGpa || a.order - b.order,
  );
  return (
    [...sorted].reverse().find((rule) => gpa >= rule.minimumGpa) ??
    sorted[0] ??
    DEFAULT_NOT_YET_GRADED_STANDING
  );
}

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
