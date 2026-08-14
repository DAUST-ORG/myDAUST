import { afterEach, describe, expect, it, vi } from "vitest";
import { AcademicsService } from "../academics/academics.service.js";
import { GuardiansService } from "../guardians/guardians.service.js";
import { FinanceService } from "./finance.service.js";

const term = { id: "term", name: "Fall 2026" };
const invoices = [
  {
    id: "tuition",
    studentId: "student",
    status: "partial",
    totalAmount: 1_000,
    amountPaid: 200,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    description: "Tuition",
    number: "INV-1",
    student: { recordStatus: "active" },
    term,
    plan: {
      installments: [
        {
          id: "past",
          sequence: 1,
          dueDate: new Date("2026-08-01T00:00:00Z"),
          amountDue: 500,
          amountPaid: 200,
          status: "partial",
        },
        {
          id: "future",
          sequence: 2,
          dueDate: new Date("2026-09-01T00:00:00Z"),
          amountDue: 500,
          amountPaid: 0,
          status: "pending",
        },
      ],
    },
    payments: [],
    paymentSubmissions: [],
  },
  {
    id: "credit",
    studentId: "student",
    status: "open",
    totalAmount: -100,
    amountPaid: 0,
    createdAt: new Date("2026-07-02T00:00:00Z"),
    description: "Scholarship",
    number: "CM-1",
    student: { recordStatus: "active" },
    term,
    plan: null,
    payments: [],
    paymentSubmissions: [],
  },
  {
    id: "no-plan",
    studentId: "student",
    status: "open",
    totalAmount: 200,
    amountPaid: 0,
    createdAt: new Date("2026-07-03T00:00:00Z"),
    description: "Library charge",
    number: "INV-2",
    student: { recordStatus: "active" },
    term,
    plan: null,
    payments: [],
    paymentSubmissions: [],
  },
];

const student = {
  id: "student",
  studentNo: "DAUST-001",
  dateOfBirth: new Date("2005-01-02T00:00:00Z"),
  photoUrl: null,
  recordStatus: "active",
  person: {
    firstName: "Awa",
    lastName: "Ndiaye",
    email: "awa@daust.edu",
    passwordHash: null,
    mustChangePassword: false,
  },
  programId: "program",
  program: { id: "program", code: "BSCS", name: "Computer Science" },
  yearLevel: 1,
  cohort: "2026",
  standing: null,
  holds: [
    {
      id: "hold",
      type: "advising",
      reason: "See adviser",
      placedAt: new Date(),
    },
  ],
  transcriptEntries: [],
  enrollments: [],
  invoices,
};

function service() {
  const prisma = {
    invoice: {
      findMany: vi.fn().mockResolvedValue(invoices),
      groupBy: vi.fn().mockResolvedValue([{ status: "open", _count: 3 }]),
    },
    payment: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 200 } }),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    student: {
      findUnique: vi.fn().mockResolvedValue(student),
      findMany: vi.fn().mockResolvedValue([student]),
    },
    studentHold: { findMany: vi.fn().mockResolvedValue(student.holds) },
    approvalRequest: { findMany: vi.fn().mockResolvedValue([]) },
    guardianStudent: {
      findMany: vi.fn().mockResolvedValue([{ student, relation: "parent" }]),
    },
    programRequirement: { groupBy: vi.fn().mockResolvedValue([]) },
    program: {
      findUnique: vi.fn().mockResolvedValue({
        id: "program",
        code: "BSCS",
        name: "Computer Science",
        departmentId: "department",
        department: { id: "department", name: "Computer Science" },
        degree: "BSc",
        school: "Engineering",
        tuition: 1_000,
        color: null,
        students: [student],
      }),
    },
    course: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return {
    prisma,
    finance: new FinanceService(
      prisma as never,
      { send: vi.fn() } as never,
      {} as never,
      {} as never,
    ),
  };
}

describe("finance API account-summary parity", () => {
  afterEach(() => vi.useRealTimers());

  it("returns the same canonical summary on student, bursar, list and public reads", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T12:00:00Z"));
    const { finance } = service();

    const studentSummary = await finance.getStudentBillingSummary("student");
    const account = await finance.getStudentAccount("student");
    const accountRows = await finance.listStudentAccounts();
    const publicBill = await finance.lookupBill("DAUST-001", "2005-01-02");
    const collection = await finance.getCollectionSummary();

    expect(studentSummary).toMatchObject({
      outstandingXof: 900,
      overdueXof: 200,
      notYetDueXof: 500,
      unscheduledXof: 200,
    });
    expect(account.summary).toEqual(studentSummary);
    expect(accountRows[0]?.summary).toEqual(studentSummary);
    expect(publicBill.summary).toEqual(studentSummary);
    expect(collection.summary).toEqual(studentSummary);
    expect(publicBill.balanceXof).toBe(studentSummary.balanceXof);
    expect(account.activeHolds).toHaveLength(1);
  });

  it("keeps guardian, registrar and program rosters identical to finance and public billing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T12:00:00Z"));
    const { finance, prisma } = service();
    const guardians = new GuardiansService(
      prisma as never,
      { send: vi.fn() } as never,
      finance,
    );
    const academics = new AcademicsService(prisma as never);

    const [canonical, publicBill, children, registrar, program] =
      await Promise.all([
        finance.getStudentBillingSummary("student"),
        finance.lookupBill("DAUST-001", "2005-01-02"),
        guardians.myChildren("guardian"),
        academics.adminStudents(),
        academics.programDetail("BSCS"),
      ]);

    expect(publicBill.summary).toEqual(canonical);
    expect(children[0]?.summary).toEqual(canonical);
    expect(registrar[0]?.summary).toEqual(canonical);
    expect(program.students[0]?.summary).toEqual(canonical);
  });

  it("keeps unscheduled debt outside current aging and reports real holds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T12:00:00Z"));
    const { finance } = service();

    const aging = await finance.arAging();

    expect(aging.totalOutstanding).toBe(900);
    expect(
      aging.buckets.find((bucket) => bucket.key === "current"),
    ).toMatchObject({
      amount: 500,
      accountCount: 1,
      installmentCount: 1,
    });
    expect(
      aging.buckets.find((bucket) => bucket.key === "unscheduled"),
    ).toMatchObject({ amount: 200, accountCount: 1, installmentCount: 0 });
    expect(aging.buckets.find((bucket) => bucket.key === "1-30")).toMatchObject(
      {
        amount: 200,
        accountCount: 1,
        installmentCount: 1,
      },
    );
    expect(aging.accountCounts.overdue).toBe(1);
    expect(aging.activeHoldAccountCount).toBe(1);
  });
});
