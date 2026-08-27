import { COST_CENTERS, COST_CENTER_TUITION } from "@mydaust/shared";
import { PrismaClient } from "@prisma/client";
import { seedSisReference } from "./sis-reference.js";
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
  { id: "usr_fac_ndoye", email: "awa.ndoye@daust.edu", firstName: "Awa", lastName: "Ndoye", roles: ["faculty"] },
  { id: "usr_fac_sarr", email: "ibrahima.sarr@daust.edu", firstName: "Ibrahima", lastName: "Sarr", roles: ["faculty"] },
  { id: "usr_fac_cisse", email: "mariama.cisse@daust.edu", firstName: "Mariama", lastName: "Cissé", roles: ["faculty"] },
  { id: "usr_fac_diop", email: "ousmane.diop@daust.edu", firstName: "Ousmane", lastName: "Diop", roles: ["faculty"] },
  { id: "usr_fac_ndiaye", email: "fatou.ndiaye@daust.edu", firstName: "Fatou", lastName: "Ndiaye", roles: ["faculty"] },
  { id: "usr_registrar", email: "registrar@daust.edu", firstName: "Fatou", lastName: "Sow", roles: ["registrar"] },
  { id: "usr_bursar", email: "bursar@daust.edu", firstName: "Mariama", lastName: "Ndiaye", roles: ["bursar"] },
  { id: "usr_hr", email: "hr@daust.edu", firstName: "Ousmane", lastName: "Fall", roles: ["hr"] },
  { id: "usr_dining", email: "dining@daust.edu", firstName: "Ibrahima", lastName: "Sarr", roles: ["dining"] },
  { id: "usr_comms", email: "comms@daust.edu", firstName: "Awa", lastName: "Diagne", roles: ["communications"] },
  { id: "usr_it", email: "it@daust.edu", firstName: "Modou", lastName: "Cissé", roles: ["it_admin"] },
  { id: "usr_admin", email: "admin@daust.edu", firstName: "Director", lastName: "DAUST", roles: ["admin", "bursar"] },
  { id: "usr_nurse", email: "nurse@daust.edu", firstName: "Adama", lastName: "Diagne", roles: ["infirmary"] },
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

// Public-site profiles for the seeded faculty. Photos are added later from the comms
// Faculty manager (photoUrl stays null → the site shows the initials monogram).
const FACULTY_PROFILES: { id: string; title: string; dept: string; bio: string; interests: string[]; scholar: string }[] = [
  {
    id: "usr_faculty",
    title: "Associate Professor of Mechanical Engineering",
    dept: "Mechanical Engineering",
    bio: "Dr. Amadou Ba leads the Advanced Energy center at DAUST. His research spans renewable energy systems, energy storage and grid modernization, with a focus on affordable, reliable clean energy for African contexts.",
    interests: ["Renewable energy", "Energy storage", "Grid modernization"],
    scholar: "https://scholar.google.com/",
  },
  {
    id: "usr_fac_ndoye",
    title: "Professor of Mathematics",
    dept: "Mathematical Sciences",
    bio: "Prof. Awa Ndoye researches numerical methods and applied mathematics, supporting DAUST's five-year engineering curriculum with a strong foundation in mathematical modelling.",
    interests: ["Numerical analysis", "Mathematical modelling", "Optimization"],
    scholar: "https://scholar.google.com/",
  },
  {
    id: "usr_fac_sarr",
    title: "Associate Professor of Computer Engineering",
    dept: "Computer & Electrical Engineering",
    bio: "Dr. Ibrahima Sarr works on autonomous systems, deep learning and robotic perception — building AI designed for real-world, resource-aware deployment across Africa.",
    interests: ["Autonomous systems", "Deep learning", "Robotic perception"],
    scholar: "https://scholar.google.com/",
  },
  {
    id: "usr_fac_cisse",
    title: "Assistant Professor of Mechanical Engineering",
    dept: "Mechanical Engineering",
    bio: "Dr. Mariama Cissé studies fluid dynamics and experimental mechanics, applying engineering principles to problems in energy, health and the environment.",
    interests: ["Fluid dynamics", "Experimental mechanics", "Sustainable design"],
    scholar: "https://scholar.google.com/",
  },
  {
    id: "usr_fac_diop",
    title: "Assistant Professor of Electrical Engineering",
    dept: "Electrical Engineering",
    bio: "Dr. Ousmane Diop develops microfluidic platforms and biosensors aimed at precision medicine and affordable diagnostics for African clinics.",
    interests: ["Microfluidics", "Biosensors", "Biomedical instrumentation"],
    scholar: "https://scholar.google.com/",
  },
  {
    id: "usr_fac_ndiaye",
    title: "Assistant Professor of Bioengineering",
    dept: "Bioengineering",
    bio: "Dr. Fatou Ndiaye researches microbial systems and engineered biomaterials at the interface of medical science and engineering.",
    interests: ["Microbial systems", "Biomaterials", "Point-of-care devices"],
    scholar: "https://scholar.google.com/",
  },
];

/** Faculty public-site profiles. Most are toggled public; one stays private to demo the toggle. */
async function seedFacultyProfiles() {
  const madePublic = new Set(FACULTY_PROFILES.slice(0, -1).map((p) => p.id));
  for (const p of FACULTY_PROFILES) {
    await prisma.facultyProfile.upsert({
      where: { personId: p.id },
      update: {
        title: p.title,
        dept: p.dept,
        bio: p.bio,
        interests: p.interests,
        scholar: p.scholar,
        publicProfile: madePublic.has(p.id),
      },
      create: {
        personId: p.id,
        title: p.title,
        dept: p.dept,
        bio: p.bio,
        interests: p.interests,
        scholar: p.scholar,
        publicProfile: madePublic.has(p.id),
      },
    });
  }
  console.log(`Seeded ${FACULTY_PROFILES.length} faculty profiles (${madePublic.size} public, 1 private).`);
}

async function seedStudents(passwordHash: string) {
  await prisma.term.upsert({
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

  for (const student of STUDENTS) {
    const person = await prisma.person.upsert({
      where: { email: student.email },
      update: { roles: ["student"], passwordHash },
      create: {
        email: student.email,
        firstName: student.firstName,
        lastName: student.lastName,
        kind: "student",
        roles: ["student"],
        passwordHash,
      },
    });
    await prisma.student.upsert({
      where: { studentNo: student.studentNo },
      update: {},
      create: { id: student.id, personId: person.id, studentNo: student.studentNo },
    });
  }
  console.log(`Seeded ${STUDENTS.length} students.`);
}

/** Seed demo accounts with the same approved package used by live student creation. */
async function seedStandardPackages() {
  const schedule = await prisma.feeSchedule.findFirst({
    where: { status: "approved", academicYear: { status: "active" } },
    orderBy: { revision: "desc" },
    include: { rows: { orderBy: { sequence: "asc" } } },
  });
  if (!schedule || schedule.rows.some((row) => !row.dueOn)) {
    throw new Error("Seed requires a complete approved fee schedule");
  }
  const term = await prisma.term.findFirstOrThrow({
    where: { academicYear: { label: schedule.academicYearLabel } },
    orderBy: [{ startDate: "asc" }, { id: "asc" }],
  });
  const tuition = schedule.rows.reduce((sum, row) => sum + row.amountTuitionXof, 0);
  const housing = schedule.rows.reduce((sum, row) => sum + row.amountHousingXof, 0);
  const cafeteria = schedule.rows.reduce((sum, row) => sum + row.amountCafeteriaXof, 0);
  const full = schedule.rows.reduce((sum, row) => sum + row.amountFullXof, 0);
  const students = await prisma.student.findMany({
    where: { recordStatus: "active" },
    select: { id: true },
  });
  let created = 0;
  for (const student of students) {
    const existing = await prisma.invoice.findFirst({
      where: {
        studentId: student.id,
        academicYearLabel: schedule.academicYearLabel,
        packageType: "standard_full",
        status: { not: "void" },
      },
    });
    if (existing) continue;
    await prisma.invoice.create({
      data: {
        studentId: student.id,
        termId: term.id,
        totalAmount: full,
        costCenterCode: COST_CENTER_TUITION,
        description: "Annual tuition, housing and cafeteria package",
        packageType: "standard_full",
        academicYearLabel: schedule.academicYearLabel,
        feeScheduleId: schedule.id,
        feeScheduleRevision: schedule.revision,
        components: {
          create: [
            { kind: "tuition", costCenterCode: "9100", amountXof: tuition },
            { kind: "housing", costCenterCode: "3700", amountXof: housing },
            { kind: "cafeteria", costCenterCode: "3600", amountXof: cafeteria },
          ],
        },
        plan: {
          create: {
            installments: {
              create: schedule.rows.map((row) => ({
                sequence: row.sequence,
                label: row.label,
                dueDate: row.dueOn!,
                amountDue: row.amountFullXof,
              })),
            },
          },
        },
      },
    });
    created++;
  }
  console.log(`Seeded ${created} approved full-package invoice(s).`);
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

  // Settled demo payments include installment and component allocations.
  const payments: [string, string, number][] = [
    ["stu_demo_aissatou", "SEED-PAY-AISS", 1_500_000],
    ["stu_mamadou", "SEED-PAY-MAM", 991_666],
  ];
  for (const [studentId, providerRef, amount] of payments) {
    if (await prisma.payment.findUnique({ where: { providerRef } })) continue;
    const invoice = await prisma.invoice.findFirst({
      where: { studentId, packageType: "standard_full", status: { not: "void" } },
      include: {
        components: true,
        plan: { include: { installments: { orderBy: { sequence: "asc" } } } },
      },
    });
    if (!invoice) continue;
    const payment = await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        studentId,
        amount,
        method: "wave",
        status: "success",
        providerRef,
        source: "seed",
        settledAt: new Date("2026-08-10T12:00:00Z"),
      },
    });
    let remaining = amount;
    for (const installment of invoice.plan?.installments ?? []) {
      const allocated = Math.min(remaining, installment.amountDue);
      if (allocated === 0) break;
      await prisma.paymentAllocation.create({
        data: { paymentId: payment.id, installmentId: installment.id, amount: allocated },
      });
      await prisma.installment.update({
        where: { id: installment.id },
        data: {
          amountPaid: allocated,
          status: allocated >= installment.amountDue ? "paid" : "partial",
        },
      });
      remaining -= allocated;
    }
    const componentAmounts = invoice.components.map((component) => ({
      component,
      amountXof: Math.floor((amount * component.amountXof) / invoice.totalAmount),
    }));
    let remainder = amount - componentAmounts.reduce((sum, row) => sum + row.amountXof, 0);
    componentAmounts.sort((a, b) => a.component.kind.localeCompare(b.component.kind));
    for (const row of componentAmounts) {
      if (remainder === 0) break;
      row.amountXof++;
      remainder--;
    }
    await prisma.paymentComponentAllocation.createMany({
      data: componentAmounts
        .filter((row) => row.amountXof > 0)
        .map((row) => ({
          paymentId: payment.id,
          invoiceComponentId: row.component.id,
          amountXof: row.amountXof,
        })),
    });
    await prisma.invoice.update({
      where: { id: invoice.id },
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

async function seedHousing() {
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

  console.log("Housing: halls and room assignments seeded (backs the student Housing screen).");
}

async function seedTrackD() {
  // Course materials + class posts for CE 201 (faculty course-detail tabs).
  const ce201 = await prisma.section.findFirst({ where: { course: { code: "CE 201" }, term: { name: "Fall 2026" } } });
  if (ce201 && (await prisma.sectionMaterial.count({ where: { sectionId: ce201.id } })) === 0) {
    await prisma.sectionMaterial.createMany({
      data: [
        // fileUrl matters: a material without one renders as a dead link, and the
        // student read path filters those out. The unpublished row exercises the gate.
        { sectionId: ce201.id, title: "Course syllabus", kind: "Document", category: "syllabus", sortOrder: 0, fileUrl: "/uploads/seed-ce201-syllabus.pdf", fileName: "ce201-syllabus.pdf", published: true },
        { sectionId: ce201.id, title: "Week 1 — Boolean Algebra Slides", kind: "Slides", category: "lecture_notes", sortOrder: 1, fileUrl: "/uploads/seed-ce201-week1.pdf", fileName: "week1-boolean.pdf", published: true },
        { sectionId: ce201.id, title: "Lab Manual — Digital Systems", kind: "Document", category: "assignments", sortOrder: 2, fileUrl: "/uploads/seed-ce201-lab-manual.pdf", fileName: "lab-manual.pdf", published: true },
        { sectionId: ce201.id, title: "K-map Tutorial Video", kind: "Video", category: "resources", sortOrder: 3, fileUrl: "/uploads/seed-ce201-kmap.mp4", fileName: "kmap.mp4", published: false },
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

async function seedGuardians(passwordHash: string) {
  const children = await prisma.student.findMany({
    where: { person: { email: { in: ["aissatou.diallo@daust.edu", "mamadou.sy@daust.edu"] } } },
  });
  if (children.length === 0) {
    console.log("Guardians: no demo students found, skipped.");
    return;
  }

  const guardian = await prisma.person.upsert({
    where: { email: "parent@daust.edu" },
    update: { roles: ["parent"], kind: "parent", passwordHash },
    create: {
      email: "parent@daust.edu",
      firstName: "Ousmane",
      lastName: "Diallo",
      kind: "parent",
      roles: ["parent"],
      passwordHash,
    },
  });

  await prisma.guardianStudent.createMany({
    data: children.map((c) => ({ guardianId: guardian.id, studentId: c.id, relation: "Father" })),
    skipDuplicates: true,
  });

  console.log(`Guardians: parent@daust.edu linked to ${children.length} student(s).`);
}

async function seedInfirmary() {
  const studentIds = STUDENTS.map((s) => s.id);
  const nurse = await prisma.person.findUnique({ where: { id: "usr_nurse" } });

  // Ensure at least one student exists
  if (studentIds.length === 0) {
    console.log("Skipping infirmary seed: no students found.");
    return;
  }

  // Check if already seeded (idempotent)
  const existingMeds = await prisma.medication.count();
  if (existingMeds > 0) {
    console.log("Infirmary seed already present, skipping.");
    return;
  }

  // Medications
  const meds = [
    { name: "Paracetamol", category: "Analgesic", stock: 200, unit: "tablets", minStock: 50, expiryDate: new Date("2027-06-01"), supplier: "PharmaSen", status: "In Stock" },
    { name: "Amoxicillin", category: "Antibiotic", stock: 80, unit: "capsules", minStock: 30, expiryDate: new Date("2027-03-15"), supplier: "PharmaSen", status: "In Stock" },
    { name: "Ibuprofen", category: "Anti-inflammatory", stock: 15, unit: "tablets", minStock: 20, expiryDate: new Date("2027-09-01"), supplier: "MediWest", status: "Low Stock" },
    { name: "Cetirizine", category: "Antihistamine", stock: 100, unit: "tablets", minStock: 25, expiryDate: new Date("2027-12-01"), supplier: "PharmaSen", status: "In Stock" },
    { name: "Omeprazole", category: "Gastrointestinal", stock: 50, unit: "capsules", minStock: 20, expiryDate: new Date("2026-11-01"), supplier: "MediWest", status: "In Stock" },
    { name: "Metformin", category: "Antidiabetic", stock: 0, unit: "tablets", minStock: 15, expiryDate: new Date("2025-12-01"), supplier: "PharmaSen", status: "Out of Stock" },
    { name: "Salbutamol Inhaler", category: "Respiratory", stock: 8, unit: "inhalers", minStock: 5, expiryDate: new Date("2027-08-01"), supplier: "AeroMed", status: "In Stock" },
    { name: "Voltaren Gel", category: "Topical", stock: 12, unit: "tubes", minStock: 5, expiryDate: new Date("2027-05-01"), supplier: "MediWest", status: "In Stock" },
    { name: "ORS Powder", category: "Rehydration", stock: 200, unit: "sachets", minStock: 50, expiryDate: new Date("2028-01-01"), supplier: "PharmaSen", status: "In Stock" },
    { name: "Bandages", category: "First Aid", stock: 300, unit: "pieces", minStock: 100, expiryDate: new Date("2030-01-01"), supplier: "MediWest", status: "In Stock" },
  ];

  for (const m of meds) {
    await prisma.medication.create({ data: m });
  }
  console.log(`Seeded ${meds.length} medications.`);

  // Consultations
  const consultations = [
    { studentId: studentIds[0], clinicianId: nurse?.id, reason: "Recurring migraines", visitType: "Walk-in", clinicalNotes: "Student reports frequent headaches during exam periods. Prescription updated.", status: "Completed", vitalsJson: { temperature: "36.8", bloodPressure: "120/78", heartRate: "72", weight: "58" }, diagnosis: "Tension-type headaches", treatmentPlan: "Increase water intake, reduce screen time, take Paracetamol as needed", followUpRequired: true, visitedAt: new Date("2026-08-21T09:42:00Z") },
    { studentId: studentIds[1], clinicianId: nurse?.id, reason: "Annual wellness check", visitType: "Scheduled", clinicalNotes: "Routine check-up. All vitals normal.", status: "Completed", vitalsJson: { temperature: "36.6", bloodPressure: "118/72", heartRate: "68", weight: "72" }, diagnosis: "Healthy", treatmentPlan: "No treatment needed", followUpRequired: false, visitedAt: new Date("2026-08-20T14:10:00Z") },
    { studentId: studentIds[2], clinicianId: nurse?.id, reason: "Asthma review", visitType: "Follow-up", clinicalNotes: "Reviewing current inhaler usage. Symptoms well-controlled.", status: "Completed", vitalsJson: { temperature: "36.7", bloodPressure: "115/70", heartRate: "74", weight: "55" }, diagnosis: "Mild persistent asthma", treatmentPlan: "Continue Salbutamol as needed. Avoid known triggers.", followUpRequired: true, visitedAt: new Date("2026-08-13T11:25:00Z") },
  ];

  for (const c of consultations) {
    const row = await prisma.consultation.create({ data: c });
    // Prescriptions linked to consultations
    if (c.studentId === studentIds[0]) {
      await prisma.prescription.create({
        data: { consultationId: row.id, studentId: c.studentId, authorId: nurse?.id, medication: "Paracetamol", dosage: "500mg", frequency: "As needed", duration: "30 days", instructions: "Take 1-2 tablets every 6 hours. Max 4g/day.", status: "Active", prescribedAt: new Date("2026-08-21T10:00:00Z") },
      });
    }
    if (c.studentId === studentIds[2]) {
      await prisma.prescription.create({
        data: { consultationId: row.id, studentId: c.studentId, authorId: nurse?.id, medication: "Salbutamol Inhaler", dosage: "100mcg", frequency: "As needed", duration: "90 days", instructions: "2 puffs every 4-6 hours as needed for wheezing.", status: "Active", prescribedAt: new Date("2026-08-13T12:00:00Z") },
      });
    }
  }
  console.log(`Seeded ${consultations.length} consultations with prescriptions.`);

  // Appointments
  const appointments = [
    { studentId: studentIds[0], date: new Date("2026-08-25"), time: "09:00", type: "Follow-up", reason: "Migraine follow-up", status: "Scheduled", notes: "Check if new medication regimen is working" },
    { studentId: studentIds[1], date: new Date("2026-08-26"), time: "10:30", type: "Routine", reason: "Blood test results", status: "Scheduled", notes: "" },
    { studentId: studentIds[2], date: new Date("2026-08-28"), time: "14:00", type: "Follow-up", reason: "Asthma medication review", status: "Scheduled", notes: "Bring current inhaler" },
  ];

  for (const a of appointments) {
    await prisma.infirmaryAppointment.create({ data: a });
  }
  console.log(`Seeded ${appointments.length} appointments.`);

  // Follow-ups
  const followUps = [
    { studentId: studentIds[0], reason: "Migraine treatment review", dueDate: new Date("2026-08-25"), status: "Pending", priority: "High", notes: "Check if Paracetamol is effective" },
    { studentId: studentIds[2], reason: "Asthma inhaler refill check", dueDate: new Date("2026-09-01"), status: "Pending", priority: "Medium", notes: "Verify inhaler stock" },
  ];

  for (const f of followUps) {
    await prisma.followUp.create({ data: f });
  }
  console.log(`Seeded ${followUps.length} follow-ups.`);

  // Documents
  const docs = [
    { studentId: studentIds[0], uploaderId: nurse?.id, name: "Migraine Treatment Plan", type: "Medical Record", notes: "Updated treatment plan for recurring migraines", createdAt: new Date("2026-08-21T10:30:00Z") },
    { studentId: studentIds[2], uploaderId: nurse?.id, name: "Asthma Action Plan", type: "Medical Record", notes: "Annual asthma management plan", createdAt: new Date("2026-08-13T13:00:00Z") },
  ];

  for (const d of docs) {
    await prisma.infirmaryDocument.create({ data: d });
  }
  console.log(`Seeded ${docs.length} medical documents.`);

  // Forms
  const form1 = await prisma.infirmaryForm.create({
    data: {
      name: "Pre-arrival wellness questionnaire",
      description: "Collect essential health information before students arrive on campus.",
      questions: [
        { id: "Q1", text: "Do you have any known allergies?", type: "yes_no", required: true },
        { id: "Q2", text: "If yes, please list your allergies", type: "text", required: false },
        { id: "Q3", text: "Do you have any chronic medical conditions?", type: "yes_no", required: true },
        { id: "Q4", text: "List any current medications", type: "text", required: false },
        { id: "Q5", text: "Rate your overall health (1-5)", type: "rating", required: true },
        { id: "Q6", text: "Have you had any surgeries in the past 2 years?", type: "yes_no", required: true },
      ],
      status: "Published",
      updatedAt: new Date("2026-08-20T12:00:00Z"),
    },
  });

  const form2 = await prisma.infirmaryForm.create({
    data: {
      name: "Sports clearance 2026",
      description: "Screening form for students joining an athletic program.",
      questions: [
        { id: "Q1", text: "Which sport do you participate in?", type: "text", required: true },
        { id: "Q2", text: "Have you had any sports injuries?", type: "yes_no", required: true },
        { id: "Q3", text: "Do you have a heart condition?", type: "yes_no", required: true },
        { id: "Q4", text: "Rate your fitness level (1-5)", type: "rating", required: true },
        { id: "Q5", text: "Do you carry an EpiPen?", type: "yes_no", required: true },
      ],
      status: "Published",
      updatedAt: new Date("2026-08-15T10:00:00Z"),
    },
  });

  // Form responses
  const responses = [
    { formId: form1.id, studentId: studentIds[0], studentName: "Aïssatou Diallo", answers: { Q1: "Yes", Q2: "Penicillin", Q3: "No", Q4: "", Q5: "4", Q6: "No" }, submittedAt: new Date("2026-08-18T10:30:00Z") },
    { formId: form1.id, studentId: studentIds[1], studentName: "Mamadou Ndiaye", answers: { Q1: "No", Q2: "", Q3: "No", Q4: "", Q5: "5", Q6: "No" }, submittedAt: new Date("2026-08-17T14:15:00Z") },
    { formId: form2.id, studentId: studentIds[2], studentName: "Binata Sow", answers: { Q1: "Basketball", Q2: "No", Q3: "No", Q4: "4", Q5: "No" }, submittedAt: new Date("2026-08-16T09:00:00Z") },
  ];

  for (const r of responses) {
    await prisma.infirmaryFormResponse.create({ data: r });
  }
  console.log(`Seeded ${responses.length} form responses.`);

  // Settings
  const settingsData: [string, unknown][] = [
    ["infirmary:clinic_name", "DAUST Health Center"],
    ["infirmary:clinic_address", "Dakar, Senegal"],
    ["infirmary:clinic_phone", "+221 33 000 0000"],
    ["infirmary:clinic_email", "health@daust.sn"],
    ["infirmary:notifications_enabled", "true"],
    ["infirmary:appointment_duration", "30"],
    ["infirmary:working_hours_start", "08:00"],
    ["infirmary:working_hours_end", "17:00"],
  ];

  for (const [key, value] of settingsData) {
    await prisma.appSetting.upsert({
      where: { key },
      update: { valueJson: value },
      create: { key, valueJson: value },
    });
  }
  console.log("Seeded infirmary settings.");
}

async function main() {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
  await seedCostCenters();
  await seedStaff(passwordHash);
  await seedFacultyProfiles();
  await seedStudents(passwordHash);
  await seedAcademics();
  await seedSisReference(prisma);
  await seedStandardPackages();
  await seedGrades();
  await seedAnnouncements();
  await seedFinanceMgmt();
  await seedApplicants();
  await seedCampus();
  await seedMessages();
  await seedDining();
  await seedHousing();
  await seedTrackD();
  await seedGuardians(passwordHash);
  await seedInfirmary();
  console.log(`All seeded users share dev password: "${DEV_PASSWORD}"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
