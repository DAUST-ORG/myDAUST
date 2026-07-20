import { COST_CENTERS, COST_CENTER_TUITION } from "@mydaust/shared";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Demo data must never land in production. The prod bootstrap is bootstrap-prod.ts.
const dbUrl = process.env.DATABASE_URL ?? "";
if (dbUrl.includes("daust-prod") && process.env.SEED_ALLOW_PROD !== "1") {
  console.error("Refusing to demo-seed a daust-prod database. Set SEED_ALLOW_PROD=1 to override (don't).");
  process.exit(1);
}

// Dev-only shared password for every seeded user. Replaced per-user / by OIDC later.
const DEV_PASSWORD = "daust-dev-2026";

async function seedCostCenters() {
  const ordered = [...COST_CENTERS].sort((a, b) =>
    a.parent === null ? -1 : b.parent === null ? 1 : 0,
  );
  for (const cc of ordered) {
    await prisma.costCenter.upsert({
      where: { code: cc.code },
      update: { name: cc.name, type: cc.type, parentCode: cc.parent },
      create: { code: cc.code, name: cc.name, type: cc.type, parentCode: cc.parent },
    });
  }
  console.log(`Seeded ${COST_CENTERS.length} cost centers.`);
}

interface StaffSpec {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
}

const STAFF: StaffSpec[] = [
  { id: "usr_faculty", email: "amadou.ba@daust.edu", firstName: "Amadou", lastName: "Ba", roles: ["faculty"] },
  { id: "usr_registrar", email: "registrar@daust.edu", firstName: "Fatou", lastName: "Sow", roles: ["registrar"] },
  { id: "usr_bursar", email: "bursar@daust.edu", firstName: "Mariama", lastName: "Ndiaye", roles: ["bursar"] },
  { id: "usr_hr", email: "hr@daust.edu", firstName: "Ousmane", lastName: "Fall", roles: ["hr"] },
  { id: "usr_saffairs", email: "studentaffairs@daust.edu", firstName: "Khady", lastName: "Diop", roles: ["student_affairs"] },
  { id: "usr_dining", email: "dining@daust.edu", firstName: "Ibrahima", lastName: "Sarr", roles: ["dining"] },
  { id: "usr_innovation", email: "innovation@daust.edu", firstName: "Awa", lastName: "Gueye", roles: ["innovation"] },
  { id: "usr_it", email: "it@daust.edu", firstName: "Modou", lastName: "Cissé", roles: ["it_admin"] },
  { id: "usr_admin", email: "admin@daust.edu", firstName: "Director", lastName: "DAUST", roles: ["admin", "bursar"] },
];

interface StudentSpec {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  studentNo: string;
  total: number;
  installments: { sequence: number; dueDate: string; amountDue: number }[];
}

const STUDENTS: StudentSpec[] = [
  {
    id: "stu_demo_aissatou",
    email: "aissatou.diallo@daust.edu",
    firstName: "Aïssatou",
    lastName: "Diallo",
    studentNo: "DAUST-CE-23-0142",
    total: 3_500_000,
    installments: [
      { sequence: 1, dueDate: "2026-09-15", amountDue: 1_500_000 },
      { sequence: 2, dueDate: "2026-10-15", amountDue: 1_000_000 },
      { sequence: 3, dueDate: "2026-11-15", amountDue: 1_000_000 },
    ],
  },
  {
    id: "stu_mamadou",
    email: "mamadou.sy@daust.edu",
    firstName: "Mamadou",
    lastName: "Sy",
    studentNo: "DAUST-EE-24-0210",
    total: 2_975_000,
    installments: [
      { sequence: 1, dueDate: "2026-09-15", amountDue: 1_487_500 },
      { sequence: 2, dueDate: "2026-11-15", amountDue: 1_487_500 },
    ],
  },
  {
    id: "stu_bineta",
    email: "bineta.faye@daust.edu",
    firstName: "Bineta",
    lastName: "Faye",
    studentNo: "DAUST-CS-25-0033",
    total: 3_500_000,
    installments: [{ sequence: 1, dueDate: "2026-09-30", amountDue: 3_500_000 }],
  },
];

async function seedStaff(passwordHash: string) {
  for (const s of STAFF) {
    await prisma.person.upsert({
      where: { email: s.email },
      update: { roles: s.roles, firstName: s.firstName, lastName: s.lastName, passwordHash },
      create: {
        id: s.id,
        email: s.email,
        firstName: s.firstName,
        lastName: s.lastName,
        kind: "staff",
        roles: s.roles,
        passwordHash,
      },
    });
  }
  console.log(`Seeded ${STAFF.length} staff users across roles.`);
}

async function seedStudents(passwordHash: string) {
  const term = await prisma.term.upsert({
    where: { name: "Fall 2026" },
    update: { addDeadline: new Date("2026-09-15"), dropDeadline: new Date("2026-10-15") },
    create: {
      name: "Fall 2026",
      startDate: new Date("2026-09-01"),
      endDate: new Date("2026-12-20"),
      addDeadline: new Date("2026-09-15"),
      dropDeadline: new Date("2026-10-15"),
    },
  });

  for (const s of STUDENTS) {
    const person = await prisma.person.upsert({
      where: { email: s.email },
      update: { roles: ["student"], passwordHash },
      create: {
        email: s.email,
        firstName: s.firstName,
        lastName: s.lastName,
        kind: "student",
        roles: ["student"],
        passwordHash,
      },
    });
    const student = await prisma.student.upsert({
      where: { studentNo: s.studentNo },
      update: {},
      create: { id: s.id, personId: person.id, studentNo: s.studentNo },
    });
    const existing = await prisma.invoice.findFirst({
      where: { studentId: student.id, termId: term.id },
    });
    if (!existing) {
      await prisma.invoice.create({
        data: {
          studentId: student.id,
          termId: term.id,
          totalAmount: s.total,
          costCenterCode: COST_CENTER_TUITION,
          plan: {
            create: {
              installments: {
                create: s.installments.map((i) => ({ ...i, dueDate: new Date(i.dueDate) })),
              },
            },
          },
        },
      });
    }
  }
  console.log(`Seeded ${STUDENTS.length} students with Fall 2026 invoices.`);
}

async function seedAcademics() {
  const dept = await prisma.department.upsert({
    where: { code: "CE" },
    update: {},
    create: { code: "CE", name: "Computer & Electrical Engineering" },
  });
  const program = await prisma.program.upsert({
    where: { code: "BSCE" },
    update: {},
    create: { code: "BSCE", name: "B.Sc. Computer Engineering", departmentId: dept.id },
  });

  // Link demo students to the program.
  await prisma.student.updateMany({
    where: { id: { in: ["stu_demo_aissatou", "stu_mamadou", "stu_bineta"] } },
    data: { programId: program.id },
  });

  const courseDefs = [
    { code: "CSC 101", title: "Introduction to Computer Science", credits: 3 },
    { code: "CSC 201", title: "Data Structures", credits: 3 },
    { code: "CE 201", title: "Digital Systems", credits: 3 },
    { code: "MTH 210", title: "Linear Algebra", credits: 4 },
    { code: "ENG 250", title: "Technical Writing", credits: 2 },
  ];
  const courses: Record<string, { id: string }> = {};
  for (const c of courseDefs) {
    courses[c.code] = await prisma.course.upsert({
      where: { code: c.code },
      update: {},
      create: { ...c, departmentId: dept.id },
    });
  }
  // CSC 201 requires CSC 101.
  await prisma.course.update({
    where: { code: "CSC 201" },
    data: { prerequisites: { connect: { code: "CSC 101" } } },
  });

  const fall = await prisma.term.findUniqueOrThrow({ where: { name: "Fall 2026" } });
  const spring = await prisma.term.upsert({
    where: { name: "Spring 2026" },
    update: {},
    create: { name: "Spring 2026", startDate: new Date("2026-01-12"), endDate: new Date("2026-05-08") },
  });

  async function section(
    courseCode: string,
    termId: string,
    code: string,
    capacity: number,
    days: string,
    startTime: string,
    endTime: string,
    room: string,
  ) {
    const courseId = courses[courseCode]!.id;
    return prisma.section.upsert({
      where: { courseId_termId_sectionCode: { courseId, termId, sectionCode: code } },
      update: { capacity, days, startTime, endTime, room, instructorId: "usr_faculty" },
      create: {
        courseId, termId, sectionCode: code, capacity, days, startTime, endTime, room,
        instructorId: "usr_faculty",
      },
    });
  }

  // Prior term: CSC 101 completed by Aïssatou (satisfies the CSC 201 prereq).
  const csc101Spring = await section("CSC 101", spring.id, "A", 30, "MWF", "10:00", "11:00", "R203");
  await prisma.enrollment.upsert({
    where: { studentId_sectionId: { studentId: "stu_demo_aissatou", sectionId: csc101Spring.id } },
    update: { status: "completed", grade: "A" },
    create: { studentId: "stu_demo_aissatou", sectionId: csc101Spring.id, status: "completed", grade: "A" },
  });

  // Fall 2026 offerings. CSC 201 has a tiny capacity to exercise seat-locking.
  await section("CSC 201", fall.id, "A", 2, "MWF", "10:00", "11:00", "R203");
  await section("CSC 101", fall.id, "A", 2, "MWF", "09:00", "10:00", "R201"); // small cap: seat-lock test
  const ce201Fall = await section("CE 201", fall.id, "A", 30, "TTh", "09:00", "10:30", "R105");
  const mth210Fall = await section("MTH 210", fall.id, "A", 30, "MWF", "08:00", "09:00", "R110");
  const eng250Fall = await section("ENG 250", fall.id, "A", 25, "T", "14:00", "16:00", "R210");

  console.log("Seeded academics: 1 program, 5 courses, Fall 2026 sections (CSC 201 cap=2).");
  await seedAssignments(ce201Fall.id, mth210Fall.id, eng250Fall.id);
  await seedInsightsDemo(ce201Fall.id, program.id);
}

/** Make CE 201 an insights showcase: a cohort with attendance history + graded work. Idempotent. */
async function seedInsightsDemo(ce201Id: string, programId: string) {
  const cohort = [
    { id: "stu_demo_i1", studentNo: "DAUST-CE-24-0301", first: "Sokhna", last: "Mbaye", score: 95, absences: 0 },
    { id: "stu_demo_i2", studentNo: "DAUST-CE-24-0302", first: "Lamine", last: "Gueye", score: 88, absences: 0 },
    { id: "stu_demo_i3", studentNo: "DAUST-CE-24-0303", first: "Rama", last: "Diop", score: 72, absences: 1 },
    { id: "stu_demo_i4", studentNo: "DAUST-CE-24-0304", first: "Cheikh", last: "Fall", score: 64, absences: 2 },
    { id: "stu_demo_i5", studentNo: "DAUST-CE-24-0305", first: "Ndeye", last: "Sarr", score: 52, absences: 3 },
    { id: "stu_demo_i6", studentNo: "DAUST-CE-24-0306", first: "Babacar", last: "Sy", score: 45, absences: 4 },
  ];
  const hw1 = await prisma.assignment.findFirst({ where: { sectionId: ce201Id, title: "HW1 — Boolean Algebra" } });
  // CE 201 meets TTh — six sessions across Sept 2026.
  const sessions = ["2026-09-08", "2026-09-10", "2026-09-15", "2026-09-17", "2026-09-22", "2026-09-24"];

  for (const c of cohort) {
    const person = await prisma.person.upsert({
      where: { email: `${c.id}@daust.edu` },
      update: {},
      create: { email: `${c.id}@daust.edu`, firstName: c.first, lastName: c.last, kind: "student", roles: ["student"] },
    });
    const student = await prisma.student.upsert({
      where: { studentNo: c.studentNo },
      update: {},
      create: { id: c.id, personId: person.id, studentNo: c.studentNo, programId },
    });
    const enr = await prisma.enrollment.upsert({
      where: { studentId_sectionId: { studentId: student.id, sectionId: ce201Id } },
      update: {},
      create: { studentId: student.id, sectionId: ce201Id, status: "enrolled" },
    });

    if (hw1) {
      await prisma.submission.upsert({
        where: { assignmentId_enrollmentId: { assignmentId: hw1.id, enrollmentId: enr.id } },
        update: {},
        create: { assignmentId: hw1.id, enrollmentId: enr.id, status: "graded", score: c.score, text: "Submitted.", gradedAt: new Date() },
      });
    }

    // Last `absences` sessions marked absent; the rest present (one late midway for texture).
    for (let i = 0; i < sessions.length; i++) {
      const absent = i >= sessions.length - c.absences;
      const status = absent ? "absent" : i === 2 ? "late" : "present";
      const date = new Date(sessions[i]!);
      await prisma.attendanceRecord.upsert({
        where: { enrollmentId_date: { enrollmentId: enr.id, date } },
        update: {},
        create: { enrollmentId: enr.id, sectionId: ce201Id, date, status },
      });
    }
  }
  console.log(`Seeded insights demo: ${cohort.length}-student cohort in CE 201 with attendance + grades.`);
}

/** Coursework so the assignments hub + faculty grading loop have data. Idempotent by title. */
async function seedAssignments(ce201Id: string, mth210Id: string, eng250Id: string) {
  const defs = [
    { sectionId: ce201Id, title: "HW1 — Boolean Algebra", type: "homework" as const, maxPoints: 100, weight: 10, dueDate: new Date("2026-09-18T23:59:00Z") },
    { sectionId: ce201Id, title: "Midterm Exam", type: "exam" as const, maxPoints: 100, weight: 30, dueDate: new Date("2026-10-20T23:59:00Z") },
    { sectionId: mth210Id, title: "Problem Set 1", type: "homework" as const, maxPoints: 50, weight: 10, dueDate: new Date("2026-09-15T23:59:00Z") },
    { sectionId: eng250Id, title: "Reflective Essay", type: "project" as const, maxPoints: 100, weight: 20, dueDate: new Date("2026-09-25T23:59:00Z") },
  ];
  for (const d of defs) {
    const existing = await prisma.assignment.findFirst({ where: { sectionId: d.sectionId, title: d.title } });
    if (!existing) await prisma.assignment.create({ data: d });
  }

  // Mamadou submits CE 201 HW1 (ungraded) so faculty has something to grade.
  const hw1 = await prisma.assignment.findFirst({ where: { sectionId: ce201Id, title: "HW1 — Boolean Algebra" } });
  const mamadouCe201 = await prisma.enrollment.findFirst({
    where: { sectionId: ce201Id, student: { person: { firstName: "Mamadou" } } },
  });
  if (hw1 && mamadouCe201) {
    await prisma.submission.upsert({
      where: { assignmentId_enrollmentId: { assignmentId: hw1.id, enrollmentId: mamadouCe201.id } },
      update: {},
      create: {
        assignmentId: hw1.id,
        enrollmentId: mamadouCe201.id,
        status: "submitted",
        text: "Truth tables and simplified expressions attached in the writeup.",
      },
    });
  }
  console.log("Seeded assignments + 1 pending submission.");
}

async function seedAnnouncements() {
  const items = [
    { title: "Le Sénégal décroche la Lune: Pourquoi 2026 marque un tournant historique pour l'innovation africaine", body: "Le \"Sputnik\" de l'Afrique de l'Ouest Le 2 avril 2026 restera dans l'histoire comme le jour où le Sénégal est devenu la première nation africaine à poser un instrument scientifique sur la Lune.", category: "Projects", audience: "all", author: "DAUST Press" },
    { title: "DAUST Career Fair 2026: Shaping Futures, Creating Opportunities", body: "On March 28, the DAUST campus in Somone came alive as the Career Fair 2026 brought together over 60 employers and hundreds of students.", category: "Campus Activities", audience: "all", author: "Student Affairs" },
    { title: "Fall 2026 registration is open", body: "Add/drop closes two weeks after term start. Register early — popular sections fill fast.", category: "Registrar", audience: "all", author: "Registrar" },
    { title: "Tuition installment 1 due Sept 15", body: "Pay via Wave, Orange Money, or card from the Billing page.", category: "Bursar", audience: "student", author: "Bursar Office" },
    { title: "Library extended hours", body: "The library is open until midnight during finals week.", category: "Library", audience: "all", author: "Library" },
    { title: "Grade submission deadline", body: "Submit Fall midterm grades by the end of week 8.", category: "Academics", audience: "faculty", author: "Registrar" },
  ];
  const count = await prisma.announcement.count();
  if (count === 0) {
    await prisma.announcement.createMany({ data: items });
  }
  console.log(`Announcements: ${await prisma.announcement.count()}.`);
}

/** Give Aïssatou a prior graded term so GPA/transcript shows real data. */
async function seedGrades() {
  const csc101Spring = await prisma.section.findFirst({
    where: { course: { code: "CSC 101" }, term: { name: "Spring 2026" } },
  });
  if (!csc101Spring) return;
  // CSC 101 already completed with A (seedAcademics). Nothing more needed; left as a hook.
}

async function seedFinanceMgmt() {
  // Budgets (FY2026) per operating/auxiliary cost center (XOF, < 2.1B Int ceiling).
  const budgets: [string, number][] = [
    ["1100", 800_000_000], ["1200", 60_000_000], ["2100", 40_000_000], ["2200", 46_500_000],
    ["3100", 50_000_000], ["3300", 45_000_000], ["3400", 300_000_000], ["3500", 80_000_000],
    ["4100", 35_000_000], ["4200", 30_000_000], ["5100", 25_000_000],
  ];
  for (const [code, allocated] of budgets) {
    await prisma.budget.upsert({
      where: { costCenterCode_fiscalYear: { costCenterCode: code, fiscalYear: "FY2026" } },
      update: { allocated },
      create: { costCenterCode: code, fiscalYear: "FY2026", allocated },
    });
  }

  if ((await prisma.expense.count()) === 0) {
    await prisma.expense.createMany({
      data: [
        { costCenterCode: "1100", category: "Salary", payee: "Amadou Ba", personId: "usr_faculty", amount: 1_200_000, isEstimate: false, incurredOn: new Date("2026-06-01") },
        { costCenterCode: "1100", category: "Salary", payee: "Amadou Ba", personId: "usr_faculty", amount: 1_200_000, isEstimate: false, incurredOn: new Date("2026-05-01") },
        { costCenterCode: "1100", category: "Salary", payee: "Amadou Ba", personId: "usr_faculty", amount: 1_200_000, isEstimate: false, incurredOn: new Date("2026-04-01") },
        { costCenterCode: "1100", category: "Salary", description: "Faculty payroll (estimated)", amount: 18_000_000, isEstimate: true, incurredOn: new Date("2026-06-01") },
        { costCenterCode: "3300", category: "Salary", description: "Admin staff payroll (estimated)", amount: 9_000_000, isEstimate: true, incurredOn: new Date("2026-06-01") },
        { costCenterCode: "3400", category: "Facilities", description: "Generator fuel + maintenance", amount: 4_500_000, isEstimate: false, incurredOn: new Date("2026-06-10") },
        { costCenterCode: "3500", category: "IT", description: "Cloud + software licenses", amount: 2_200_000, isEstimate: false, incurredOn: new Date("2026-06-12") },
        { costCenterCode: "2200", category: "Operations", description: "Career Fair logistics", amount: 3_000_000, isEstimate: false, incurredOn: new Date("2026-06-15") },
        { costCenterCode: "3100", category: "Operations", description: "Bank / PayTech fees", amount: 350_000, isEstimate: false, incurredOn: new Date("2026-06-20") },
      ],
    });
  }

  // Backfill: link existing seeded salary rows to the canonical employee (payslips join on personId).
  await prisma.expense.updateMany({
    where: { category: "Salary", payee: "Amadou Ba", personId: null },
    data: { personId: "usr_faculty" },
  });

  // A couple of settled payments so "money in" (tuition revenue, cc 9100) is non-zero.
  const settle: [string, string, number][] = [
    ["stu_demo_aissatou", "SEED-PAY-AISS", 1_500_000],
    ["stu_mamadou", "SEED-PAY-MAM", 991_666],
  ];
  for (const [studentId, ref, amount] of settle) {
    if (await prisma.payment.findUnique({ where: { providerRef: ref } })) continue;
    const inv = await prisma.invoice.findFirst({ where: { studentId } });
    if (!inv) continue;
    await prisma.payment.create({
      data: { invoiceId: inv.id, studentId, amount, method: "wave", status: "success", providerRef: ref },
    });
    await prisma.invoice.update({
      where: { id: inv.id },
      data: { amountPaid: { increment: amount }, status: "partial" },
    });
  }
  console.log("Seeded finance: budgets, expenses, settled payments.");
}

async function seedApplicants() {
  if ((await prisma.applicant.count()) > 0) return;
  await prisma.applicant.createMany({
    data: [
      { firstName: "Cheikh", lastName: "Ndoye", email: "cheikh.ndoye@example.sn", programCode: "BSCE", stage: "submitted", score: 14, country: "Senegal" },
      { firstName: "Aminata", lastName: "Bâ", email: "aminata.ba@example.sn", programCode: "BSCE", stage: "review", score: 16, country: "Senegal" },
      { firstName: "John", lastName: "Mensah", email: "john.mensah@example.gh", programCode: "BSCE", stage: "interview", score: 15, country: "Ghana" },
      { firstName: "Fatima", lastName: "Diallo", email: "fatima.diallo@example.gn", programCode: "BSCE", stage: "offer", score: 17, country: "Guinea" },
      { firstName: "Moussa", lastName: "Traoré", email: "moussa.traore@example.ml", programCode: "BSCE", stage: "accepted", score: 18, country: "Mali" },
      { firstName: "Awa", lastName: "Sy", email: "awa.sy@example.sn", programCode: "BSCE", stage: "submitted", score: 13, country: "Senegal" },
      { firstName: "Ousmane", lastName: "Kane", email: "ousmane.kane@example.sn", programCode: "BSCE", stage: "rejected", score: 9, country: "Senegal" },
    ],
  });
  console.log("Seeded 7 applicants across the admissions funnel.");
}

async function seedCampus() {
  if ((await prisma.event.count()) === 0) {
    await prisma.event.createMany({
      data: [
        { title: "Career Fair — Atlantic Atrium", description: "60+ employers on campus. Bring your CV.", location: "Atlantic Atrium", category: "Career", startsAt: new Date("2026-09-12T10:00:00Z"), endsAt: new Date("2026-09-12T16:00:00Z") },
        { title: "Guest Lecture: AI & Society", description: "Distinguished speaker series.", location: "Lecture Hall A", category: "Academics", startsAt: new Date("2026-09-18T14:00:00Z") },
        { title: "Intramural Football Final", description: "Cheer on your department.", location: "Sports Field", category: "Sports", startsAt: new Date("2026-09-20T17:00:00Z") },
        { title: "Robotics Club Workshop", description: "Build a line-following robot.", location: "Innovation Lab", category: "Campus", startsAt: new Date("2026-09-25T15:00:00Z") },
        { title: "Open Mic Night", description: "Music, poetry, and more.", location: "Student Center", category: "Arts", startsAt: new Date("2026-09-27T19:00:00Z") },
      ],
    });
  }
  if ((await prisma.libraryResource.count()) === 0) {
    await prisma.libraryResource.createMany({
      data: [
        { title: "Introduction to Algorithms", author: "Cormen, Leiserson, Rivest, Stein", kind: "book", subject: "Computer Science", callNumber: "QA76.6 .C66", available: true },
        { title: "Structure and Interpretation of Computer Programs", author: "Abelson & Sussman", kind: "book", subject: "Computer Science", callNumber: "QA76.6 .A26", available: false },
        { title: "Digital Design", author: "M. Morris Mano", kind: "book", subject: "Electrical Engineering", callNumber: "TK7888.4 .M36", available: true },
        { title: "Linear Algebra and Its Applications", author: "Gilbert Strang", kind: "book", subject: "Mathematics", callNumber: "QA184 .S77", available: true },
        { title: "IEEE Xplore Digital Library", kind: "database", subject: "Engineering", available: true },
        { title: "Nature", kind: "journal", subject: "Science", available: true },
        { title: "Clean Code", author: "Robert C. Martin", kind: "ebook", subject: "Software Engineering", available: true },
      ],
    });
  }
  console.log(`Campus: ${await prisma.event.count()} events, ${await prisma.libraryResource.count()} library resources.`);
}

async function seedMessages() {
  if ((await prisma.thread.count()) > 0) return;
  const aissatou = await prisma.person.findFirst({ where: { email: "aissatou.diallo@daust.edu" } });
  const amadou = await prisma.person.findFirst({ where: { email: "amadou.ba@daust.edu" } });
  if (!aissatou || !amadou) return;
  const thread = await prisma.thread.create({
    data: {
      subject: "Office hours",
      participants: { create: [{ personId: aissatou.id }, { personId: amadou.id }] },
    },
  });
  await prisma.message.create({ data: { threadId: thread.id, senderId: aissatou.id, body: "Professor, may I schedule an advising session about my project?" } });
  await prisma.message.create({ data: { threadId: thread.id, senderId: amadou.id, body: "Of course — does Thursday at 14:00 during office hours work?" } });
  console.log("Seeded 1 demo message thread.");
}

async function seedDining() {
  if ((await prisma.menuItem.count()) === 0) {
    await prisma.menuItem.createMany({
      data: [
        { name: "Thiéboudienne", description: "Senegalese rice & fish", category: "weekend", priceXof: 2500 },
        { name: "Yassa Poulet", description: "Grilled chicken, onion-lemon sauce", category: "weekend", priceXof: 2000 },
        { name: "Mafé", description: "Peanut stew with beef", category: "weekend", priceXof: 2200 },
        { name: "Salade Niçoise", description: "Fresh garden salad", category: "weekend", priceXof: 1500 },
        { name: "Fruit bowl", description: "Seasonal fruit", category: "weekend", priceXof: 800 },
        { name: "Bissap juice", description: "Hibiscus drink", category: "weekend", priceXof: 500 },
      ],
    });
  }
  // Give demo students meal plans (full for Aïssatou, half for Mamadou).
  const plans: [string, "full" | "half"][] = [["stu_demo_aissatou", "full"], ["stu_mamadou", "half"]];
  for (const [studentId, type] of plans) {
    const exists = await prisma.student.findUnique({ where: { id: studentId } });
    if (exists) {
      await prisma.mealPlan.upsert({
        where: { studentId },
        update: { type, active: true },
        create: { studentId, type, term: "Fall 2026", active: true },
      });
    }
  }
  console.log(`Dining: ${await prisma.menuItem.count()} menu items, meal plans seeded.`);
}

async function seedAffairs() {
  if ((await prisma.hall.count()) === 0) {
    await prisma.hall.createMany({
      data: [
        { name: "Teranga Hall", kind: "First-year · Mixed", beds: 320, color: "#153b6a" },
        { name: "Gorée Hall", kind: "Upper-year · Women", beds: 264, color: "#1d4a82" },
        { name: "Sahel Hall", kind: "Upper-year · Men", beds: 288, color: "#3a6ea5" },
        { name: "Baobab Hall", kind: "Graduate · Mixed", beds: 196, color: "#ed8425" },
        { name: "Atlantic Hall", kind: "Exchange · Mixed", beds: 188, color: "#6c7884" },
      ],
    });
  }
  const goree = await prisma.hall.findUnique({ where: { name: "Gorée Hall" } });
  const teranga = await prisma.hall.findUnique({ where: { name: "Teranga Hall" } });

  // Housing: a few assigned, a couple pending (drives the assignment workflow).
  const housing: { id: string; hallId: string | null; room: string | null; status: "assigned" | "pending"; note?: string }[] = [
    { id: "stu_demo_aissatou", hallId: goree?.id ?? null, room: "G-214", status: "assigned" },
    { id: "stu_mamadou", hallId: teranga?.id ?? null, room: "T-118", status: "assigned" },
    { id: "stu_bineta", hallId: null, room: null, status: "pending", note: "Quiet floor · near labs" },
    { id: "stu_demo_i5", hallId: null, room: null, status: "pending", note: "International first-year · arrival soon" },
  ];
  for (const h of housing) {
    if (!(await prisma.student.findUnique({ where: { id: h.id } }))) continue;
    await prisma.housingAssignment.upsert({
      where: { studentId: h.id },
      update: {},
      create: { studentId: h.id, hallId: h.hallId, room: h.room, status: h.status, note: h.note ?? null },
    });
  }

  // Roommate profiles for matching.
  const profiles: { id: string; sleep: string; tidy: string; social: string; study: string }[] = [
    { id: "stu_bineta", sleep: "early", tidy: "very", social: "moderate", study: "quiet" },
    { id: "stu_demo_aissatou", sleep: "early", tidy: "very", social: "moderate", study: "quiet" },
    { id: "stu_demo_i1", sleep: "early", tidy: "very", social: "low", study: "quiet" },
    { id: "stu_demo_i2", sleep: "late", tidy: "moderate", social: "high", study: "music" },
    { id: "stu_demo_i3", sleep: "early", tidy: "moderate", social: "moderate", study: "quiet" },
  ];
  for (const p of profiles) {
    if (!(await prisma.student.findUnique({ where: { id: p.id } }))) continue;
    await prisma.roommateProfile.upsert({
      where: { studentId: p.id },
      update: {},
      create: { studentId: p.id, sleep: p.sleep, tidy: p.tidy, social: p.social, study: p.study },
    });
  }

  if ((await prisma.conductCase.count()) === 0) {
    await prisma.conductCase.createMany({
      data: [
        { subject: "Anonymous (referral)", type: "Academic integrity", stage: "investigation", severity: "high", officer: "Dean Faye", slaDueAt: new Date("2026-09-10") },
        { subject: "Residence noise", type: "Residence noise", stage: "mediation", severity: "med", officer: "A. Ndour", slaDueAt: new Date("2026-09-20") },
        { subject: "Roommate dispute", type: "Interpersonal conflict", stage: "intake", severity: "med", slaDueAt: new Date("2026-06-25") },
        { subject: "Lab safety violation", type: "Policy breach", stage: "hearing", severity: "high", officer: "Dean Faye", slaDueAt: new Date("2026-09-30") },
      ],
    });
  }

  if ((await prisma.club.count()) === 0) {
    await prisma.club.createMany({
      data: [
        { name: "Robotics & Automation Society", category: "Engineering", members: 84, budgetXof: 3_200_000, status: "active", lead: "Ousmane Sow" },
        { name: "DAUST Women in STEM", category: "Advocacy", members: 132, budgetXof: 2_600_000, status: "active", lead: "Aïssatou Diallo" },
        { name: "Teranga Cultural Collective", category: "Culture", members: 210, budgetXof: 4_100_000, status: "active", lead: "Marième Faye" },
        { name: "Entrepreneurship Lab", category: "Business", members: 96, budgetXof: 3_800_000, status: "active", lead: "Ibrahima Cissé" },
        { name: "Debate & Model UN", category: "Academic", members: 61, budgetXof: 1_400_000, status: "review", lead: "Fatou Ndiaye" },
      ],
    });
  }

  if ((await prisma.coCurricularLine.count()) === 0) {
    await prisma.coCurricularLine.createMany({
      data: [
        { line: "Clubs & organizations", allocatedXof: 14_000_000, spentXof: 9_600_000, color: "#153b6a" },
        { line: "Events & programming", allocatedXof: 16_500_000, spentXof: 11_200_000, color: "#1d4a82" },
        { line: "Study abroad support", allocatedXof: 8_000_000, spentXof: 4_100_000, color: "#3a6ea5" },
        { line: "Internship stipends", allocatedXof: 5_000_000, spentXof: 2_300_000, color: "#ed8425" },
        { line: "Wellness & support", allocatedXof: 3_000_000, spentXof: 1_200_000, color: "#6c7884" },
      ],
    });
  }
  console.log("Student Affairs: halls, housing, roommate profiles, conduct, clubs, budget seeded.");
}

async function seedInnovation() {
  if ((await prisma.project.count()) > 0) {
    console.log("Innovation: projects already seeded.");
    return;
  }
  const aissatou = await prisma.student.findUnique({ where: { id: "stu_demo_aissatou" }, include: { person: true } });
  const mamadou = await prisma.student.findUnique({ where: { id: "stu_mamadou" }, include: { person: true } });
  if (!aissatou || !mamadou) return;

  const project = await prisma.project.create({
    data: {
      name: "Solar-Powered Water Purifier",
      description: "An off-grid water purification unit for rural Senegalese communities.",
      phase: "build",
      advisor: "Awa Gueye",
      members: {
        create: [
          { personId: aissatou.person.id, role: "lead" },
          { personId: mamadou.person.id, role: "member" },
        ],
      },
      tasks: {
        create: [
          { title: "Submit Project Proposal", phase: "proposal", status: "done", dueDate: new Date("2025-10-03") },
          { title: "Literature Review Report", phase: "research", status: "done", dueDate: new Date("2025-11-14") },
          { title: "Design Document & Architecture", phase: "design", status: "done", dueDate: new Date("2025-12-19") },
          { title: "Working Prototype Demo", phase: "build", status: "todo", dueDate: new Date("2026-03-06") },
          { title: "Test Plan & Results", phase: "test", status: "todo", dueDate: new Date("2026-04-17") },
        ],
      },
      submissions: {
        create: [
          { title: "Proposal v1", kind: "Document", status: "reviewed", grade: "A", feedback: "Clear problem framing." },
          { title: "Mid-year prototype video", kind: "Video", status: "submitted" },
        ],
      },
    },
  });

  // A second project entirely awaiting review (drives the review queue + projects list).
  const bineta = await prisma.student.findUnique({ where: { id: "stu_bineta" }, include: { person: true } });
  if (bineta) {
    await prisma.project.create({
      data: {
        name: "Campus Waste Sorting Robot",
        phase: "research",
        advisor: "Awa Gueye",
        members: { create: [{ personId: bineta.person.id, role: "lead" }] },
        submissions: { create: [{ title: "Literature review", kind: "Document", status: "submitted" }] },
      },
    });
  }
  console.log(`Innovation: seeded project "${project.name}" + review-queue project.`);
}


async function seedTrackD() {
  // Course materials + class posts for CE 201 (faculty course-detail tabs).
  const ce201 = await prisma.section.findFirst({ where: { course: { code: "CE 201" }, term: { name: "Fall 2026" } } });
  if (ce201 && (await prisma.sectionMaterial.count({ where: { sectionId: ce201.id } })) === 0) {
    await prisma.sectionMaterial.createMany({
      data: [
        { sectionId: ce201.id, title: "Week 1 — Boolean Algebra Slides", kind: "Slides", fileName: "week1-boolean.pdf", published: true },
        { sectionId: ce201.id, title: "Lab Manual — Digital Systems", kind: "Document", fileName: "lab-manual.pdf", published: true },
        { sectionId: ce201.id, title: "K-map Tutorial Video", kind: "Video", published: false },
      ],
    });
    await prisma.sectionPost.createMany({
      data: [
        { sectionId: ce201.id, title: "Welcome to CE 201", body: "Syllabus is under Materials. First lab meets Thursday in R105.", author: "Amadou Ba", pinned: true },
        { sectionId: ce201.id, title: "Midterm moved to Oct 20", body: "Same room, same duration — plan accordingly.", author: "Amadou Ba" },
      ],
    });
  }

  if ((await prisma.onboardingCase.count()) === 0) {
    await prisma.onboardingCase.createMany({
      data: [
        { name: "Emily Carter", origin: "Boston, US", kind: "Exchange", visaStatus: "Valid", arrivalDate: new Date("2026-09-02"), tasks: [{ label: "Airport pickup", done: true }, { label: "SIM + bank", done: false }] },
        { name: "Sofia Hassan", origin: "Cairo, EG", kind: "Graduate", visaStatus: "Pending", arrivalDate: new Date("2026-09-05"), tasks: [{ label: "Residency permit", done: false }, { label: "Housing letter", done: false }, { label: "Orientation", done: false }] },
        { name: "Lucas Moreau", origin: "Lyon, FR", kind: "Exchange", visaStatus: "Action needed", arrivalDate: new Date("2026-08-30"), tasks: [{ label: "Housing letter", done: false }, { label: "Permit appointment", done: false }] },
        { name: "Kwame Mensah", origin: "Accra, GH", kind: "Degree-seeking", visaStatus: "Valid", arrivalDate: new Date("2026-08-28"), tasks: [{ label: "Orientation", done: true }, { label: "Buddy match", done: true }] },
      ],
    });
  }

  if ((await prisma.abroadProgram.count()) === 0) {
    await prisma.abroadProgram.createMany({
      data: [
        { name: "MIT Summer Exchange", kind: "Study abroad", partner: "Cambridge, US", seatsTotal: 8, seatsTaken: 6, deadline: new Date("2026-09-15"), status: "open" },
        { name: "Siemens Engineering Internship", kind: "Internship", partner: "Munich, DE", seatsTotal: 4, seatsTaken: 3, deadline: new Date("2026-09-20"), status: "open" },
        { name: "Sonatel Data Science Co-op", kind: "Internship", partner: "Dakar, SN", seatsTotal: 12, seatsTaken: 12, status: "full" },
        { name: "Sorbonne Research Semester", kind: "Study abroad", partner: "Paris, FR", seatsTotal: 5, seatsTaken: 2, deadline: new Date("2026-10-01"), status: "open" },
      ],
    });
  }

  const baobab = await prisma.hall.findUnique({ where: { name: "Baobab Hall" } });
  const sahel = await prisma.hall.findUnique({ where: { name: "Sahel Hall" } });
  if (baobab && (await prisma.maintenanceTicket.count()) === 0) {
    await prisma.maintenanceTicket.createMany({
      data: [
        { hallId: baobab.id, room: "B-106", kind: "AC unit unresolved", note: "Open 11 days — follow up with facilities.", severity: "low" },
        ...(sahel ? [{ hallId: sahel.id, room: "S-303", kind: "Noise complaints ×2", note: "Two roommate-reported incidents this month.", severity: "med" }] : []),
      ],
    });
  }

  // Innovation global tasks (passes every project must complete) + per-project status rows.
  if ((await prisma.globalTask.count()) === 0) {
    await prisma.globalTask.createMany({
      data: [
        { title: "Submit Project Proposal", kind: "Document", dueDate: new Date("2025-10-03") },
        { title: "Record a 2-min Pitch Video", kind: "Video", dueDate: new Date("2025-11-28") },
        { title: "Final Report Submission", kind: "Document", dueDate: new Date("2026-06-12") },
      ],
    });
    const [tasks, projects] = await Promise.all([prisma.globalTask.findMany(), prisma.project.findMany()]);
    for (const t of tasks) {
      for (const pr of projects) {
        await prisma.projectGlobalTask.upsert({
          where: { globalTaskId_projectId: { globalTaskId: t.id, projectId: pr.id } },
          update: {},
          create: { globalTaskId: t.id, projectId: pr.id, done: t.title.includes("Proposal") },
        });
      }
    }
  }

  // Enrich seeded events for the SA events board.
  await prisma.event.updateMany({ where: { title: { contains: "Career Fair" } }, data: { organizer: "Career Services", attendees: 520, budgetXof: 4_200_000, status: "upcoming" } });
  await prisma.event.updateMany({ where: { title: { contains: "Open Mic" } }, data: { organizer: "Cultural Collective", attendees: 180, budgetXof: 1_000_000, status: "planning" } });

  console.log("Track D: materials/posts, onboarding, abroad, maintenance, global tasks seeded.");
}

/**
 * SIS reference data: grading scales, catalog years, degree-audit requirement
 * buckets and the institution fee schedule. Idempotent — keyed on natural
 * unique columns so re-seeding updates rather than duplicates.
 */
async function seedSisReference() {
  // --- Grading schemes. GPA is always derived from these points. ---
  const schemes: {
    key: string;
    name: string;
    isDefault?: boolean;
    rows: [string, number | null, number | null, number | null][];
  }[] = [
    {
      key: "letter",
      name: "Standard Letter Scale · 4.00",
      isDefault: true,
      rows: [
        ["A", 4.0, 93, 100], ["A-", 3.7, 90, 92], ["B+", 3.3, 87, 89],
        ["B", 3.0, 83, 86], ["B-", 2.7, 80, 82], ["C+", 2.3, 77, 79],
        ["C", 2.0, 73, 76], ["D", 1.0, 60, 69], ["F", 0.0, 0, 59],
      ],
    },
    {
      key: "pass",
      name: "Pass / Fail Scale",
      // Pass/Fail carries no grade points, so it is excluded from GPA.
      rows: [["P — Pass", null, 60, 100], ["F — Fail", 0.0, 0, 59]],
    },
    {
      key: "iep",
      name: "Intensive English Program Levels",
      rows: [
        ["Level 5 — Advanced", null, null, null],
        ["Level 4 — Upper Int.", null, 85, 100],
        ["Level 3 — Intermediate", null, 70, 84],
        ["Level 2 — Elementary", null, 55, 69],
        ["Level 1 — Beginner", null, 0, 54],
      ],
    },
  ];

  for (const s of schemes) {
    const scheme = await prisma.gradingScheme.upsert({
      where: { key: s.key },
      update: { name: s.name, isDefault: s.isDefault ?? false },
      create: { key: s.key, name: s.name, isDefault: s.isDefault ?? false },
    });
    await prisma.gradeScaleRow.deleteMany({ where: { schemeId: scheme.id } });
    await prisma.gradeScaleRow.createMany({
      data: s.rows.map(([grade, points, minScore, maxScore], i) => ({
        schemeId: scheme.id, grade, points, minScore, maxScore, position: i,
      })),
    });
  }

  // --- Catalog years. Exactly one active. ---
  const years: [string, "archived" | "active" | "draft"][] = [
    ["2023–2024", "archived"], ["2024–2025", "archived"], ["2025–2026", "archived"],
    ["2026–2027", "active"], ["2027–2028", "draft"],
  ];
  for (const [label, status] of years) {
    await prisma.academicYear.upsert({
      where: { label },
      update: { status },
      create: { label, status },
    });
  }
  const activeYear = await prisma.academicYear.findUnique({ where: { label: "2026–2027" } });

  // Attach every term to a catalog year so curriculum slots resolve. The year is
  // derived from the term name: Fall YYYY belongs to YYYY–YYYY+1, Spring YYYY to
  // YYYY-1–YYYY. Terms whose year has not been seeded are left unlinked.
  const yearByLabel = new Map(
    (await prisma.academicYear.findMany()).map((y) => [y.label, y.id]),
  );
  for (const term of await prisma.term.findMany()) {
    const m = /^(Fall|Spring|Summer)\s+(\d{4})$/.exec(term.name);
    if (!m) continue;
    const semester = m[1]!;
    const year = Number(m[2]);
    const start = semester === "Fall" ? year : year - 1;
    const yearId = yearByLabel.get(`${start}–${start + 1}`);
    await prisma.term.update({
      where: { id: term.id },
      data: { semester, academicYearId: yearId ?? null },
    });
  }

  // --- Degree-audit requirement buckets. The per-category credits sum to the
  // degree total (132), so `completed` can be derived from category fulfilment
  // instead of being tracked separately. ---
  const requirements: [string, number][] = [
    ["Core Engineering", 40], ["Computer Science", 36], ["Mathematics", 20],
    ["Sciences", 16], ["Humanities & English", 12], ["Free Electives", 8],
  ];
  const programs = await prisma.program.findMany();
  for (const program of programs) {
    for (const [i, [category, requiredCredits]] of requirements.entries()) {
      await prisma.programRequirement.upsert({
        where: {
          programId_catalogYear_category: {
            programId: program.id, catalogYear: "2026–2027", category,
          },
        },
        update: { requiredCredits, position: i },
        create: {
          programId: program.id, catalogYear: "2026–2027", category, requiredCredits, position: i,
        },
      });
    }
  }

  // --- Institution fee schedule (the DAUST payment plan sheet).
  // Tuition 2,975,000 + housing 680,000 + cafeteria 630,000 = 4,285,000/yr,
  // split into four equal installments. Integer XOF throughout. ---
  const feePlan: [string, string, number, string][] = [
    ["Fall", "Inscription", 1, "2026-08-25"],
    ["Fall", "2nd installment", 2, "2026-11-05"],
    ["Spring", "3rd installment", 3, "2027-01-05"],
    ["Spring", "4th installment", 4, "2027-03-05"],
  ];
  for (const [semester, label, sequence, dueOn] of feePlan) {
    await prisma.feePlanInstallment.upsert({
      where: { academicYearLabel_sequence: { academicYearLabel: "2026–2027", sequence } },
      update: { semester, label, dueOn: new Date(dueOn), amountFullXof: 1_071_250, amountTuitionXof: 743_750 },
      create: {
        academicYearLabel: "2026–2027", semester, label, sequence,
        dueOn: new Date(dueOn), amountFullXof: 1_071_250, amountTuitionXof: 743_750,
      },
    });
  }

  console.log("Seeded SIS reference data (grading schemes, catalog years, requirements, fee plan).");
}

async function main() {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
  await seedCostCenters();
  await seedStaff(passwordHash);
  await seedStudents(passwordHash);
  await seedAcademics();
  await seedGrades();
  await seedAnnouncements();
  await seedFinanceMgmt();
  await seedApplicants();
  await seedCampus();
  await seedMessages();
  await seedDining();
  await seedAffairs();
  await seedInnovation();
  await seedTrackD();
  await seedSisReference();
  console.log(`All seeded users share dev password: "${DEV_PASSWORD}"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
