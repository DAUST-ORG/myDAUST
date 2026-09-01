import { createHash } from "node:crypto";
import { z } from "zod";

const MAX_XOF = Number.MAX_SAFE_INTEGER;

export const WORKBOOK_CUTOVER_BASELINE = {
  sourceAsOfDate: "2026-08-29",
  workbookRows: 403,
  productionStudents: 417,
  productionActiveStudents: 401,
  productionPendingPaymentStudents: 16,
  productionArchivedStudents: 0,
  currentApplicants: 42,
  billedXof: 1_514_469_978,
  paidXof: 286_551_264,
  installmentPaidXof: 286_549_831,
  positivePaymentRows: 223,
  zeroPaymentRows: 180,
  housingRows: 345,
  housingNoneRows: 58,
  housingDoubleRows: 311,
  housingDoubleAcRows: 24,
  housingIndividualRows: 4,
  housingIndividualAcRows: 6,
  cafeteriaRows: 302,
  cafeteriaNoneRows: 101,
  insuranceRows: 386,
  insuranceNoneRows: 17,
  cautionRows: 117,
  explicitPercentageScholarshipRows: 118,
} as const;

export const WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF = {
  tuition: 2_975_000,
  housing_none: 0,
  housing_double: 680_000,
  housing_double_ac: 800_000,
  housing_individual: 1_360_000,
  housing_individual_ac: 1_600_000,
  cafeteria_none: 0,
  cafeteria_full: 630_000,
  insurance_none: 0,
  insurance_selected: 10_000,
} as const;

export const WORKBOOK_CUTOVER_REFERENCE_PACKAGE_XOF = 4_295_000;
export const WORKBOOK_CUTOVER_CAUTION_BPS = 1_000;

export const WORKBOOK_CUTOVER_INSTALLMENT_DUE_DATES = [
  "2026-08-25",
  "2026-11-05",
  "2027-01-05",
  "2027-03-05",
] as const;

export function workbookCutoverBillingTermLabel(
  academicYearLabel: string,
): string {
  return `${academicYearLabel} annual workbook billing`;
}

const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD calendar date")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Expected a valid calendar date");

export const WorkbookCutoverSha256Schema = z
  .string()
  .trim()
  .regex(/^[a-fA-F0-9]{64}$/, "Expected a SHA-256 hex digest")
  .transform((value) => value.toLowerCase());

const WholeXofSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_XOF)
  .refine(Number.isSafeInteger, "Expected a safe whole-XOF value");

const IdSchema = z.string().trim().min(1).max(240);

export const WorkbookCutoverStudentNumberSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .transform((value) => value.normalize("NFKC").toUpperCase())
  .refine(
    (value) => /^[A-Z0-9][A-Z0-9._-]*$/.test(value),
    "Student numbers must use canonical uppercase letters, numbers, dots, underscores, or hyphens",
  );

const EmailSchema = z
  .string()
  .trim()
  .email()
  .max(320)
  .transform((value) => value.toLowerCase());

export const WorkbookCutoverSignedReviewSchema = z
  .object({
    reviewedBy: z.string().trim().min(3).max(240),
    reviewedAt: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(10).max(2_000),
    signedOff: z.literal(true),
    signatureSha256: WorkbookCutoverSha256Schema,
  })
  .strict();

export const WorkbookCutoverAcademicFingerprintSchema = z
  .object({
    // Each table hash is over canonical source-order-independent rows including
    // stable IDs plus every identity/value field that contributes to history,
    // credits, or GPA. Counts make omission detectable independently of SHA.
    transcriptCount: z.number().int().nonnegative().max(1_000_000),
    transcriptSha256: WorkbookCutoverSha256Schema,
    enrollmentCount: z.number().int().nonnegative().max(1_000_000),
    enrollmentSha256: WorkbookCutoverSha256Schema,
    gradeSnapshotCount: z.number().int().nonnegative().max(1_000_000),
    gradeSnapshotSha256: WorkbookCutoverSha256Schema,
    creditsSha256: WorkbookCutoverSha256Schema,
    gpaSha256: WorkbookCutoverSha256Schema,
  })
  .strict();

const ExistingIdentityFields = {
  studentId: IdSchema,
  personId: IdSchema,
  studentNo: WorkbookCutoverStudentNumberSchema,
  firstName: z.string().trim().min(1).max(160),
  lastName: z.string().trim().min(1).max(160),
  loginEmail: EmailSchema.nullable(),
  recordStatus: z.enum(["active", "pending_payment", "archived"]),
  personStatus: z.enum(["active", "suspended", "inactive"]),
  roles: z.array(z.string().trim().min(1).max(80)).max(50),
  academicFingerprint: WorkbookCutoverAcademicFingerprintSchema,
  academicFingerprintSha256: WorkbookCutoverSha256Schema,
} as const;

const WorkbookIdentityDecisionSchema = z.union([
  z
    .object({
      decision: z.literal("link_existing"),
      ...ExistingIdentityFields,
      matchEvidence: z.enum([
        "official_student_number",
        "reviewed_identity_document",
        "prior_reviewed_live_verification",
        "exact_unique_name_with_official_confirmation",
      ]),
      review: WorkbookCutoverSignedReviewSchema,
    })
    .strict(),
  z
    .object({
      decision: z.literal("create_new"),
      firstName: z.string().trim().min(1).max(160),
      lastName: z.string().trim().min(1).max(160),
      personalEmail: EmailSchema.nullable(),
      programCode: z.string().trim().min(1).max(40).nullable().optional(),
      plannedStudentNo: WorkbookCutoverStudentNumberSchema.optional(),
      plannedLoginEmail: EmailSchema.refine(
        (value) => value.endsWith("@mydaust.com"),
        "New SIS login identities must use @mydaust.com",
      ).optional(),
      review: WorkbookCutoverSignedReviewSchema,
    })
    .strict()
    .superRefine((identity, ctx) => {
      if (
        (identity.plannedStudentNo === undefined) !==
        (identity.plannedLoginEmail === undefined)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["plannedStudentNo"],
          message:
            "A reviewed preallocation must include both plannedStudentNo and plannedLoginEmail",
        });
      }
    }),
  z
    .object({
      decision: z.literal("reviewed_duplicate"),
      canonicalWorkbookRowKey: z.string().trim().min(3).max(240),
      duplicateStudentClaim: z.string().trim().min(1).max(240),
      review: WorkbookCutoverSignedReviewSchema,
    })
    .strict(),
  z
    .object({
      decision: z.literal("hold"),
      holdCode: z.enum([
        "unmatched",
        "ambiguous",
        "missing_official_identity",
        "conflicting_source_rows",
      ]),
      candidateStudentNos: z
        .array(WorkbookCutoverStudentNumberSchema)
        .max(50)
        .default([]),
      review: WorkbookCutoverSignedReviewSchema,
    })
    .strict(),
]);

export type WorkbookCutoverHousingOption =
  "none" | "double" | "double_ac" | "individual" | "individual_ac";

const HousingOptionSchema = z.enum([
  "none",
  "double",
  "double_ac",
  "individual",
  "individual_ac",
]);

export type WorkbookCutoverComponentKey =
  "tuition" | "housing" | "cafeteria" | "insurance" | "housing_caution";

const ComponentKeySchema = z.enum([
  "tuition",
  "housing",
  "cafeteria",
  "insurance",
  "housing_caution",
]);

const ServiceSelectionSchema = z
  .object({
    housing: z
      .object({
        option: HousingOptionSchema,
        annualAmountXof: WholeXofSchema,
      })
      .strict(),
    cafeteria: z
      .object({
        plan: z.enum(["none", "full"]),
        annualAmountXof: WholeXofSchema,
      })
      .strict(),
    insurance: z
      .object({
        selected: z.boolean(),
        annualAmountXof: WholeXofSchema,
      })
      .strict(),
    caution: z
      .object({
        selected: z.boolean(),
        // Usually identical to the selected housing option. Kept explicit so
        // the one workbook anomaly (caution billed while Housing=false) is
        // represented and warned on instead of silently inventing housing.
        basisHousingOption: HousingOptionSchema,
        percentageBps: z.union([
          z.literal(0),
          z.literal(WORKBOOK_CUTOVER_CAUTION_BPS),
        ]),
        amountXof: WholeXofSchema,
        refundable: z.literal(true),
      })
      .strict(),
  })
  .strict()
  .superRefine((services, ctx) => {
    const expectedHousing = housingAmountXof(services.housing.option);
    if (services.housing.annualAmountXof !== expectedHousing) {
      ctx.addIssue({
        code: "custom",
        path: ["housing", "annualAmountXof"],
        message: `Housing ${services.housing.option} must be ${expectedHousing} XOF`,
      });
    }
    const expectedCafeteria =
      services.cafeteria.plan === "full"
        ? WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF.cafeteria_full
        : 0;
    if (services.cafeteria.annualAmountXof !== expectedCafeteria) {
      ctx.addIssue({
        code: "custom",
        path: ["cafeteria", "annualAmountXof"],
        message: `Cafeteria ${services.cafeteria.plan} must be ${expectedCafeteria} XOF`,
      });
    }
    const expectedInsurance = services.insurance.selected
      ? WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF.insurance_selected
      : 0;
    if (services.insurance.annualAmountXof !== expectedInsurance) {
      ctx.addIssue({
        code: "custom",
        path: ["insurance", "annualAmountXof"],
        message: `Insurance selection must be ${expectedInsurance} XOF`,
      });
    }
    const cautionBasisHousing = housingAmountXof(
      services.caution.basisHousingOption,
    );
    const expectedCaution = services.caution.selected
      ? Math.round(
          (cautionBasisHousing * WORKBOOK_CUTOVER_CAUTION_BPS) / 10_000,
        )
      : 0;
    if (
      services.caution.selected &&
      services.caution.basisHousingOption === "none"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["caution", "basisHousingOption"],
        message: "A selected caution requires a non-none housing price basis",
      });
    }
    if (
      services.housing.option !== "none" &&
      services.caution.selected &&
      services.caution.basisHousingOption !== services.housing.option
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["caution", "basisHousingOption"],
        message: "Caution basis must equal the selected housing option",
      });
    }
    if (
      !services.caution.selected &&
      services.caution.basisHousingOption !== "none"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["caution", "basisHousingOption"],
        message: "An unselected caution must use the none housing basis",
      });
    }
    if (
      services.caution.percentageBps !==
        (services.caution.selected ? WORKBOOK_CUTOVER_CAUTION_BPS : 0) ||
      services.caution.amountXof !== expectedCaution
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["caution"],
        message: `Housing caution must be ${expectedCaution} XOF at the configured 10% rate`,
      });
    }
  });

const ComponentSnapshotSchema = z
  .object({
    key: ComponentKeySchema,
    optionCode: z.string().trim().min(1).max(80).nullable(),
    grossAmountXof: WholeXofSchema,
    adjustmentXof: z.number().int().min(-MAX_XOF).max(MAX_XOF).safe(),
    netAmountXof: WholeXofSchema,
    refundable: z.boolean(),
  })
  .strict()
  .refine(
    (component) =>
      component.grossAmountXof + component.adjustmentXof ===
      component.netAmountXof,
    "Component gross plus adjustment must equal component net",
  );

const AdjustmentDefinitionSchema = z.enum([
  "merit_10",
  "merit_15",
  "merit_20",
  "family",
  "somone_resident",
  "full_scholarship",
  "s10",
  "three_fpt",
  "social_help",
  "january_enrollment",
  "reviewed_manual_adjustment",
]);

const AdjustmentSchema = z
  .object({
    instanceKey: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{0,79}$/),
    definitionKey: AdjustmentDefinitionSchema,
    label: z.string().trim().min(1).max(160),
    // Gross-package awards (notably 3FPT) and final workbook reconciliation
    // can span more than one service component. A null target records the
    // adjustment at invoice/profile level while the component snapshots below
    // retain the deterministic non-negative allocation of the net bill.
    targetComponentKey: ComponentKeySchema.nullable(),
    direction: z.enum(["reduction", "charge"]),
    calculation: z.enum(["percentage", "fixed", "manual"]),
    basis: z.enum(["tuition", "gross_package", "none"]),
    basisAmountXof: WholeXofSchema,
    percentageBps: z.number().int().min(1).max(10_000).optional(),
    // A named workbook adjustment may be present without a separately
    // quantified monetary effect. Preserve that provenance as a zero manual
    // row instead of inventing one XOF. Percentage/fixed rules below still
    // require their exact positive calculated amount.
    amountXof: WholeXofSchema,
    stacking: z.enum(["additive", "exclusive"]),
    approvalRequired: z.boolean(),
    review: WorkbookCutoverSignedReviewSchema,
  })
  .strict()
  .superRefine((adjustment, ctx) => {
    const expectedStacking = [
      "merit_10",
      "merit_15",
      "merit_20",
      "full_scholarship",
      "three_fpt",
    ].includes(adjustment.definitionKey)
      ? "exclusive"
      : "additive";
    const expectedApprovalRequired = ![
      "merit_10",
      "merit_15",
      "merit_20",
    ].includes(adjustment.definitionKey);
    if (
      adjustment.stacking !== expectedStacking ||
      adjustment.approvalRequired !== expectedApprovalRequired
    ) {
      ctx.addIssue({
        code: "custom",
        message: `${adjustment.definitionKey} must snapshot its configured stacking and approval requirements`,
      });
    }
    const fixedRules: Partial<
      Record<
        z.infer<typeof AdjustmentDefinitionSchema>,
        { calculation: "percentage" | "fixed"; basis: "tuition"; value: number }
      >
    > = {
      merit_10: { calculation: "percentage", basis: "tuition", value: 1_000 },
      merit_15: { calculation: "percentage", basis: "tuition", value: 1_500 },
      merit_20: { calculation: "percentage", basis: "tuition", value: 2_000 },
      family: { calculation: "percentage", basis: "tuition", value: 1_000 },
      somone_resident: {
        calculation: "percentage",
        basis: "tuition",
        value: 1_000,
      },
      full_scholarship: {
        calculation: "percentage",
        basis: "tuition",
        value: 10_000,
      },
      s10: { calculation: "percentage", basis: "tuition", value: 5_000 },
      january_enrollment: {
        calculation: "fixed",
        basis: "tuition",
        value: 250_000,
      },
    };
    const fixed = fixedRules[adjustment.definitionKey];
    if (fixed) {
      if (
        adjustment.direction !== "reduction" ||
        adjustment.calculation !== fixed.calculation ||
        adjustment.basis !== fixed.basis ||
        adjustment.basisAmountXof !==
          WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF.tuition
      ) {
        ctx.addIssue({
          code: "custom",
          message: `${adjustment.definitionKey} must use its approved tuition reduction definition`,
        });
      }
      if (
        fixed.calculation === "percentage" &&
        adjustment.percentageBps !== fixed.value
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["percentageBps"],
          message: `${adjustment.definitionKey} must use ${fixed.value} basis points`,
        });
      }
      if (
        fixed.calculation === "fixed" &&
        adjustment.amountXof !== fixed.value
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["amountXof"],
          message: `${adjustment.definitionKey} must be ${fixed.value} XOF`,
        });
      }
    }
    if (adjustment.definitionKey === "three_fpt") {
      if (
        adjustment.direction !== "reduction" ||
        adjustment.calculation !== "percentage" ||
        adjustment.basis !== "gross_package" ||
        adjustment.basisAmountXof !== WORKBOOK_CUTOVER_REFERENCE_PACKAGE_XOF
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "3FPT must be a reviewed percentage reduction on the 4,295,000 XOF reference package",
        });
      }
    }
    if (adjustment.definitionKey === "social_help") {
      if (
        adjustment.direction !== "reduction" ||
        adjustment.calculation !== "manual" ||
        adjustment.basis !== "tuition" ||
        adjustment.basisAmountXof !==
          WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF.tuition
      ) {
        ctx.addIssue({
          code: "custom",
          message:
            "Social help must be a reviewed manual tuition-basis reduction",
        });
      }
    }
    if (adjustment.definitionKey === "reviewed_manual_adjustment") {
      const validManual =
        adjustment.calculation === "manual" && adjustment.basis === "none";
      const validReviewedPercentage =
        adjustment.calculation === "percentage" &&
        ["tuition", "gross_package"].includes(adjustment.basis);
      const validReviewedFixed =
        adjustment.calculation === "fixed" && adjustment.basis === "none";
      if (!validManual && !validReviewedPercentage && !validReviewedFixed) {
        ctx.addIssue({
          code: "custom",
          message:
            "Reviewed manual adjustments must explicitly declare manual, percentage, or fixed calculation and its compatible basis",
        });
      }
    }
    if (adjustment.calculation === "percentage") {
      if (adjustment.percentageBps === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["percentageBps"],
          message: "Percentage adjustments require percentageBps",
        });
      } else if (
        Math.round(
          (adjustment.basisAmountXof * adjustment.percentageBps) / 10_000,
        ) !== adjustment.amountXof
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["amountXof"],
          message:
            "Percentage adjustment amount must equal its rounded basis calculation",
        });
      }
    } else if (adjustment.percentageBps !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["percentageBps"],
        message: "Only percentage adjustments may include percentageBps",
      });
    }
  });

const InstallmentSchema = z
  .object({
    sequence: z.number().int().min(1).max(4),
    dueXof: WholeXofSchema,
    paidDetailXof: WholeXofSchema,
  })
  .strict()
  .refine(
    (installment) => installment.paidDetailXof <= installment.dueXof,
    "Installment paid detail cannot exceed installment due",
  );

export const WorkbookFinancialSnapshotSchema = z
  .object({
    sourceCategory: z.string().trim().min(1).max(80),
    amountBilledXof: WholeXofSchema,
    amountPaidXof: WholeXofSchema,
    installments: z.array(InstallmentSchema).length(4),
    services: ServiceSelectionSchema,
    components: z.array(ComponentSnapshotSchema).min(1).max(10),
    adjustments: z.array(AdjustmentSchema).max(30),
    sourceScholarshipOnTuition: z.number().finite().min(0).max(1).nullable(),
    sourceNote: z.string().max(2_000).nullable(),
    accountCreditXof: WholeXofSchema,
  })
  .strict()
  .superRefine((financial, ctx) => {
    const sequences = financial.installments.map(
      (installment) => installment.sequence,
    );
    if (sequences.join(",") !== "1,2,3,4") {
      ctx.addIssue({
        code: "custom",
        path: ["installments"],
        message: "Workbook installments must be the exact ordered sequence 1-4",
      });
    }
    const dueTotal = sumXof(
      financial.installments.map((installment) => installment.dueXof),
    );
    const paidDetailTotal = sumXof(
      financial.installments.map((installment) => installment.paidDetailXof),
    );
    if (dueTotal !== financial.amountBilledXof) {
      ctx.addIssue({
        code: "custom",
        path: ["installments"],
        message: `Four installment due cells total ${dueTotal} XOF, not Amount Billed ${financial.amountBilledXof} XOF`,
      });
    }
    if (
      paidDetailTotal + financial.accountCreditXof !==
      financial.amountPaidXof
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["accountCreditXof"],
        message:
          "Installment-paid detail plus reviewed account credit must equal Amount Paid",
      });
    }

    const componentByKey = new Map<
      WorkbookCutoverComponentKey,
      z.infer<typeof ComponentSnapshotSchema>
    >();
    for (const [index, component] of financial.components.entries()) {
      if (componentByKey.has(component.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["components", index, "key"],
          message: `Component ${component.key} appears more than once`,
        });
      }
      componentByKey.set(component.key, component);
    }
    const expectedComponents = expectedServiceComponents(financial.services);
    for (const expected of expectedComponents) {
      const actual = componentByKey.get(expected.key);
      if (
        !actual ||
        actual.optionCode !== expected.optionCode ||
        actual.grossAmountXof !== expected.grossAmountXof ||
        actual.refundable !== expected.refundable
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["components"],
          message: `Missing or incorrect gross snapshot for ${expected.key}`,
        });
      }
    }
    if (componentByKey.size !== expectedComponents.length) {
      ctx.addIssue({
        code: "custom",
        path: ["components"],
        message: "Components must exactly match the selected gross services",
      });
    }

    const adjustmentKeys = new Set<string>();
    for (const [index, adjustment] of financial.adjustments.entries()) {
      if (adjustmentKeys.has(adjustment.instanceKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["adjustments", index, "instanceKey"],
          message: `Adjustment ${adjustment.instanceKey} appears more than once`,
        });
      }
      adjustmentKeys.add(adjustment.instanceKey);
      if (
        adjustment.targetComponentKey !== null &&
        !componentByKey.has(adjustment.targetComponentKey)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["adjustments", index, "targetComponentKey"],
          message: "An adjustment must target a selected invoice component",
        });
      }
    }
    const explicitScholarshipBps = Math.round(
      (financial.sourceScholarshipOnTuition ?? 0) * 10_000,
    );
    if (explicitScholarshipBps > 0) {
      const explainedBps = financial.adjustments
        .filter(
          (adjustment) =>
            adjustment.basis === "tuition" &&
            adjustment.direction === "reduction" &&
            [
              "merit_10",
              "merit_15",
              "merit_20",
              "family",
              "somone_resident",
              "full_scholarship",
              "s10",
              "social_help",
              "reviewed_manual_adjustment",
            ].includes(adjustment.definitionKey),
        )
        .reduce(
          (sum, adjustment) =>
            sum +
            (adjustment.percentageBps ??
              Math.round(
                (adjustment.amountXof * 10_000) /
                  WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF.tuition,
              )),
          0,
        );
      if (explainedBps !== explicitScholarshipBps) {
        ctx.addIssue({
          code: "custom",
          path: ["adjustments"],
          message: `Workbook scholarship percentage ${explicitScholarshipBps} bps must be explained by explicit named tuition adjustments`,
        });
      }
    }
    const signedAdjustmentTotal = sumXofSigned(
      financial.adjustments.map((adjustment) =>
        adjustment.direction === "reduction"
          ? -adjustment.amountXof
          : adjustment.amountXof,
      ),
    );
    const componentAdjustmentTotal = sumXofSigned(
      financial.components.map((component) => component.adjustmentXof),
    );
    if (signedAdjustmentTotal !== componentAdjustmentTotal) {
      ctx.addIssue({
        code: "custom",
        path: ["adjustments"],
        message:
          "Explicit signed adjustments must equal the total adjustment allocated across component snapshots",
      });
    }
    const netTotal = sumXof(
      financial.components.map((component) => component.netAmountXof),
    );
    if (netTotal !== financial.amountBilledXof) {
      ctx.addIssue({
        code: "custom",
        path: ["components"],
        message: `Net components total ${netTotal} XOF, not authoritative Amount Billed ${financial.amountBilledXof} XOF`,
      });
    }
  });

const WorkbookRowSchema = z
  .object({
    sourceKey: z.string().trim().min(3).max(240),
    sourceSheet: z.string().trim().min(1).max(120),
    sourceRowNumber: z.number().int().min(1).max(10_000_000),
    sourceRecordSha256: WorkbookCutoverSha256Schema,
    sourceStudentClaim: z.string().trim().min(1).max(240),
    identity: WorkbookIdentityDecisionSchema,
    financial: WorkbookFinancialSnapshotSchema,
  })
  .strict();

const ProductionStudentDecisionSchema = z.discriminatedUnion("decision", [
  z
    .object({
      decision: z.literal("link_workbook"),
      sourceKey: z.string().trim().min(3).max(240),
      sourceRecordSha256: WorkbookCutoverSha256Schema,
      ...ExistingIdentityFields,
      workbookRowKey: z.string().trim().min(3).max(240),
      review: WorkbookCutoverSignedReviewSchema,
    })
    .strict(),
  z
    .object({
      decision: z.literal("keep_exception"),
      sourceKey: z.string().trim().min(3).max(240),
      sourceRecordSha256: WorkbookCutoverSha256Schema,
      ...ExistingIdentityFields,
      exceptionCode: z.string().trim().min(3).max(80),
      review: WorkbookCutoverSignedReviewSchema,
    })
    .strict(),
  z
    .object({
      decision: z.literal("archive"),
      sourceKey: z.string().trim().min(3).max(240),
      sourceRecordSha256: WorkbookCutoverSha256Schema,
      ...ExistingIdentityFields,
      revokeStudentRole: z.literal(true),
      bumpSessionVersion: z.literal(true),
      suspendPersonOnlyWhenNoOtherInstitutionalRole: z.literal(true),
      review: WorkbookCutoverSignedReviewSchema,
    })
    .strict(),
  z
    .object({
      decision: z.literal("hold"),
      sourceKey: z.string().trim().min(3).max(240),
      sourceRecordSha256: WorkbookCutoverSha256Schema,
      ...ExistingIdentityFields,
      holdCode: z.enum([
        "possible_workbook_match",
        "identity_conflict",
        "records_need_review",
      ]),
      candidateWorkbookRowKeys: z
        .array(z.string().trim().min(3).max(240))
        .max(50),
      review: WorkbookCutoverSignedReviewSchema,
    })
    .strict(),
]);

const ApplicantDecisionSchema = z
  .object({
    decision: z.literal("preserve"),
    sourceKey: z.string().trim().min(3).max(240),
    sourceRecordSha256: WorkbookCutoverSha256Schema,
    applicantId: IdSchema,
    firstName: z.string().trim().min(1).max(160),
    lastName: z.string().trim().min(1).max(160),
    email: EmailSchema,
    stage: z.string().trim().min(1).max(80),
    review: WorkbookCutoverSignedReviewSchema,
  })
  .strict();

const BaselineControlsSchema = z
  .object({
    workbookRows: z.literal(WORKBOOK_CUTOVER_BASELINE.workbookRows),
    productionStudents: z.number().int().nonnegative().max(50_000),
    productionActiveStudents: z.number().int().nonnegative().max(50_000),
    productionPendingPaymentStudents: z
      .number()
      .int()
      .nonnegative()
      .max(50_000),
    productionArchivedStudents: z.number().int().nonnegative().max(50_000),
    currentApplicants: z.number().int().nonnegative().max(50_000),
    billedXof: z.literal(WORKBOOK_CUTOVER_BASELINE.billedXof),
    paidXof: z.literal(WORKBOOK_CUTOVER_BASELINE.paidXof),
    installmentPaidXof: z.literal(WORKBOOK_CUTOVER_BASELINE.installmentPaidXof),
    positivePaymentRows: z.literal(
      WORKBOOK_CUTOVER_BASELINE.positivePaymentRows,
    ),
    zeroPaymentRows: z.literal(WORKBOOK_CUTOVER_BASELINE.zeroPaymentRows),
    housingRows: z.literal(WORKBOOK_CUTOVER_BASELINE.housingRows),
    housingNoneRows: z.literal(WORKBOOK_CUTOVER_BASELINE.housingNoneRows),
    housingDoubleRows: z.literal(WORKBOOK_CUTOVER_BASELINE.housingDoubleRows),
    housingDoubleAcRows: z.literal(
      WORKBOOK_CUTOVER_BASELINE.housingDoubleAcRows,
    ),
    housingIndividualRows: z.literal(
      WORKBOOK_CUTOVER_BASELINE.housingIndividualRows,
    ),
    housingIndividualAcRows: z.literal(
      WORKBOOK_CUTOVER_BASELINE.housingIndividualAcRows,
    ),
    cafeteriaRows: z.literal(WORKBOOK_CUTOVER_BASELINE.cafeteriaRows),
    cafeteriaNoneRows: z.literal(WORKBOOK_CUTOVER_BASELINE.cafeteriaNoneRows),
    insuranceRows: z.literal(WORKBOOK_CUTOVER_BASELINE.insuranceRows),
    insuranceNoneRows: z.literal(WORKBOOK_CUTOVER_BASELINE.insuranceNoneRows),
    cautionRows: z.literal(WORKBOOK_CUTOVER_BASELINE.cautionRows),
    explicitPercentageScholarshipRows: z.literal(
      WORKBOOK_CUTOVER_BASELINE.explicitPercentageScholarshipRows,
    ),
  })
  .strict();

const DispositionControlsSchema = z
  .object({
    includedWorkbookRows: z.number().int().nonnegative().max(403),
    includedBilledXof: WholeXofSchema,
    includedPaidXof: WholeXofSchema,
    reviewedExclusionRows: z.number().int().nonnegative().max(403),
    reviewedExclusionBilledXof: WholeXofSchema,
    reviewedExclusionPaidXof: WholeXofSchema,
    heldWorkbookRows: z.number().int().nonnegative().max(403),
    heldBilledXof: WholeXofSchema,
    heldPaidXof: WholeXofSchema,
    linkedProductionStudents: z.number().int().nonnegative().max(417),
    keptProductionExceptions: z.number().int().nonnegative().max(417),
    archivedProductionStudents: z.number().int().nonnegative().max(417),
    heldProductionStudents: z.number().int().nonnegative().max(417),
    preservedApplicants: z.number().int().nonnegative().max(50_000),
  })
  .strict();

const SourceFileSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    sha256: WorkbookCutoverSha256Schema,
  })
  .strict();

export interface WorkbookCutoverReviewSignatureContext {
  reviewWorkbookSha256: string;
  sourceWorkbookSha256: string;
  extractionSha256: string;
  productionSnapshotSha256: string;
}

export function workbookCutoverReviewSignature(input: {
  scope: string;
  sourceKey: string;
  payload: unknown;
  reviewedBy: string;
  reviewedAt: string;
  reason: string;
  context: WorkbookCutoverReviewSignatureContext;
}): string {
  return createHash("sha256")
    .update(
      canonicalWorkbookCutoverJson({
        schemaVersion: 1,
        signedOff: true,
        ...input,
      }),
    )
    .digest("hex");
}

function adjustmentReviewScope(adjustment: {
  definitionKey: string;
  targetComponentKey: string | null;
}): string {
  if (
    adjustment.definitionKey === "social_help" &&
    adjustment.targetComponentKey === null
  ) {
    return "financial_adjustment:social_help_manual";
  }
  if (
    adjustment.definitionKey === "reviewed_manual_adjustment" &&
    adjustment.targetComponentKey === null
  ) {
    return "financial_adjustment:final_reconciliation";
  }
  return `financial_adjustment:${adjustment.definitionKey}`;
}

export const WorkbookCutoverManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    importName: z.string().trim().min(3).max(200),
    academicYearLabel: z.string().trim().min(4).max(64),
    academicYearStart: z.number().int().min(2000).max(2999),
    sourceAsOfDate: z.literal(WORKBOOK_CUTOVER_BASELINE.sourceAsOfDate),
    currency: z.literal("XOF"),
    sourceWorkbook: SourceFileSchema.refine(
      (source) => source.fileName.toLowerCase().endsWith(".xlsx"),
      "Source workbook must be an .xlsx file",
    ),
    trustedExtraction: SourceFileSchema,
    productionSnapshot: SourceFileSchema,
    reviewWorkbook: SourceFileSchema.refine(
      (source) => source.fileName.toLowerCase().endsWith(".xlsx"),
      "Review workbook must be an .xlsx file",
    ),
    billingTermLabel: z.string().trim().min(1).max(120),
    installmentDueDates: z.array(DateOnlySchema).length(4),
    controls: BaselineControlsSchema,
    dispositionControls: DispositionControlsSchema,
    workbookRows: z.array(WorkbookRowSchema).length(403),
    productionStudents: z.array(ProductionStudentDecisionSchema).max(50_000),
    applicants: z.array(ApplicantDecisionSchema).max(50_000),
    reviewNote: z.string().trim().min(10).max(4_000),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    if (
      manifest.billingTermLabel !==
      workbookCutoverBillingTermLabel(manifest.academicYearLabel)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["billingTermLabel"],
        message: "Billing term label is not the locked annual workbook term",
      });
    }
    if (
      canonicalWorkbookCutoverJson(manifest.installmentDueDates) !==
      canonicalWorkbookCutoverJson(WORKBOOK_CUTOVER_INSTALLMENT_DUE_DATES)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["installmentDueDates"],
        message:
          "Installment dates differ from the reviewed workbook cutover dates",
      });
    }

    const signatureContext: WorkbookCutoverReviewSignatureContext = {
      reviewWorkbookSha256: manifest.reviewWorkbook.sha256,
      sourceWorkbookSha256: manifest.sourceWorkbook.sha256,
      extractionSha256: manifest.trustedExtraction.sha256,
      productionSnapshotSha256: manifest.productionSnapshot.sha256,
    };
    const verifyReview = (
      scope: string,
      sourceKey: string,
      payload: unknown,
      review: z.infer<typeof WorkbookCutoverSignedReviewSchema>,
      path: Array<string | number>,
    ) => {
      const expected = workbookCutoverReviewSignature({
        scope,
        sourceKey,
        payload,
        reviewedBy: review.reviewedBy,
        reviewedAt: review.reviewedAt,
        reason: review.reason,
        context: signatureContext,
      });
      if (review.signatureSha256 !== expected) {
        ctx.addIssue({
          code: "custom",
          path: [...path, "signatureSha256"],
          message:
            "Signed review does not match its decision payload and source anchors",
        });
      }
    };
    manifest.workbookRows.forEach((row, rowIndex) => {
      const { review, ...identityPayload } = row.identity;
      verifyReview(
        "workbook_identity",
        row.sourceKey,
        identityPayload,
        review,
        ["workbookRows", rowIndex, "identity", "review"],
      );
      row.financial.adjustments.forEach((adjustment, adjustmentIndex) => {
        const { review: adjustmentReview, ...adjustmentPayload } = adjustment;
        verifyReview(
          adjustmentReviewScope(adjustment),
          row.sourceKey,
          adjustmentPayload,
          adjustmentReview,
          [
            "workbookRows",
            rowIndex,
            "financial",
            "adjustments",
            adjustmentIndex,
            "review",
          ],
        );
      });
    });
    manifest.productionStudents.forEach((student, index) => {
      const { review, ...payload } = student;
      verifyReview("production_student", student.sourceKey, payload, review, [
        "productionStudents",
        index,
        "review",
      ]);
    });
    manifest.applicants.forEach((applicant, index) => {
      const { review, ...payload } = applicant;
      verifyReview(
        "applicant_preservation",
        applicant.sourceKey,
        payload,
        review,
        ["applicants", index, "review"],
      );
    });
    validateWorkbookRows(manifest, ctx);
    validateProductionStudents(manifest, ctx);
    validateApplicants(manifest, ctx);
    validateCrossSourceBijection(manifest, ctx);
    validateDispositionControls(manifest, ctx);
  });

export type WorkbookCutoverManifest = z.infer<
  typeof WorkbookCutoverManifestSchema
>;
export type WorkbookCutoverManifestRow =
  WorkbookCutoverManifest["workbookRows"][number];
export type WorkbookCutoverWorkbookIdentity =
  WorkbookCutoverManifestRow["identity"];
export type WorkbookCutoverProductionDecision =
  WorkbookCutoverManifest["productionStudents"][number];
export type WorkbookCutoverApplicantDecision =
  WorkbookCutoverManifest["applicants"][number];
export type WorkbookCutoverFinancialSnapshot =
  WorkbookCutoverManifestRow["financial"];

export function workbookCutoverWorkbookRowKey(
  sheet: string,
  rowNumber: number,
): string {
  return `workbook:${sheet.trim()}!${rowNumber}`;
}

export function workbookCutoverProductionStudentKey(studentId: string): string {
  return `student:${studentId.trim()}`;
}

export function workbookCutoverApplicantKey(applicantId: string): string {
  return `applicant:${applicantId.trim()}`;
}

export function canonicalWorkbookCutoverJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalWorkbookCutoverJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalWorkbookCutoverJson(object[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function workbookCutoverManifestDigest(
  manifest: WorkbookCutoverManifest,
): string {
  const normalized = {
    ...manifest,
    workbookRows: [...manifest.workbookRows].sort((left, right) =>
      compareText(left.sourceKey, right.sourceKey),
    ),
    productionStudents: [...manifest.productionStudents].sort((left, right) =>
      compareText(left.sourceKey, right.sourceKey),
    ),
    applicants: [...manifest.applicants].sort((left, right) =>
      compareText(left.sourceKey, right.sourceKey),
    ),
  };
  return createHash("sha256")
    .update(canonicalWorkbookCutoverJson(normalized))
    .digest("hex");
}

export function parseWorkbookCutoverManifest(
  bytes: Buffer,
): WorkbookCutoverManifest {
  return WorkbookCutoverManifestSchema.parse(
    JSON.parse(bytes.toString("utf8")) as unknown,
  );
}

export function workbookCutoverAcademicFingerprintDigest(
  fingerprint: z.infer<typeof WorkbookCutoverAcademicFingerprintSchema>,
): string {
  return createHash("sha256")
    .update(canonicalWorkbookCutoverJson(fingerprint))
    .digest("hex");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sumXof(values: readonly number[]): number {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) {
    throw new Error("Workbook cutover XOF controls exceed safe integers");
  }
  return total;
}

function sumXofSigned(values: readonly number[]): number {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) {
    throw new Error(
      "Workbook cutover signed XOF controls exceed safe integers",
    );
  }
  return total;
}

function housingAmountXof(option: WorkbookCutoverHousingOption): number {
  return WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF[`housing_${option}`];
}

function expectedServiceComponents(
  services: z.infer<typeof ServiceSelectionSchema>,
): Array<{
  key: WorkbookCutoverComponentKey;
  optionCode: string | null;
  grossAmountXof: number;
  refundable: boolean;
}> {
  const components: Array<{
    key: WorkbookCutoverComponentKey;
    optionCode: string | null;
    grossAmountXof: number;
    refundable: boolean;
  }> = [
    {
      key: "tuition",
      optionCode: "annual_tuition",
      grossAmountXof: WORKBOOK_CUTOVER_SERVICE_AMOUNTS_XOF.tuition,
      refundable: false,
    },
  ];
  if (services.housing.option !== "none") {
    components.push({
      key: "housing",
      optionCode: services.housing.option,
      grossAmountXof: services.housing.annualAmountXof,
      refundable: false,
    });
  }
  if (services.cafeteria.plan === "full") {
    components.push({
      key: "cafeteria",
      optionCode: "full",
      grossAmountXof: services.cafeteria.annualAmountXof,
      refundable: false,
    });
  }
  if (services.insurance.selected) {
    components.push({
      key: "insurance",
      optionCode: "annual",
      grossAmountXof: services.insurance.annualAmountXof,
      refundable: false,
    });
  }
  if (services.caution.selected) {
    components.push({
      key: "housing_caution",
      optionCode: services.caution.basisHousingOption,
      grossAmountXof: services.caution.amountXof,
      refundable: true,
    });
  }
  return components;
}

function issue(
  ctx: z.RefinementCtx,
  path: Array<string | number>,
  message: string,
): void {
  ctx.addIssue({ code: "custom", path, message });
}

function validateWorkbookRows(
  manifest: z.infer<typeof WorkbookCutoverManifestSchema._def.schema>,
  ctx: z.RefinementCtx,
): void {
  const keys = new Set<string>();
  let billedXof = 0;
  let paidXof = 0;
  let installmentPaidXof = 0;
  let positivePaymentRows = 0;
  const housing = new Map<WorkbookCutoverHousingOption, number>([
    ["none", 0],
    ["double", 0],
    ["double_ac", 0],
    ["individual", 0],
    ["individual_ac", 0],
  ]);
  let cafeteriaRows = 0;
  let insuranceRows = 0;
  let cautionRows = 0;
  let explicitPercentageRows = 0;
  for (const [index, row] of manifest.workbookRows.entries()) {
    const expectedKey = workbookCutoverWorkbookRowKey(
      row.sourceSheet,
      row.sourceRowNumber,
    );
    if (row.sourceKey !== expectedKey) {
      issue(
        ctx,
        ["workbookRows", index, "sourceKey"],
        `Workbook source key must be ${expectedKey}`,
      );
    }
    if (keys.has(row.sourceKey)) {
      issue(
        ctx,
        ["workbookRows", index, "sourceKey"],
        `Workbook source ${row.sourceKey} appears more than once`,
      );
    }
    keys.add(row.sourceKey);
    billedXof += row.financial.amountBilledXof;
    paidXof += row.financial.amountPaidXof;
    const detail = sumXof(
      row.financial.installments.map(
        (installment) => installment.paidDetailXof,
      ),
    );
    installmentPaidXof += detail;
    if (row.financial.amountPaidXof > 0) positivePaymentRows += 1;
    housing.set(
      row.financial.services.housing.option,
      (housing.get(row.financial.services.housing.option) ?? 0) + 1,
    );
    if (row.financial.services.cafeteria.plan === "full") cafeteriaRows += 1;
    if (row.financial.services.insurance.selected) insuranceRows += 1;
    if (row.financial.services.caution.selected) cautionRows += 1;
    if ((row.financial.sourceScholarshipOnTuition ?? 0) > 0) {
      explicitPercentageRows += 1;
    }
    const variance = row.financial.amountPaidXof - detail;
    const isReviewedVarianceRow =
      row.sourceSheet === "Comparison" && row.sourceRowNumber === 159;
    if (
      isReviewedVarianceRow &&
      (detail !== row.financial.amountBilledXof ||
        row.financial.amountPaidXof !== row.financial.amountBilledXof + 1_433 ||
        variance !== 1_433 ||
        row.financial.accountCreditXof !== 1_433)
    ) {
      issue(
        ctx,
        ["workbookRows", index, "financial", "accountCreditXof"],
        "Comparison row 159 must carry the reviewed +1,433 XOF Amount Paid-over-bill account credit",
      );
    } else if (
      !isReviewedVarianceRow &&
      (variance !== 0 || row.financial.accountCreditXof !== 0)
    ) {
      issue(
        ctx,
        ["workbookRows", index, "financial", "accountCreditXof"],
        "Only Comparison row 159 may carry the reviewed +1,433 XOF Amount Paid variance",
      );
    }
  }
  const controls: Array<[number, number, string]> = [
    [billedXof, WORKBOOK_CUTOVER_BASELINE.billedXof, "billed XOF"],
    [paidXof, WORKBOOK_CUTOVER_BASELINE.paidXof, "paid XOF"],
    [
      installmentPaidXof,
      WORKBOOK_CUTOVER_BASELINE.installmentPaidXof,
      "installment-paid XOF",
    ],
    [
      positivePaymentRows,
      WORKBOOK_CUTOVER_BASELINE.positivePaymentRows,
      "positive-payment rows",
    ],
    [
      manifest.workbookRows.length - positivePaymentRows,
      WORKBOOK_CUTOVER_BASELINE.zeroPaymentRows,
      "zero-payment rows",
    ],
    [
      housing.get("none") ?? 0,
      WORKBOOK_CUTOVER_BASELINE.housingNoneRows,
      "no-housing rows",
    ],
    [
      housing.get("double") ?? 0,
      WORKBOOK_CUTOVER_BASELINE.housingDoubleRows,
      "double-housing rows",
    ],
    [
      housing.get("double_ac") ?? 0,
      WORKBOOK_CUTOVER_BASELINE.housingDoubleAcRows,
      "double-AC rows",
    ],
    [
      housing.get("individual") ?? 0,
      WORKBOOK_CUTOVER_BASELINE.housingIndividualRows,
      "individual-housing rows",
    ],
    [
      housing.get("individual_ac") ?? 0,
      WORKBOOK_CUTOVER_BASELINE.housingIndividualAcRows,
      "individual-AC rows",
    ],
    [cafeteriaRows, WORKBOOK_CUTOVER_BASELINE.cafeteriaRows, "cafeteria rows"],
    [insuranceRows, WORKBOOK_CUTOVER_BASELINE.insuranceRows, "insurance rows"],
    [cautionRows, WORKBOOK_CUTOVER_BASELINE.cautionRows, "caution rows"],
    [
      explicitPercentageRows,
      WORKBOOK_CUTOVER_BASELINE.explicitPercentageScholarshipRows,
      "explicit percentage scholarship rows",
    ],
  ];
  for (const [actual, expected, label] of controls) {
    if (actual !== expected) {
      issue(
        ctx,
        ["controls"],
        `Workbook ${label} control is ${actual}; expected ${expected}`,
      );
    }
  }
}

function validateProductionStudents(
  manifest: z.infer<typeof WorkbookCutoverManifestSchema._def.schema>,
  ctx: z.RefinementCtx,
): void {
  const sourceKeys = new Set<string>();
  const studentIds = new Set<string>();
  const studentNos = new Set<string>();
  const loginEmails = new Set<string>();
  let activeStudents = 0;
  let pendingPaymentStudents = 0;
  let archivedStudents = 0;
  for (const [index, decision] of manifest.productionStudents.entries()) {
    const expectedKey = workbookCutoverProductionStudentKey(decision.studentId);
    if (decision.sourceKey !== expectedKey) {
      issue(
        ctx,
        ["productionStudents", index, "sourceKey"],
        `Production Student source key must be ${expectedKey}`,
      );
    }
    for (const [set, value, label] of [
      [sourceKeys, decision.sourceKey, "source key"],
      [studentIds, decision.studentId, "Student ID"],
      [studentNos, decision.studentNo, "student number"],
    ] as const) {
      if (set.has(value)) {
        issue(
          ctx,
          ["productionStudents", index],
          `Production ${label} ${value} appears more than once`,
        );
      }
      set.add(value);
    }
    if (decision.loginEmail) {
      if (loginEmails.has(decision.loginEmail)) {
        issue(
          ctx,
          ["productionStudents", index, "loginEmail"],
          `Production login email ${decision.loginEmail} appears more than once`,
        );
      }
      loginEmails.add(decision.loginEmail);
    }
    if (
      decision.academicFingerprintSha256 !==
      workbookCutoverAcademicFingerprintDigest(decision.academicFingerprint)
    ) {
      issue(
        ctx,
        ["productionStudents", index, "academicFingerprintSha256"],
        "Academic fingerprint SHA must be derived from transcript, enrollment, grade, credit, and GPA controls",
      );
    }
    if (decision.recordStatus === "active") activeStudents += 1;
    if (decision.recordStatus === "pending_payment") {
      pendingPaymentStudents += 1;
    }
    if (decision.recordStatus === "archived") archivedStudents += 1;
  }
  if (
    manifest.productionStudents.length !== manifest.controls.productionStudents
  ) {
    issue(
      ctx,
      ["controls", "productionStudents"],
      `Manifest has ${manifest.productionStudents.length} production Students, not declared ${manifest.controls.productionStudents}`,
    );
  }
  for (const [actual, expected, label] of [
    [
      activeStudents,
      manifest.controls.productionActiveStudents,
      "productionActiveStudents",
    ],
    [
      pendingPaymentStudents,
      manifest.controls.productionPendingPaymentStudents,
      "productionPendingPaymentStudents",
    ],
    [
      archivedStudents,
      manifest.controls.productionArchivedStudents,
      "productionArchivedStudents",
    ],
  ] as const) {
    if (actual !== expected) {
      issue(
        ctx,
        ["controls", label],
        `Manifest ${label} is ${actual}, not declared ${expected}`,
      );
    }
  }
}

function validateApplicants(
  manifest: z.infer<typeof WorkbookCutoverManifestSchema._def.schema>,
  ctx: z.RefinementCtx,
): void {
  const sourceKeys = new Set<string>();
  const ids = new Set<string>();
  if (manifest.applicants.length !== manifest.controls.currentApplicants) {
    issue(
      ctx,
      ["controls", "currentApplicants"],
      `Manifest has ${manifest.applicants.length} Applicants, not declared ${manifest.controls.currentApplicants}`,
    );
  }
  for (const [index, applicant] of manifest.applicants.entries()) {
    const expectedKey = workbookCutoverApplicantKey(applicant.applicantId);
    if (applicant.sourceKey !== expectedKey) {
      issue(
        ctx,
        ["applicants", index, "sourceKey"],
        `Applicant source key must be ${expectedKey}`,
      );
    }
    if (sourceKeys.has(applicant.sourceKey) || ids.has(applicant.applicantId)) {
      issue(
        ctx,
        ["applicants", index],
        `Applicant ${applicant.applicantId} appears more than once`,
      );
    }
    sourceKeys.add(applicant.sourceKey);
    ids.add(applicant.applicantId);
  }
}

function validateCrossSourceBijection(
  manifest: z.infer<typeof WorkbookCutoverManifestSchema._def.schema>,
  ctx: z.RefinementCtx,
): void {
  const workbookByKey = new Map(
    manifest.workbookRows.map((row) => [row.sourceKey, row]),
  );
  const productionById = new Map(
    manifest.productionStudents.map((decision) => [
      decision.studentId,
      decision,
    ]),
  );
  const claimedStudentIds = new Set<string>();
  const claimedStudentNos = new Set<string>();
  const claimedLoginEmails = new Set<string>();
  for (const [index, row] of manifest.workbookRows.entries()) {
    const identity = row.identity;
    if (identity.decision === "link_existing") {
      if (claimedStudentIds.has(identity.studentId)) {
        issue(
          ctx,
          ["workbookRows", index, "identity", "studentId"],
          `Student ${identity.studentId} is claimed by more than one workbook row`,
        );
      }
      claimedStudentIds.add(identity.studentId);
      if (claimedStudentNos.has(identity.studentNo)) {
        issue(
          ctx,
          ["workbookRows", index, "identity", "studentNo"],
          `Student number ${identity.studentNo} is claimed by more than one workbook row`,
        );
      }
      claimedStudentNos.add(identity.studentNo);
      if (identity.loginEmail) claimedLoginEmails.add(identity.loginEmail);
      const production = productionById.get(identity.studentId);
      if (
        !production ||
        production.decision !== "link_workbook" ||
        production.workbookRowKey !== row.sourceKey ||
        production.personId !== identity.personId ||
        production.studentNo !== identity.studentNo ||
        production.recordStatus !== identity.recordStatus ||
        production.personStatus !== identity.personStatus ||
        canonicalWorkbookCutoverJson(
          [...production.roles].sort(compareText),
        ) !==
          canonicalWorkbookCutoverJson([...identity.roles].sort(compareText)) ||
        production.academicFingerprintSha256 !==
          identity.academicFingerprintSha256 ||
        canonicalWorkbookCutoverJson(production.academicFingerprint) !==
          canonicalWorkbookCutoverJson(identity.academicFingerprint)
      ) {
        issue(
          ctx,
          ["workbookRows", index, "identity"],
          "A link_existing decision must have one reciprocal link_workbook production decision with identical official identity and academic fingerprint",
        );
      }
    } else if (identity.decision === "create_new") {
      if (
        identity.plannedStudentNo &&
        claimedStudentNos.has(identity.plannedStudentNo)
      ) {
        issue(
          ctx,
          ["workbookRows", index, "identity", "plannedStudentNo"],
          `Planned student number ${identity.plannedStudentNo} is already claimed`,
        );
      }
      if (identity.plannedStudentNo) {
        claimedStudentNos.add(identity.plannedStudentNo);
      }
      if (
        identity.plannedLoginEmail &&
        claimedLoginEmails.has(identity.plannedLoginEmail)
      ) {
        issue(
          ctx,
          ["workbookRows", index, "identity", "plannedLoginEmail"],
          `Planned login ${identity.plannedLoginEmail} is already claimed`,
        );
      }
      if (identity.plannedLoginEmail) {
        claimedLoginEmails.add(identity.plannedLoginEmail);
      }
    } else if (identity.decision === "reviewed_duplicate") {
      const canonical = workbookByKey.get(identity.canonicalWorkbookRowKey);
      if (
        identity.canonicalWorkbookRowKey === row.sourceKey ||
        !canonical ||
        (canonical.identity.decision !== "link_existing" &&
          canonical.identity.decision !== "create_new")
      ) {
        issue(
          ctx,
          ["workbookRows", index, "identity", "canonicalWorkbookRowKey"],
          "A reviewed duplicate must point to a distinct included canonical workbook row",
        );
      }
    } else if (
      identity.holdCode === "ambiguous" &&
      identity.candidateStudentNos.length < 2
    ) {
      issue(
        ctx,
        ["workbookRows", index, "identity", "candidateStudentNos"],
        "An ambiguous hold requires at least two candidate student numbers",
      );
    }
  }
  for (const [index, production] of manifest.productionStudents.entries()) {
    if (production.decision !== "link_workbook") continue;
    const row = workbookByKey.get(production.workbookRowKey);
    if (
      !row ||
      row.identity.decision !== "link_existing" ||
      row.identity.studentId !== production.studentId
    ) {
      issue(
        ctx,
        ["productionStudents", index, "workbookRowKey"],
        "A link_workbook decision must have one reciprocal link_existing workbook decision",
      );
    }
  }
}

function validateDispositionControls(
  manifest: z.infer<typeof WorkbookCutoverManifestSchema._def.schema>,
  ctx: z.RefinementCtx,
): void {
  const included = manifest.workbookRows.filter(
    (row) =>
      row.identity.decision === "link_existing" ||
      row.identity.decision === "create_new",
  );
  const excluded = manifest.workbookRows.filter(
    (row) => row.identity.decision === "reviewed_duplicate",
  );
  const held = manifest.workbookRows.filter(
    (row) => row.identity.decision === "hold",
  );
  const derived = {
    includedWorkbookRows: included.length,
    includedBilledXof: sumXof(
      included.map((row) => row.financial.amountBilledXof),
    ),
    includedPaidXof: sumXof(included.map((row) => row.financial.amountPaidXof)),
    reviewedExclusionRows: excluded.length,
    reviewedExclusionBilledXof: sumXof(
      excluded.map((row) => row.financial.amountBilledXof),
    ),
    reviewedExclusionPaidXof: sumXof(
      excluded.map((row) => row.financial.amountPaidXof),
    ),
    heldWorkbookRows: held.length,
    heldBilledXof: sumXof(held.map((row) => row.financial.amountBilledXof)),
    heldPaidXof: sumXof(held.map((row) => row.financial.amountPaidXof)),
    linkedProductionStudents: manifest.productionStudents.filter(
      (row) => row.decision === "link_workbook",
    ).length,
    keptProductionExceptions: manifest.productionStudents.filter(
      (row) => row.decision === "keep_exception",
    ).length,
    archivedProductionStudents: manifest.productionStudents.filter(
      (row) => row.decision === "archive",
    ).length,
    heldProductionStudents: manifest.productionStudents.filter(
      (row) => row.decision === "hold",
    ).length,
    preservedApplicants: manifest.applicants.length,
  };
  for (const [key, value] of Object.entries(derived)) {
    if (
      manifest.dispositionControls[
        key as keyof typeof manifest.dispositionControls
      ] !== value
    ) {
      issue(
        ctx,
        ["dispositionControls", key],
        `Declared disposition control ${key} does not equal derived value ${value}`,
      );
    }
  }
  if (
    derived.includedWorkbookRows +
      derived.reviewedExclusionRows +
      derived.heldWorkbookRows !==
      WORKBOOK_CUTOVER_BASELINE.workbookRows ||
    derived.includedBilledXof +
      derived.reviewedExclusionBilledXof +
      derived.heldBilledXof !==
      WORKBOOK_CUTOVER_BASELINE.billedXof ||
    derived.includedPaidXof +
      derived.reviewedExclusionPaidXof +
      derived.heldPaidXof !==
      WORKBOOK_CUTOVER_BASELINE.paidXof
  ) {
    issue(
      ctx,
      ["dispositionControls"],
      "Included, reviewed-exclusion, and held workbook controls must conserve all source rows and XOF",
    );
  }
}
