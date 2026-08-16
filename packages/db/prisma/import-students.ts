import { readFileSync } from "node:fs";
import { COST_CENTER_TUITION, normalizeStudentNumber } from "@mydaust/shared";
import { PrismaClient } from "@prisma/client";

// One-off import of the real active-student roster into a bootstrapped prod DB.
// Run AFTER bootstrap-prod.ts (needs the Fall 2026 term). Idempotent: safe to re-run.
//
//   STUDENTS_CSV="/abs/path/Active Students.csv" pnpm --filter @mydaust/db import:students          # dry run
//   STUDENTS_CSV="..." CONFIRM=1 pnpm --filter @mydaust/db import:students                          # writes
//
// The CSV stays OUT of git (student PII). Each student gets the active,
// administrator-approved tuition + housing + cafeteria package.

const prisma = new PrismaClient();

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** RFC 4180 parser: handles quoted fields with embedded commas, newlines and "" escapes. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const header = rows.shift();
  if (!header) return [];
  return rows
    .filter((r) => r.some((cell) => cell.trim() !== ""))
    .map((r) =>
      Object.fromEntries(
        header.map((h, idx) => [h.trim(), (r[idx] ?? "").trim()]),
      ),
    );
}

/** "12-Aug-2001" -> UTC midnight Date (date-only). Returns null on any parse failure. */
function parseDmy(value: string): Date | null {
  const m = value.trim().match(/^(\d{1,2})-([A-Za-z]{3,})-(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
  const year = Number(m[3]);
  if (mon === undefined || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, mon, day));
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.replace(/\s+/g, " ").trim().split(" ");
  const firstName = parts.shift() ?? "";
  return { firstName, lastName: parts.join(" ") || firstName };
}

function synthEmail(studentNo: string): string {
  return `${studentNo.toLowerCase()}@students.daust.edu`;
}

async function main() {
  const csvPath = process.env.STUDENTS_CSV;
  if (!csvPath) throw new Error("Set STUDENTS_CSV to the roster CSV path.");
  const commit = process.env.CONFIRM === "1";

  const rows = parseCsv(readFileSync(csvPath, "utf8"));
  console.log(`Parsed ${rows.length} roster rows from ${csvPath}`);

  const schedule = await prisma.feeSchedule.findFirst({
    where: {
      status: "approved",
      academicYear: { status: "active" },
      approvedById: { not: null },
      approvedAt: { not: null },
    },
    orderBy: { revision: "desc" },
    include: { rows: { orderBy: { sequence: "asc" } } },
  });
  if (
    !schedule ||
    schedule.rows.length === 0 ||
    schedule.rows.some((row) => !row.dueOn)
  ) {
    throw new Error(
      "The active academic year needs a complete approved fee schedule.",
    );
  }
  const term = await prisma.term.findFirst({
    where: { academicYear: { label: schedule.academicYearLabel } },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
  });
  if (!term)
    throw new Error(`No term exists for ${schedule.academicYearLabel}.`);
  const totals = {
    tuition: schedule.rows.reduce((sum, row) => sum + row.amountTuitionXof, 0),
    housing: schedule.rows.reduce((sum, row) => sum + row.amountHousingXof, 0),
    cafeteria: schedule.rows.reduce(
      (sum, row) => sum + row.amountCafeteriaXof,
      0,
    ),
    full: schedule.rows.reduce((sum, row) => sum + row.amountFullXof, 0),
  };
  if (totals.full !== totals.tuition + totals.housing + totals.cafeteria) {
    throw new Error("Approved fee-schedule components do not reconcile.");
  }

  let created = 0;
  let updated = 0;
  const skipped: string[] = [];

  const existingYearBilling = (studentId: string) =>
    prisma.invoice.findFirst({
      where: {
        studentId,
        status: { not: "void" },
        totalAmount: { gt: 0 },
        OR: [
          { academicYearLabel: schedule.academicYearLabel },
          { term: { academicYear: { label: schedule.academicYearLabel } } },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, packageType: true, number: true },
    });
  const seenEmails = new Set<string>();

  for (const r of rows) {
    const studentNo = normalizeStudentNumber(r["ID Number"] ?? "");
    if (!studentNo) {
      skipped.push("(blank ID)");
      continue;
    }

    const dob = parseDmy(r["Date of Birth"] ?? "");
    if (!dob) {
      skipped.push(`${studentNo} (bad DOB "${r["Date of Birth"]}")`);
      continue;
    }

    const { firstName, lastName } = splitName(r["Student Name"] ?? "");
    let email = (r["Email"] || "").trim().toLowerCase();
    if (!email || seenEmails.has(email)) email = synthEmail(studentNo);
    seenEmails.add(email);

    if (!commit) {
      const existing = await prisma.student.findUnique({
        where: { studentNo },
      });
      if (!existing) {
        created++;
        continue;
      }
      const billing = await existingYearBilling(existing.id);
      if (billing && billing.packageType !== "standard_full") {
        skipped.push(
          `${studentNo} (existing ${billing.number ?? billing.id} requires the full-package conversion)`,
        );
      } else {
        updated++;
      }
      continue;
    }

    const person = await prisma.person.upsert({
      where: { email },
      update: { firstName, lastName },
      create: {
        email,
        firstName,
        lastName,
        kind: "student",
        roles: ["student"],
      },
    });
    const student = await prisma.student.upsert({
      where: { studentNo },
      update: { dateOfBirth: dob },
      create: { personId: person.id, studentNo, dateOfBirth: dob },
    });

    const existingInvoice = await existingYearBilling(student.id);
    if (existingInvoice?.packageType === "standard_full") {
      updated++;
      continue;
    }
    if (existingInvoice) {
      skipped.push(
        `${studentNo} (existing ${existingInvoice.number ?? existingInvoice.id} requires the full-package conversion)`,
      );
      continue;
    }

    await prisma.invoice.create({
      data: {
        studentId: student.id,
        termId: term.id,
        totalAmount: totals.full,
        costCenterCode: COST_CENTER_TUITION,
        description: "Annual tuition, housing and cafeteria package",
        packageType: "standard_full",
        academicYearLabel: schedule.academicYearLabel,
        feeScheduleId: schedule.id,
        feeScheduleRevision: schedule.revision,
        components: {
          create: [
            {
              kind: "tuition",
              costCenterCode: "9100",
              amountXof: totals.tuition,
            },
            {
              kind: "housing",
              costCenterCode: "3700",
              amountXof: totals.housing,
            },
            {
              kind: "cafeteria",
              costCenterCode: "3600",
              amountXof: totals.cafeteria,
            },
          ],
        },
        plan: {
          create: {
            installments: {
              create: schedule.rows.map((row) => ({
                sequence: row.sequence,
                label: row.label,
                dueDate: row.dueOn!,
                amountDue: row.amountFullXof,
              })),
            },
          },
        },
      },
    });
    created++;
  }

  console.log(
    `${commit ? "Imported" : "[dry run] would import"}: ${created} new, ${updated} existing/updated, ${skipped.length} skipped.`,
  );
  if (skipped.length) console.log("Skipped:", skipped.join(", "));
  if (!commit) console.log("Dry run only. Re-run with CONFIRM=1 to write.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
