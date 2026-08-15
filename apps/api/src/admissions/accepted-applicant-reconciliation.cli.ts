import "dotenv/config";
import { createHash } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { PrismaClient } from "@mydaust/db";
import { z } from "zod";
import { classifyAcceptedApplicant } from "./accepted-applicant-reconciliation.js";

const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  ACCEPTED_APPLICANT_RECONCILIATION_OUTPUT: z.string().trim().min(1),
});

async function main() {
  const env = environmentSchema.parse(process.env);
  if (!isAbsolute(env.ACCEPTED_APPLICANT_RECONCILIATION_OUTPUT)) {
    throw new Error("The reconciliation output path must be absolute");
  }
  const outputPath = resolve(env.ACCEPTED_APPLICANT_RECONCILIATION_OUTPUT);
  const prisma = new PrismaClient();
  try {
    const [applicants, students] = await Promise.all([
      prisma.applicant.findMany({
        where: { stage: "accepted" },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          dateOfBirth: true,
          programCode: true,
          studentId: true,
          onboardingStatus: true,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
      prisma.student.findMany({
        select: {
          id: true,
          studentNo: true,
          recordStatus: true,
          dateOfBirth: true,
          personalEmail: true,
          person: { select: { email: true } },
          program: { select: { code: true } },
        },
        orderBy: { studentNo: "asc" },
      }),
    ]);
    const candidates = students.map((student) => ({
      studentId: student.id,
      studentNo: student.studentNo,
      recordStatus: student.recordStatus,
      personEmail: student.person.email,
      personalEmail: student.personalEmail,
      dateOfBirth: student.dateOfBirth,
      programCode: student.program?.code ?? null,
    }));
    const rows = applicants.map((applicant) =>
      classifyAcceptedApplicant({
        applicantId: applicant.id,
        name: `${applicant.firstName} ${applicant.lastName}`.trim(),
        email: applicant.email,
        dateOfBirth: applicant.dateOfBirth,
        programCode: applicant.programCode,
        linkedStudentId: applicant.studentId,
        onboardingStatus: applicant.onboardingStatus,
        candidates,
      }),
    );
    const counts = Object.fromEntries(
      [...new Set(rows.map((row) => row.disposition))]
        .sort()
        .map((disposition) => [
          disposition,
          rows.filter((row) => row.disposition === disposition).length,
        ]),
    );
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      mode: "read-only",
      acceptedApplicantCount: applicants.length,
      counts,
      rows,
      note: "No database changes were made. Review exact candidates and every blocker before using the normal acceptance workflow.",
    };
    const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(outputPath, bytes, { mode: 0o600, flag: "wx" });
    await chmod(outputPath, 0o600);
    console.log(
      JSON.stringify({
        event: "accepted-applicant-reconciliation",
        ok: true,
        mode: "read-only",
        acceptedApplicantCount: applicants.length,
        counts,
        outputPath,
        outputSha256: createHash("sha256").update(bytes).digest("hex"),
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: "accepted-applicant-reconciliation",
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
