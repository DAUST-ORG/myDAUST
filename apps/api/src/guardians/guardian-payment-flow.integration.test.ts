import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@mydaust/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthService } from "../auth/auth.service.js";
import { FinanceService } from "../finance/finance.service.js";
import { PaymentSubmissionsService } from "../finance/payment-submissions.service.js";
import {
  RequestToPayRegistry,
  type RequestToPayProvider,
} from "../finance/request-to-pay.provider.js";
import { validateWireProof } from "../finance/wire-proof.storage.js";
import { GuardiansService } from "./guardians.service.js";

/**
 * Parent lifecycle and money-path integration test.
 *
 * A fresh PostgreSQL schema is migrated for every run. The test is skipped only
 * when neither TEST_DATABASE_URL nor DATABASE_URL is available, so the normal
 * unit suite stays usable without Docker while CI/staging can exercise real FKs,
 * cascades, unique constraints, and authorization joins.
 */
const SCHEMA = `guardian_flow_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

function databaseUrl(): string | null {
  const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) return null;
  const url = new URL(base);
  url.searchParams.set("schema", SCHEMA);
  return url.toString();
}

const DB_URL = databaseUrl();
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
let prisma: PrismaClient;
let guardians: GuardiansService;
let submissions: PaymentSubmissionsService;
let auth: AuthService;
let registrarId: string;
let studentIds: string[];
let invoiceIds: string[];
let outsider: { studentId: string; invoiceId: string };
const sentMail: { to: string | string[]; subject: string; html: string }[] = [];

const piSpiProvider: RequestToPayProvider = {
  name: "pi_spi",
  isConfigured: () => true,
  async verifyAlias(alias) {
    return { alias, name: "Guardian Payer", country: "SN" };
  },
  async requestPayment(input) {
    return {
      txId: input.txId,
      end2endId: `e2e-${input.txId}`,
      status: "sent",
      statusReason: null,
      payerName: "Guardian Payer",
      payerCountry: "SN",
      amount: input.amount,
    };
  },
  async confirmRequest(txId) {
    return {
      txId,
      end2endId: `e2e-${txId}`,
      status: "sent",
      statusReason: null,
      payerName: "Guardian Payer",
      payerCountry: "SN",
      amount: null,
    };
  },
  async getRequest() {
    return null;
  },
  verifyWebhook() {
    return { valid: false, events: [] };
  },
};

const proofFile = {
  fieldname: "proof",
  originalname: "wire-proof.pdf",
  encoding: "7bit",
  mimetype: "application/pdf",
  size: 18,
  buffer: Buffer.from("%PDF-1.4\n% test\n"),
  destination: "",
  filename: "",
  path: "",
  stream: undefined as never,
} satisfies Express.Multer.File;

function inviteToken(message: { html: string }): string {
  // The invite token now rides in the URL fragment, which a browser never sends
  // to a server, so the credential stays out of access logs and Referer headers.
  const match = message.html.match(/[?&#]token=([^"&<]+)/);
  if (!match?.[1]) throw new Error("Invite email did not contain a token");
  return decodeURIComponent(match[1]);
}

async function createStudent(label: string, termId: string) {
  const person = await prisma.person.create({
    data: {
      email: `${label.toLowerCase()}-${randomUUID()}@test.local`,
      firstName: label,
      lastName: "Student",
      kind: "student",
      roles: ["student"],
    },
  });
  const student = await prisma.student.create({
    data: {
      personId: person.id,
      studentNo: `${label.toUpperCase()}-${randomUUID().slice(0, 7)}`,
      recordStatus: "active",
    },
  });
  const invoice = await prisma.invoice.create({
    data: {
      studentId: student.id,
      termId,
      totalAmount: 100_000,
      description: `${label} annual fees`,
      costCenterCode: "9100",
      plan: {
        create: {
          installments: {
            create: {
              sequence: 1,
              label: "Registration",
              dueDate: new Date("2027-09-01T00:00:00.000Z"),
              amountDue: 100_000,
            },
          },
        },
      },
    },
  });
  return { studentId: student.id, invoiceId: invoice.id };
}

describe.skipIf(!DB_URL)("guardian account and payment lifecycle", () => {
  beforeAll(async () => {
    const url = DB_URL!;
    // Finance's request-to-pay TTL is loaded through the production env parser,
    // while Prisma itself uses the isolated URL passed to its constructor.
    process.env.DATABASE_URL = url;
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: new URL("../../../../packages/db", import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    });
    prisma = new PrismaClient({ datasources: { db: { url } } });

    await prisma.costCenter.createMany({
      data: [
        { code: "9100", name: "Tuition", type: "revenue" },
        { code: "3700", name: "Housing", type: "revenue" },
        { code: "3600", name: "Cafeteria", type: "revenue" },
      ],
      skipDuplicates: true,
    });
    const term = await prisma.term.create({
      data: {
        name: `Guardian Test ${randomUUID().slice(0, 8)}`,
        startDate: new Date("2027-08-20T00:00:00.000Z"),
        endDate: new Date("2027-12-20T00:00:00.000Z"),
        semester: "Fall",
        status: "active",
      },
    });
    const registrar = await prisma.person.create({
      data: {
        email: `registrar-${randomUUID()}@test.local`,
        firstName: "Flow",
        lastName: "Registrar",
        kind: "staff",
        roles: ["registrar"],
      },
    });
    registrarId = registrar.id;

    const first = await createStudent("Alpha", term.id);
    const second = await createStudent("Beta", term.id);
    outsider = await createStudent("Outside", term.id);
    studentIds = [first.studentId, second.studentId];
    invoiceIds = [first.invoiceId, second.invoiceId];

    await prisma.appSetting.create({
      data: {
        key: "wire_payment_config",
        valueJson: {
          enabled: true,
          bankName: "Test Bank",
          beneficiary: "DAUST",
          accountNumber: "TEST-001",
          iban: "",
          swift: "TESTSNDA",
          branch: "Dakar",
          instructions: "Use the student number as reference.",
          notificationRecipients: ["finance@test.local"],
        },
      },
    });

    const mail = {
      async send(message: {
        to: string | string[];
        subject: string;
        html: string;
      }) {
        sentMail.push(message);
        return { sent: true, id: randomUUID() };
      },
    };
    const proofStorage = {
      async put(file: Express.Multer.File) {
        const mime = validateWireProof(file);
        return { key: `test/${randomUUID()}.pdf`, mime };
      },
      async get() {
        return proofFile.buffer;
      },
    };
    const finance = new FinanceService(
      prisma as never,
      mail as never,
      proofStorage as never,
      new RequestToPayRegistry([piSpiProvider]),
    );
    await prisma.appSetting.upsert({
      where: { key: "payment_method_config" },
      create: {
        key: "payment_method_config",
        valueJson: {
          wave: {
            enabled: true,
            phoneNumber: "770000000",
            merchantNumber: "",
            instructions: "Pay DAUST",
            qrAsset: {
              objectKey: "test/qr.png",
              fileName: "qr.png",
              mimeType: "image/png",
              size: 8,
            },
          },
          orangeMoney: {
            enabled: true,
            phoneNumber: "780000000",
            merchantNumber: "DAUST",
            instructions: "Pay DAUST",
            qrAsset: {
              objectKey: "test/qr.png",
              fileName: "qr.png",
              mimeType: "image/png",
              size: 8,
            },
          },
          bank: {
            enabled: true,
            bankName: "Test Bank",
            beneficiary: "DAUST",
            accountNumber: "123",
            iban: "SN00",
            swift: "TESTSN",
            branch: "Dakar",
            instructions: "Use the reference",
          },
          notificationRecipients: ["finance@test.local"],
        },
      },
      update: {},
    });
    const paymentFiles = {
      async put(file: Express.Multer.File) {
        const mime = validateWireProof(file);
        return {
          objectKey: `payment-files/test/${randomUUID()}`,
          fileName: file.originalname,
          mimeType: mime,
          size: file.size,
        };
      },
      async get() {
        return proofFile.buffer;
      },
    };
    submissions = new PaymentSubmissionsService(
      prisma as never,
      paymentFiles as never,
      finance,
      mail as never,
    );
    guardians = new GuardiansService(
      prisma as never,
      mail as never,
      finance,
      submissions,
    );
    auth = new AuthService(prisma as never);
  }, 120_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await prisma.$disconnect();
    if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
  });

  it("invalidates an old invite on email change and atomically claims its replacement", async () => {
    const created = await guardians.create(registrarId, {
      fullName: "Pending Parent",
      email: `pending-${randomUUID()}@test.local`,
      studentIds: [studentIds[0]!],
    });
    expect(created.inviteDelivery).toBe("sent");
    const oldInvite = await prisma.guardianInvite.findFirstOrThrow({
      where: { guardianId: created.id, usedAt: null },
      orderBy: { createdAt: "desc" },
    });

    const replacement = await guardians.update(registrarId, created.id, {
      email: `replacement-${randomUUID()}@test.local`,
    });
    expect(replacement.inviteDelivery).toBe("sent");
    expect(
      (
        await prisma.guardianInvite.findUniqueOrThrow({
          where: { id: oldInvite.id },
        })
      ).usedAt,
    ).not.toBeNull();
    expect(
      await prisma.guardianInvite.count({
        where: { guardianId: created.id, usedAt: null },
      }),
    ).toBe(1);

    const replacementMessage = sentMail.at(-1);
    expect(replacementMessage?.to).toBe(replacement.email);
    const token = inviteToken(replacementMessage!);
    const passwords = [
      "Concurrent-parent-password-one",
      "Concurrent-parent-password-two",
    ];
    const redemptions = await Promise.allSettled(
      passwords.map((candidate) => guardians.redeemInvite(token, candidate)),
    );
    expect(
      redemptions.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      redemptions.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);

    const logins = await Promise.allSettled(
      passwords.map((candidate) =>
        auth.validateUser(replacement.email, candidate),
      ),
    );
    expect(
      logins.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    await expect(
      guardians.redeemInvite(token, "A-third-password-cannot-reset-it"),
    ).rejects.toThrow("invalid or has expired");
    await guardians.remove(registrarId, created.id);
  });

  it("runs invite, login, multi-child reads, every payment path, unlink, and deletion", async () => {
    const email = `family-${randomUUID()}@test.local`;
    const beforeMail = sentMail.length;
    const created = await guardians.create(registrarId, {
      fullName: "Family Guardian",
      email,
      studentIds: [studentIds[0]!],
      relation: "Guardian",
    });
    expect(created.inviteDelivery).toBe("sent");
    const token = inviteToken(sentMail[beforeMail]!);
    await guardians.redeemInvite(token, "Secure-parent-password-2027");
    const signedIn = await auth.validateUser(
      email,
      "Secure-parent-password-2027",
    );
    expect(signedIn).toMatchObject({ personId: created.id, roles: ["parent"] });

    expect(await guardians.myChildren(created.id)).toHaveLength(1);
    await guardians.setChildren(registrarId, created.id, studentIds);
    expect(await guardians.myChildren(created.id)).toHaveLength(2);
    await prisma.transcriptEntry.createMany({
      data: [
        {
          studentId: studentIds[0]!,
          source: "manual",
          courseCode: "CS 101",
          courseTitle: "Computing Foundations",
          termLabel: "Fall 2026",
          termSortKey: "2026-1",
          grade: "A",
          credits: 3,
          earnedCredits: 3,
          gradePoints: 4,
          countsTowardGpa: true,
          countsTowardCredits: true,
          createdById: registrarId,
        },
        {
          studentId: studentIds[0]!,
          source: "manual",
          courseCode: "MATH 102",
          courseTitle: "Calculus II",
          termLabel: "Spring 2027",
          termSortKey: "2026-2",
          grade: "I",
          credits: 3,
          earnedCredits: 0,
          gradePoints: null,
          countsTowardGpa: false,
          countsTowardCredits: false,
          createdById: registrarId,
        },
      ],
    });
    expect(
      (await guardians.myChildren(created.id)).find(
        (child) => child.studentId === studentIds[1],
      ),
    ).toMatchObject({ gpa: null, standing: "Not yet graded" });
    await expect(
      guardians.childAccount(created.id, studentIds[0]!),
    ).resolves.toBeTruthy();
    await expect(
      guardians.childAccount(created.id, studentIds[1]!),
    ).resolves.toBeTruthy();
    await expect(
      guardians.childGrades(created.id, studentIds[1]!),
    ).resolves.toMatchObject({ semesters: [], totals: { gpa: null } });
    const transcript = await guardians.childGrades(created.id, studentIds[0]!);
    expect(transcript.totals.gpa).toBe(4);
    expect(
      transcript.semesters.find((semester) => semester.label === "Spring 2027"),
    ).toMatchObject({ gpa: null, earnedCredits: 0 });
    await expect(
      guardians.childAttendance(created.id, studentIds[1]!),
    ).resolves.toMatchObject({ rows: [] });

    const actor = {
      personId: created.id,
      email,
      name: "Family Guardian",
      roles: ["parent" as const],
    };
    const checkout = await guardians.initiateChildPayment(
      actor,
      studentIds[0]!,
      { invoiceId: invoiceIds[0]!, amount: 100, method: "wave" },
    );
    expect(checkout).toMatchObject({
      status: "awaiting_proof",
      method: "wave",
    });

    const piSpi = await guardians.submitChildPiSpi(actor, studentIds[0]!, {
      invoiceId: invoiceIds[0]!,
      alias: "550e8400-e29b-41d4-a716-446655440000",
      amountXof: 100,
    });
    expect(
      await guardians.childPiSpiStatus(created.id, studentIds[0]!, piSpi.txId),
    ).toMatchObject({
      status: "sent",
      amountXof: 100,
    });

    const wire = await submissions.submitProof(checkout.id, proofFile, {
      resumeToken: checkout.resumeToken!,
    });
    expect(wire).toMatchObject({
      status: "submitted",
      amountXof: 100,
    });

    const initiated = await prisma.payment.findMany({
      where: { studentId: studentIds[0]! },
      orderBy: { createdAt: "asc" },
    });
    expect(initiated).toHaveLength(2);
    expect(
      initiated.every((payment) => payment.source === "parent_portal"),
    ).toBe(true);
    expect(
      initiated.every((payment) => payment.initiatedById === created.id),
    ).toBe(true);
    expect(
      initiated.every((payment) => payment.initiatedByEmail === email),
    ).toBe(true);
    expect(
      await prisma.paymentSubmission.findUniqueOrThrow({
        where: { id: wire.id },
      }),
    ).toMatchObject({
      source: "parent_portal",
      submittedById: created.id,
      submittedByEmail: email,
      contactEmail: email,
    });

    const manualPaymentId = (
      await prisma.paymentSubmission.findUniqueOrThrow({
        where: { id: checkout.id },
        select: { paymentId: true },
      })
    ).paymentId!;
    await prisma.payment.update({
      where: { id: manualPaymentId },
      data: { status: "success", settledAt: new Date() },
    });
    expect(
      await guardians.childPaymentStatus(
        created.id,
        studentIds[0]!,
        manualPaymentId,
      ),
    ).toMatchObject({ status: "success", source: "parent_portal" });
    const receipt = await guardians.childPaymentReceipt(
      created.id,
      studentIds[0]!,
      manualPaymentId,
    );
    expect(receipt).toMatchObject({
      id: manualPaymentId,
      studentNo: expect.any(String),
    });
    expect(receipt).not.toHaveProperty("initiatedByEmail");

    await expect(
      guardians.childAccount(created.id, outsider.studentId),
    ).rejects.toThrow("You do not have access");
    await expect(
      guardians.initiateChildPayment(actor, outsider.studentId, {
        invoiceId: outsider.invoiceId,
        amount: 100,
        method: "wave",
      }),
    ).rejects.toThrow("You do not have access");
    await expect(
      guardians.childPaymentReceipt(
        created.id,
        outsider.studentId,
        manualPaymentId,
      ),
    ).rejects.toThrow("You do not have access");

    const archived = await createStudent(
      "Archived",
      (
        await prisma.invoice.findUniqueOrThrow({
          where: { id: invoiceIds[0]! },
        })
      ).termId,
    );
    await prisma.student.update({
      where: { id: archived.studentId },
      data: { recordStatus: "archived" },
    });
    await expect(
      guardians.setChildren(registrarId, created.id, [archived.studentId]),
    ).rejects.toThrow("do not exist or are archived");

    await guardians.setChildren(registrarId, created.id, [studentIds[1]!]);
    await expect(
      guardians.childAccount(created.id, studentIds[0]!),
    ).rejects.toThrow("You do not have access");
    await guardians.remove(registrarId, created.id);
    expect(
      await prisma.person.findUnique({ where: { id: created.id } }),
    ).toBeNull();
    await expect(
      prisma.auditLog.findFirstOrThrow({
        where: {
          entity: "Person",
          entityId: created.id,
          action: "guardian-deleted",
          actorId: registrarId,
        },
      }),
    ).resolves.toBeTruthy();
  });
});
