import type { PrismaClient } from "@prisma/client";

/**
 * SIS reference data: grading scales, catalogue years, degree-audit requirement
 * buckets, course requirement mapping and the institution fee schedule.
 *
 * This is *official* configuration, not demo data, so both the dev seed and the
 * production bootstrap load it — without it the grading, degree-audit and fee
 * screens are empty. Idempotent: keyed on natural unique columns so re-running
 * updates rather than duplicates.
 */

/** Scales the institution grades on. Null points = excluded from GPA, not zero. */
const SCHEMES: {
  key: string;
  name: string;
  isDefault?: boolean;
  rows: [string, number | null, number | null, number | null][];
}[] = [
  {
    key: "letter",
    name: "Standard Letter Scale · 4.00",
    isDefault: true,
    rows: [
      ["A", 4.0, 93, 100], ["A-", 3.7, 90, 92], ["B+", 3.3, 87, 89],
      ["B", 3.0, 83, 86], ["B-", 2.7, 80, 82], ["C+", 2.3, 77, 79],
      ["C", 2.0, 73, 76], ["D", 1.0, 60, 69], ["F", 0.0, 0, 59],
    ],
  },
  {
    key: "pass",
    name: "Pass / Fail Scale",
    rows: [["P — Pass", null, 60, 100], ["F — Fail", 0.0, 0, 59]],
  },
  {
    key: "iep",
    name: "Intensive English Program Levels",
    rows: [
      ["Level 5 — Advanced", null, null, null],
      ["Level 4 — Upper Int.", null, 85, 100],
      ["Level 3 — Intermediate", null, 70, 84],
      ["Level 2 — Elementary", null, 55, 69],
      ["Level 1 — Beginner", null, 0, 54],
    ],
  },
];

/** Per-category credits sum to the 132-credit degree, so completion can be
 *  derived from category fulfilment rather than tracked separately. */
const REQUIREMENTS: [string, number][] = [
  ["Core Engineering", 40], ["Computer Science", 36], ["Mathematics", 20],
  ["Sciences", 16], ["Humanities & English", 12], ["Free Electives", 8],
];

/** A course's requirement area follows the institution's code prefixes; the
 *  owning department does not imply it (one department teaches several areas). */
const CATEGORY_BY_PREFIX: [RegExp, string][] = [
  [/^CSC/, "Computer Science"],
  [/^MTH/, "Mathematics"],
  [/^PHY|^CHM|^BIO/, "Sciences"],
  [/^HUM|^ENG/, "Humanities & English"],
  [/^CE|^MEC|^EEE/, "Core Engineering"],
  [/^GEN/, "Free Electives"],
];

/** The official DAUST payment plan: 4,285,000 full / 2,975,000 tuition-only a year. */
const FEE_PLAN: [string, string, number, string][] = [
  ["Fall", "Inscription", 1, "2026-08-25"],
  ["Fall", "2nd installment", 2, "2026-11-05"],
  ["Spring", "3rd installment", 3, "2027-01-05"],
  ["Spring", "4th installment", 4, "2027-03-05"],
];

export async function seedSisReference(
  prisma: PrismaClient,
  opts: { activeYear?: string; years?: [string, "archived" | "active" | "draft"][] } = {},
) {
  const activeLabel = opts.activeYear ?? "2026–2027";
  const years =
    opts.years ??
    ([
      ["2023–2024", "archived"], ["2024–2025", "archived"], ["2025–2026", "archived"],
      [activeLabel, "active"], ["2027–2028", "draft"],
    ] as [string, "archived" | "active" | "draft"][]);

  for (const s of SCHEMES) {
    const scheme = await prisma.gradingScheme.upsert({
      where: { key: s.key },
      update: { name: s.name, isDefault: s.isDefault ?? false },
      create: { key: s.key, name: s.name, isDefault: s.isDefault ?? false },
    });
    await prisma.gradeScaleRow.deleteMany({ where: { schemeId: scheme.id } });
    await prisma.gradeScaleRow.createMany({
      data: s.rows.map(([grade, points, minScore, maxScore], i) => ({
        schemeId: scheme.id, grade, points, minScore, maxScore, position: i,
      })),
    });
  }

  for (const [label, status] of years) {
    await prisma.academicYear.upsert({
      where: { label },
      update: { status },
      create: { label, status },
    });
  }

  // Link each term to its catalogue year, derived from the term name: Fall YYYY
  // belongs to YYYY–YYYY+1, Spring YYYY to YYYY-1–YYYY.
  const yearByLabel = new Map((await prisma.academicYear.findMany()).map((y) => [y.label, y.id]));
  for (const term of await prisma.term.findMany()) {
    const m = /^(Fall|Spring|Summer)\s+(\d{4})$/.exec(term.name);
    if (!m) continue;
    const semester = m[1]!;
    const year = Number(m[2]);
    const start = semester === "Fall" ? year : year - 1;
    await prisma.term.update({
      where: { id: term.id },
      data: { semester, academicYearId: yearByLabel.get(`${start}–${start + 1}`) ?? null },
    });
  }

  for (const program of await prisma.program.findMany()) {
    for (const [i, [category, requiredCredits]] of REQUIREMENTS.entries()) {
      await prisma.programRequirement.upsert({
        where: {
          programId_catalogYear_category: { programId: program.id, catalogYear: activeLabel, category },
        },
        update: { requiredCredits, position: i },
        create: { programId: program.id, catalogYear: activeLabel, category, requiredCredits, position: i },
      });
    }
  }

  for (const course of await prisma.course.findMany()) {
    const hit = CATEGORY_BY_PREFIX.find(([re]) => re.test(course.code));
    if (!hit) continue;
    await prisma.course.update({ where: { id: course.id }, data: { requirementCategory: hit[1] } });
  }

  for (const [semester, label, sequence, dueOn] of FEE_PLAN) {
    await prisma.feePlanInstallment.upsert({
      where: { academicYearLabel_sequence: { academicYearLabel: activeLabel, sequence } },
      update: { semester, label, dueOn: new Date(dueOn), amountFullXof: 1_071_250, amountTuitionXof: 743_750 },
      create: {
        academicYearLabel: activeLabel, semester, label, sequence,
        dueOn: new Date(dueOn), amountFullXof: 1_071_250, amountTuitionXof: 743_750,
      },
    });
  }

  console.log("SIS reference: grading schemes, catalogue years, requirements, fee plan.");
}
