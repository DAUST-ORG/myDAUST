import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Operator tool: create/reset PROD staff logins with passwords YOU supply via env.
// Passwords never live in this file or in git. Safe to re-run (idempotent upsert);
// it only touches the listed staff accounts — never student/payment/invoice data.
//
// Run (one per account you want; omit an env var to skip that account):
//   ADMIN_PASSWORD=... REGISTRAR_PASSWORD=... BURSAR_PASSWORD=... \
//   HR_PASSWORD=... IT_PASSWORD=... COMMS_PASSWORD=... \
//   pnpm --filter @mydaust/db run accounts:prod
//
// On prod this runs as a one-off ECS task on the api image (same pattern as the
// deploy's migrate step), with the env vars set on the task override.

const prisma = new PrismaClient();

// email -> { roles, firstName, lastName, env } — the env var that carries its password.
const ACCOUNTS = [
  { email: "admin@daust.edu", roles: ["admin", "bursar"], firstName: "DAUST", lastName: "Administration", env: "ADMIN_PASSWORD" },
  { email: "registrar@daust.edu", roles: ["registrar", "admin"], firstName: "DAUST", lastName: "Registrar", env: "REGISTRAR_PASSWORD" },
  { email: "bursar@daust.edu", roles: ["bursar"], firstName: "DAUST", lastName: "Bursar", env: "BURSAR_PASSWORD" },
  { email: "hr@daust.edu", roles: ["hr"], firstName: "DAUST", lastName: "HR", env: "HR_PASSWORD" },
  { email: "it@daust.edu", roles: ["it_admin"], firstName: "DAUST", lastName: "IT", env: "IT_PASSWORD" },
  { email: "comms@daust.edu", roles: ["communications"], firstName: "DAUST", lastName: "Communications", env: "COMMS_PASSWORD" },
] as const;

async function main() {
  const targets = ACCOUNTS.filter((a) => (process.env[a.env] ?? "").length > 0);
  if (targets.length === 0) {
    throw new Error(
      "No password env vars set. Provide at least one of: " +
        ACCOUNTS.map((a) => a.env).join(", "),
    );
  }
  for (const a of targets) {
    const pw = process.env[a.env]!;
    if (pw.length < 12) throw new Error(`${a.env} must be at least 12 characters`);
    const passwordHash = await bcrypt.hash(pw, 12);
    await prisma.person.upsert({
      where: { email: a.email },
      update: { roles: [...a.roles], passwordHash },
      create: {
        email: a.email,
        firstName: a.firstName,
        lastName: a.lastName,
        kind: "staff",
        roles: [...a.roles],
        passwordHash,
      },
    });
    // Emails only — never log the password.
    console.log(`set ${a.email} (${a.roles.join(", ")})`);
  }
  console.log(`\n${targets.length} staff account(s) set. Passwords were supplied via env; none were printed.`);
  console.log("Students, parents and faculty are provisioned from the admin dashboard, not here.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
