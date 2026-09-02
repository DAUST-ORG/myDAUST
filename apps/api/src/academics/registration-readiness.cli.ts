import "dotenv/config";
import { PrismaClient } from "@mydaust/db";
import { z } from "zod";
import { AcademicsService } from "./academics.service.js";
import { compareApprovedCurriculumMaps } from "./curriculum-map-readiness.js";
import type { RecommendationAvailability } from "./course-recommendations.js";
import {
  readRegistrationConfiguration,
  normalizeRegistrationSemester,
  registrationClosedReason,
} from "./registration-configuration.js";
import {
  inspectApprovedCurriculumCreditIntegrity,
  inspectApprovedCurriculumSnapshots,
  registrationReadinessRunStateChanged,
  summarizeRegistrationReadiness,
  type RegistrationReadinessRunState,
  type RegistrationReadinessStudentResult,
} from "./registration-readiness.js";

const environmentSchema = z.object({ DATABASE_URL: z.string().min(1) });
const EVENT = "registration-recommendation-readiness";

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  work: (value: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor++;
        try {
          results[index] = {
            status: "fulfilled",
            value: await work(values[index]!),
          };
        } catch (reason) {
          results[index] = { status: "rejected", reason };
        }
      }
    }),
  );
  return results;
}

async function captureRunState(
  prisma: PrismaClient,
  academics: AcademicsService,
): Promise<RegistrationReadinessRunState> {
  const configuration = await readRegistrationConfiguration(prisma);
  const legacyTerm =
    configuration.state === "absent" ? await academics.currentTerm() : null;
  const targetTermId =
    configuration.state === "valid"
      ? configuration.termId
      : (legacyTerm?.id ?? null);
  const [targetTerm, targetSectionCount, approvedRevisions] = await Promise.all(
    [
      targetTermId
        ? prisma.term.findUnique({
            where: { id: targetTermId },
            select: {
              id: true,
              name: true,
              status: true,
              semester: true,
              academicYearId: true,
              startDate: true,
              endDate: true,
              addDeadline: true,
              dropDeadline: true,
            },
          })
        : null,
      targetTermId
        ? prisma.section.count({ where: { termId: targetTermId } })
        : 0,
      prisma.academicCatalogRevision.findMany({
        where: { status: "approved" },
        select: { id: true, updatedAt: true },
      }),
    ],
  );
  return { configuration, targetTerm, targetSectionCount, approvedRevisions };
}

async function main() {
  environmentSchema.parse(process.env);
  const prisma = new PrismaClient();
  try {
    const academics = new AcademicsService(prisma as never);
    const initialRunState = await captureRunState(prisma, academics);
    const { configuration, targetTerm, targetSectionCount } = initialRunState;
    const activeStudents = await prisma.student.findMany({
      where: { recordStatus: "active" },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const audited = await mapWithConcurrency(
      activeStudents,
      8,
      async (student): Promise<RegistrationReadinessStudentResult> => {
        const catalog = await academics.registrationCatalogForReadinessAudit(
          student.id,
        );
        return {
          registrationOpen: catalog.registration.open,
          recommendationStatus: catalog.recommendationContext.status,
          recommendationCount: catalog.recommendations.length,
          recommendationAvailabilities: catalog.recommendations.map(
            (recommendation) =>
              recommendation.availability as RecommendationAvailability,
          ),
          unofferedRecommendationCount: catalog.recommendations.filter(
            (recommendation) => recommendation.availability === "not_offered",
          ).length,
        };
      },
    );
    const studentResults = audited.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    const [
      unlinkedTranscriptEntryCount,
      activeStudentUnlinkedTranscriptEntryCount,
      approvedRevisions,
      candidateRevisions,
      catalogCourses,
    ] = await Promise.all([
      prisma.transcriptEntry.count({
        where: {
          voidedAt: null,
          courseId: null,
        },
      }),
      prisma.transcriptEntry.count({
        where: {
          voidedAt: null,
          courseId: null,
          student: { recordStatus: "active" },
        },
      }),
      prisma.academicCatalogRevision.findMany({
        where: { status: "approved" },
        select: {
          academicYearId: true,
          revision: true,
          approvedAt: true,
          defaultLevels: true,
          programConfigurations: true,
        },
      }),
      prisma.academicCatalogRevision.findMany({
        where: { status: { in: ["draft", "pending"] } },
        select: {
          academicYearId: true,
          revision: true,
          approvedAt: true,
          programConfigurations: true,
        },
      }),
      prisma.course.findMany({
        select: { id: true, code: true, credits: true },
      }),
    ]);
    const comparedAcademicYearIds = [
      ...new Set(
        [...approvedRevisions, ...candidateRevisions].map(
          (revision) => revision.academicYearId,
        ),
      ),
    ];
    const relationalCurricula =
      comparedAcademicYearIds.length === 0
        ? []
        : await prisma.curriculum.findMany({
            where: { academicYearId: { in: comparedAcademicYearIds } },
            select: {
              academicYearId: true,
              programId: true,
              entries: {
                select: {
                  courseId: true,
                  yearIndex: true,
                  semester: true,
                  position: true,
                  course: { select: { code: true } },
                },
              },
            },
          });
    const curriculumSnapshotAudit =
      inspectApprovedCurriculumSnapshots(approvedRevisions);
    const curriculumCreditAudit = inspectApprovedCurriculumCreditIntegrity(
      approvedRevisions,
      catalogCourses,
    );
    const curriculumMapComparisons = compareApprovedCurriculumMaps(
      approvedRevisions,
      relationalCurricula,
    );
    const candidateCurriculumMaps = compareApprovedCurriculumMaps(
      candidateRevisions,
      relationalCurricula,
    ).map(({ approvedRevision, ...comparison }) => ({
      ...comparison,
      candidateRevision: approvedRevision,
    }));
    const finalRunState = await captureRunState(prisma, academics);
    const runStateStable = !registrationReadinessRunStateChanged(
      initialRunState,
      finalRunState,
    );
    const summary = summarizeRegistrationReadiness({
      configuration,
      targetTermAvailable:
        targetTerm !== null && registrationClosedReason(targetTerm) === null,
      targetTermExists: targetTerm !== null,
      targetTermMapped:
        targetTerm?.academicYearId !== null &&
        targetTerm?.academicYearId !== undefined &&
        normalizeRegistrationSemester(targetTerm.semester) !== null,
      targetSectionCount,
      activeStudentCount: activeStudents.length,
      auditedStudents: studentResults,
      failedStudentCount: audited.length - studentResults.length,
      unlinkedTranscriptEntryCount,
      activeStudentUnlinkedTranscriptEntryCount,
      duplicateCurriculumEntryCount:
        curriculumSnapshotAudit.duplicateCurriculumEntryCount,
      duplicateCurriculumCourseCodeCount:
        curriculumSnapshotAudit.duplicateCurriculumCourseCodeCount,
      invalidCurriculumPositionCount:
        curriculumSnapshotAudit.invalidCurriculumPositionCount,
      malformedCurriculumSnapshotCount:
        curriculumSnapshotAudit.malformedCurriculumSnapshotCount,
      curriculumYearBeyondConfiguredPlanCount:
        curriculumSnapshotAudit.curriculumYearBeyondConfiguredPlanCount,
      unknownCurriculumCourseIdCount:
        curriculumCreditAudit.unknownCurriculumCourseIdCount,
      curriculumCourseCodeMismatchCount:
        curriculumCreditAudit.curriculumCourseCodeMismatchCount,
      curriculumCreditTotalMismatchCount:
        curriculumCreditAudit.curriculumCreditTotalMismatchCount,
      curriculumMapComparisons,
      runStateStable,
    });
    console.log(
      JSON.stringify({
        event: EVENT,
        ok: true,
        mode: "read-only",
        generatedAt: new Date().toISOString(),
        runStateStable,
        configuration,
        targetTerm,
        approvedRevisionCount: curriculumSnapshotAudit.approvedRevisionCount,
        curriculumMaps: curriculumMapComparisons,
        candidateRevisionCount: candidateRevisions.length,
        candidateCurriculumMaps,
        ...summary,
        note: "No database changes were made. Resolve every blocker before enabling student recommendations in production.",
      }),
    );
    if (!summary.ready) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: EVENT,
      ok: false,
      mode: "read-only",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
