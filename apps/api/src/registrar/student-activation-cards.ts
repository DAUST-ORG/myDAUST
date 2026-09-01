import type { PrismaClient } from "@mydaust/db";
import { Prisma } from "@mydaust/db";
import {
  encodeStudentActivationCode,
  normalizeStudentActivationCode,
} from "@mydaust/shared";
import fontkit from "@pdf-lib/fontkit";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PDFDocument, type PDFFont, type PDFPage, rgb } from "pdf-lib";

export const STUDENT_ACTIVATION_CARD_TTL_MS = 24 * 60 * 60_000;
export const STUDENT_ACTIVATION_CARD_CODE_CONTEXT =
  "mydaust:student-activation-card-code:v1\0";
export const STUDENT_ACTIVATION_CARD_PLAN_VERSION = 1;
export const DEFAULT_STUDENT_ACTIVATION_URL =
  "https://my.daust.net/activate-student";
export const STUDENT_ACTIVATION_URL_ALLOWLIST = [
  DEFAULT_STUDENT_ACTIVATION_URL,
  "https://daust-staging.azt.dev/activate-student",
] as const;
export const STUDENT_ACTIVATION_CARD_REVOKE_REASONS = [
  "lost_artifact",
  "misprint",
  "operator_error",
  "suspected_disclosure",
  "superseded",
  "security_response",
] as const;
export type StudentActivationCardRevokeReason =
  (typeof STUDENT_ACTIVATION_CARD_REVOKE_REASONS)[number];

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const PAGE_MARGIN = 22;
const CARD_GAP = 12;
const CARD_COLUMNS = 2;
const CARD_ROWS = 4;
const CARDS_PER_PAGE = CARD_COLUMNS * CARD_ROWS;
const CARD_WIDTH = (PAGE_WIDTH - PAGE_MARGIN * 2 - CARD_GAP) / 2;
const CARD_HEIGHT =
  (PAGE_HEIGHT - PAGE_MARGIN * 2 - CARD_GAP * (CARD_ROWS - 1)) / CARD_ROWS;
const REGULAR_FONT_PATH = resolve(
  __dirname,
  "../transcript/assets/Saira-Regular.ttf",
);
const BOLD_FONT_PATH = resolve(
  __dirname,
  "../transcript/assets/Saira-Bold.ttf",
);
const NAVY = rgb(0.059, 0.173, 0.314);
const ORANGE = rgb(0.929, 0.424, 0.078);
const INK = rgb(0.08, 0.11, 0.15);
const MUTED = rgb(0.33, 0.38, 0.44);
const BORDER = rgb(0.78, 0.82, 0.86);
const PALE = rgb(0.955, 0.968, 0.982);
const WHITE = rgb(1, 1, 1);

type ActivationCardReadClient = Pick<
  Prisma.TransactionClient,
  "person" | "student" | "studentActivationCardBatch"
>;

export class StudentActivationCardBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudentActivationCardBlockedError";
  }
}

export interface ActivationCardCandidate {
  studentId: string;
  studentPersonId: string;
  studentNo: string;
  dateOfBirth: string;
  name: string;
  loginEmail: string;
}

export interface StudentActivationCardStudentSnapshot {
  id: string;
  personId: string;
  studentNo: string;
  dateOfBirth: Date | null;
  recordStatus: string;
  person: {
    email: string | null;
    firstName: string;
    lastName: string;
    kind: string;
    roles: string[];
    status: string;
    passwordHash: string | null;
    mustChangePassword: boolean;
    studentInvites: Array<{
      id: string;
      expiresAt: Date;
      usedAt: Date | null;
    }>;
    studentActivationCards: Array<{
      id: string;
      expiresAt: Date;
      failedAttempts: number;
      claimedAt: Date | null;
      usedAt: Date | null;
      revokedAt: Date | null;
      batch: {
        id: string;
        status: string;
        expiresAt: Date;
        revokedAt: Date | null;
      };
    }>;
  };
}

export interface StudentActivationCardGenerationPlan {
  schemaVersion: number;
  capturedAt: string;
  actorId: string;
  activationUrl: string;
  activeStudentCount: number;
  exactPasswordlessStudentCount: number;
  eligibleCount: number;
  excludedCount: number;
  expiredCardCleanupCount: number;
  blockerCounts: Record<string, number>;
  eligibilitySnapshotSha256: string;
  planSha256: string;
  candidates: ActivationCardCandidate[];
}

export interface IssuedActivationCard extends ActivationCardCandidate {
  canonicalCode: string;
  displayCode: string;
  codeHmacSha256: string;
  boundEmailSha256: string;
}

export interface ActivationCardRevocationPlan {
  schemaVersion: number;
  capturedAt: string;
  actorId: string;
  batchId: string;
  reason: StudentActivationCardRevokeReason;
  batchStatus: string;
  alreadyRevoked: boolean;
  unusedCardCount: number;
  usedCardCount: number;
  linkedUnconsumedRequestCount: number;
  linkedUnusedInviteCount: number;
  stateSnapshotSha256: string;
  planSha256: string;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function isValidLoginEmail(value: string): boolean {
  return (
    value.length <= 320 &&
    value.trim() === value &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function isAuthorizedActivationCardOperator(person: {
  kind: string;
  roles: string[];
  status: string;
}): boolean {
  return (
    person.status === "active" &&
    person.kind === "staff" &&
    person.roles.some((role) => ["admin", "registrar"].includes(role))
  );
}

function snapshotAnchor(students: StudentActivationCardStudentSnapshot[]) {
  return students.map((student) => ({
    studentId: student.id,
    personId: student.personId,
    studentNoSha256: sha256(student.studentNo),
    dateOfBirth: student.dateOfBirth?.toISOString() ?? null,
    recordStatus: student.recordStatus,
    person: {
      emailSha256: student.person.email
        ? sha256(student.person.email.toLowerCase())
        : null,
      firstNameSha256: sha256(student.person.firstName),
      lastNameSha256: sha256(student.person.lastName),
      kind: student.person.kind,
      roles: [...student.person.roles],
      status: student.person.status,
      hasPassword: student.person.passwordHash !== null,
      mustChangePassword: student.person.mustChangePassword,
      invites: student.person.studentInvites
        .map((invite) => ({
          id: invite.id,
          expiresAt: invite.expiresAt.toISOString(),
          usedAt: invite.usedAt?.toISOString() ?? null,
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      cards: student.person.studentActivationCards
        .map((card) => ({
          id: card.id,
          expiresAt: card.expiresAt.toISOString(),
          failedAttempts: card.failedAttempts,
          claimedAt: card.claimedAt?.toISOString() ?? null,
          usedAt: card.usedAt?.toISOString() ?? null,
          revokedAt: card.revokedAt?.toISOString() ?? null,
          batch: {
            id: card.batch.id,
            status: card.batch.status,
            expiresAt: card.batch.expiresAt.toISOString(),
            revokedAt: card.batch.revokedAt?.toISOString() ?? null,
          },
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    },
  }));
}

export function buildStudentActivationCardGenerationPlan(input: {
  students: StudentActivationCardStudentSnapshot[];
  caseInsensitiveEmailCounts: ReadonlyMap<string, number>;
  actorId: string;
  activationUrl: string;
  capturedAt: Date;
}): StudentActivationCardGenerationPlan {
  const students = [...input.students].sort((left, right) =>
    left.studentNo.localeCompare(right.studentNo),
  );
  const nowMs = input.capturedAt.getTime();
  const blockerCounts: Record<string, number> = {};
  const candidates: ActivationCardCandidate[] = [];
  let exactPasswordlessStudentCount = 0;
  let excludedCount = 0;
  let expiredCardCleanupCount = 0;

  for (const student of students) {
    const person = student.person;
    const exactPasswordlessStudent =
      student.recordStatus === "active" &&
      person.status === "active" &&
      person.kind === "student" &&
      person.roles.length === 1 &&
      person.roles[0] === "student" &&
      person.passwordHash === null &&
      person.mustChangePassword === false;
    if (!exactPasswordlessStudent) {
      excludedCount += 1;
      continue;
    }
    exactPasswordlessStudentCount += 1;

    if (!student.dateOfBirth) {
      increment(blockerCounts, "missing_date_of_birth");
      continue;
    }
    const loginEmail = person.email ?? "";
    if (!isValidLoginEmail(loginEmail)) {
      increment(blockerCounts, "invalid_login_email");
      continue;
    }
    if (input.caseInsensitiveEmailCounts.get(loginEmail.toLowerCase()) !== 1) {
      increment(blockerCounts, "non_unique_login_email");
      continue;
    }
    if (
      person.studentInvites.some(
        (invite) => !invite.usedAt && invite.expiresAt.getTime() > nowMs,
      )
    ) {
      increment(blockerCounts, "active_setup_invite");
      continue;
    }
    if (
      person.studentActivationCards.some(
        (card) =>
          !card.usedAt &&
          !card.revokedAt &&
          card.expiresAt.getTime() > nowMs &&
          card.batch.status === "active" &&
          !card.batch.revokedAt &&
          card.batch.expiresAt.getTime() > nowMs,
      )
    ) {
      increment(blockerCounts, "active_activation_card");
      continue;
    }
    expiredCardCleanupCount += person.studentActivationCards.filter(
      (card) =>
        !card.usedAt &&
        !card.revokedAt &&
        (card.expiresAt.getTime() <= nowMs ||
          card.batch.status !== "active" ||
          !!card.batch.revokedAt ||
          card.batch.expiresAt.getTime() <= nowMs),
    ).length;
    candidates.push({
      studentId: student.id,
      studentPersonId: student.personId,
      studentNo: student.studentNo,
      dateOfBirth: dateKey(student.dateOfBirth),
      name: `${person.firstName} ${person.lastName}`.trim(),
      loginEmail,
    });
  }

  const eligibilitySnapshotSha256 = sha256(
    canonicalJson(snapshotAnchor(students)),
  );
  const planAnchor = {
    schemaVersion: STUDENT_ACTIVATION_CARD_PLAN_VERSION,
    operation: "generate",
    actorId: input.actorId,
    activationUrl: input.activationUrl,
    activeStudentCount: students.length,
    exactPasswordlessStudentCount,
    eligibleCount: candidates.length,
    excludedCount,
    expiredCardCleanupCount,
    blockerCounts,
    eligibilitySnapshotSha256,
    eligibleStudentPersonIds: candidates.map(
      (candidate) => candidate.studentPersonId,
    ),
  };
  return {
    ...planAnchor,
    capturedAt: input.capturedAt.toISOString(),
    planSha256: sha256(canonicalJson(planAnchor)),
    candidates,
  };
}

async function loadOperator(db: ActivationCardReadClient, actorEmail: string) {
  const actors = await db.person.findMany({
    where: { email: { equals: actorEmail, mode: "insensitive" } },
    select: { id: true, kind: true, roles: true, status: true },
    take: 2,
  });
  const actor = actors[0];
  if (
    actors.length !== 1 ||
    !actor ||
    !isAuthorizedActivationCardOperator(actor)
  ) {
    throw new StudentActivationCardBlockedError(
      "Activation-card operator is not one unique active authorized staff account",
    );
  }
  return actor;
}

export async function planStudentActivationCardGeneration(
  db: ActivationCardReadClient,
  input: {
    actorEmail: string;
    activationUrl: string;
    capturedAt?: Date;
  },
): Promise<StudentActivationCardGenerationPlan> {
  const capturedAt = input.capturedAt ?? new Date();
  const [actor, students, emailRows] = await Promise.all([
    loadOperator(db, input.actorEmail),
    db.student.findMany({
      where: { recordStatus: "active" },
      select: {
        id: true,
        personId: true,
        studentNo: true,
        dateOfBirth: true,
        recordStatus: true,
        person: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
            kind: true,
            roles: true,
            status: true,
            passwordHash: true,
            mustChangePassword: true,
            studentInvites: {
              where: { usedAt: null },
              select: { id: true, expiresAt: true, usedAt: true },
            },
            studentActivationCards: {
              select: {
                id: true,
                expiresAt: true,
                failedAttempts: true,
                claimedAt: true,
                usedAt: true,
                revokedAt: true,
                batch: {
                  select: {
                    id: true,
                    status: true,
                    expiresAt: true,
                    revokedAt: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ studentNo: "asc" }, { id: "asc" }],
    }),
    db.person.findMany({
      where: { email: { not: null } },
      select: { email: true },
    }),
  ]);
  const emailCounts = new Map<string, number>();
  for (const row of emailRows) {
    if (!row.email) continue;
    const key = row.email.toLowerCase();
    emailCounts.set(key, (emailCounts.get(key) ?? 0) + 1);
  }
  return buildStudentActivationCardGenerationPlan({
    students,
    caseInsensitiveEmailCounts: emailCounts,
    actorId: actor.id,
    activationUrl: input.activationUrl,
    capturedAt,
  });
}

export function generationPlanSummary(
  plan: StudentActivationCardGenerationPlan,
) {
  return {
    schemaVersion: plan.schemaVersion,
    capturedAt: plan.capturedAt,
    activationUrl: plan.activationUrl,
    activeStudentCount: plan.activeStudentCount,
    exactPasswordlessStudentCount: plan.exactPasswordlessStudentCount,
    eligibleCount: plan.eligibleCount,
    excludedCount: plan.excludedCount,
    expiredCardCleanupCount: plan.expiredCardCleanupCount,
    blockerCounts: plan.blockerCounts,
    eligibilitySnapshotSha256: plan.eligibilitySnapshotSha256,
    planSha256: plan.planSha256,
    actor: "<authorized>",
  };
}

export function assertCleanGenerationPlan(
  plan: StudentActivationCardGenerationPlan,
): void {
  const blockerCount = Object.values(plan.blockerCounts).reduce(
    (sum, count) => sum + count,
    0,
  );
  if (blockerCount > 0) {
    throw new StudentActivationCardBlockedError(
      "Activation-card generation plan has blockers",
    );
  }
  if (plan.eligibleCount === 0) {
    throw new StudentActivationCardBlockedError(
      "Activation-card generation plan has no eligible students",
    );
  }
}

export function activationCardCodeHmac(
  canonicalCode: string,
  key: Uint8Array,
): string {
  const normalized = normalizeStudentActivationCode(canonicalCode);
  if (!normalized || normalized !== canonicalCode) {
    throw new StudentActivationCardBlockedError(
      "Activation-card code is not canonical",
    );
  }
  if (key.length !== 32) {
    throw new StudentActivationCardBlockedError(
      "Activation-card HMAC key must contain exactly 32 bytes",
    );
  }
  return createHmac("sha256", key)
    .update(STUDENT_ACTIVATION_CARD_CODE_CONTEXT)
    .update(canonicalCode)
    .digest("hex");
}

export function formatStudentActivationCode(canonicalCode: string): string {
  if (normalizeStudentActivationCode(canonicalCode) !== canonicalCode) {
    throw new StudentActivationCardBlockedError(
      "Activation-card code is not canonical",
    );
  }
  return canonicalCode.match(/.{1,4}/g)!.join("-");
}

export function issueActivationCards(
  plan: StudentActivationCardGenerationPlan,
  key: Uint8Array,
  randomSource: (size: number) => Uint8Array = randomBytes,
): IssuedActivationCard[] {
  assertCleanGenerationPlan(plan);
  const issued: IssuedActivationCard[] = [];
  const seen = new Set<string>();
  for (const candidate of plan.candidates) {
    let canonicalCode = "";
    for (let attempt = 0; attempt < 20; attempt += 1) {
      canonicalCode = encodeStudentActivationCode(randomSource(10));
      if (!seen.has(canonicalCode)) break;
      canonicalCode = "";
    }
    if (!canonicalCode) {
      throw new StudentActivationCardBlockedError(
        "Could not generate a unique activation-card code",
      );
    }
    seen.add(canonicalCode);
    issued.push({
      ...candidate,
      canonicalCode,
      displayCode: formatStudentActivationCode(canonicalCode),
      codeHmacSha256: activationCardCodeHmac(canonicalCode, key),
      boundEmailSha256: sha256(candidate.loginEmail),
    });
  }
  return issued;
}

function wrapText(
  font: PDFFont,
  value: string,
  size: number,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const pushLongWord = (word: string) => {
    let chunk = "";
    for (const character of word) {
      const next = chunk + character;
      if (chunk && font.widthOfTextAtSize(next, size) > maxWidth) {
        lines.push(chunk);
        chunk = character;
      } else {
        chunk = next;
      }
      if (lines.length >= maxLines) break;
    }
    line = chunk;
  };
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    if (lines.length >= maxLines) break;
    if (font.widthOfTextAtSize(word, size) <= maxWidth) line = word;
    else pushLongWord(word);
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.join(" ").replace(/\s/g, "") !== value.replace(/\s/g, "")) {
    throw new StudentActivationCardBlockedError(
      "Activation-card identity text does not fit the print layout",
    );
  }
  return lines;
}

function drawLines(
  page: PDFPage,
  font: PDFFont,
  lines: string[],
  options: {
    x: number;
    y: number;
    size: number;
    color: ReturnType<typeof rgb>;
    lineHeight: number;
  },
): number {
  let y = options.y;
  for (const line of lines) {
    page.drawText(line, {
      x: options.x,
      y,
      size: options.size,
      font,
      color: options.color,
    });
    y -= options.lineHeight;
  }
  return y;
}

function formatExpiry(expiresAt: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Dakar",
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(expiresAt);
}

function drawActivationCard(
  page: PDFPage,
  card: IssuedActivationCard,
  fonts: { regular: PDFFont; bold: PDFFont },
  box: { x: number; y: number; width: number; height: number },
  input: {
    activationUrl: string;
    expiresAt: Date;
    planSha256: string;
  },
): void {
  page.drawRectangle({
    ...box,
    borderColor: BORDER,
    borderWidth: 0.8,
    color: WHITE,
  });
  const headerHeight = 32;
  page.drawRectangle({
    x: box.x,
    y: box.y + box.height - headerHeight,
    width: box.width,
    height: headerHeight,
    color: NAVY,
  });
  page.drawRectangle({
    x: box.x,
    y: box.y + box.height - headerHeight,
    width: box.width,
    height: 4,
    color: ORANGE,
  });
  page.drawText("DAUST", {
    x: box.x + 12,
    y: box.y + box.height - 16,
    size: 11.5,
    font: fonts.bold,
    color: WHITE,
  });
  page.drawText("STUDENT ACCOUNT ACTIVATION", {
    x: box.x + 12,
    y: box.y + box.height - 27,
    size: 5.8,
    font: fonts.regular,
    color: WHITE,
  });

  const innerX = box.x + 12;
  const innerWidth = box.width - 24;
  const top = box.y + box.height;
  page.drawText("STUDENT", {
    x: innerX,
    y: top - 44,
    size: 5.4,
    font: fonts.bold,
    color: MUTED,
  });
  drawLines(
    page,
    fonts.bold,
    wrapText(fonts.bold, card.name, 8.2, innerWidth, 2),
    {
      x: innerX,
      y: top - 56,
      size: 8.2,
      color: INK,
      lineHeight: 9.5,
    },
  );
  page.drawText(`Student ID  ${card.studentNo}`, {
    x: innerX,
    y: top - 82,
    size: 6.8,
    font: fonts.regular,
    color: INK,
  });

  page.drawRectangle({
    x: innerX,
    y: box.y + 70,
    width: innerWidth,
    height: 38,
    color: PALE,
    borderColor: BORDER,
    borderWidth: 0.5,
  });
  page.drawText("ONE-TIME ACTIVATION CODE", {
    x: innerX + 8,
    y: box.y + 96,
    size: 5.4,
    font: fonts.bold,
    color: MUTED,
  });
  page.drawText(card.displayCode, {
    x: innerX + 8,
    y: box.y + 78,
    size: 11.8,
    font: fonts.bold,
    color: NAVY,
  });
  page.drawText(input.activationUrl.replace(/^https?:\/\//, ""), {
    x: innerX,
    y: box.y + 58,
    size: 6.5,
    font: fonts.bold,
    color: NAVY,
  });
  const instructions = [
    "1  Open the URL above.",
    "2  Enter Student ID, date of birth, and this code.",
    "3  Choose a private password; your login appears next.",
  ];
  instructions.forEach((instruction, index) => {
    page.drawText(instruction, {
      x: innerX,
      y: box.y + 46 - index * 9,
      size: 5.45,
      font: fonts.regular,
      color: INK,
    });
  });
  page.drawText(`Valid until ${formatExpiry(input.expiresAt)} (Dakar time)`, {
    x: innerX,
    y: box.y + 16,
    size: 5.6,
    font: fonts.bold,
    color: ORANGE,
  });
  page.drawText(
    `Keep this card private • Plan ${input.planSha256.slice(0, 10)}`,
    {
      x: innerX,
      y: box.y + 6,
      size: 4.7,
      font: fonts.regular,
      color: MUTED,
    },
  );
}

export function studentActivationCardPdfPageCount(cardCount: number): number {
  if (!Number.isInteger(cardCount) || cardCount < 0) {
    throw new StudentActivationCardBlockedError(
      "Activation-card PDF count must be a non-negative integer",
    );
  }
  return Math.ceil(cardCount / CARDS_PER_PAGE);
}

export async function renderStudentActivationCardsPdf(input: {
  cards: IssuedActivationCard[];
  activationUrl: string;
  issuedAt: Date;
  expiresAt: Date;
  planSha256: string;
}): Promise<{ bytes: Uint8Array; pageCount: number }> {
  if (input.cards.length === 0) {
    throw new StudentActivationCardBlockedError(
      "Cannot render an empty activation-card artifact",
    );
  }
  const [regularBytes, boldBytes] = await Promise.all([
    readFile(REGULAR_FONT_PATH),
    readFile(BOLD_FONT_PATH),
  ]);
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  document.setTitle("DAUST student account activation cards");
  document.setAuthor("Dakar American University of Science & Technology");
  document.setSubject("Confidential one-time student activation cards");
  document.setCreator("myDAUST operator CLI");
  document.setProducer("myDAUST");
  document.setCreationDate(input.issuedAt);
  document.setModificationDate(input.issuedAt);
  const fonts = {
    regular: await document.embedFont(regularBytes, { subset: true }),
    bold: await document.embedFont(boldBytes, { subset: true }),
  };
  const sorted = [...input.cards].sort((left, right) =>
    left.studentNo.localeCompare(right.studentNo),
  );
  const pageCount = studentActivationCardPdfPageCount(sorted.length);
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    for (let slot = 0; slot < CARDS_PER_PAGE; slot += 1) {
      const card = sorted[pageIndex * CARDS_PER_PAGE + slot];
      if (!card) break;
      const column = slot % 2;
      const row = Math.floor(slot / 2);
      const x = PAGE_MARGIN + column * (CARD_WIDTH + CARD_GAP);
      const y =
        PAGE_HEIGHT -
        PAGE_MARGIN -
        CARD_HEIGHT -
        row * (CARD_HEIGHT + CARD_GAP);
      drawActivationCard(
        page,
        card,
        fonts,
        { x, y, width: CARD_WIDTH, height: CARD_HEIGHT },
        input,
      );
    }
    page.drawText(`Page ${pageIndex + 1} of ${pageCount}`, {
      x: PAGE_WIDTH / 2 - 18,
      y: 7,
      size: 5.5,
      font: fonts.regular,
      color: MUTED,
    });
  }
  return { bytes: await document.save(), pageCount };
}

export async function findGeneratedBatchByPlan(
  db: ActivationCardReadClient,
  planSha256: string,
) {
  return db.studentActivationCardBatch.findUnique({
    where: { confirmationPlanSha256: planSha256 },
    select: {
      id: true,
      generatedCount: true,
      outputSha256: true,
      expiresAt: true,
      status: true,
      revokedAt: true,
    },
  });
}

export async function executeStudentActivationCardGeneration(
  prisma: PrismaClient,
  input: {
    actorEmail: string;
    activationUrl: string;
    expectedPlanSha256: string;
    plan: StudentActivationCardGenerationPlan;
    issuedCards: IssuedActivationCard[];
    issuedAt: Date;
    expiresAt: Date;
    outputSha256: string;
    pageCount: number;
  },
) {
  if (
    input.expiresAt.getTime() - input.issuedAt.getTime() !==
    STUDENT_ACTIVATION_CARD_TTL_MS
  ) {
    throw new StudentActivationCardBlockedError(
      "Activation-card expiry must be exactly 24 hours after issuance",
    );
  }
  if (
    input.plan.planSha256 !== input.expectedPlanSha256 ||
    input.issuedCards.length !== input.plan.eligibleCount
  ) {
    throw new StudentActivationCardBlockedError(
      "Activation-card confirmation does not match the reviewed plan",
    );
  }
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT 1 AS "locked"
        FROM (
          SELECT pg_advisory_xact_lock(
            hashtext('mydaust:student-activation-card-generation:v1')
          )
        ) AS generation_lock
      `);
      const existing = await findGeneratedBatchByPlan(
        tx,
        input.expectedPlanSha256,
      );
      if (existing) return { alreadyGenerated: true as const, ...existing };

      const reviewedPersonIds = input.plan.candidates
        .map((candidate) => candidate.studentPersonId)
        .sort();
      const lockedStudents = await tx.$queryRaw<
        Array<{ id: string; personId: string }>
      >(Prisma.sql`
        SELECT "id", "personId"
        FROM "Student"
        WHERE "personId" IN (${Prisma.join(reviewedPersonIds)})
        ORDER BY "personId" ASC
        FOR UPDATE
      `);
      if (lockedStudents.length !== reviewedPersonIds.length) {
        throw new StudentActivationCardBlockedError(
          "Reviewed student population changed before confirmation",
        );
      }
      const lockedPeople = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`
          SELECT "id"
          FROM "Person"
          WHERE "id" IN (${Prisma.join(reviewedPersonIds)})
          ORDER BY "id" ASC
          FOR UPDATE
        `,
      );
      if (lockedPeople.length !== reviewedPersonIds.length) {
        throw new StudentActivationCardBlockedError(
          "Reviewed student identities changed before confirmation",
        );
      }

      const current = await planStudentActivationCardGeneration(tx, {
        actorEmail: input.actorEmail,
        activationUrl: input.activationUrl,
        capturedAt: input.issuedAt,
      });
      assertCleanGenerationPlan(current);
      if (current.planSha256 !== input.expectedPlanSha256) {
        throw new StudentActivationCardBlockedError(
          "Live eligibility changed after the reviewed dry run",
        );
      }
      const expectedPeople = current.candidates.map(
        (candidate) => candidate.studentPersonId,
      );
      const issuedPeople = input.issuedCards.map(
        (candidate) => candidate.studentPersonId,
      );
      if (canonicalJson(expectedPeople) !== canonicalJson(issuedPeople)) {
        throw new StudentActivationCardBlockedError(
          "Issued-card identities do not match the reviewed plan",
        );
      }

      const expiredCardsRevoked = await tx.studentActivationCard.updateMany({
        where: {
          studentPersonId: { in: expectedPeople },
          usedAt: null,
          revokedAt: null,
          OR: [
            { expiresAt: { lte: input.issuedAt } },
            { batch: { status: { not: "active" } } },
            { batch: { revokedAt: { not: null } } },
            { batch: { expiresAt: { lte: input.issuedAt } } },
          ],
        },
        data: { revokedAt: input.issuedAt },
      });
      if (expiredCardsRevoked.count !== current.expiredCardCleanupCount) {
        throw new StudentActivationCardBlockedError(
          "Reviewed expired-card cleanup changed before confirmation",
        );
      }

      const batch = await tx.studentActivationCardBatch.create({
        data: {
          confirmationPlanSha256: input.expectedPlanSha256,
          eligibilitySnapshotSha256: current.eligibilitySnapshotSha256,
          expiresAt: input.expiresAt,
          eligibleCount: current.eligibleCount,
          generatedCount: input.issuedCards.length,
          outputSha256: input.outputSha256,
          status: "active",
          createdById: current.actorId,
          createdAt: input.issuedAt,
          items: {
            create: input.issuedCards.map((card) => ({
              studentPersonId: card.studentPersonId,
              codeHmacSha256: card.codeHmacSha256,
              boundEmailSha256: card.boundEmailSha256,
              expiresAt: input.expiresAt,
              createdAt: input.issuedAt,
            })),
          },
        },
        select: { id: true, generatedCount: true, expiresAt: true },
      });
      await tx.auditLog.create({
        data: {
          entity: "StudentActivationCardBatch",
          entityId: batch.id,
          action: "student-activation-cards-generated",
          actorId: current.actorId,
          data: {
            generatedCount: batch.generatedCount,
            expiresAt: batch.expiresAt.toISOString(),
            confirmationPlanSha256: input.expectedPlanSha256,
            eligibilitySnapshotSha256: current.eligibilitySnapshotSha256,
            outputSha256: input.outputSha256,
            pageCount: input.pageCount,
            expiredCardsRevoked: expiredCardsRevoked.count,
            plaintextDisclosure: "mode_0600_operator_pdf_only",
          },
        },
      });
      return {
        alreadyGenerated: false as const,
        id: batch.id,
        generatedCount: batch.generatedCount,
        expiresAt: batch.expiresAt,
        outputSha256: input.outputSha256,
        status: "active",
        revokedAt: null,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 60_000,
    },
  );
}

export async function planStudentActivationCardRevocation(
  db: ActivationCardReadClient,
  input: {
    actorEmail: string;
    batchId: string;
    reason: StudentActivationCardRevokeReason;
    capturedAt?: Date;
  },
): Promise<ActivationCardRevocationPlan> {
  const capturedAt = input.capturedAt ?? new Date();
  const actor = await loadOperator(db, input.actorEmail);
  const batch = await db.studentActivationCardBatch.findUnique({
    where: { id: input.batchId },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      revokedAt: true,
      revokedById: true,
      revokeReason: true,
      items: {
        select: {
          id: true,
          studentPersonId: true,
          expiresAt: true,
          failedAttempts: true,
          claimedAt: true,
          usedAt: true,
          revokedAt: true,
          activationRequest: {
            select: {
              id: true,
              consumedAt: true,
              invalidatedAt: true,
              studentInvite: {
                select: { id: true, expiresAt: true, usedAt: true },
              },
            },
          },
        },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!batch) {
    throw new StudentActivationCardBlockedError(
      "Activation-card batch does not exist",
    );
  }
  const unusedCardCount = batch.items.filter(
    (item) => !item.usedAt && !item.revokedAt,
  ).length;
  const usedCardCount = batch.items.filter((item) => !!item.usedAt).length;
  const linkedUnconsumedRequestCount = batch.items.filter(
    (item) =>
      item.activationRequest &&
      !item.activationRequest.consumedAt &&
      !item.activationRequest.invalidatedAt,
  ).length;
  const linkedUnusedInviteCount = batch.items.filter((item) => {
    const invite = item.activationRequest?.studentInvite;
    return invite && !invite.usedAt && invite.expiresAt >= capturedAt;
  }).length;
  const stateAnchor = {
    batch: {
      id: batch.id,
      status: batch.status,
      expiresAt: batch.expiresAt.toISOString(),
      revokedAt: batch.revokedAt?.toISOString() ?? null,
      revokedById: batch.revokedById,
      revokeReasonSha256: batch.revokeReason
        ? sha256(batch.revokeReason)
        : null,
    },
    items: batch.items.map((item) => ({
      id: item.id,
      studentPersonId: item.studentPersonId,
      expiresAt: item.expiresAt.toISOString(),
      failedAttempts: item.failedAttempts,
      claimedAt: item.claimedAt?.toISOString() ?? null,
      usedAt: item.usedAt?.toISOString() ?? null,
      revokedAt: item.revokedAt?.toISOString() ?? null,
      request: item.activationRequest
        ? {
            id: item.activationRequest.id,
            consumedAt:
              item.activationRequest.consumedAt?.toISOString() ?? null,
            invalidatedAt:
              item.activationRequest.invalidatedAt?.toISOString() ?? null,
            invite: item.activationRequest.studentInvite
              ? {
                  id: item.activationRequest.studentInvite.id,
                  expiresAt:
                    item.activationRequest.studentInvite.expiresAt.toISOString(),
                  usedAt:
                    item.activationRequest.studentInvite.usedAt?.toISOString() ??
                    null,
                }
              : null,
          }
        : null,
    })),
  };
  const stateSnapshotSha256 = sha256(canonicalJson(stateAnchor));
  const planAnchor = {
    schemaVersion: STUDENT_ACTIVATION_CARD_PLAN_VERSION,
    operation: "revoke",
    actorId: actor.id,
    batchId: batch.id,
    reasonSha256: sha256(input.reason),
    batchStatus: batch.status,
    alreadyRevoked: batch.status === "revoked" || !!batch.revokedAt,
    unusedCardCount,
    usedCardCount,
    linkedUnconsumedRequestCount,
    linkedUnusedInviteCount,
    stateSnapshotSha256,
  };
  return {
    schemaVersion: STUDENT_ACTIVATION_CARD_PLAN_VERSION,
    capturedAt: capturedAt.toISOString(),
    actorId: actor.id,
    batchId: batch.id,
    reason: input.reason,
    batchStatus: batch.status,
    alreadyRevoked: planAnchor.alreadyRevoked,
    unusedCardCount,
    usedCardCount,
    linkedUnconsumedRequestCount,
    linkedUnusedInviteCount,
    stateSnapshotSha256,
    planSha256: sha256(canonicalJson(planAnchor)),
  };
}

export function revocationPlanSummary(plan: ActivationCardRevocationPlan) {
  return {
    schemaVersion: plan.schemaVersion,
    capturedAt: plan.capturedAt,
    batchStatus: plan.batchStatus,
    alreadyRevoked: plan.alreadyRevoked,
    unusedCardCount: plan.unusedCardCount,
    usedCardCount: plan.usedCardCount,
    linkedUnconsumedRequestCount: plan.linkedUnconsumedRequestCount,
    linkedUnusedInviteCount: plan.linkedUnusedInviteCount,
    stateSnapshotSha256: plan.stateSnapshotSha256,
    planSha256: plan.planSha256,
    actor: "<authorized>",
  };
}

export async function executeStudentActivationCardRevocation(
  prisma: PrismaClient,
  input: {
    actorEmail: string;
    batchId: string;
    reason: StudentActivationCardRevokeReason;
    expectedPlanSha256: string;
    revokedAt?: Date;
  },
) {
  const revokedAt = input.revokedAt ?? new Date();
  return prisma.$transaction(
    async (tx) => {
      // Lock order shared with public redemption: batch, then cards. The public
      // path performs its code lookup without a lock, then re-locks/revalidates
      // the exact card only after taking this batch lock.
      const lockedBatch = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "StudentActivationCardBatch"
        WHERE "id" = ${input.batchId}
        FOR UPDATE
      `);
      if (lockedBatch.length !== 1) {
        throw new StudentActivationCardBlockedError(
          "Activation-card batch does not exist",
        );
      }
      const current = await planStudentActivationCardRevocation(tx, {
        actorEmail: input.actorEmail,
        batchId: input.batchId,
        reason: input.reason,
        capturedAt: revokedAt,
      });
      if (current.planSha256 !== input.expectedPlanSha256) {
        throw new StudentActivationCardBlockedError(
          "Live batch state changed after the reviewed revocation dry run",
        );
      }
      if (current.alreadyRevoked) {
        return {
          alreadyRevoked: true as const,
          batchId: current.batchId,
          revokedCards: 0,
          invalidatedRequests: 0,
          expiredInvites: 0,
        };
      }
      const claimed = await tx.studentActivationCardBatch.updateMany({
        where: {
          id: input.batchId,
          status: "active",
          revokedAt: null,
          revokedById: null,
          revokeReason: null,
        },
        data: {
          status: "revoked",
          revokedAt,
          revokedById: current.actorId,
          revokeReason: input.reason,
        },
      });
      if (claimed.count !== 1) {
        throw new StudentActivationCardBlockedError(
          "Activation-card batch could not be claimed for revocation",
        );
      }
      const revokedCards = await tx.studentActivationCard.updateMany({
        where: {
          batchId: input.batchId,
          usedAt: null,
          revokedAt: null,
        },
        data: { revokedAt },
      });
      const expiredInvites = await tx.studentInvite.updateMany({
        where: {
          usedAt: null,
          activationRequest: {
            studentActivationCard: { batchId: input.batchId },
          },
        },
        data: { expiresAt: revokedAt },
      });
      const invalidatedRequests = await tx.studentActivationRequest.updateMany({
        where: {
          studentActivationCard: { batchId: input.batchId },
          consumedAt: null,
          invalidatedAt: null,
        },
        data: { invalidatedAt: revokedAt },
      });
      await tx.auditLog.create({
        data: {
          entity: "StudentActivationCardBatch",
          entityId: input.batchId,
          action: "student-activation-cards-revoked",
          actorId: current.actorId,
          data: {
            reasonSha256: sha256(input.reason),
            revokedCards: revokedCards.count,
            invalidatedRequests: invalidatedRequests.count,
            expiredInvites: expiredInvites.count,
            confirmationPlanSha256: input.expectedPlanSha256,
          },
        },
      });
      return {
        alreadyRevoked: false as const,
        batchId: input.batchId,
        revokedCards: revokedCards.count,
        invalidatedRequests: invalidatedRequests.count,
        expiredInvites: expiredInvites.count,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 60_000,
    },
  );
}
