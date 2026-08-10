import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@mydaust/db";
import {
  type ArchivedProfileAuthorization,
  type HistoricalTranscriptManifest,
  type PreparedHistoricalImport,
  type PreparedHistoricalRow,
  archivedProfileEmail,
  courseLookupKey,
} from "./historical-import.manifest.js";

const IMPORT_ROLES = new Set(["admin", "registrar"]);
const QUERY_CHUNK_SIZE = 1_000;
const ENTRY_WRITE_CHUNK_SIZE = 500;
const AUDIT_WRITE_CHUNK_SIZE = 1_000;

type ImportReadClient = Pick<
  Prisma.TransactionClient,
  | "course"
  | "person"
  | "student"
  | "term"
  | "transcriptEntry"
  | "transcriptImportBatch"
>;

interface CourseMatch {
  id: string;
  code: string;
  requirementCategory: string | null;
}

interface TermMatch {
  id: string;
  name: string;
  startDate: Date;
}

export interface HistoricalImportInvocation {
  actorEmail: string;
  manifestObjectKey: string;
}

export interface HistoricalImportPlan {
  actorId: string;
  alreadyImportedBatchId: string | null;
  totalManifestRows: number;
  authoritativeRows: number;
  exactContentDuplicatesInManifest: number;
  existingContentDuplicates: number;
  rowsToImport: number;
  existingStudents: number;
  archivedProfilesToCreate: number;
  matchedCourseRows: number;
  unmatchedCourseRows: number;
  matchedTermRows: number;
  unmatchedTermRows: number;
  unmatchedCourseCodes: string[];
  unmatchedTermLabels: string[];
}

export interface HistoricalImportResult {
  batchId: string;
  alreadyImported: boolean;
  importedRows: number;
  skippedRows: number;
  archivedProfilesCreated: number;
}

export class HistoricalImportBlockedError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HistoricalImportBlockedError";
  }
}

function chunks<T>(items: readonly T[]): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += QUERY_CHUNK_SIZE) {
    result.push(items.slice(index, index + QUERY_CHUNK_SIZE));
  }
  return result;
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

async function requireImportActor(
  client: ImportReadClient,
  actorEmailInput: string,
) {
  const actorEmail = actorEmailInput.trim().toLowerCase();
  const actor = await client.person.findUnique({
    where: { email: actorEmail },
    select: { id: true, email: true, roles: true },
  });
  if (!actor || !actor.roles.some((role) => IMPORT_ROLES.has(role))) {
    throw new HistoricalImportBlockedError(
      "Import actor must be an existing registrar or administrator",
      { actorEmail },
    );
  }
  return actor;
}

function requireResolvedIdentities(prepared: PreparedHistoricalImport): void {
  if (prepared.identityBlockers.length === 0) return;
  const missingRows = prepared.identityBlockers
    .filter((blocker) => blocker.status === "missing")
    .map((blocker) => blocker.sourceRowNumber);
  const ambiguousRows = prepared.identityBlockers
    .filter((blocker) => blocker.status === "ambiguous")
    .map((blocker) => blocker.sourceRowNumber);
  throw new HistoricalImportBlockedError(
    "Manifest contains missing or ambiguous student identities",
    {
      missingCount: missingRows.length,
      ambiguousCount: ambiguousRows.length,
      missingSourceRows: missingRows.slice(0, 100),
      ambiguousSourceRows: ambiguousRows.slice(0, 100),
    },
  );
}

async function findStudents(client: ImportReadClient, studentNos: string[]) {
  const students: Array<{
    id: string;
    studentNo: string;
    recordStatus: string;
    person: { email: string };
  }> = [];
  for (const chunk of chunks(studentNos)) {
    students.push(
      ...(await client.student.findMany({
        where: { studentNo: { in: chunk } },
        select: {
          id: true,
          studentNo: true,
          recordStatus: true,
          person: { select: { email: true } },
        },
      })),
    );
  }
  return students;
}

async function findExistingSourceKeys(
  client: ImportReadClient,
  sourceKeys: string[],
): Promise<Set<string>> {
  const existing = new Set<string>();
  for (const chunk of chunks(sourceKeys)) {
    const entries = await client.transcriptEntry.findMany({
      where: { sourceKey: { in: chunk } },
      select: { sourceKey: true },
    });
    for (const entry of entries) {
      if (entry.sourceKey) existing.add(entry.sourceKey);
    }
  }
  return existing;
}

async function loadCatalogMatches(client: ImportReadClient): Promise<{
  courses: Map<string, CourseMatch>;
  terms: Map<string, TermMatch>;
}> {
  const [catalogCourses, catalogTerms] = await Promise.all([
    client.course.findMany({
      select: { id: true, code: true, requirementCategory: true },
    }),
    client.term.findMany({ select: { id: true, name: true, startDate: true } }),
  ]);

  const groupedCourses = new Map<string, CourseMatch[]>();
  for (const course of catalogCourses) {
    const key = courseLookupKey(course.code);
    const matches = groupedCourses.get(key) ?? [];
    matches.push(course);
    groupedCourses.set(key, matches);
  }
  const courses = new Map<string, CourseMatch>();
  for (const [key, matches] of groupedCourses) {
    const onlyMatch = matches.length === 1 ? matches[0] : undefined;
    if (key && onlyMatch) courses.set(key, onlyMatch);
  }

  const terms = new Map(catalogTerms.map((term) => [term.name, term]));
  return { courses, terms };
}

function resolveCourse(
  row: PreparedHistoricalRow,
  courses: Map<string, CourseMatch>,
): CourseMatch | null {
  const key = courseLookupKey(row.courseCode);
  return key ? (courses.get(key) ?? null) : null;
}

function authorizationMap(manifest: HistoricalTranscriptManifest) {
  return new Map(
    manifest.archivedProfiles.map((profile) => [profile.studentNo, profile]),
  );
}

async function requireAuthorizedMissingStudents(
  client: ImportReadClient,
  missingStudentNos: string[],
  authorizations: Map<string, ArchivedProfileAuthorization>,
): Promise<ArchivedProfileAuthorization[]> {
  const unauthorized = missingStudentNos.filter(
    (studentNo) => !authorizations.has(studentNo),
  );
  if (unauthorized.length > 0) {
    throw new HistoricalImportBlockedError(
      "Authoritative student numbers are absent from the SIS and lack archived-profile authorization",
      {
        count: unauthorized.length,
        studentNos: unauthorized.slice(0, 100),
      },
    );
  }

  const profiles = missingStudentNos.map((studentNo) =>
    authorizations.get(studentNo)!,
  );
  const emails = profiles.map((profile) =>
    archivedProfileEmail(profile.studentNo),
  );
  const emailConflicts = emails.length
    ? await client.person.findMany({
        where: { email: { in: emails } },
        select: { email: true },
      })
    : [];
  if (emailConflicts.length > 0) {
    throw new HistoricalImportBlockedError(
      "A generated archive.invalid email is already assigned to another record",
      { count: emailConflicts.length },
    );
  }
  return profiles;
}

export async function planHistoricalImport(
  prisma: PrismaClient,
  manifest: HistoricalTranscriptManifest,
  prepared: PreparedHistoricalImport,
  invocation: HistoricalImportInvocation,
): Promise<HistoricalImportPlan> {
  requireResolvedIdentities(prepared);
  const actor = await requireImportActor(prisma, invocation.actorEmail);
  const existingBatch = await prisma.transcriptImportBatch.findUnique({
    where: { sourceSha256: manifest.sourceWorkbook.sha256 },
  });
  if (existingBatch) {
    if (existingBatch.status !== "imported") {
      throw new HistoricalImportBlockedError(
        "A non-complete import batch already owns this workbook hash",
        { batchId: existingBatch.id, status: existingBatch.status },
      );
    }
    return {
      actorId: actor.id,
      alreadyImportedBatchId: existingBatch.id,
      totalManifestRows: existingBatch.totalRows,
      authoritativeRows: existingBatch.importedRows + existingBatch.skippedRows,
      exactContentDuplicatesInManifest: 0,
      existingContentDuplicates: existingBatch.skippedRows,
      rowsToImport: 0,
      existingStudents: 0,
      archivedProfilesToCreate: 0,
      matchedCourseRows: 0,
      unmatchedCourseRows: 0,
      matchedTermRows: 0,
      unmatchedTermRows: 0,
      unmatchedCourseCodes: [],
      unmatchedTermLabels: [],
    };
  }

  const studentNos = unique(prepared.rows.map((row) => row.studentNo));
  const existingStudents = await findStudents(prisma, studentNos);
  const existingStudentNos = new Set(
    existingStudents.map((student) => student.studentNo),
  );
  const missingStudentNos = studentNos.filter(
    (studentNo) => !existingStudentNos.has(studentNo),
  );
  const profilesToCreate = await requireAuthorizedMissingStudents(
    prisma,
    missingStudentNos,
    authorizationMap(manifest),
  );

  const [{ courses, terms }, existingSourceKeys] = await Promise.all([
    loadCatalogMatches(prisma),
    findExistingSourceKeys(
      prisma,
      prepared.rows.map((row) => row.sourceKey),
    ),
  ]);
  const unmatchedCourseCodes = new Set<string>();
  const unmatchedTermLabels = new Set<string>();
  let matchedCourseRows = 0;
  let matchedTermRows = 0;
  for (const row of prepared.rows) {
    if (resolveCourse(row, courses)) matchedCourseRows += 1;
    else unmatchedCourseCodes.add(row.courseCode || "<blank>");
    if (terms.has(row.termLabel)) matchedTermRows += 1;
    else unmatchedTermLabels.add(row.termLabel);
  }

  return {
    actorId: actor.id,
    alreadyImportedBatchId: null,
    totalManifestRows: manifest.rows.length,
    authoritativeRows: prepared.rows.length,
    exactContentDuplicatesInManifest: prepared.duplicateSourceRows.length,
    existingContentDuplicates: existingSourceKeys.size,
    rowsToImport: prepared.rows.length - existingSourceKeys.size,
    existingStudents: existingStudents.length,
    archivedProfilesToCreate: profilesToCreate.length,
    matchedCourseRows,
    unmatchedCourseRows: prepared.rows.length - matchedCourseRows,
    matchedTermRows,
    unmatchedTermRows: prepared.rows.length - matchedTermRows,
    unmatchedCourseCodes: [...unmatchedCourseCodes].sort(),
    unmatchedTermLabels: [...unmatchedTermLabels].sort(),
  };
}

function termSortKey(term: TermMatch | null, fallback: string): string {
  return term
    ? `${term.startDate.toISOString().slice(0, 10)}:${term.name}`
    : fallback;
}

export async function executeHistoricalImport(
  prisma: PrismaClient,
  manifest: HistoricalTranscriptManifest,
  prepared: PreparedHistoricalImport,
  invocation: HistoricalImportInvocation,
): Promise<HistoricalImportResult> {
  requireResolvedIdentities(prepared);

  return prisma.$transaction(
    async (tx) => {
      const actor = await requireImportActor(tx, invocation.actorEmail);
      const existingBatch = await tx.transcriptImportBatch.findUnique({
        where: { sourceSha256: manifest.sourceWorkbook.sha256 },
      });
      if (existingBatch) {
        if (existingBatch.status !== "imported") {
          throw new HistoricalImportBlockedError(
            "A non-complete import batch already owns this workbook hash",
            { batchId: existingBatch.id, status: existingBatch.status },
          );
        }
        return {
          batchId: existingBatch.id,
          alreadyImported: true,
          importedRows: existingBatch.importedRows,
          skippedRows: existingBatch.skippedRows,
          archivedProfilesCreated: 0,
        };
      }

      const batch = await tx.transcriptImportBatch.create({
        data: {
          sourceFileName: manifest.sourceWorkbook.fileName,
          sourceSha256: manifest.sourceWorkbook.sha256,
          sourceObjectKey: manifest.sourceWorkbook.objectKey,
          status: "pending",
          totalRows: manifest.rows.length,
          note: `${manifest.importName}; manifest=${invocation.manifestObjectKey}`,
          createdById: actor.id,
        },
      });

      const studentNos = unique(prepared.rows.map((row) => row.studentNo));
      const existingStudents = await findStudents(tx, studentNos);
      const studentIds = new Map(
        existingStudents.map((student) => [student.studentNo, student.id]),
      );
      const missingStudentNos = studentNos.filter(
        (studentNo) => !studentIds.has(studentNo),
      );
      const profilesToCreate = await requireAuthorizedMissingStudents(
        tx,
        missingStudentNos,
        authorizationMap(manifest),
      );

      const profileAudits: Prisma.AuditLogCreateManyInput[] = [];
      for (const profile of profilesToCreate) {
        const person = await tx.person.create({
          data: {
            email: archivedProfileEmail(profile.studentNo),
            firstName: profile.firstName,
            lastName: profile.lastName,
            kind: "student",
            roles: ["student"],
          },
        });
        const student = await tx.student.create({
          data: {
            personId: person.id,
            studentNo: profile.studentNo,
            recordStatus: "archived",
          },
        });
        studentIds.set(profile.studentNo, student.id);
        profileAudits.push({
          entity: "Student",
          entityId: student.id,
          action: "historical-archive-profile-created",
          actorId: actor.id,
          data: {
            importBatchId: batch.id,
            studentNo: profile.studentNo,
            email: person.email,
            authorizationReference: profile.authorizationReference,
          },
        });
      }

      const [{ courses, terms }, existingSourceKeys] = await Promise.all([
        loadCatalogMatches(tx),
        findExistingSourceKeys(
          tx,
          prepared.rows.map((row) => row.sourceKey),
        ),
      ]);
      const insertableRows = prepared.rows.filter(
        (row) => !existingSourceKeys.has(row.sourceKey),
      );
      const entryData: Prisma.TranscriptEntryCreateManyInput[] =
        insertableRows.map((row) => {
          const studentId = studentIds.get(row.studentNo);
          if (!studentId) {
            throw new HistoricalImportBlockedError(
              "Student resolution changed during import",
              { studentNo: row.studentNo },
            );
          }
          const course = resolveCourse(row, courses);
          const term = terms.get(row.termLabel) ?? null;
          return {
            id: randomUUID(),
            studentId,
            source: "legacy_import",
            sourceKey: row.sourceKey,
            importBatchId: batch.id,
            importRowNumber: row.importRowNumber,
            courseId: course?.id ?? null,
            termId: term?.id ?? null,
            courseCode: row.courseCode,
            courseTitle: row.courseTitle,
            termLabel: row.termLabel,
            termSortKey: termSortKey(term, row.termSortKey),
            grade: row.grade,
            credits: row.credits,
            earnedCredits: row.earnedCredits,
            gradePoints: row.gradePoints,
            countsTowardGpa: row.countsTowardGpa,
            countsTowardCredits: row.countsTowardCredits,
            requirementCategory:
              row.requirementCategory ?? course?.requirementCategory ?? null,
            createdById: actor.id,
            updatedById: actor.id,
          };
        });

      if (entryData.length > 0) {
        let createdCount = 0;
        for (
          let index = 0;
          index < entryData.length;
          index += ENTRY_WRITE_CHUNK_SIZE
        ) {
          const created = await tx.transcriptEntry.createMany({
            data: entryData.slice(index, index + ENTRY_WRITE_CHUNK_SIZE),
          });
          createdCount += created.count;
        }
        if (createdCount !== entryData.length) {
          throw new Error(
            `Expected to create ${entryData.length} transcript entries, created ${createdCount}`,
          );
        }
      }

      const entryAudits: Prisma.AuditLogCreateManyInput[] = entryData.map(
        (entry) => ({
          entity: "TranscriptEntry",
          entityId: entry.id!,
          action: "legacy-imported",
          actorId: actor.id,
          data: {
            importBatchId: batch.id,
            importRowNumber: entry.importRowNumber,
            sourceKey: entry.sourceKey,
          },
        }),
      );
      const audits = [...profileAudits, ...entryAudits];
      for (
        let index = 0;
        index < audits.length;
        index += AUDIT_WRITE_CHUNK_SIZE
      ) {
        await tx.auditLog.createMany({
          data: audits.slice(index, index + AUDIT_WRITE_CHUNK_SIZE),
        });
      }

      const skippedRows = manifest.rows.length - entryData.length;
      const importedBatch = await tx.transcriptImportBatch.update({
        where: { id: batch.id },
        data: {
          status: "imported",
          importedRows: entryData.length,
          skippedRows,
          errorRows: 0,
          importedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          entity: "TranscriptImportBatch",
          entityId: importedBatch.id,
          action: "historical-transcript-imported",
          actorId: actor.id,
          data: {
            manifestObjectKey: invocation.manifestObjectKey,
            workbookObjectKey: manifest.sourceWorkbook.objectKey,
            sourceSha256: manifest.sourceWorkbook.sha256,
            totalRows: manifest.rows.length,
            importedRows: entryData.length,
            skippedRows,
            exactContentDuplicatesInManifest:
              prepared.duplicateSourceRows.length,
            existingContentDuplicates: existingSourceKeys.size,
            archivedProfilesCreated: profilesToCreate.length,
          },
        },
      });

      return {
        batchId: importedBatch.id,
        alreadyImported: false,
        importedRows: entryData.length,
        skippedRows,
        archivedProfilesCreated: profilesToCreate.length,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 120_000,
    },
  );
}
