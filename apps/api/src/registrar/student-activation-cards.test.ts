import { createHash } from "node:crypto";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  STUDENT_ACTIVATION_CARD_TTL_MS,
  activationCardCodeHmac,
  buildStudentActivationCardGenerationPlan,
  formatStudentActivationCode,
  generationPlanSummary,
  isAuthorizedActivationCardOperator,
  issueActivationCards,
  renderStudentActivationCardsPdf,
  studentActivationCardPdfPageCount,
  type StudentActivationCardStudentSnapshot,
} from "./student-activation-cards.js";
import {
  parseStudentActivationCardCliConfig,
  promotePrivatePdfExclusive,
  recoverOrVerifyCommittedArtifact,
  writePrivatePdfExclusive,
} from "./student-activation-cards.cli.js";

const NOW = new Date("2026-09-01T12:00:00.000Z");
const KEY = Uint8Array.from({ length: 32 }, (_, index) => index + 1);

function student(
  suffix: string,
  overrides: Partial<StudentActivationCardStudentSnapshot> = {},
): StudentActivationCardStudentSnapshot {
  const personOverrides = overrides.person ?? {};
  return {
    id: `student-${suffix}`,
    personId: `person-${suffix}`,
    studentNo: `S2026${suffix}`,
    dateOfBirth: new Date("2005-01-02T00:00:00.000Z"),
    recordStatus: "active",
    person: {
      email: `student.${suffix}@mydaust.com`,
      firstName: "Awa",
      lastName: `Student ${suffix}`,
      kind: "student",
      roles: ["student"],
      status: "active",
      passwordHash: null,
      mustChangePassword: false,
      studentInvites: [],
      studentActivationCards: [],
      ...personOverrides,
    },
    ...overrides,
  };
}

function planFor(students: StudentActivationCardStudentSnapshot[]) {
  const counts = new Map<string, number>();
  for (const value of students) {
    if (value.person.email) {
      const key = value.person.email.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return buildStudentActivationCardGenerationPlan({
    students,
    caseInsensitiveEmailCounts: counts,
    actorId: "operator-1",
    activationUrl: "https://my.daust.net/activate-student",
    capturedAt: NOW,
  });
}

describe("student activation-card planning", () => {
  it("anchors the exact eligible snapshot without putting PII in the safe summary", () => {
    const first = planFor([student("0002"), student("0001")]);
    const second = buildStudentActivationCardGenerationPlan({
      students: [student("0001"), student("0002")],
      caseInsensitiveEmailCounts: new Map([
        ["student.0001@mydaust.com", 1],
        ["student.0002@mydaust.com", 1],
      ]),
      actorId: "operator-1",
      activationUrl: "https://my.daust.net/activate-student",
      capturedAt: new Date("2026-09-01T12:05:00.000Z"),
    });

    expect(first.planSha256).toBe(second.planSha256);
    expect(first.candidates.map((entry) => entry.studentNo)).toEqual([
      "S20260001",
      "S20260002",
    ]);
    const summary = JSON.stringify(generationPlanSummary(first));
    expect(generationPlanSummary(first).activationUrl).toBe(
      "https://my.daust.net/activate-student",
    );
    expect(summary).not.toContain("Awa");
    expect(summary).not.toContain("S2026");
    expect(summary).not.toContain("@mydaust.com");
  });

  it("changes the reviewed digest on identity drift and excludes passworded accounts", () => {
    const clean = planFor([student("0001")]);
    const drifted = planFor([
      student("0001", {
        person: {
          ...student("0001").person,
          passwordHash: "bcrypt-hash",
        },
      }),
    ]);
    expect(drifted.planSha256).not.toBe(clean.planSha256);
    expect(drifted.eligibleCount).toBe(0);
    expect(drifted.excludedCount).toBe(1);
  });

  it("blocks live setup capabilities but plans reviewed cleanup only for expired cards", () => {
    const liveInvite = planFor([
      student("0001", {
        person: {
          ...student("0001").person,
          studentInvites: [
            {
              id: "invite-1",
              expiresAt: new Date(NOW.getTime() + 60_000),
              usedAt: null,
            },
          ],
        },
      }),
    ]);
    expect(liveInvite.blockerCounts).toEqual({ active_setup_invite: 1 });

    const expiredCard = planFor([
      student("0002", {
        person: {
          ...student("0002").person,
          studentActivationCards: [
            {
              id: "card-expired",
              expiresAt: new Date(NOW.getTime() - 1),
              failedAttempts: 0,
              claimedAt: null,
              usedAt: null,
              revokedAt: null,
              batch: {
                id: "batch-old",
                status: "active",
                expiresAt: new Date(NOW.getTime() - 1),
                revokedAt: null,
              },
            },
          ],
        },
      }),
    ]);
    expect(expiredCard.eligibleCount).toBe(1);
    expect(expiredCard.expiredCardCleanupCount).toBe(1);
  });

  it("authorizes only active staff holding admin or registrar", () => {
    expect(
      isAuthorizedActivationCardOperator({
        kind: "staff",
        status: "active",
        roles: ["registrar"],
      }),
    ).toBe(true);
    expect(
      isAuthorizedActivationCardOperator({
        kind: "staff",
        status: "active",
        roles: ["admin"],
      }),
    ).toBe(true);
    expect(
      isAuthorizedActivationCardOperator({
        kind: "staff",
        status: "active",
        roles: ["it_admin"],
      }),
    ).toBe(false);
  });
});

describe("student activation-card credentials and PDF", () => {
  it("issues exactly 80-bit canonical codes and stores only domain-separated HMACs", () => {
    const plan = planFor([student("0001"), student("0002")]);
    let counter = 1;
    const cards = issueActivationCards(plan, KEY, () => {
      const bytes = new Uint8Array(10);
      bytes[9] = counter;
      counter += 1;
      return bytes;
    });
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.canonicalCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
      expect(card.displayCode).toMatch(
        /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){3}$/,
      );
      expect(card.codeHmacSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(card.codeHmacSha256).not.toContain(card.canonicalCode);
    }
    expect(formatStudentActivationCode(cards[0]!.canonicalCode)).toBe(
      cards[0]!.displayCode,
    );
    expect(activationCardCodeHmac(cards[0]!.canonicalCode, KEY)).toBe(
      cards[0]!.codeHmacSha256,
    );
    expect(STUDENT_ACTIVATION_CARD_TTL_MS).toBe(86_400_000);
  });

  it("renders eight readable, data-minimized cards on one A4 page", async () => {
    const plan = planFor(
      Array.from({ length: 8 }, (_, index) =>
        student(String(index + 1).padStart(4, "0")),
      ),
    );
    let counter = 1;
    const cards = issueActivationCards(plan, KEY, () => {
      const bytes = new Uint8Array(10);
      bytes[8] = counter;
      bytes[9] = 255 - counter;
      counter += 1;
      return bytes;
    });
    const rendered = await renderStudentActivationCardsPdf({
      cards,
      activationUrl: plan.activationUrl,
      issuedAt: NOW,
      expiresAt: new Date(NOW.getTime() + STUDENT_ACTIVATION_CARD_TTL_MS),
      planSha256: plan.planSha256,
    });
    expect(rendered.pageCount).toBe(1);
    expect(Buffer.from(rendered.bytes).subarray(0, 5).toString()).toBe("%PDF-");
    const document = await PDFDocument.load(rendered.bytes);
    expect(document.getPageCount()).toBe(1);
    expect(studentActivationCardPdfPageCount(400)).toBe(50);
  });
});

describe("student activation-card CLI guards", () => {
  const baseEnv = {
    STUDENT_ACTIVATION_CARD_ACTOR_EMAIL: "admin@daust.net",
  } satisfies NodeJS.ProcessEnv;

  it("is dry-run by default and requires the reviewed digest for confirmation", () => {
    expect(parseStudentActivationCardCliConfig(baseEnv)).toMatchObject({
      operation: "generate",
      confirm: false,
    });
    expect(() =>
      parseStudentActivationCardCliConfig({ ...baseEnv, CONFIRM: "1" }),
    ).toThrow(/reviewed dry-run plan/i);
  });

  it("allows only the exact reviewed production and staging activation URLs", () => {
    expect(
      parseStudentActivationCardCliConfig({
        ...baseEnv,
        STUDENT_ACTIVATION_CARD_ACTIVATION_URL:
          "https://daust-staging.azt.dev/activate-student",
      }).activationUrl,
    ).toBe("https://daust-staging.azt.dev/activate-student");

    for (const activationUrl of [
      "https://phishing.example/activate-student",
      "https://my.daust.net/activate-student?next=evil",
      "https://my.daust.net/activate-student/",
      "https://my.daust.net/other-path",
    ]) {
      expect(() =>
        parseStudentActivationCardCliConfig({
          ...baseEnv,
          STUDENT_ACTIVATION_CARD_ACTIVATION_URL: activationUrl,
        }),
      ).toThrow(/must exactly match one of/i);
    }
  });

  it("accepts only non-PII revocation reason codes", () => {
    expect(
      parseStudentActivationCardCliConfig({
        ...baseEnv,
        STUDENT_ACTIVATION_CARD_OPERATION: "revoke",
        STUDENT_ACTIVATION_CARD_REVOKE_BATCH_ID:
          "11111111-1111-4111-8111-111111111111",
        STUDENT_ACTIVATION_CARD_REVOKE_REASON: "suspected_disclosure",
      }),
    ).toMatchObject({ revokeReason: "suspected_disclosure" });
    expect(() =>
      parseStudentActivationCardCliConfig({
        ...baseEnv,
        STUDENT_ACTIVATION_CARD_OPERATION: "revoke",
        STUDENT_ACTIVATION_CARD_REVOKE_BATCH_ID:
          "11111111-1111-4111-8111-111111111111",
        STUDENT_ACTIVATION_CARD_REVOKE_REASON: "A student lost it",
      }),
    ).toThrow(/must be one of/i);
  });

  it("writes mode 0600 with exclusive creation and never overwrites", async () => {
    const directory = await mkdtemp(join(tmpdir(), "activation-card-test-"));
    const outputPath = join(directory, "cards.pdf");
    const bytes = Buffer.from("%PDF-test-fixture");
    await writePrivatePdfExclusive(outputPath, bytes);
    expect((await stat(outputPath)).mode & 0o777).toBe(0o600);
    await expect(
      writePrivatePdfExclusive(outputPath, bytes),
    ).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(outputPath, "utf8")).toBe("%PDF-test-fixture");
  });

  it("does not delete a pre-existing file when exclusive creation fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "activation-card-test-"));
    const outputPath = join(directory, "cards.pdf");
    await writeFile(outputPath, "owner content", { mode: 0o600 });
    await expect(
      writePrivatePdfExclusive(outputPath, Buffer.from("replacement")),
    ).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(outputPath, "utf8")).toBe("owner content");
  });

  it("fsyncs a pending file and promotes it without an overwrite window", async () => {
    const directory = await mkdtemp(join(tmpdir(), "activation-card-test-"));
    const outputPath = join(directory, "cards.pdf");
    const pendingPath = `${outputPath}.pending`;
    const bytes = Buffer.from("%PDF-committed-fixture");
    await writePrivatePdfExclusive(pendingPath, bytes);
    await promotePrivatePdfExclusive(pendingPath, outputPath);
    expect(await readFile(outputPath, "utf8")).toBe("%PDF-committed-fixture");
    expect((await stat(outputPath)).mode & 0o777).toBe(0o600);
    await expect(stat(pendingPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("leaves the recoverable pending artifact intact when promotion loses a path race", async () => {
    const directory = await mkdtemp(join(tmpdir(), "activation-card-test-"));
    const outputPath = join(directory, "cards.pdf");
    const pendingPath = `${outputPath}.pending`;
    await writePrivatePdfExclusive(
      pendingPath,
      Buffer.from("%PDF-pending-fixture"),
    );
    await writePrivatePdfExclusive(
      outputPath,
      Buffer.from("%PDF-other-fixture"),
    );
    await expect(
      promotePrivatePdfExclusive(pendingPath, outputPath),
    ).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(pendingPath, "utf8")).toBe("%PDF-pending-fixture");
    expect(await readFile(outputPath, "utf8")).toBe("%PDF-other-fixture");
  });

  it("recovers a committed batch only from a matching private pending digest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "activation-card-test-"));
    const outputPath = join(directory, "cards.pdf");
    const pendingPath = `${outputPath}.pending`;
    const bytes = Buffer.from("%PDF-recovery-fixture");
    const expectedSha256 = createHash("sha256").update(bytes).digest("hex");
    await writePrivatePdfExclusive(pendingPath, bytes);
    await expect(
      recoverOrVerifyCommittedArtifact({ outputPath, expectedSha256 }),
    ).resolves.toEqual({ recovered: true });
    expect(await readFile(outputPath, "utf8")).toBe("%PDF-recovery-fixture");
    await expect(stat(pendingPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
