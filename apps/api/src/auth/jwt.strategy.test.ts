import { UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "./current-user.js";
import { JwtStrategy } from "./jwt.strategy.js";

const ENV = { SESSION_SECRET: "test-secret" } as never;

function strategyFor(row: unknown) {
  const prisma = { person: { findUnique: vi.fn().mockResolvedValue(row) } };
  return {
    prisma,
    strategy: new JwtStrategy(ENV, prisma as never),
  };
}

const ACTIVE_ROW = {
  id: "person-1",
  email: "registrar@daust.edu",
  firstName: "Awa",
  lastName: "Ndiaye",
  roles: ["registrar"],
  status: "active",
  sessionVersion: 0,
  student: null,
};

const TOKEN: AuthUser = {
  personId: "person-1",
  roles: ["registrar"],
  email: "registrar@daust.edu",
  name: "Awa Ndiaye",
  sessionVersion: 0,
};

describe("JwtStrategy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("takes roles from the database, not from the token", async () => {
    // The token was signed while this person was an admin; the row says otherwise.
    const { strategy } = strategyFor({ ...ACTIVE_ROW, roles: ["registrar"] });

    const user = await strategy.validate({ ...TOKEN, roles: ["admin"] });

    expect(user.roles).toEqual(["registrar"]);
  });

  it("drops role strings that are not app roles", async () => {
    const { strategy } = strategyFor({
      ...ACTIVE_ROW,
      roles: ["registrar", "wizard"],
    });

    const user = await strategy.validate(TOKEN);

    expect(user.roles).toEqual(["registrar"]);
  });

  it("rejects a suspended account", async () => {
    const { strategy } = strategyFor({ ...ACTIVE_ROW, status: "suspended" });

    await expect(strategy.validate(TOKEN)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects a token whose session version is behind the row", async () => {
    const { strategy } = strategyFor({ ...ACTIVE_ROW, sessionVersion: 1 });

    await expect(
      strategy.validate({ ...TOKEN, sessionVersion: 0 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a token for a person who no longer exists", async () => {
    const { strategy } = strategyFor(null);

    await expect(strategy.validate(TOKEN)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("admits a pre-existing token that carries no session-version claim", async () => {
    // Every session live at deploy time is in this state. Treating the missing claim as 0
    // is what keeps the migration from logging the whole institution out.
    const { strategy } = strategyFor(ACTIVE_ROW);
    const legacyToken = { ...TOKEN };
    delete legacyToken.sessionVersion;

    await expect(strategy.validate(legacyToken)).resolves.toMatchObject({
      personId: "person-1",
    });
  });

  it("rejects a claimless token once that person's sessions have been ended", async () => {
    const { strategy } = strategyFor({ ...ACTIVE_ROW, sessionVersion: 1 });
    const legacyToken = { ...TOKEN };
    delete legacyToken.sessionVersion;

    await expect(strategy.validate(legacyToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("surfaces the student id for ownership checks", async () => {
    const { strategy } = strategyFor({
      ...ACTIVE_ROW,
      roles: ["student"],
      student: { id: "student-9" },
    });

    const user = await strategy.validate({ ...TOKEN, roles: ["student"] });

    expect(user.studentId).toBe("student-9");
  });

  it("reads the person by primary key exactly once per request", async () => {
    const { prisma, strategy } = strategyFor(ACTIVE_ROW);

    await strategy.validate(TOKEN);

    expect(prisma.person.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.person.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "person-1" } }),
    );
  });
});
