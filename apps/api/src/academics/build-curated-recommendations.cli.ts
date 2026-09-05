import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@mydaust/db";
import { normalizeGuardianImportName } from "@mydaust/shared";
import { z } from "zod";
import {
  courseCodeForLabel,
  reviewedStudentNumberFor,
} from "./curated-recommendations.catalog.js";
import { parseRosterHtml } from "./curated-recommendations.parser.js";

/**
 * Turns the academic office's Fall 2026 roster HTML into the committed artifact
 * the API serves. Read-only against the database: it resolves names to
 * studentNo and labels to course codes, writes a JSON file, and changes nothing.
 *
 * Keying the artifact on studentNo rather than name means the name-matching
 * ambiguity is resolved once, here, under review — not on every request.
 */
const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  CURATED_ROSTER_HTML_PATH: z.string().trim().min(1),
  CURATED_ROSTER_SOURCE_URL: z.string().trim().url(),
  CURATED_ROSTER_TERM_NAME: z.string().trim().min(1).default("Fall 2026"),
  CURATED_ROSTER_OUT_PATH: z.string().trim().min(1),
});

const EVENT = "curated-recommendation-build";
const MAX_HTML_BYTES = 8 * 1024 * 1024;

async function main() {
  const env = environmentSchema.parse(process.env);

  const html = readFileSync(env.CURATED_ROSTER_HTML_PATH, "utf8");
  if (Buffer.byteLength(html) > MAX_HTML_BYTES) {
    throw new Error(
      `Roster HTML exceeds ${MAX_HTML_BYTES} bytes; refusing to parse`,
    );
  }
  const roster = parseRosterHtml(html);

  const prisma = new PrismaClient();
  try {
    const term = await prisma.term.findUnique({
      where: { name: env.CURATED_ROSTER_TERM_NAME },
      select: { id: true, name: true },
    });
    if (!term) throw new Error(`Term ${env.CURATED_ROSTER_TERM_NAME} not found`);

    const students = await prisma.student.findMany({
      where: { recordStatus: "active" },
      select: {
        studentNo: true,
        person: { select: { firstName: true, lastName: true } },
      },
    });
    const byName = new Map<string, string[]>();
    for (const student of students) {
      const key = normalizeGuardianImportName(
        `${student.person?.firstName ?? ""} ${student.person?.lastName ?? ""}`,
      );
      if (!key) continue;
      byName.set(key, [...(byName.get(key) ?? []), student.studentNo]);
    }

    const courses = await prisma.course.findMany({
      select: { code: true },
    });
    const knownCodes = new Set(courses.map((course) => course.code));

    const entries: Record<string, { level: string; courses: string[] }> = {};
    const unmatched: string[] = [];
    const ambiguous: string[] = [];
    const unknownCodes = new Set<string>();
    let slots = 0;

    for (const row of roster.rows) {
      // A reviewer's decision wins over name matching. These are the rows a
      // search could not resolve on its own - archived students, a spelling
      // variant, and one name shared by two people.
      const reviewed = reviewedStudentNumberFor(row.student);
      const candidates = reviewed
        ? [reviewed]
        : byName.get(normalizeGuardianImportName(row.student));
      if (!candidates) {
        unmatched.push(row.student);
        continue;
      }
      if (candidates.length > 1) {
        // Two active students share this name. Guessing would put one
        // student's plan in front of the other.
        ambiguous.push(row.student);
        continue;
      }
      const codes: string[] = [];
      for (const label of row.courseLabels) {
        const code = courseCodeForLabel(label);
        if (!code) continue;
        if (!knownCodes.has(code)) {
          unknownCodes.add(code);
          continue;
        }
        if (!codes.includes(code)) codes.push(code);
      }
      slots += codes.length;
      entries[candidates[0]!] = { level: row.nextLevel, courses: codes };
    }

    // Emitted as TypeScript, not JSON: tsc does not copy .json into dist/ and
    // the API runs `node dist/main`, so a JSON artifact would be absent at
    // runtime. A .ts module compiles alongside everything else.
    const banner = [
      "// GENERATED FILE - do not edit by hand.",
      "//",
      `// Source:  ${env.CURATED_ROSTER_SOURCE_URL}`,
      `// Term:    ${term.name}`,
      "// Rebuild: pnpm --filter @mydaust/api run build:curated-recommendations",
      "//",
      "// Keyed by Student.studentNo. Course values are Course.code.",
      'import type { CuratedRecommendationData } from "./curated-recommendations.js";',
      "",
      "export const CURATED_RECOMMENDATIONS: CuratedRecommendationData = ",
    ].join("\n");
    writeFileSync(
      env.CURATED_ROSTER_OUT_PATH,
      `${banner}${JSON.stringify(
        { termName: term.name, students: entries },
        null,
        2,
      )} as const;\n`,
      "utf8",
    );

    console.log(
      JSON.stringify({
        event: EVENT,
        ok: unknownCodes.size === 0 && roster.unmappedLabels.length === 0,
        mode: "read-only",
        term: term.name,
        rosterRows: roster.rows.length + roster.groupHeaderRows,
        groupHeaderRows: roster.groupHeaderRows,
        realStudents: roster.rows.length,
        matchedStudents: Object.keys(entries).length,
        recommendationSlots: slots,
        studentsWithNoCourses: Object.values(entries).filter(
          (entry) => entry.courses.length === 0,
        ).length,
        unmatchedCount: unmatched.length,
        unmatched,
        ambiguousCount: ambiguous.length,
        ambiguous,
        unmappedLabels: roster.unmappedLabels,
        unknownCourseCodes: [...unknownCodes],
        outPath: env.CURATED_ROSTER_OUT_PATH,
      }),
    );

    if (roster.unmappedLabels.length > 0 || unknownCodes.size > 0) {
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ event: EVENT, ok: false, error: message }));
  process.exitCode = 1;
});
