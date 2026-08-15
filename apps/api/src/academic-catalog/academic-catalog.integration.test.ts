import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, PrismaClient } from "@mydaust/db";
import type { AuthUser } from "../auth/current-user.js";
import { FinanceApprovalsService } from "../finance/finance-approvals.service.js";
import { AcademicCatalogService } from "./academic-catalog.service.js";

const SCHEMA = `academic_catalog_test_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const baseDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const DB_URL = baseDatabaseUrl
  ? (() => {
      const url = new URL(baseDatabaseUrl);
      url.searchParams.set("schema", SCHEMA);
      return url.toString();
    })()
  : null;

const defaultLevels = [
  { code: "S1", name: "Foundation", creditCeiling: 30 },
  { code: "S2", name: "Development", creditCeiling: 60 },
  { code: "S3", name: "Advanced", creditCeiling: 90 },
];

let prisma: PrismaClient;
let catalogs: AcademicCatalogService;
let approvals: FinanceApprovalsService;
let registrar: AuthUser;
let director: AuthUser;
let yearId: string;
let programId: string;

function catalogInput(requiredCredits: number, reason: string) {
  return {
    yearLabel: "AY 2026 corrected",
    startsOn: "2026-08-20",
    endsOn: "2027-06-30",
    defaultLevels,
    programs: [
      {
        programId,
        programCode: "BSCS",
        programName: "Computer Science",
        progressionMode: "default" as const,
        customLevels: [],
        requirements: [{ category: "Degree", requiredCredits }],
      },
    ],
    reason,
    activateYear: true,
  };
}

describe.skipIf(!DB_URL)("academic catalog approval lifecycle", () => {
  beforeAll(async () => {
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: new URL("../../../../packages/db", import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: DB_URL! },
      stdio: "pipe",
    });
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL! } } });
    catalogs = new AcademicCatalogService(prisma as never);
    approvals = new FinanceApprovalsService(prisma as never);

    const [registrarPerson, directorPerson] = await Promise.all([
      prisma.person.create({
        data: {
          email: `registrar-${randomUUID()}@test.local`,
          firstName: "Rama",
          lastName: "Registrar",
          kind: "staff",
          roles: ["registrar"],
        },
      }),
      prisma.person.create({
        data: {
          email: `director-${randomUUID()}@test.local`,
          firstName: "Demba",
          lastName: "Director",
          kind: "staff",
          roles: ["admin"],
        },
      }),
    ]);
    registrar = {
      personId: registrarPerson.id,
      roles: ["registrar"],
      email: registrarPerson.email,
      name: "Rama Registrar",
    };
    director = {
      personId: directorPerson.id,
      roles: ["admin"],
      email: directorPerson.email,
      name: "Demba Director",
    };
    const department = await prisma.department.create({
      data: { code: "CSE", name: "Computer Science" },
    });
    const program = await prisma.program.create({
      data: {
        code: "BSCS",
        name: "Computer Science",
        departmentId: department.id,
      },
    });
    programId = program.id;
    const year = await prisma.academicYear.create({
      data: { label: "AY 2026", status: "draft" },
    });
    yearId = year.id;
    await prisma.academicCatalogRevision.create({
      data: {
        academicYearId: year.id,
        revision: 1,
        status: "approved",
        yearLabel: year.label,
        defaultLevels: [
          ...defaultLevels,
          { code: "S4", name: "Senior", creditCeiling: 120 },
          { code: "S5", name: "Completion", creditCeiling: 150 },
        ],
        programConfigurations: [
          {
            ...catalogInput(132, "Legacy baseline").programs[0],
          },
        ],
        reason: "Legacy baseline",
        approvedAt: new Date(),
      },
    });
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await prisma.$disconnect();
  });

  it("keeps drafts invisible, then atomically publishes the director-approved revision", async () => {
    await catalogs.saveDraft(
      yearId,
      registrar.personId,
      catalogInput(90, "Align the programme with its approved curriculum"),
    );
    const before = await catalogs.progress({
      programId,
      catalogYearId: yearId,
      catalogYearLabel: "AY 2026",
      earnedCredits: 61,
      inProgressCredits: 12,
    });
    expect(before.requiredCredits).toBe(132);

    const submitted = await catalogs.submit(yearId, registrar);
    const pending = await prisma.approvalRequest.findUniqueOrThrow({
      where: { id: submitted.requestId },
    });
    expect(pending).toMatchObject({
      kind: "academic_catalog",
      status: "pending",
      requestedById: registrar.personId,
      baseRevision: 1,
    });

    await approvals.approve(submitted.requestId, director, "Catalog verified");
    const [approved, previous, year, requirement, decision] = await Promise.all(
      [
        prisma.academicCatalogRevision.findFirstOrThrow({
          where: { academicYearId: yearId, status: "approved" },
        }),
        prisma.academicCatalogRevision.findUniqueOrThrow({
          where: {
            academicYearId_revision: { academicYearId: yearId, revision: 1 },
          },
        }),
        prisma.academicYear.findUniqueOrThrow({ where: { id: yearId } }),
        prisma.programRequirement.findFirstOrThrow({
          where: { programId, catalogYear: "AY 2026 corrected" },
        }),
        prisma.approvalRequest.findUniqueOrThrow({
          where: { id: submitted.requestId },
        }),
      ],
    );
    expect(approved).toMatchObject({
      revision: 2,
      createdById: registrar.personId,
      approvedById: director.personId,
    });
    expect(previous.status).toBe("superseded");
    expect(year).toMatchObject({
      label: "AY 2026 corrected",
      status: "active",
    });
    expect(requirement.requiredCredits).toBe(90);
    expect(decision).toMatchObject({
      status: "approved",
      reviewedById: director.personId,
    });

    const after = await catalogs.progress({
      programId,
      catalogYearId: yearId,
      catalogYearLabel: "AY 2026",
      earnedCredits: 61,
      inProgressCredits: 12,
    });
    expect(after).toMatchObject({
      requiredCredits: 90,
      level: { code: "S3" },
      maximumLevel: { code: "S3" },
      catalog: { revision: 2, fallback: false },
    });
  });

  it("marks an overtaken request stale without changing the active catalog", async () => {
    await catalogs.saveDraft(
      yearId,
      registrar.personId,
      catalogInput(87, "Superseded proposal"),
    );
    const submitted = await catalogs.submit(yearId, registrar);
    await prisma.$transaction([
      prisma.academicCatalogRevision.updateMany({
        where: { academicYearId: yearId, status: "approved" },
        data: { status: "superseded" },
      }),
      prisma.academicCatalogRevision.create({
        data: {
          academicYearId: yearId,
          revision: 4,
          status: "approved",
          yearLabel: "AY 2026 corrected",
          startsOn: new Date("2026-08-20T00:00:00.000Z"),
          endsOn: new Date("2027-06-30T00:00:00.000Z"),
          defaultLevels,
          programConfigurations: catalogInput(
            90,
            "Concurrent approved revision",
          ).programs as Prisma.InputJsonValue,
          reason: "Concurrent approved revision",
          approvedById: director.personId,
          approvedAt: new Date(),
        },
      }),
    ]);

    await expect(
      approvals.approve(submitted.requestId, director),
    ).resolves.toMatchObject({ status: "stale" });
    const [request, overtaken, active] = await Promise.all([
      prisma.approvalRequest.findUniqueOrThrow({
        where: { id: submitted.requestId },
      }),
      prisma.academicCatalogRevision.findUniqueOrThrow({
        where: {
          academicYearId_revision: { academicYearId: yearId, revision: 3 },
        },
      }),
      prisma.academicCatalogRevision.findFirstOrThrow({
        where: { academicYearId: yearId, status: "approved" },
      }),
    ]);
    expect(request.status).toBe("stale");
    expect(overtaken.status).toBe("rejected");
    expect(active.revision).toBe(4);
  });

  it("records a rejection while leaving the approved catalog untouched", async () => {
    await catalogs.saveDraft(
      yearId,
      registrar.personId,
      catalogInput(84, "Rejected proposal"),
    );
    const submitted = await catalogs.submit(yearId, registrar);
    await approvals.reject(
      submitted.requestId,
      director,
      "Requirements are not yet approved by the faculty senate",
    );
    const [request, rejected, active] = await Promise.all([
      prisma.approvalRequest.findUniqueOrThrow({
        where: { id: submitted.requestId },
      }),
      prisma.academicCatalogRevision.findUniqueOrThrow({
        where: {
          academicYearId_revision: { academicYearId: yearId, revision: 5 },
        },
      }),
      prisma.academicCatalogRevision.findFirstOrThrow({
        where: { academicYearId: yearId, status: "approved" },
      }),
    ]);
    expect(request).toMatchObject({
      status: "rejected",
      reviewedById: director.personId,
    });
    expect(rejected.status).toBe("rejected");
    expect(active.revision).toBe(4);
  });
});
