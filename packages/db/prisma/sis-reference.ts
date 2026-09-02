import { Prisma, type PrismaClient } from "@prisma/client";
import {
  INITIAL_BILLING_ADJUSTMENT_DEFINITIONS,
  INITIAL_BILLING_CATALOG_ACADEMIC_YEAR,
  INITIAL_BILLING_SERVICE_OPTIONS,
} from "@mydaust/shared";

/**
 * SIS reference data: grading scales, catalogue years, degree-audit requirement
 * buckets, course requirement mapping, management-reporting categories and the
 * institution fee schedule.
 *
 * This is *official* configuration, not demo data, so both the dev seed and the
 * production bootstrap load it — without it the grading, degree-audit and fee
 * screens are empty. Idempotent reference rows may be refreshed, but an approved
 * fee schedule is financial configuration and is therefore created only when the
 * academic year has no approved revision. Deployments never overwrite it.
 */

/** Scales the institution grades on. Null points = excluded from GPA, not zero. */
const SCHEMES: {
  key: string;
  name: string;
  isDefault?: boolean;
  rows: [
    string,
    number | null,
    number | null,
    number | null,
    boolean,
    boolean,
  ][];
}[] = [
  {
    key: "letter",
    name: "Standard Letter Scale · 4.00",
    isDefault: true,
    rows: [
      ["A+", 4.0, 97, 100, true, true],
      ["A", 4.0, 93, 96, true, true],
      ["A-", 3.7, 90, 92, true, true],
      ["B+", 3.3, 87, 89, true, true],
      ["B", 3.0, 83, 86, true, true],
      ["B-", 2.7, 80, 82, true, true],
      ["C+", 2.3, 77, 79, true, true],
      ["C", 2.0, 73, 76, true, true],
      ["C-", 1.7, 70, 72, true, true],
      ["D+", 1.3, 67, 69, true, true],
      ["D", 1.0, 63, 66, true, true],
      ["D-", 0.7, 60, 62, true, true],
      ["F", 0.0, 0, 59, true, false],
      ["I", null, null, null, false, false],
      ["P", null, null, null, false, true],
    ],
  },
  {
    key: "pass",
    name: "Pass / Fail Scale",
    rows: [
      ["P", null, 60, 100, false, true],
      ["F", 0.0, 0, 59, true, false],
    ],
  },
  {
    key: "iep",
    name: "Intensive English Program Levels",
    rows: [
      ["Level 5 — Advanced", null, null, null, false, false],
      ["Level 4 — Upper Int.", null, 85, 100, false, false],
      ["Level 3 — Intermediate", null, 70, 84, false, false],
      ["Level 2 — Elementary", null, 55, 69, false, false],
      ["Level 1 — Beginner", null, 0, 54, false, false],
    ],
  },
];

/** Each approved engineering curriculum contains 300 credits: nine 30-credit
 * taught semesters plus a 30-credit internship/thesis semester. The discipline
 * split comes from the four source curriculum sheets. */
const REQUIREMENTS_BY_DISCIPLINE: Record<
  "computer" | "electrical" | "mechanical" | "chemical",
  [string, number][]
> = {
  computer: [
    ["Core Engineering", 102],
    ["Computer Science", 132],
    ["Mathematics", 36],
    ["Sciences", 18],
    ["Humanities & English", 12],
  ],
  electrical: [
    ["Core Engineering", 90],
    ["Electrical Engineering", 132],
    ["Computer Science", 12],
    ["Mathematics", 36],
    ["Sciences", 18],
    ["Humanities & English", 12],
  ],
  mechanical: [
    ["Core Engineering", 90],
    ["Mechanical Engineering", 120],
    ["Electrical Engineering", 12],
    ["Computer Science", 12],
    ["Mathematics", 36],
    ["Sciences", 18],
    ["Humanities & English", 12],
  ],
  chemical: [
    ["Core Engineering", 90],
    ["Chemical Engineering", 102],
    ["Chemistry", 36],
    ["Computer Science", 12],
    ["Mathematics", 36],
    ["Sciences", 12],
    ["Humanities & English", 12],
  ],
};

function requirementsForProgram(program: { code: string; name: string }) {
  const identity = `${program.code} ${program.name}`.toLowerCase();
  if (
    identity.includes("chemical") ||
    /\b(?:bschem|bsche|che)\b/.test(identity)
  )
    return REQUIREMENTS_BY_DISCIPLINE.chemical;
  if (identity.includes("mechanical") || /\b(?:bsme|me)\b/.test(identity))
    return REQUIREMENTS_BY_DISCIPLINE.mechanical;
  if (identity.includes("electrical") || /\b(?:bsee|ee)\b/.test(identity))
    return REQUIREMENTS_BY_DISCIPLINE.electrical;
  if (identity.includes("computer") || /\b(?:bsce|bscs|cs)\b/.test(identity))
    return REQUIREMENTS_BY_DISCIPLINE.computer;
  return null;
}

function defaultProgressionLevels(requiredCredits: number) {
  return Array.from(
    { length: Math.max(1, Math.ceil(requiredCredits / 30)) },
    (_, index) => ({
      code: `S${index + 1}`,
      name: `Semester ${index + 1}`,
      creditCeiling: (index + 1) * 30,
    }),
  );
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** A course's requirement area follows the institution's code prefixes; the
 *  owning department does not imply it (one department teaches several areas). */
const CATEGORY_BY_PREFIX: [RegExp, string][] = [
  [/^(?:CSC|CS)\b/i, "Computer Science"],
  [/^(?:MTH|MATH)\b/i, "Mathematics"],
  [/^(?:PHY|PHYS|CHM|CHEM|BIO)\b/i, "Sciences"],
  [/^(?:HUM|HSS|ENG)\b/i, "Humanities & English"],
  [/^EE\b/i, "Electrical Engineering"],
  [/^ME\b/i, "Mechanical Engineering"],
  [/^CHE\b/i, "Chemical Engineering"],
  [/^(?:ENGR|CE|MEC|EEE)\b/i, "Core Engineering"],
  [/^GEN\b/i, "Free Electives"],
];

/** The official DAUST payment plan: 4,285,000 full / 2,975,000 tuition-only a year. */
const FEE_PLAN: [string, string, number, string][] = [
  ["Fall", "Inscription", 1, "2026-09-05"],
  ["Fall", "2nd installment", 2, "2026-11-05"],
  ["Spring", "3rd installment", 3, "2027-01-05"],
  ["Spring", "4th installment", 4, "2027-03-05"],
];

/** Stable Budgeting & Cashflow categories. These labels mirror the approved
 * standalone reference; the prototype's example monetary values are not data. */
const MANAGEMENT_CATEGORIES: [string, string, "expense" | "income", number][] =
  [
    ["taxes", "Taxes", "expense", 0],
    ["debts", "Debts", "expense", 1],
    ["rent", "Rent", "expense", 2],
    ["permanent_staff_salaries", "Permanent Staff Salaries", "expense", 3],
    ["cafeteria_restaurant", "Cafeteria & Restaurant", "expense", 4],
    ["capital_other_expenses", "Capital & Other Expenses", "expense", 5],
    [
      "contract_vacataire_salaries",
      "Contract (Vacataire) Salaries",
      "expense",
      6,
    ],
    ["service_providers", "Service Providers", "expense", 7],
    ["utilities", "Utilities", "expense", 8],
    ["facilities_it_maintenance", "Facilities, IT & Maintenance", "expense", 9],
    ["departments_events", "Departments & Events", "expense", 10],
    ["insurance", "Insurance", "expense", 11],
    ["travel_transportation", "Travel & Transportation", "expense", 12],
    ["bursar", "Tuition, dining & housing (Bursar)", "income", 0],
    ["research_grants", "Research Grants", "income", 1],
    ["service_contracts", "Service Contracts", "income", 2],
    ["donations_sponsorships", "Donations & Sponsorships", "income", 3],
    ["scholarships", "Scholarships", "income", 4],
    ["others", "Others", "income", 5],
  ];

export async function seedSisReference(
  prisma: PrismaClient,
  opts: {
    activeYear?: string;
    years?: [string, "archived" | "active" | "draft"][];
  } = {},
) {
  const activeLabel = opts.activeYear ?? "2026–2027";
  const years =
    opts.years ??
    ([
      ["2023–2024", "archived"],
      ["2024–2025", "archived"],
      ["2025–2026", "archived"],
      [activeLabel, "active"],
      ["2027–2028", "draft"],
    ] as [string, "archived" | "active" | "draft"][]);

  for (const s of SCHEMES) {
    const scheme = await prisma.gradingScheme.upsert({
      where: { key: s.key },
      update: { name: s.name, isDefault: s.isDefault ?? false },
      create: { key: s.key, name: s.name, isDefault: s.isDefault ?? false },
    });
    await prisma.gradeScaleRow.deleteMany({ where: { schemeId: scheme.id } });
    await prisma.gradeScaleRow.createMany({
      data: s.rows.map(
        (
          [
            grade,
            points,
            minScore,
            maxScore,
            countsTowardGpa,
            countsTowardCredits,
          ],
          i,
        ) => ({
          schemeId: scheme.id,
          grade,
          points,
          minScore,
          maxScore,
          countsTowardGpa,
          countsTowardCredits,
          position: i,
        }),
      ),
    });
  }

  for (const [label, status] of years) {
    const isWorkbookCutoverYear =
      label === INITIAL_BILLING_CATALOG_ACADEMIC_YEAR;
    await prisma.academicYear.upsert({
      where: { label },
      update: {
        status,
        ...(isWorkbookCutoverYear
          ? {
              startsOn: new Date("2026-08-25T00:00:00.000Z"),
              endsOn: new Date("2027-03-05T00:00:00.000Z"),
            }
          : {}),
      },
      create: {
        label,
        status,
        ...(isWorkbookCutoverYear
          ? {
              startsOn: new Date("2026-08-25T00:00:00.000Z"),
              endsOn: new Date("2027-03-05T00:00:00.000Z"),
            }
          : {}),
      },
    });
  }

  const workbookCutoverYear = await prisma.academicYear.findUnique({
    where: { label: INITIAL_BILLING_CATALOG_ACADEMIC_YEAR },
    select: { id: true },
  });
  if (workbookCutoverYear) {
    await prisma.term.upsert({
      where: { name: "2026–2027 annual workbook billing" },
      update: {
        startDate: new Date("2026-08-25T00:00:00.000Z"),
        endDate: new Date("2027-03-05T00:00:00.000Z"),
        addDeadline: null,
        dropDeadline: null,
        academicYearId: workbookCutoverYear.id,
        semester: "Annual",
        status: "planning",
      },
      create: {
        name: "2026–2027 annual workbook billing",
        startDate: new Date("2026-08-25T00:00:00.000Z"),
        endDate: new Date("2027-03-05T00:00:00.000Z"),
        academicYearId: workbookCutoverYear.id,
        semester: "Annual",
        status: "planning",
      },
    });

    // On an empty database the migration runs before reference AcademicYears
    // exist, so its cutover-year INSERT ... SELECT intentionally has no rows to
    // target. The deployment reference loader is therefore the second,
    // idempotent bootstrap point. Existing catalog rows are never rewritten or
    // reactivated here; subsequent changes belong to the approval workflow.
    await prisma.billingServiceOption.createMany({
      data: INITIAL_BILLING_SERVICE_OPTIONS.map((option) => ({
        ...option,
        academicYearLabel: INITIAL_BILLING_CATALOG_ACADEMIC_YEAR,
        active: true,
      })),
      skipDuplicates: true,
    });
    await prisma.billingAdjustmentDefinition.createMany({
      data: INITIAL_BILLING_ADJUSTMENT_DEFINITIONS.map((definition) => ({
        ...definition,
        academicYearLabel: INITIAL_BILLING_CATALOG_ACADEMIC_YEAR,
        active: true,
      })),
      skipDuplicates: true,
    });

    const [serviceOptionCount, adjustmentDefinitionCount] = await Promise.all([
      prisma.billingServiceOption.count({
        where: {
          academicYearLabel: INITIAL_BILLING_CATALOG_ACADEMIC_YEAR,
        },
      }),
      prisma.billingAdjustmentDefinition.count({
        where: {
          academicYearLabel: INITIAL_BILLING_CATALOG_ACADEMIC_YEAR,
        },
      }),
    ]);
    if (
      serviceOptionCount < INITIAL_BILLING_SERVICE_OPTIONS.length ||
      adjustmentDefinitionCount < INITIAL_BILLING_ADJUSTMENT_DEFINITIONS.length
    ) {
      throw new Error(
        "Billing catalog preflight failed for the workbook cutover year",
      );
    }
  }

  for (const [key, label, kind, sortOrder] of MANAGEMENT_CATEGORIES) {
    await prisma.managementCategory.upsert({
      where: { key },
      update: { label, kind, sortOrder, isActive: true },
      create: { key, label, kind, sortOrder },
    });
  }

  // Link each term to its catalogue year, derived from the term name: Fall YYYY
  // belongs to YYYY–YYYY+1, Spring YYYY to YYYY-1–YYYY.
  const yearByLabel = new Map(
    (await prisma.academicYear.findMany()).map((y) => [y.label, y.id]),
  );
  for (const term of await prisma.term.findMany()) {
    const m = /^(Fall|Spring|Summer)\s+(\d{4})$/.exec(term.name);
    if (!m) continue;
    const semester = m[1]!;
    const year = Number(m[2]);
    const start = semester === "Fall" ? year : year - 1;
    await prisma.term.update({
      where: { id: term.id },
      data: {
        semester,
        academicYearId: yearByLabel.get(`${start}–${start + 1}`) ?? null,
      },
    });
  }

  for (const program of await prisma.program.findMany()) {
    const requirements = requirementsForProgram(program);
    if (!requirements) continue;
    await prisma.programRequirement.deleteMany({
      where: {
        programId: program.id,
        catalogYear: activeLabel,
        category: { notIn: requirements.map(([category]) => category) },
      },
    });
    for (const [i, [category, requiredCredits]] of requirements.entries()) {
      await prisma.programRequirement.upsert({
        where: {
          programId_catalogYear_category: {
            programId: program.id,
            catalogYear: activeLabel,
            category,
          },
        },
        update: { requiredCredits, position: i },
        create: {
          programId: program.id,
          catalogYear: activeLabel,
          category,
          requiredCredits,
          position: i,
        },
      });
    }
  }

  // The migration can run before the production reference loader has created
  // programme requirements. Fill only that empty bootstrap snapshot; once a
  // catalog contains programmes, it belongs to the director approval workflow
  // and this idempotent loader must never rewrite it.
  const activeYear = await prisma.academicYear.findUnique({
    where: { label: activeLabel },
  });
  if (activeYear) {
    const configuredPrograms = await prisma.program.findMany({
      orderBy: { code: "asc" },
      include: {
        requirements: {
          where: { catalogYear: activeLabel },
          orderBy: [{ position: "asc" }, { category: "asc" }],
        },
      },
    });
    const programConfigurations = configuredPrograms.map((program) => ({
      programId: program.id,
      programCode: program.code,
      programName: program.name,
      progressionMode: "default",
      customLevels: [],
      requirements: program.requirements.map((requirement) => ({
        category: requirement.category,
        requiredCredits: requirement.requiredCredits,
      })),
    }));
    const largestTotal = Math.max(
      30,
      ...programConfigurations.map((program) =>
        program.requirements.reduce(
          (total, requirement) => total + requirement.requiredCredits,
          0,
        ),
      ),
    );
    const defaultLevels = defaultProgressionLevels(largestTotal);
    const approvedCatalog = await prisma.academicCatalogRevision.findFirst({
      where: { academicYearId: activeYear.id, status: "approved" },
      orderBy: { revision: "desc" },
    });
    if (!approvedCatalog) {
      const latest = await prisma.academicCatalogRevision.findFirst({
        where: { academicYearId: activeYear.id },
        orderBy: { revision: "desc" },
        select: { revision: true },
      });
      await prisma.academicCatalogRevision.create({
        data: {
          academicYearId: activeYear.id,
          revision: (latest?.revision ?? 0) + 1,
          status: "approved",
          yearLabel: activeYear.label,
          startsOn: activeYear.startsOn,
          endsOn: activeYear.endsOn,
          defaultLevels: asJson(defaultLevels),
          programConfigurations: asJson(programConfigurations),
          reason: "Bootstrap fallback — replace through Director approval",
          approvedAt: new Date(),
        },
      });
    } else if (
      Array.isArray(approvedCatalog.programConfigurations) &&
      approvedCatalog.programConfigurations.length === 0
    ) {
      await prisma.academicCatalogRevision.update({
        where: { id: approvedCatalog.id },
        data: {
          defaultLevels: asJson(defaultLevels),
          programConfigurations: asJson(programConfigurations),
        },
      });
    }
  }

  // Deployment preflight: every latest approved catalog must expose the full
  // 300-credit requirement for every recognized engineering programme. A
  // mismatch is safer to fail than to publish another incorrect denominator.
  const programmes = new Map(
    (await prisma.program.findMany()).map((program) => [program.id, program]),
  );
  const approvedRevisions = await prisma.academicCatalogRevision.findMany({
    where: { status: "approved" },
    orderBy: [{ academicYearId: "asc" }, { revision: "desc" }],
  });
  const checkedYears = new Set<string>();
  for (const revision of approvedRevisions) {
    if (checkedYears.has(revision.academicYearId)) continue;
    checkedYears.add(revision.academicYearId);
    const configurations = Array.isArray(revision.programConfigurations)
      ? revision.programConfigurations
      : [];
    for (const raw of configurations) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const configuration = raw as {
        programId?: unknown;
        requirements?: unknown;
      };
      if (typeof configuration.programId !== "string") continue;
      const programme = programmes.get(configuration.programId);
      if (!programme || !requirementsForProgram(programme)) continue;
      const total = Array.isArray(configuration.requirements)
        ? configuration.requirements.reduce((sum, requirement) => {
            if (!requirement || typeof requirement !== "object") return sum;
            const credits = (requirement as { requiredCredits?: unknown })
              .requiredCredits;
            return sum + (typeof credits === "number" ? credits : 0);
          }, 0)
        : 0;
      if (total !== 300) {
        throw new Error(
          `Academic catalog preflight failed: ${programme.code} totals ${total} credits in ${revision.yearLabel}; expected 300`,
        );
      }
    }
  }

  for (const course of await prisma.course.findMany()) {
    const hit = CATEGORY_BY_PREFIX.find(([re]) => re.test(course.code));
    if (!hit) continue;
    await prisma.course.update({
      where: { id: course.id },
      data: { requirementCategory: hit[1] },
    });
  }

  const approvedSchedule = await prisma.feeSchedule.findFirst({
    where: { academicYearLabel: activeLabel, status: "approved" },
    orderBy: { revision: "desc" },
  });
  if (!approvedSchedule) {
    await prisma.feeSchedule.create({
      data: {
        academicYearLabel: activeLabel,
        revision: 1,
        status: "approved",
        reason: "Bootstrap fallback — replace through Director approval",
        approvedAt: new Date(),
        components: {
          create: [
            {
              key: "tuition",
              label: "Tuition",
              description: "Annual tuition",
              costCenterCode: "9100",
              annualAmountXof: 2_975_000,
              defaultSelected: true,
              sortOrder: 0,
            },
            {
              key: "housing",
              label: "Housing",
              description: "Annual student housing",
              costCenterCode: "3700",
              annualAmountXof: 680_000,
              defaultSelected: true,
              sortOrder: 1,
            },
            {
              key: "cafeteria",
              label: "Cafeteria",
              description: "Annual cafeteria plan",
              costCenterCode: "3600",
              annualAmountXof: 630_000,
              defaultSelected: true,
              sortOrder: 2,
            },
          ],
        },
        rows: {
          create: FEE_PLAN.map(([semester, label, sequence, dueOn]) => ({
            academicYearLabel: activeLabel,
            semester,
            label,
            sequence,
            dueOn: new Date(dueOn),
            amountFullXof: 1_071_250,
            amountTuitionXof: 743_750,
            amountHousingXof: 170_000,
            amountCafeteriaXof: 157_500,
          })),
        },
      },
    });
  }

  console.log(
    "SIS reference: grading schemes, catalogue years, requirements, fee plan.",
  );
}
