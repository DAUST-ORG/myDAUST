import type { AddressInfo } from "node:net";
import { type INestApplication, Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ZodExceptionFilter } from "../common/zod-exception.filter.js";
import { ENV } from "../config/config.module.js";
import { SESSION_COOKIE } from "../auth/constants.js";
import type { AuthUser } from "../auth/current-user.js";
import { JwtAuthGuard } from "../auth/guards.js";
import { JwtStrategy } from "../auth/jwt.strategy.js";
import { RolesGuard } from "../auth/roles.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RegistrarController } from "../registrar/registrar.controller.js";
import { RegistrarService } from "../registrar/registrar.service.js";
import { AcademicsController } from "./academics.controller.js";
import { AcademicsService } from "./academics.service.js";
import { RegistrarEnrollmentService } from "./registrar-enrollment.service.js";

const registrationCatalog = vi.fn(async () => ({ source: "catalog" }));
const enrollBundle = vi.fn(
  async (_studentId: string, sectionIds: string[]) => ({
    enrollmentIds: sectionIds.map((_, index) => `enrollment-${index + 1}`),
    sectionIds,
  }),
);
const registrationConfiguration = vi.fn(async () => ({
  configured: true,
  termId: "11111111-1111-4111-8111-111111111111",
  recommendationsEnabled: true,
  term: null,
}));
const updateRegistrationConfiguration = vi.fn(
  async (_actorId: string, input: unknown) => input,
);

const TEST_SECRET = "registration-http-boundary-secret";
let databasePerson = {
  id: "student-person",
  email: "student@test.local" as string | null,
  firstName: "Authenticated",
  lastName: "Student",
  roles: ["student"],
  status: "active",
  sessionVersion: 0,
  student: { id: "student-from-database" } as { id: string } | null,
};
const findPerson = vi.fn(async () => databasePerson);

class RegistrationHttpBoundaryTestModule {}

Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.register({ secret: TEST_SECRET }),
  ],
  controllers: [AcademicsController, RegistrarController],
  providers: [
    {
      provide: AcademicsService,
      useValue: { registrationCatalog, enrollBundle },
    },
    {
      // AcademicsController injects it; these routes never reach it, but Nest
      // resolves every dependency at bootstrap.
      provide: RegistrarEnrollmentService,
      useValue: { sectionEnrollments: vi.fn(), enrollStudent: vi.fn() },
    },
    {
      provide: RegistrarService,
      useValue: {
        registrationConfiguration,
        updateRegistrationConfiguration,
      },
    },
    { provide: ENV, useValue: { SESSION_SECRET: TEST_SECRET } },
    {
      provide: PrismaService,
      useValue: { person: { findUnique: findPerson } },
    },
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})(RegistrationHttpBoundaryTestModule);

describe("registration authenticated HTTP boundary", () => {
  let app: INestApplication;
  let origin: string;
  let jwt: JwtService;

  const sessionCookie = async (payload: Partial<AuthUser> = {}) => {
    const token = await jwt.signAsync(
      {
        personId: databasePerson.id,
        // These stale token values are deliberately ignored by JwtStrategy;
        // identity and roles must come from the database row above.
        studentId: "student-from-token-must-not-win",
        roles: ["admin"],
        email: "stale-token@test.local",
        name: "Stale Token",
        sessionVersion: 0,
        ...payload,
      } satisfies AuthUser,
      { expiresIn: "5m" },
    );
    return `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
  };

  beforeAll(async () => {
    app = await NestFactory.create(RegistrationHttpBoundaryTestModule, {
      logger: false,
    });
    app.setGlobalPrefix("api");
    app.useGlobalFilters(new ZodExceptionFilter(app.getHttpAdapter()));
    await app.listen(0, "127.0.0.1");
    jwt = app.get(JwtService);
    const address = app.getHttpServer().address() as AddressInfo;
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    databasePerson = {
      id: "student-person",
      email: "student@test.local",
      firstName: "Authenticated",
      lastName: "Student",
      roles: ["student"],
      status: "active",
      sessionVersion: 0,
      student: { id: "student-from-database" },
    };
  });

  it("binds catalog and atomic bundle calls to the authenticated student id", async () => {
    const termId = "11111111-1111-4111-8111-111111111111";
    const sectionIds = [
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];
    const headers = { cookie: await sessionCookie() };
    const catalogResponse = await fetch(
      `${origin}/api/academics/my/registration?termId=${termId}`,
      { headers },
    );
    const bundleResponse = await fetch(
      `${origin}/api/academics/my/enrollments/bundle`,
      {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ sectionIds }),
      },
    );

    expect(catalogResponse.status).toBe(200);
    expect(bundleResponse.status).toBe(201);
    expect(registrationCatalog).toHaveBeenCalledWith(
      "student-from-database",
      termId,
    );
    expect(enrollBundle).toHaveBeenCalledWith(
      "student-from-database",
      sectionIds,
    );
    await expect(bundleResponse.json()).resolves.toEqual({
      enrollmentIds: ["enrollment-1", "enrollment-2"],
      sectionIds,
    });
  });

  it("keeps student registration routes student-only at the real RolesGuard boundary", async () => {
    const unauthenticated = await fetch(
      `${origin}/api/academics/my/registration`,
    );
    databasePerson = {
      ...databasePerson,
      roles: ["registrar"],
      student: null,
    };
    const registrar = await fetch(`${origin}/api/academics/my/registration`, {
      headers: { cookie: await sessionCookie({ roles: ["student"] }) },
    });

    expect(unauthenticated.status).toBe(401);
    expect(registrar.status).toBe(403);
    expect(registrationCatalog).not.toHaveBeenCalled();
  });

  it("allows registrar configuration reads and audited updates but rejects students", async () => {
    const input = {
      termId: "11111111-1111-4111-8111-111111111111",
      recommendationsEnabled: true,
      reason: "Open registration for the approved term",
    };
    databasePerson = {
      ...databasePerson,
      id: "registrar-person",
      email: "registrar@test.local",
      roles: ["registrar"],
      student: null,
    };
    const registrarHeaders = { cookie: await sessionCookie() };
    const readResponse = await fetch(
      `${origin}/api/registrar/registration-configuration`,
      { headers: registrarHeaders },
    );
    const updateResponse = await fetch(
      `${origin}/api/registrar/registration-configuration`,
      {
        method: "PATCH",
        headers: {
          ...registrarHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
      },
    );
    databasePerson = {
      ...databasePerson,
      id: "student-person",
      email: "student@test.local",
      roles: ["student"],
      student: { id: "student-from-database" },
    };
    const studentResponse = await fetch(
      `${origin}/api/registrar/registration-configuration`,
      { headers: { cookie: await sessionCookie() } },
    );

    expect(readResponse.status).toBe(200);
    expect(updateResponse.status).toBe(200);
    expect(studentResponse.status).toBe(403);
    expect(registrationConfiguration).toHaveBeenCalledTimes(1);
    expect(updateRegistrationConfiguration).toHaveBeenCalledWith(
      "registrar-person",
      input,
    );
  });

  it("rejects a bundle body that tries to override the session identity", async () => {
    const response = await fetch(
      `${origin}/api/academics/my/enrollments/bundle`,
      {
        method: "POST",
        headers: {
          cookie: await sessionCookie(),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sectionIds: ["22222222-2222-4222-8222-222222222222"],
          studentId: "attacker-selected-student",
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(enrollBundle).not.toHaveBeenCalled();
  });
});
