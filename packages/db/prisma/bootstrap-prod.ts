import { randomBytes } from "node:crypto";
import { COST_CENTERS, FEE_STRUCTURE, SCHOLARSHIP_TIERS } from "@mydaust/shared";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Minimal PRODUCTION bootstrap: reference data + one admin. No demo students,
// no fake money. Run once against an empty schema (after `migrate deploy`).
// The generated admin password prints to the terminal ONLY — store it safely.

const prisma = new PrismaClient();

async function costCenters() {
  const ordered = [...COST_CENTERS].sort((a, b) => (a.parent === null ? -1 : b.parent === null ? 1 : 0));
  for (const cc of ordered) {
    await prisma.costCenter.upsert({
      where: { code: cc.code },
      update: { name: cc.name, type: cc.type, parentCode: cc.parent },
      create: { code: cc.code, name: cc.name, type: cc.type, parentCode: cc.parent },
    });
  }
  console.log(`cost centers: ${COST_CENTERS.length}`);
}

async function moneyConfig() {
  // Official fee sheet values (same source app-config.service.ts falls back to).
  const fees = [
    { key: "tuition", label: "Tuition", minXof: FEE_STRUCTURE.tuitionPerYear, maxXof: null, period: "year", note: "Half per semester · monthly installments available", sortOrder: 0 },
    { key: "housing", label: "Housing", minXof: FEE_STRUCTURE.housingPerYear, maxXof: null, period: "year", note: "Optional · on-campus residence", sortOrder: 1 },
    { key: "cafeteria", label: "Cafeteria", minXof: FEE_STRUCTURE.cafeteriaPerYear, maxXof: null, period: "year", note: "Optional · full pension meal plan", sortOrder: 2 },
    { key: "application_fee", label: "Application Fee", minXof: FEE_STRUCTURE.applicationFee, maxXof: null, period: "one-time", note: "One-time, paid with your application", sortOrder: 3 },
    { key: "insurance", label: "Insurance", minXof: FEE_STRUCTURE.insurancePerYear, maxXof: null, period: "year", note: "Annual student insurance", sortOrder: 4 },
  ];
  for (const f of fees) {
    await prisma.feeItem.upsert({ where: { key: f.key }, update: f, create: f });
  }
  if ((await prisma.scholarshipTier.count()) === 0) {
    await prisma.scholarshipTier.createMany({
      data: SCHOLARSHIP_TIERS.map((t) => ({ minScore: t.minScore, pct: t.pct, band: t.band })),
    });
  }
  console.log("fees + scholarship tiers: official values");
}

async function academicCatalog() {
  const term = await prisma.term.upsert({
    where: { name: "Fall 2026" },
    update: {},
    create: {
      name: "Fall 2026",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-12-20"),
      addDeadline: new Date("2026-09-15"),
      dropDeadline: new Date("2026-10-15"),
    },
  });
  const dept = await prisma.department.upsert({
    where: { code: "CE" },
    update: {},
    create: { code: "CE", name: "Computer & Electrical Engineering" },
  });
  const programs = [
    { code: "BSCE", name: "B.Sc. Computer Engineering" },
    { code: "BSEE", name: "B.Sc. Electrical Engineering" },
    { code: "BSME", name: "B.Sc. Mechanical Engineering" },
  ];
  for (const p of programs) {
    await prisma.program.upsert({ where: { code: p.code }, update: {}, create: { ...p, departmentId: dept.id } });
  }
  console.log(`term ${term.name}, ${programs.length} programs (sections/courses via registrar later)`);
}

async function adminAccount(): Promise<string> {
  const password = randomBytes(18).toString("base64url");
  const hash = await bcrypt.hash(password, 12);
  await prisma.person.upsert({
    where: { email: "admin@daust.edu" },
    update: { roles: ["admin", "bursar"], passwordHash: hash },
    create: {
      email: "admin@daust.edu",
      firstName: "DAUST",
      lastName: "Administration",
      kind: "staff",
      roles: ["admin", "bursar"],
      passwordHash: hash,
    },
  });
  return password;
}

async function main() {
  const students = await prisma.student.count();
  const payments = await prisma.payment.count();
  if (students > 0 || payments > 0) {
    throw new Error(
      `Refusing to bootstrap: database is not empty (${students} students, ${payments} payments). ` +
        "Wipe first (prisma migrate reset --skip-seed) if this is intentional.",
    );
  }
  await costCenters();
  await moneyConfig();
  await academicCatalog();
  const password = await adminAccount();
  console.log("\n=== PROD ADMIN BOOTSTRAP ===");
  console.log("email:    admin@daust.edu");
  console.log(`password: ${password}`);
  console.log("Shown once — store it in a password manager. Rotate by re-running this script.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
