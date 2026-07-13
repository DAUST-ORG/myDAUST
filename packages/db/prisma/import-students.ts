import { readFileSync } from "node:fs";
import { COST_CENTER_TUITION, splitEvenXof } from "@mydaust/shared";
import { PrismaClient } from "@prisma/client";

// One-off import of the real active-student roster into a bootstrapped prod DB.
// Run AFTER bootstrap-prod.ts (needs the Fall 2026 term). Idempotent: safe to re-run.
//
//   STUDENTS_CSV="/abs/path/Active Students.csv" pnpm --filter @mydaust/db import:students          # dry run
//   STUDENTS_CSV="..." CONFIRM=1 pnpm --filter @mydaust/db import:students                          # writes
//
// The CSV stays OUT of git (student PII). Each student gets one tuition-only invoice
// (2,975,000 XOF) on cost center 9100, split into the official 4 installments.

const prisma = new PrismaClient();

const TUITION_PER_YEAR = 2_975_000;
const TERM_NAME = "Fall 2026";
// Official DAUST payment sheet (tuition-only): 4 x 743,750 XOF, fixed dates for everyone.
const INSTALLMENT_DUE = ["2026-08-05", "2026-11-05", "2027-01-05", "2027-03-05"] as const;

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
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
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); field = ""; row = []; }
    else field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }

  const header = rows.shift();
  if (!header) return [];
  return rows
    .filter((r) => r.some((cell) => cell.trim() !== ""))
    .map((r) => Object.fromEntries(header.map((h, idx) => [h.trim(), (r[idx] ?? "").trim()])));
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

  const term = await prisma.term.findUnique({ where: { name: TERM_NAME } });
  if (!term) throw new Error(`Term "${TERM_NAME}" not found. Run bootstrap:prod first.`);

  const installmentAmounts = splitEvenXof(TUITION_PER_YEAR, INSTALLMENT_DUE.length);

  let created = 0;
  let updated = 0;
  const skipped: string[] = [];
  const seenEmails = new Set<string>();

  for (const r of rows) {
    const studentNo = r["ID Number"]?.trim();
    if (!studentNo) { skipped.push("(blank ID)"); continue; }

    const dob = parseDmy(r["Date of Birth"] ?? "");
    if (!dob) { skipped.push(`${studentNo} (bad DOB "${r["Date of Birth"]}")`); continue; }

    const { firstName, lastName } = splitName(r["Student Name"] ?? "");
    let email = (r["Email"] || "").trim().toLowerCase();
    if (!email || seenEmails.has(email)) email = synthEmail(studentNo);
    seenEmails.add(email);

    const dueDates = INSTALLMENT_DUE.map((d) => new Date(`${d}T00:00:00Z`));

    if (!commit) {
      const existing = await prisma.student.findUnique({ where: { studentNo } });
      if (existing) updated++; else created++;
      continue;
    }

    const person = await prisma.person.upsert({
      where: { email },
      update: { firstName, lastName },
      create: { email, firstName, lastName, kind: "student", roles: ["student"] },
    });
    const student = await prisma.student.upsert({
      where: { studentNo },
      update: { dateOfBirth: dob },
      create: { personId: person.id, studentNo, dateOfBirth: dob },
    });

    const existingInvoice = await prisma.invoice.findFirst({
      where: { studentId: student.id, termId: term.id },
    });
    if (existingInvoice) { updated++; continue; }

    await prisma.invoice.create({
      data: {
        studentId: student.id,
        termId: term.id,
        totalAmount: TUITION_PER_YEAR,
        costCenterCode: COST_CENTER_TUITION,
        plan: {
          create: {
            installments: {
              create: installmentAmounts.map((amountDue, idx) => ({
                sequence: idx + 1,
                dueDate: dueDates[idx],
                amountDue,
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
