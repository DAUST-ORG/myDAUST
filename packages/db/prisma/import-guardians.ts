import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import { type GuardianImportRow, planGuardianImport } from "@mydaust/shared";

// Imports an authoritative parent/guardian CSV without committing the PII file.
// Convert the supplied workbook to CSV first, then run:
//
//   GUARDIANS_CSV="/abs/path/All Parents.csv" IMPORT_ACTOR_EMAIL="..." \
//     pnpm --filter @mydaust/db import:guardians
//   ... CONFIRM=1 pnpm --filter @mydaust/db import:guardians
// ECS tasks may instead provide GUARDIANS_S3_BUCKET and GUARDIANS_S3_KEY.
//
// The default is a dry run. Student authorization links are only created for a
// unique, normalized exact-name match. Set ALLOW_PARTIAL=1 at confirmation time
// to import safe matches while leaving reported blockers unresolved.

const prisma = new PrismaClient();
const IMPORT_ROLES = new Set(["admin", "registrar"]);

/** RFC 4180 parser: quoted commas, newlines and doubled quotes are supported. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  const source = text.replace(/\r\n?/g, "\n");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const header = rows.shift()?.map((cell) => cell.trim());
  if (!header) return [];
  return rows
    .filter((cells) => cells.some((cell) => cell.trim()))
    .map((cells) =>
      Object.fromEntries(
        header.map((key, index) => [key, (cells[index] ?? "").trim()]),
      ),
    );
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().replace(/\s+/g, " ").split(" ");
  const firstName = parts.shift() ?? "";
  return { firstName, lastName: parts.join(" ") || firstName };
}

async function main() {
  const sourcePath = process.env.GUARDIANS_CSV;
  const sourceBucket = process.env.GUARDIANS_S3_BUCKET;
  const sourceKey = process.env.GUARDIANS_S3_KEY;
  const actorEmail = process.env.IMPORT_ACTOR_EMAIL?.trim().toLowerCase();
  const commit = process.env.CONFIRM === "1";
  const allowPartial = process.env.ALLOW_PARTIAL === "1";
  if (!sourcePath && !(sourceBucket && sourceKey)) {
    throw new Error(
      "Set GUARDIANS_CSV or both GUARDIANS_S3_BUCKET and GUARDIANS_S3_KEY.",
    );
  }
  if (!actorEmail)
    throw new Error("Set IMPORT_ACTOR_EMAIL to the registrar/admin email.");

  const source = sourcePath
    ? readFileSync(sourcePath, "utf8")
    : await new S3Client({})
        .send(new GetObjectCommand({ Bucket: sourceBucket!, Key: sourceKey! }))
        .then(async (response) => {
          if (!response.Body)
            throw new Error("Guardian import object is empty.");
          return response.Body.transformToString("utf8");
        });
  const sourceSha256 = createHash("sha256").update(source).digest("hex");
  const rawRows = parseCsv(source);
  const requiredHeaders = ["Name", "Phone", "Email", "Address", "Student"];
  const headers = new Set(Object.keys(rawRows[0] ?? {}));
  const missingHeaders = requiredHeaders.filter(
    (header) => !headers.has(header),
  );
  if (missingHeaders.length) {
    throw new Error(`Missing required columns: ${missingHeaders.join(", ")}`);
  }
  const rows: GuardianImportRow[] = rawRows.map((row, index) => ({
    rowNumber: index + 2,
    name: row.Name ?? "",
    phone: row.Phone ?? "",
    email: row.Email ?? "",
    address: row.Address ?? "",
    studentName: row.Student ?? "",
  }));

  const actor = await prisma.person.findUnique({
    where: { email: actorEmail },
    select: { id: true, roles: true },
  });
  if (!actor || !actor.roles.some((role) => IMPORT_ROLES.has(role))) {
    throw new Error(
      "Import actor must be an existing registrar or administrator.",
    );
  }

  const activeStudents = await prisma.student.findMany({
    where: { recordStatus: "active" },
    select: {
      id: true,
      studentNo: true,
      person: { select: { firstName: true, lastName: true } },
    },
    orderBy: { studentNo: "asc" },
  });
  const plan = planGuardianImport(
    rows,
    activeStudents.map((student) => ({
      id: student.id,
      studentNo: student.studentNo,
      name: `${student.person.firstName} ${student.person.lastName}`.trim(),
    })),
  );

  const existingPeople = await prisma.person.findMany({
    where: { email: { in: plan.guardians.map((guardian) => guardian.email) } },
    select: { id: true, email: true, kind: true },
  });
  const peopleByEmail = new Map(
    existingPeople.map((person) => [person.email, person]),
  );
  const conflictingEmails = existingPeople.filter(
    (person) => person.kind !== "parent",
  );
  const eligible = plan.guardians.filter(
    (guardian) =>
      !conflictingEmails.some((person) => person.email === guardian.email),
  );
  const existingLinks = await prisma.guardianStudent.findMany({
    where: {
      guardianId: {
        in: existingPeople
          .filter((person) => person.kind === "parent")
          .map((person) => person.id),
      },
    },
    select: { guardianId: true, studentId: true },
  });
  const linkKeys = new Set(
    existingLinks.map((link) => `${link.guardianId}:${link.studentId}`),
  );
  const newGuardians = eligible.filter(
    (guardian) => !peopleByEmail.has(guardian.email),
  ).length;
  const existingGuardians = eligible.length - newGuardians;
  const eligibleLinks = eligible.reduce(
    (count, guardian) => count + guardian.students.length,
    0,
  );
  const newLinks = eligible.reduce((count, guardian) => {
    const existing = peopleByEmail.get(guardian.email);
    return (
      count +
      guardian.students.filter(
        (student) => !existing || !linkKeys.has(`${existing.id}:${student.id}`),
      ).length
    );
  }, 0);
  const blockerCount =
    plan.issues.filter((issue) => issue.severity === "blocker").length +
    conflictingEmails.length;

  console.log(
    JSON.stringify({
      event: "guardian-import-plan",
      mode: commit ? "commit" : "dry-run",
      sourceSha256,
      sourceRows: plan.sourceRows,
      distinctGuardianEmails: plan.distinctEmails,
      eligibleGuardians: eligible.length,
      newGuardians,
      existingGuardians,
      plannedLinks: eligibleLinks,
      newLinks,
      skippedGuardians: plan.skippedGuardians + conflictingEmails.length,
      blockerCount,
      warningCount: plan.issues.filter((issue) => issue.severity === "warning")
        .length,
      issues: [
        ...plan.issues.map(({ code, severity, rowNumbers }) => ({
          code,
          severity,
          rowNumbers,
        })),
        ...conflictingEmails.map(() => ({
          code: "email_owned_by_non_guardian",
          severity: "blocker",
        })),
      ],
    }),
  );

  if (!commit) {
    console.log("Dry run only. Re-run with CONFIRM=1 to write.");
    return;
  }
  if (blockerCount > 0 && !allowPartial) {
    throw new Error(
      "Import has blockers. Resolve them or set ALLOW_PARTIAL=1 to import only the safe matches.",
    );
  }

  await prisma.$transaction(async (tx) => {
    for (const guardian of eligible) {
      const existing = peopleByEmail.get(guardian.email);
      const person = existing
        ? existing
        : await tx.person.create({
            data: {
              email: guardian.email,
              ...splitName(guardian.name),
              kind: "parent",
              roles: ["parent"],
            },
          });
      await tx.guardianProfile.upsert({
        where: { guardianId: person.id },
        create: {
          guardianId: person.id,
          phone: guardian.phone,
          address: guardian.address,
        },
        update: { phone: guardian.phone, address: guardian.address },
      });
      await tx.guardianStudent.createMany({
        data: guardian.students.map((student) => ({
          guardianId: person.id,
          studentId: student.id,
        })),
        skipDuplicates: true,
      });
      await tx.auditLog.create({
        data: {
          entity: "Person",
          entityId: person.id,
          action: existing ? "guardian-import-linked" : "guardian-imported",
          actorId: actor.id,
          data: {
            sourceSha256,
            sourceObjectKey: sourceKey ?? null,
            sourceRows: guardian.rowNumbers,
            studentNos: guardian.students.map((student) => student.studentNo),
          },
        },
      });
    }
  });
  console.log(
    `Imported ${eligible.length} guardians and planned ${eligibleLinks} total links. ` +
      "No passwords were generated; use the Parents account controls explicitly.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
