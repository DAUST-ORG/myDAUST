"use client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** HTTP error carrying the status so callers can branch; `message` is always human-readable. */
export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// Friendly copy for statuses whose server body is jargon or empty. 4xx validation/conflict
// messages (e.g. "This ID is already assigned") are user-meaningful, so those are kept as-is.
const FRIENDLY: Record<number, string> = {
  401: "Your session has expired. Please sign in again.",
  403: "You do not have permission to do that.",
  500: "Something went wrong on our end. Please try again.",
  502: "The server is unavailable right now. Please try again.",
  503: "The server is unavailable right now. Please try again.",
};

async function toApiError(res: Response): Promise<ApiError> {
  const text = await res.text();
  let serverMsg = "";
  try {
    const body = JSON.parse(text);
    serverMsg = typeof body?.message === "string"
      ? body.message
      : Array.isArray(body?.message)
        ? body.message.join(", ")
        : typeof body?.error === "string"
          ? body.error
          : "";
  } catch {
    serverMsg = text;
  }
  const overrideWithFriendly = res.status >= 500 || res.status === 401 || res.status === 403;
  const message = overrideWithFriendly
    ? FRIENDLY[res.status] ?? serverMsg ?? `Request failed (${res.status}).`
    : serverMsg || FRIENDLY[res.status] || `Request failed (${res.status}).`;
  return new ApiError(res.status, message);
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    credentials: "include", // send/receive the session cookie
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw await toApiError(res);
  const ct = res.headers.get("content-type") ?? "";
  return (ct.includes("application/json") ? res.json() : res.text()) as Promise<T>;
}

export { API_URL };

/** Resolve a stored relative upload URL (`/uploads/x`) to an absolute, fetchable URL. */
export const fileUrl = (path: string) => (path.startsWith("http") ? path : `${API_URL}${path}`);

// --- File upload (Track P: local disk now, S3 later) ---
export interface UploadResult {
  url: string;
  name: string;
  size: number;
}
export async function uploadFile(file: File): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/api/uploads`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) throw await toApiError(res);
  return res.json() as Promise<UploadResult>;
}

// --- Auth ---
export interface Me {
  personId: string;
  roles: string[];
  studentId?: string;
  email: string;
  name: string;
}
export const login = (email: string, password: string) =>
  request<Me>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
export const logout = () => request<{ ok: boolean }>("/auth/logout", { method: "POST" });

/** Sidebar badge counts + the identity line, both scoped to the caller's roles. */
export interface NavContext {
  badges: Record<string, string>;
  meta: string | null;
}
export const getNavContext = () => request<NavContext>("/nav/context");
export const getMe = () => request<Me>("/auth/me");

// --- Finance: student ---
export interface BillingInstallment {
  id: string;
  sequence: number;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  status: string;
}
export interface BillingPayment {
  id: string;
  amount: number;
  method: string;
  status: string;
  createdAt: string;
}
export interface BillingInvoice {
  id: string;
  term: string;
  total: number;
  paid: number;
  balance: number;
  status: string;
  installments: BillingInstallment[];
  payments: BillingPayment[];
}
export const getMyBilling = () => request<BillingInvoice[]>("/finance/my/billing");
export const initiatePayment = (invoiceId: string, amount: number, method: string) =>
  request<{ paymentId: string; redirectUrl: string }>("/finance/my/payments", {
    method: "POST",
    body: JSON.stringify({ invoiceId, amount, method }),
  });

// --- Finance: admin ---
export interface CollectionSummary {
  currency: string;
  billed: number;
  collected: number;
  outstanding: number;
  collectionRate: number;
  byMethod: { method: string; amount: number; count: number }[];
  invoicesByStatus: { status: string; count: number }[];
}
export const getAdminSummary = () => request<CollectionSummary>("/finance/admin/summary");

export interface AdminPayment {
  id: string;
  student: string;
  studentNo: string;
  term: string;
  amount: number;
  method: string;
  status: string;
  providerRef: string;
  createdAt: string;
}
export const getAdminPayments = (status?: string) =>
  request<AdminPayment[]>(`/finance/admin/payments${status ? `?status=${status}` : ""}`);

// --- Academics ---
export interface Term {
  id: string;
  name: string;
}
export interface Section {
  id: string;
  courseCode: string;
  title: string;
  credits: number;
  sectionCode: string;
  /** Registration status set by the registrar: "open" | "closed". Independent of seats left. */
  status: string;
  capacity: number;
  seatsTaken: number;
  seatsLeft: number;
  schedule: string;
  days: string;
  startTime: string;
  endTime: string;
  room: string | null;
  instructor: string | null;
  instructorId: string | null;
  termId: string;
  prerequisites: string[];
}
export interface MyEnrollment {
  enrollmentId: string;
  sectionId: string;
  courseCode: string;
  title: string;
  credits: number;
  sectionCode: string;
  term: string;
  days: string;
  startTime: string;
  endTime: string;
  schedule: string;
  room: string | null;
}
export const getCurrentTerm = () => request<Term>("/academics/current-term");
export const getSections = (termId: string) =>
  request<Section[]>(`/academics/sections?termId=${termId}`);
export const getMyEnrollments = () => request<MyEnrollment[]>("/academics/my/enrollments");
export const enrollSection = (sectionId: string) =>
  request("/academics/my/enroll", { method: "POST", body: JSON.stringify({ sectionId }) });
export const dropEnrollment = (enrollmentId: string) =>
  request("/academics/my/drop", { method: "POST", body: JSON.stringify({ enrollmentId }) });

export interface TeachingSection {
  id: string;
  course: string;
  sectionCode: string;
  term: string;
  schedule: string;
  room: string | null;
  enrolled: number;
  capacity: number;
}
export interface Roster {
  course: string;
  sectionCode: string;
  students: { studentNo: string; name: string; grade: string | null }[];
}
export const getTeaching = () => request<TeachingSection[]>("/academics/teaching");

// --- Faculty dashboard + insights (teacher design) ---
export interface FacultyClass {
  sectionId: string;
  code: string;
  title: string;
  color: string;
  students: number;
  attendance: number | null;
  ungraded: number;
  room: string | null;
  days: string;
  startTime: string;
  endTime: string;
  term: string;
}
export interface FacultyOverview {
  kpis: { activeCourses: number; studentsTaught: number; itemsToGrade: number; avgAttendance: number | null };
  classes: FacultyClass[];
  today: { sectionId: string; time: string; end: string; label: string; sub: string }[];
  needsAttention: { label: string; meta: string; sectionId: string; tone: string }[];
}
export const getFacultyOverview = () => request<FacultyOverview>("/academics/teaching/overview");

export interface FacultyScheduleItem {
  sectionId: string;
  code: string;
  title: string;
  color: string;
  days: string;
  startTime: string;
  endTime: string;
  room: string | null;
}
export const getFacultySchedule = () => request<FacultyScheduleItem[]>("/academics/teaching/schedule");

export interface Advisee {
  studentNo: string;
  name: string;
  program: string;
  gpa: number;
  atRisk: boolean;
  deansList: boolean;
}
export const getAdvisees = () => request<Advisee[]>("/academics/teaching/advisees");

export interface SectionInsights {
  course: string;
  sectionCode: string;
  kpis: { attendance: number | null; passRate: number | null; itemsToGrade: number; atRiskCount: number };
  distribution: { label: string; count: number }[];
  trend: { date: string; pct: number }[];
  atRisk: { name: string; studentNo: string; reason: string; severity: string }[];
}
export const getSectionInsights = (sectionId: string) =>
  request<SectionInsights>(`/academics/sections/${sectionId}/insights`);
export const getRoster = (sectionId: string) =>
  request<Roster>(`/academics/sections/${sectionId}/roster`);

// --- Gradebook + attendance (faculty) ---
export interface Gradebook {
  course: string;
  sectionCode: string;
  students: { enrollmentId: string; studentNo: string; name: string; grade: string | null; status: string }[];
}
export const getGradebook = (sectionId: string) =>
  request<Gradebook>(`/academics/sections/${sectionId}/gradebook`);
export const submitGrades = (
  sectionId: string,
  grades: { enrollmentId: string; grade: string | null }[],
  finalize: boolean,
) =>
  request(`/academics/sections/${sectionId}/grades`, {
    method: "POST",
    body: JSON.stringify({ grades, finalize }),
  });

export interface AttendanceSheet {
  date: string;
  students: { enrollmentId: string; studentNo: string; name: string; status: string }[];
}
export const getAttendance = (sectionId: string, date: string) =>
  request<AttendanceSheet>(`/academics/sections/${sectionId}/attendance?date=${date}`);
export const markAttendance = (
  sectionId: string,
  date: string,
  records: { enrollmentId: string; status: string }[],
) =>
  request(`/academics/sections/${sectionId}/attendance`, {
    method: "POST",
    body: JSON.stringify({ date, records }),
  });

// --- Assignments + submissions (faculty) ---
export interface SectionAssignment {
  id: string;
  title: string;
  type: string;
  maxPoints: number;
  weight: number;
  dueDate: string;
  submitted: number;
  graded: number;
}
export interface SectionAssignments {
  enrolled: number;
  assignments: SectionAssignment[];
}
export const getSectionAssignments = (sectionId: string) =>
  request<SectionAssignments>(`/academics/sections/${sectionId}/assignments`);
export const createAssignment = (
  sectionId: string,
  body: { title: string; description?: string; type: string; maxPoints: number; weight: number; dueDate: string },
) => request(`/academics/sections/${sectionId}/assignments`, { method: "POST", body: JSON.stringify(body) });

export interface SubmissionRow {
  enrollmentId: string;
  studentNo: string;
  name: string;
  submissionId: string | null;
  status: string;
  text: string | null;
  fileUrl: string | null;
  fileName: string | null;
  score: number | null;
  feedback: string | null;
  submittedAt: string | null;
}
export interface AssignmentSubmissions {
  assignment: {
    id: string;
    title: string;
    description: string | null;
    type: string;
    maxPoints: number;
    weight: number;
    dueDate: string;
    course: string;
    sectionId: string;
  };
  submissions: SubmissionRow[];
}
export const getAssignmentSubmissions = (assignmentId: string) =>
  request<AssignmentSubmissions>(`/academics/assignments/${assignmentId}/submissions`);
export const gradeSubmission = (submissionId: string, score: number, feedback?: string) =>
  request(`/academics/submissions/${submissionId}/grade`, {
    method: "POST",
    body: JSON.stringify({ score, feedback }),
  });

// --- Assignments (student) ---
export interface MyAssignment {
  assignmentId: string;
  title: string;
  type: string;
  courseCode: string;
  sectionId: string;
  maxPoints: number;
  dueDate: string;
  status: string;
  score: number | null;
  feedback: string | null;
  submittedAt: string | null;
}
export const getMyAssignments = () => request<MyAssignment[]>("/academics/my/assignments");
export const submitAssignment = (
  assignmentId: string,
  body: { text?: string; fileUrl?: string; fileName?: string },
) => request(`/academics/my/assignments/${assignmentId}/submit`, { method: "POST", body: JSON.stringify(body) });

export interface CourseDetail {
  overview: {
    courseCode: string;
    title: string;
    credits: number;
    description: string | null;
    term: string;
    instructor: string | null;
    schedule: string;
    room: string | null;
    prerequisites: string[];
    status: string;
    grade: string | null;
  };
  assignments: {
    assignmentId: string;
    title: string;
    type: string;
    maxPoints: number;
    weight: number;
    dueDate: string;
    status: string;
    score: number | null;
    feedback: string | null;
  }[];
}
export const getCourseDetail = (sectionId: string) =>
  request<CourseDetail>(`/academics/my/sections/${sectionId}`);

export interface MySummary {
  enrolledCourses: number;
  credits: number;
  gpa: number;
  completedCredits: number;
}
export interface GradeRow {
  courseCode: string;
  title: string;
  credits: number;
  term: string;
  grade: string | null;
  points: number | null;
}
export const getMySummary = () => request<MySummary>("/academics/my/summary");
export const getMyGrades = () => request<GradeRow[]>("/academics/my/grades");

export interface AdminStats {
  totalStudents: number;
  totalEnrolled: number;
  /** Students carrying an unpaid balance — a headcount, not an amount. */
  holdsCount: number;
  openApplications: number;
  byProgram: { code: string; name: string; students: number }[];
}
export interface AdminStudent {
  id: string;
  studentNo: string;
  name: string;
  email: string;
  photoUrl: string | null;
  program: string;
  programName: string | null;
  yearLevel: number | null;
  cohort: string | null;
  gpa: number;
  completedCredits: number;
  balance: number;
  status: string;
}
export interface ProgramRow {
  code: string;
  name: string;
  department: string;
  students: number;
  degree: string | null;
  school: string | null;
  tuition: number | null;
  color: string | null;
}
export interface AdminPrograms {
  programs: ProgramRow[];
  courses: { code: string; title: string; credits: number; department: string; status: string; prereq: string | null }[];
  departments: { id: string; code: string; name: string }[];
}
export const createProgram = (input: { code: string; name: string; departmentId: string; degree?: string | null; school?: string | null; tuition?: number | null; color?: string | null }) =>
  request<{ id: string }>("/academics/admin/programs", { method: "POST", body: JSON.stringify(input) });
export const createCourse = (input: { code: string; title: string; credits: number; departmentId: string } & CourseCatalogInput) =>
  request<{ id: string }>("/academics/admin/courses", { method: "POST", body: JSON.stringify(input) });

export interface ProgramDetail {
  code: string;
  name: string;
  department: string;
  degree: string | null;
  school: string | null;
  tuition: number | null;
  color: string | null;
  stats: { studentCount: number; billed: number; paid: number; revenue: number; yearDist: number[] };
  students: { id: string; studentNo: string; name: string; photoUrl: string | null; yearLevel: number | null; gpa: number; completedCredits: number; balance: number; status: string }[];
  courses: { code: string; title: string; credits: number }[];
}
export const getProgramDetail = (code: string) => request<ProgramDetail>(`/academics/admin/programs/${encodeURIComponent(code)}`);
export interface UpdateProgramInput {
  name?: string;
  departmentId?: string;
  degree?: string | null;
  school?: string | null;
  tuition?: number | null;
  color?: string | null;
}
export const updateProgram = (code: string, input: UpdateProgramInput) =>
  request(`/academics/admin/programs/${encodeURIComponent(code)}`, { method: "PATCH", body: JSON.stringify(input) });

export interface CourseSection {
  id: string;
  sectionCode: string;
  term: string;
  termId: string;
  instructor: string | null;
  instructorId: string | null;
  days: string;
  startTime: string;
  endTime: string;
  room: string | null;
  capacity: number;
  seatsTaken: number;
}
export interface AdminCourseDetail {
  id: string;
  code: string;
  title: string;
  credits: number;
  status: string;
  description: string | null;
  semestersOffered: string[];
  department: string;
  departmentId: string;
  prerequisites: { code: string; title: string }[];
  corequisites: { code: string; title: string }[];
  sections: CourseSection[];
  allCourses: { code: string; title: string }[];
  departments: { id: string; code: string; name: string }[];
  terms: { id: string; name: string }[];
}

export interface CourseCatalogInput {
  title?: string;
  credits?: number;
  departmentId?: string;
  status?: "active" | "draft";
  description?: string | null;
  semestersOffered?: ("fall" | "spring" | "summer")[];
  prerequisiteCodes?: string[];
  corequisiteCodes?: string[];
}
export const deleteCourse = (code: string) =>
  request<{ ok: boolean }>(`/academics/admin/courses/${encodeURIComponent(code)}`, { method: "DELETE" });
export const getAdminCourseDetail = (code: string) => request<AdminCourseDetail>(`/academics/admin/courses/${encodeURIComponent(code)}`);
export const updateCourse = (code: string, input: CourseCatalogInput) =>
  request(`/academics/admin/courses/${encodeURIComponent(code)}`, { method: "PATCH", body: JSON.stringify(input) });
export interface SectionInput {
  courseCode: string;
  termId: string;
  sectionCode: string;
  instructorId?: string | null;
  capacity: number;
  days: string;
  startTime: string;
  endTime: string;
  room?: string | null;
}
export const createSection = (input: SectionInput) =>
  request<{ id: string }>("/academics/admin/sections", { method: "POST", body: JSON.stringify(input) });
export const updateSection = (
  id: string,
  input: Partial<Omit<SectionInput, "courseCode">> & { status?: "open" | "closed" },
) =>
  request(`/academics/admin/sections/${id}`, { method: "PATCH", body: JSON.stringify(input) });
export const deleteSection = (id: string) =>
  request<{ ok: boolean }>(`/academics/admin/sections/${id}`, { method: "DELETE" });
export const getAdminStats = () => request<AdminStats>("/academics/admin/stats");
export const getAdminStudents = () => request<AdminStudent[]>("/academics/admin/students");
export interface AdminStudentDetail {
  id: string;
  studentNo: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  photoUrl: string | null;
  program: string | null;
  programCode: string | null;
  department: string | null;
  gpa: number;
  completedCredits: number;
  currentTermCredits: number;
  standing: string;
  status: string;
  balance: number;
  dateOfBirth: string | null;
  gender: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  nationality: string | null;
  guardianName: string | null;
  guardianRelation: string | null;
  guardianPhone: string | null;
  advisor: string | null;
  yearLevel: number | null;
  cohort: string | null;
  enrolledAt: string | null;
  preferredName: string | null;
  nationalId: string | null;
  maritalStatus: string | null;
  personalEmail: string | null;
  bloodType: string | null;
  allergies: string | null;
  insurance: string | null;
  physician: string | null;
  emergencyName2: string | null;
  emergencyPhone2: string | null;
  major: string | null;
  minor: string | null;
  admitTerm: string | null;
  expectedGrad: string | null;
  enrollmentStatus: string | null;
  catalogYear: string | null;
  enrollments: { enrollmentId: string; courseCode: string; title: string; credits: number; term: string; sectionCode: string; instructor: string | null; status: string; grade: string | null }[];
}
export const getAdminStudentDetail = (id: string) =>
  request<AdminStudentDetail>(`/academics/admin/students/${id}`);
export interface StudentActivity {
  type: string;
  title: string;
  detail: string;
  at: string;
}
export const getAdminStudentActivity = (id: string) =>
  request<StudentActivity[]>(`/academics/admin/students/${id}/activity`);
export interface UpdateStudentInput {
  fullName?: string;
  email?: string;
  programCode?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  nationality?: string | null;
  guardianName?: string | null;
  guardianRelation?: string | null;
  guardianPhone?: string | null;
  advisor?: string | null;
  yearLevel?: number | null;
  cohort?: string | null;
  preferredName?: string | null;
  nationalId?: string | null;
  maritalStatus?: string | null;
  personalEmail?: string | null;
  bloodType?: string | null;
  allergies?: string | null;
  insurance?: string | null;
  physician?: string | null;
  emergencyName2?: string | null;
  emergencyPhone2?: string | null;
  major?: string | null;
  minor?: string | null;
  admitTerm?: string | null;
  expectedGrad?: string | null;
  enrollmentStatus?: string | null;
  catalogYear?: string | null;
}
export const updateStudent = (id: string, input: UpdateStudentInput) =>
  request<AdminStudentDetail>(`/academics/admin/students/${id}`, { method: "PATCH", body: JSON.stringify(input) });
export const adminDropEnrollment = (enrollmentId: string) =>
  request(`/academics/admin/enrollments/${enrollmentId}/drop`, { method: "POST" });
export const getAdminPrograms = () => request<AdminPrograms>("/academics/admin/programs");

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: string;
  audience: string;
  author: string | null;
  createdAt: string;
}
export const getAnnouncements = () => request<Announcement[]>("/comms/announcements");
export const createAnnouncement = (body: { title: string; body: string; category: string; audience: string }) =>
  request("/comms/announcements", { method: "POST", body: JSON.stringify(body) });

// --- Messaging ---
export interface ThreadSummary {
  id: string;
  subject: string | null;
  who: string;
  role: string;
  initials: string;
  preview: string;
  time: string;
  unread: number;
}
export interface ThreadMessage {
  id: string;
  body: string;
  me: boolean;
  sender: string;
  time: string;
}
export interface ThreadDetail {
  id: string;
  subject: string | null;
  who: string;
  role: string;
  initials: string;
  messages: ThreadMessage[];
}
export interface Contact {
  id: string;
  name: string;
  role: string;
  initials: string;
}
export const getThreads = () => request<ThreadSummary[]>("/comms/threads");
export const getThread = (id: string) => request<ThreadDetail>(`/comms/threads/${id}`);
export const getContacts = () => request<Contact[]>("/comms/contacts");
export const sendThreadMessage = (id: string, body: string) =>
  request<{ id: string }>(`/comms/threads/${id}/messages`, { method: "POST", body: JSON.stringify({ body }) });
export const startThread = (recipientId: string, body: string, subject?: string) =>
  request<{ threadId: string }>("/comms/threads", { method: "POST", body: JSON.stringify({ recipientId, body, subject }) });
/** Message every enrolled student in one of your own sections, as individual threads. */
export const broadcastToSection = (sectionId: string, body: string, subject?: string) =>
  request<{ sent: number; course: string }>(`/comms/sections/${sectionId}/broadcast`, {
    method: "POST",
    body: JSON.stringify({ body, subject }),
  });

// --- Campus: events + library ---
export interface CampusEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  category: string;
  startsAt: string;
  endsAt: string | null;
}
export const getEvents = () => request<CampusEvent[]>("/campus/events");

export interface LibraryResource {
  id: string;
  title: string;
  author: string | null;
  kind: string;
  subject: string | null;
  callNumber: string | null;
  available: boolean;
}
export const getLibrary = (q?: string) =>
  request<LibraryResource[]>(`/campus/library${q ? `?q=${encodeURIComponent(q)}` : ""}`);

// --- Dining ---
export interface DiningPass { token: string; studentNo: string; name: string; plan: string; active: boolean }
export const getDiningPass = () => request<DiningPass>("/dining/my/pass");
export const chooseMealPlan = (type: string) => request("/dining/my/plan", { method: "POST", body: JSON.stringify({ type }) });

export interface MenuItem { id: string; name: string; description: string | null; category: string; priceXof: number; imageUrl: string | null; available: boolean }
export const getMenu = () => request<MenuItem[]>("/dining/menu");

export interface DiningOrder { id: string; status: string; totalXof: number; createdAt: string; items: { name: string; qty: number; priceXof: number }[] }
export const getMyDiningOrders = () => request<DiningOrder[]>("/dining/my/orders");
export const createDiningOrder = (items: { menuItemId: string; qty: number }[]) =>
  request<{ id: string }>("/dining/my/orders", { method: "POST", body: JSON.stringify({ items }) });
export const payDiningOrder = (id: string) =>
  request<{ paid: boolean; redirectUrl?: string }>(`/dining/my/orders/${id}/pay`, { method: "POST" });

export interface ScanResult { result: string; reason: string | null; name: string | null; studentNo: string | null }
export const diningScan = (token: string, period: string) =>
  request<ScanResult>("/dining/scan", { method: "POST", body: JSON.stringify({ token, period }) });
export interface LiveScans { period: string; served: number; turnedAway: number; recent: { name: string; studentNo: string; result: string; reason: string | null; time: string }[] }
export const getLiveScans = (period: string) => request<LiveScans>(`/dining/scans?period=${period}`);

export interface DiningOverview {
  periods: { period: string; served: number; turnedAway: number }[];
  activePlans: number;
  planMix: { type: string; count: number }[];
  openOrders: number;
  weekendRevenue: number;
}
export const getDiningOverview = () => request<DiningOverview>("/dining/admin/overview");
export interface AdminDiningOrder { id: string; student: string; status: string; totalXof: number; items: string[]; createdAt: string }
export const getAdminDiningOrders = () => request<AdminDiningOrder[]>("/dining/admin/orders");
export const advanceDiningOrder = (id: string, status: string) =>
  request(`/dining/admin/orders/${id}/advance`, { method: "POST", body: JSON.stringify({ status }) });
export const getDiningSettlement = () => request<{ orders: number; revenue: number; settledTo: string }>("/dining/admin/settlement");
export const getAdminMenu = () => request<MenuItem[]>("/dining/admin/menu");
export const createMenuItem = (body: { name: string; description?: string; category: string; priceXof: number }) =>
  request("/dining/admin/menu", { method: "POST", body: JSON.stringify(body) });
export const toggleMenuItem = (id: string) => request(`/dining/admin/menu/${id}/toggle`, { method: "POST" });

// --- Student Affairs ---
export interface AffairsDashboard {
  occupancy: { beds: number; filled: number; pct: number };
  pendingAssignments: number;
  openConductCases: number;
  budget: { allocated: number; spent: number; pct: number };
}
export const getAffairsDashboard = () => request<AffairsDashboard>("/affairs/dashboard");

export interface Hall { id: string; name: string; kind: string; beds: number; filled: number; color: string }
export const getHalls = () => request<Hall[]>("/affairs/halls");

export interface HousingRow { assignmentId: string; studentId: string; studentNo: string; name: string; program: string; hall: string; room: string; status: string }
export const getHousingRoster = () => request<HousingRow[]>("/affairs/housing/roster");
export interface HousingRequest { assignmentId: string; studentId: string; name: string; studentNo: string; need: string }
export const getHousingRequests = () => request<HousingRequest[]>("/affairs/housing/requests");
export const assignRoom = (assignmentId: string, hallId: string, room: string, feeXof?: number) =>
  request(`/affairs/housing/${assignmentId}/assign`, { method: "POST", body: JSON.stringify({ hallId, room, feeXof }) });

export interface RoommateMatches {
  subject: { name: string; prefs: Record<string, string> };
  matches: { studentId: string; name: string; hall: string; room: string; score: number; shared: string[]; diff: string[] }[];
}
export const getRoommateSubjects = () => request<{ studentId: string; name: string }[]>("/affairs/roommate/subjects");
export const getRoommateMatches = (studentId: string) => request<RoommateMatches>(`/affairs/roommate/matches?studentId=${studentId}`);

export interface ConductCase { id: string; subject: string; type: string; stage: string; severity: string; officer: string | null; openedAt: string; slaDueAt: string | null; overdue: boolean }
export const getConductCases = () => request<ConductCase[]>("/affairs/conduct");
export const createConductCase = (body: { subject: string; type: string; severity: string }) =>
  request("/affairs/conduct", { method: "POST", body: JSON.stringify(body) });
export const advanceConduct = (id: string, stage: string) =>
  request(`/affairs/conduct/${id}/advance`, { method: "POST", body: JSON.stringify({ stage }) });

export interface Club { id: string; name: string; category: string; members: number; budgetXof: number; status: string; lead: string | null }
export const getClubs = () => request<Club[]>("/affairs/clubs");
export const setClubStatus = (id: string, status: string) =>
  request(`/affairs/clubs/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });

export interface CoCurricularLine { line: string; allocated: number; spent: number; pct: number; color: string }
export const getCoCurricularBudget = () => request<CoCurricularLine[]>("/affairs/budget");

// --- Innovation ---
export interface RoadmapPhase { id: string; name: string; short: string; status: string }
export interface MyProject {
  id: string;
  name: string;
  description: string | null;
  phase: string;
  advisor: string | null;
  status: string;
  grade: string | null;
  roadmap: RoadmapPhase[];
  members: { name: string; role: string }[];
  tasks: { id: string; title: string; phase: string; status: string; dueDate: string | null }[];
  submissions: { id: string; title: string; kind: string; status: string; grade: string | null; feedback: string | null; fileName: string | null; createdAt: string }[];
}
export const getMyProject = () => request<MyProject | null>("/innovation/my/project");
export const toggleProjectTask = (id: string) => request(`/innovation/tasks/${id}/toggle`, { method: "POST" });
export const submitProjectWork = (projectId: string, body: { title: string; kind: string; fileUrl?: string; fileName?: string }) =>
  request(`/innovation/projects/${projectId}/submit`, { method: "POST", body: JSON.stringify(body) });

export interface InnovationOverview { total: number; pendingReviews: number; phases: { id: string; name: string; count: number }[] }
export const getInnovationOverview = () => request<InnovationOverview>("/innovation/admin/overview");
export interface AdminProject { id: string; name: string; phase: string; advisor: string | null; status: string; grade: string | null; members: string[]; pendingReviews: number }
export const getAdminProjects = () => request<AdminProject[]>("/innovation/admin/projects");
export interface ReviewItem { id: string; project: string; projectId: string; title: string; kind: string; fileName: string | null; fileUrl: string | null; createdAt: string }
export const getReviewQueue = () => request<ReviewItem[]>("/innovation/admin/review-queue");
export interface ProjectDetail {
  id: string; name: string; description: string | null; phase: string; advisor: string | null; status: string; grade: string | null;
  roadmap: RoadmapPhase[];
  members: { personId: string; name: string; role: string }[];
  submissions: { id: string; title: string; kind: string; status: string; grade: string | null; feedback: string | null; fileName: string | null; fileUrl: string | null }[];
}
export const getProjectDetail = (id: string) => request<ProjectDetail>(`/innovation/admin/projects/${id}`);
export const advanceProjectPhase = (id: string) => request(`/innovation/admin/projects/${id}/advance`, { method: "POST" });
export const gradeProjectSubmission = (id: string, grade: string, feedback?: string) =>
  request(`/innovation/admin/submissions/${id}/grade`, { method: "POST", body: JSON.stringify({ grade, feedback }) });
export const addProjectMember = (projectId: string, email: string, role?: string) =>
  request<{ ok: boolean; name: string }>(`/innovation/admin/projects/${projectId}/members`, { method: "POST", body: JSON.stringify({ email, role }) });
export const removeProjectMember = (projectId: string, personId: string) =>
  request(`/innovation/admin/projects/${projectId}/members/${personId}`, { method: "DELETE" });
export const setProjectAdvisor = (projectId: string, advisor: string) =>
  request(`/innovation/admin/projects/${projectId}/advisor`, { method: "POST", body: JSON.stringify({ advisor }) });

// --- HR-lite ---
export interface Payslip { id: string; period: string; gross: number; deductions: number; net: number; isEstimate: boolean }
export const getPayslips = () => request<Payslip[]>("/hr/my/payslips");
export interface LeaveRequest { id: string; type: string; startDate: string; endDate: string; reason: string | null; status: string }
export const getMyLeave = () => request<LeaveRequest[]>("/hr/my/leave");
export const requestLeave = (body: { type: string; startDate: string; endDate: string; reason?: string }) =>
  request("/hr/my/leave", { method: "POST", body: JSON.stringify(body) });
export interface RoomBooking { id: string; room: string; date: string; startTime: string; endTime: string; purpose: string | null; status: string }
export const getMyBookings = () => request<RoomBooking[]>("/hr/my/bookings");
export const bookRoom = (body: { room: string; date: string; startTime: string; endTime: string; purpose?: string }) =>
  request("/hr/my/bookings", { method: "POST", body: JSON.stringify(body) });

// --- Bursar: accounts, overdue, reconcile, plan config ---
export interface AccountInstallment {
  id: string;
  sequence: number;
  label: string | null;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  status: string;
}
export interface AccountInvoice {
  id: string;
  term: string;
  description: string | null;
  total: number;
  paid: number;
  balance: number;
  status: string;
  hasPlan: boolean;
  installments: AccountInstallment[];
  payments: { id: string; amount: number; method: string; status: string; createdAt: string }[];
}
export interface StudentAccount {
  student: { studentNo: string; name: string; program: string; email: string };
  totals: { billed: number; paid: number; balance: number };
  invoices: AccountInvoice[];
}
export const getStudentAccount = (studentId: string) =>
  request<StudentAccount>(`/finance/admin/students/${studentId}/account`);

// --- Standalone billing admin: all accounts with derived balances ---
export interface StudentAccountRow {
  id: string;
  studentNo: string;
  name: string;
  program: string | null;
  photoUrl: string | null;
  billed: number;
  paid: number;
  balance: number;
  openCharges: number;
  overdue: boolean;
  status: string; // paid | due | overdue
  invoiceId: string | null;
  billingNumber: string | null;
  billingDescription: string | null;
}
export const listStudentAccounts = () => request<StudentAccountRow[]>("/finance/admin/accounts");

// Registrar student provisioning (design flow): creates the record + account + a
// password-setup invite email, and bills nothing (money stays in the Finance portal).
export interface RegistrarStudentInput {
  studentNo: string;
  firstName: string;
  lastName?: string;
  email: string;
  dateOfBirth?: string | null;
  programCode?: string | null;
  gender?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  nationality?: string | null;
  preferredName?: string | null;
  nationalId?: string | null;
  maritalStatus?: string | null;
  personalEmail?: string | null;
  bloodType?: string | null;
  allergies?: string | null;
  insurance?: string | null;
  physician?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  emergencyName2?: string | null;
  emergencyPhone2?: string | null;
  advisor?: string | null;
  yearLevel?: number | null;
  cohort?: string | null;
  major?: string | null;
  minor?: string | null;
  admitTerm?: string | null;
  expectedGrad?: string | null;
  enrollmentStatus?: string | null;
  catalogYear?: string | null;
}
export const createRegistrarStudent = (input: RegistrarStudentInput) =>
  request<{ id: string; studentNo: string; email: string; inviteExpiresAt: string }>(
    "/registrar/students",
    { method: "POST", body: JSON.stringify(input) },
  );

// Student "Documents on file": six typed PDF slots + an open "other" list.
export interface StudentDocumentRow {
  id: string;
  slot: string;
  name: string | null;
  url: string;
  uploadedAt: string;
}
export const getStudentDocuments = (studentId: string) =>
  request<StudentDocumentRow[]>(`/registrar/students/${studentId}/documents`);
export const addStudentDocument = (studentId: string, input: { slot: string; url: string; name?: string | null }) =>
  request<StudentDocumentRow>(`/registrar/students/${studentId}/documents`, { method: "POST", body: JSON.stringify(input) });
export const removeStudentDocument = (documentId: string) =>
  request<{ ok: boolean }>(`/registrar/student-documents/${documentId}`, { method: "DELETE" });

// Standalone billing admin: create students + add/remove ad-hoc charges (single or bulk).
export const createStudent = (input: {
  fullName: string;
  dateOfBirth: string;
  studentNo?: string;
  email?: string;
  programCode?: string;
  billTuition?: boolean;
}) => request<{ id: string; studentNo: string }>("/finance/admin/students", { method: "POST", body: JSON.stringify(input) });
export const addCharge = (input: {
  studentIds: string[];
  description: string;
  amountXof: number;
  costCenterCode?: string;
  dueDate?: string;
  installments?: { dueDate: string; amountXof: number; label?: string | null }[];
}) => request<{ ok: boolean; count: number }>("/finance/admin/charges", { method: "POST", body: JSON.stringify(input) });
export const removeCharge = (invoiceId: string) =>
  request<{ ok: boolean }>(`/finance/admin/charges/${invoiceId}`, { method: "DELETE" });
export const applyDiscount = (input: { studentId: string; label: string; amountXof: number; kind?: "discount" | "scholarship"; costCenterCode?: string }) =>
  request<{ ok: boolean; creditId: string }>("/finance/admin/discounts", { method: "POST", body: JSON.stringify(input) });
export const updatePaymentPlan = (
  invoiceId: string,
  installments: { id: string; dueDate: string; amountDue: number; label?: string | null }[],
) => request<{ ok: boolean }>(`/finance/admin/plans/${invoiceId}`, { method: "PATCH", body: JSON.stringify({ installments }) });

export interface OverdueRow {
  installmentId: string;
  student: string;
  studentNo: string;
  term: string;
  sequence: number;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  outstanding: number;
}
export const getOverdue = () => request<OverdueRow[]>("/finance/admin/overdue");

export interface ArAging {
  buckets: { key: string; label: string; amount: number; count: number }[];
  totalOutstanding: number;
  rows: { student: string; studentNo: string; term: string; daysOverdue: number; outstanding: number }[];
}
export const getArAging = () => request<ArAging>("/finance/admin/aging");

export interface FinanceReports {
  collections: CollectionSummary;
  aging: ArAging;
  paymentsByMethod: { method: string; amount: number; count: number }[];
  revenueByTerm: { term: string; amount: number }[];
  cashByCostCenter: { code: string; name: string; revenue: number; expense: number; net: number }[];
  budgetVsActual: { code: string; name: string; allocated: number; spent: number; pct: number }[];
  recentPayments: AdminPayment[];
  totals: { moneyIn: number; moneyOut: number; net: number; cashPosition: number };
}
export const getFinanceReports = () => request<FinanceReports>("/finance/admin/reports");

export interface Receipt {
  id: string;
  student: string;
  studentNo: string;
  email: string;
  term: string;
  amount: number;
  method: string;
  status: string;
  providerRef: string;
  paidAt: string;
  allocations: { sequence: number; amount: number }[];
}
export const getReceipt = (paymentId: string) => request<Receipt>(`/finance/admin/payments/${paymentId}/receipt`);
export const refundPayment = (paymentId: string, reason?: string) =>
  request<{ ok: boolean; refundedAmount: number; gatewayRefund: boolean }>(`/finance/admin/payments/${paymentId}/refund`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
export interface StalePayment {
  id: string;
  student: string;
  studentNo: string;
  term: string;
  amount: number;
  method: string;
  providerRef: string;
  createdAt: string;
  ageMinutes: number;
}
export const reconcilePayments = () =>
  request<{ stale: StalePayment[] }>("/finance/admin/reconcile", { method: "POST" });
export const confirmPayment = (id: string) =>
  request(`/finance/admin/payments/${id}/confirm`, { method: "POST" });
export const cancelPayment = (id: string) =>
  request(`/finance/admin/payments/${id}/cancel`, { method: "POST" });

export interface PlanInstallmentInput {
  sequence: number;
  dueDate: string;
  amount: number;
}
export const createPaymentPlan = (invoiceId: string, installments: PlanInstallmentInput[]) =>
  request("/finance/admin/plans", { method: "POST", body: JSON.stringify({ invoiceId, installments }) });

// --- Director money-in/out, expenses, budgets ---
export interface DirectorOverview {
  fiscalYear: string;
  totals: { moneyIn: number; moneyOut: number; net: number; cashPosition: number };
  centers: { code: string; name: string; type: string; revenue: number; expense: number; net: number }[];
  groups: { code: string; name: string; revenue: number; expense: number; net: number }[];
  budget: { code: string; name: string; allocated: number; spent: number; pct: number }[];
}
export const getDirectorOverview = () => request<DirectorOverview>("/finance/admin/director-overview");

export interface CostCenter {
  code: string;
  name: string;
  type: string;
  parentCode: string | null;
}
export const getCostCenters = () => request<CostCenter[]>("/finance/admin/cost-centers");

export interface Expense {
  id: string;
  costCenter: string;
  category: string;
  payee: string | null;
  description: string | null;
  amount: number;
  isEstimate: boolean;
  incurredOn: string;
}
export const getExpenses = () => request<Expense[]>("/finance/admin/expenses");
export const createExpense = (body: {
  costCenterCode: string;
  category: string;
  description?: string;
  payee?: string;
  amount: number;
  isEstimate: boolean;
  incurredOn: string;
}) => request("/finance/admin/expenses", { method: "POST", body: JSON.stringify(body) });
export const updateExpense = (id: string, patch: Partial<{ costCenterCode: string; category: string; description: string; payee: string; amount: number; isEstimate: boolean; incurredOn: string }>) =>
  request(`/finance/admin/expenses/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
export const deleteExpense = (id: string) =>
  request(`/finance/admin/expenses/${id}`, { method: "DELETE" });
export const setBudget = (costCenterCode: string, fiscalYear: string, allocated: number) =>
  request("/finance/admin/budgets", { method: "POST", body: JSON.stringify({ costCenterCode, fiscalYear, allocated }) });

// --- Admissions, staff, users ---
export interface Applicant {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  program: string;
  stage: string;
  score: number | null;
  country: string | null;
  feePaid: boolean;
  submittedAt: string;
}
export interface Admissions {
  funnel: { stage: string; count: number }[];
  applicants: Applicant[];
}
export const getAdmissions = () => request<Admissions>("/academics/admin/applicants");
/** The full application form; only name + email are required to create an entry. */
export interface ApplicantInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  programCode?: string | null;
  country?: string | null;
  score?: number | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  nationality?: string | null;
  city?: string | null;
  origin?: "high-school" | "transfer" | null;
  school?: string | null;
  priorGpa?: string | null;
  parentName?: string | null;
  parentPhone?: string | null;
  parentEmail?: string | null;
  allergies?: string | null;
  source?: string | null;
  essay?: string | null;
  term?: string | null;
}
export const createApplicant = (
  input: ApplicantInput & { firstName: string; lastName: string; email: string },
) => request<{ id: string }>("/admissions/applicants", { method: "POST", body: JSON.stringify(input) });
export const updateApplicant = (id: string, input: ApplicantInput) =>
  request<{ id: string }>(`/admissions/applicants/${id}`, { method: "PATCH", body: JSON.stringify(input) });
export const setApplicantStage = (id: string, stage: string) =>
  request(`/admissions/applicants/${id}/stage`, { method: "PATCH", body: JSON.stringify({ stage }) });
export interface ApplicantDetail {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  programCode: string | null;
  program: string | null;
  stage: string;
  score: number | null;
  country: string | null;
  feePaid: boolean;
  appFee: number;
  submittedAt: string;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  nationality: string | null;
  city: string | null;
  origin: string | null;
  school: string | null;
  priorGpa: string | null;
  parentName: string | null;
  parentPhone: string | null;
  parentEmail: string | null;
  allergies: string | null;
  source: string | null;
  essay: string | null;
  term: string | null;
  scholarship: { pct: number; band: string | null };
}
export const getApplicant = (id: string) => request<ApplicantDetail>(`/admissions/applicants/${id}`);

export interface StaffMember { id: string; name: string; email: string; kind: string; roles: string[] }
export const getStaff = () => request<StaffMember[]>("/academics/admin/staff");

// --- Director-configurable money settings ---
export interface FeeItem { key: string; label: string; minXof: number; maxXof: number | null; period: string; note: string | null; sortOrder: number }
export const getFeeConfig = () => request<FeeItem[]>("/config/fees");
export const updateFeeItem = (key: string, patch: Partial<Pick<FeeItem, "label" | "minXof" | "maxXof" | "period" | "note">>) =>
  request(`/config/fees/${key}`, { method: "PATCH", body: JSON.stringify(patch) });

export interface ScholarshipTierRow { id: string; minScore: number; pct: number; band: string; note: string | null }
export const getScholarshipConfig = () => request<ScholarshipTierRow[]>("/config/scholarships");
export const createScholarshipTier = (body: { minScore: number; pct: number; band: string; note?: string }) =>
  request("/config/scholarships", { method: "POST", body: JSON.stringify(body) });
export const updateScholarshipTier = (id: string, body: { minScore: number; pct: number; band: string; note?: string }) =>
  request(`/config/scholarships/${id}`, { method: "PATCH", body: JSON.stringify(body) });
export const deleteScholarshipTier = (id: string) =>
  request(`/config/scholarships/${id}`, { method: "DELETE" });

export interface AppUser { id: string; name: string; email: string; roles: string[] }
export const updateUserRoles = (personId: string, roles: string[]) =>
  request(`/users/${personId}/roles`, { method: "PATCH", body: JSON.stringify({ roles }) });
export const getUsers = () => request<AppUser[]>("/academics/admin/users");

// --- Payment links (bursar-generated; public pay page at /pay/[token]) ---
export interface PaymentLinkRow {
  id: string;
  token: string;
  url: string;
  amountXof: number;
  purpose: string;
  payeeName: string;
  payeeMeta: string | null;
  studentId: string | null;
  invoiceId: string | null;
  costCenterCode: string;
  dueDate: string | null;
  expiresAt: string | null;
  status: string;
  method: string | null;
  paidAt: string | null;
  createdAt: string;
  expired: boolean;
}
export interface PublicPaymentLink {
  ref: string;
  amountXof: number;
  purpose: string;
  payeeName: string;
  payeeMeta: string | null;
  dueDate: string | null;
  expiresAt: string | null;
  status: string; // active | paid | expired
  method: string | null;
  paidAt: string | null;
}
export const getPaymentLinks = () => request<PaymentLinkRow[]>("/finance/admin/links");
export const createPaymentLink = (input: {
  payeeName: string;
  payeeMeta?: string;
  studentId?: string;
  invoiceId?: string;
  amountXof: number;
  purpose: string;
  costCenterCode?: string;
  dueDate?: string;
  expiresAt?: string;
}) => request<PaymentLinkRow>("/finance/admin/links", { method: "POST", body: JSON.stringify(input) });
export const cancelPaymentLink = (id: string) =>
  request<PaymentLinkRow>(`/finance/admin/links/${id}/cancel`, { method: "POST" });
export const markPaymentLinkPaid = (id: string) =>
  request<PaymentLinkRow>(`/finance/admin/links/${id}/mark-paid`, { method: "POST" });
export const getPublicPaymentLink = (token: string) => request<PublicPaymentLink>(`/finance/links/${token}`);
export const checkoutPaymentLink = (token: string, method: string) =>
  request<{ redirectUrl: string }>(`/finance/links/${token}/checkout`, { method: "POST", body: JSON.stringify({ method }) });

// --- Public bill portal (payment.daust.net): pay a real student account by ID + DOB ---
export interface BillCharge {
  label: string;
  dueDate: string | null;
  amountXof: number;
  paidXof: number;
  status: string; // pending | partial | paid | overdue
}
export interface BillLookup {
  studentName: string;
  studentNo: string;
  program: string | null;
  term: string | null;
  balanceXof: number;
  creditXof: number;
  dueDate: string | null;
  charges: BillCharge[];
}
export const lookupBill = (studentNo: string, dob: string) =>
  request<BillLookup>("/finance/public/bill/lookup", { method: "POST", body: JSON.stringify({ studentNo, dob }) });
export const checkoutBill = (input: { studentNo: string; dob: string; amountXof: number; method: string }) =>
  request<{ redirectUrl: string }>("/finance/public/bill/checkout", { method: "POST", body: JSON.stringify(input) });

// --- Parent portal (guardian access) ---
export interface ChildSummary {
  studentId: string;
  studentNo: string;
  name: string;
  program: string;
  yearLevel: number | null;
  photoUrl: string | null;
  relation: string | null;
  gpa: number;
  completedCredits: number;
  standing: string;
  balance: number;
  /** Credits the programme requires, summed from its requirement categories. */
  requiredCredits: number | null;
  /** Percentage; a late counts as half a present. Null when nothing is recorded. */
  attendanceRate: number | null;
}
export const getMyChildren = () => request<ChildSummary[]>("/parent/children");

export interface ChildTranscript {
  cumulativeGpa: number;
  terms: {
    term: string;
    gpa: number;
    credits: number;
    courses: { code: string; title: string; credits: number; grade: string | null }[];
  }[];
}
export const getChildGrades = (studentId: string) =>
  request<ChildTranscript>(`/parent/children/${studentId}/grades`);

export interface ChildAttendance {
  overall: number | null;
  rows: { code: string; title: string; present: number; late: number; absent: number; pct: number | null }[];
}
export const getChildAttendance = (studentId: string) =>
  request<ChildAttendance>(`/parent/children/${studentId}/attendance`);

export const getChildAccount = (studentId: string) =>
  request<StudentAccount>(`/parent/children/${studentId}/account`);

// --- Registrar: guardian administration ---
export interface GuardianRow {
  id: string;
  name: string;
  email: string;
  status: string; // active | invited | invite-expired
  children: { studentId: string; studentNo: string; name: string; relation: string | null }[];
}
/** Public: a guardian redeeming their single-use password-setup invite. */
export const redeemGuardianInvite = (token: string, password: string) =>
  request<{ ok: boolean }>("/guardian-invites/redeem", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
export const getGuardians = () => request<GuardianRow[]>("/guardians");
export const createGuardian = (input: {
  fullName: string;
  email: string;
  studentIds: string[];
  relation?: string;
}) =>
  request<{ id: string; email: string; inviteExpiresAt: string | null }>("/guardians", {
    method: "POST",
    body: JSON.stringify(input),
  });
export const resendGuardianInvite = (id: string) =>
  request<{ ok: boolean; inviteLink: string; inviteExpiresAt: string }>(
    `/guardians/${id}/resend-invite`,
    { method: "POST" },
  );
export const setGuardianChildren = (id: string, studentIds: string[]) =>
  request<{ ok: boolean }>(`/guardians/${id}/children`, { method: "PATCH", body: JSON.stringify({ studentIds }) });
export const updateGuardian = (id: string, input: { fullName?: string; email?: string }) =>
  request<{ id: string; name: string; email: string }>(`/guardians/${id}`, { method: "PATCH", body: JSON.stringify(input) });
export const deleteGuardian = (id: string) =>
  request<{ ok: boolean }>(`/guardians/${id}`, { method: "DELETE" });

// --- Institution fee schedule (the DAUST payment-plan sheet) ---
export interface FeePlanRow {
  id: string;
  academicYearLabel: string;
  semester: string;
  label: string;
  sequence: number;
  dueOn: string | null;
  amountFullXof: number;
  amountTuitionXof: number;
}
export interface FeePlan {
  academicYearLabel: string | null;
  rows: FeePlanRow[];
  totals: { full: number; tuition: number };
}
export const getFeePlan = (year?: string) =>
  request<FeePlan>(`/finance/admin/fee-plan${year ? `?year=${encodeURIComponent(year)}` : ""}`);
export const updateFeePlanRow = (
  id: string,
  input: { label?: string; dueOn?: string; amountFullXof?: number; amountTuitionXof?: number },
) => request<FeePlanRow>(`/finance/admin/fee-plan/${id}`, { method: "PATCH", body: JSON.stringify(input) });

// --- Student: registration, degree audit, attendance ---
export interface RegistrationSection {
  sectionId: string;
  courseCode: string;
  title: string;
  credits: number;
  sectionCode: string;
  instructor: string | null;
  room: string | null;
  days: string;
  startTime: string;
  endTime: string;
  schedule: string;
  seatsTaken: number;
  capacity: number;
  seatsLeft: number;
  /** Null when the student may register; otherwise the single clearest reason they cannot. */
  blockedReason: string | null;
}
export interface RegistrationCatalog {
  maxCredits: number;
  currentCredits: number;
  holds: { type: string; reason: string | null }[];
  catalogYear: string | null;
  sections: RegistrationSection[];
}
export const getRegistrationCatalog = (termId: string) =>
  request<RegistrationCatalog>(`/academics/my/registration?termId=${encodeURIComponent(termId)}`);

export interface DegreeCategory {
  category: string;
  required: number;
  done: number;
  inProgress: number;
  remaining: number;
  pct: number;
  status: string;
}
export interface DegreeAudit {
  program: string | null;
  catalogYear?: string | null;
  categories: DegreeCategory[];
  completed: number;
  inProgress: number;
  remaining: number;
  total: number;
  pctComplete: number;
}
export const getDegreeAudit = () => request<DegreeAudit>("/academics/my/degree");

export interface MyAttendance {
  overall: number | null;
  rows: { code: string; title: string; present: number; late: number; absent: number; pct: number | null }[];
}
export const getMyAttendance = () => request<MyAttendance>("/academics/my/attendance");

export interface MyProfile {
  name: string;
  studentNo: string;
  email: string;
  program: string | null;
  gpa: number;
  completedCredits: number;
  standing: string;
  personal: Record<string, string | null>;
  contact: Record<string, string | null>;
  academic: Record<string, string | number | null>;
  emergency: Record<string, string | null>;
}
export const getMyProfile = () => request<MyProfile>("/academics/my/profile");

export type MyHousing =
  | { assigned: false }
  | {
      assigned: true;
      building: string | null;
      kind: string | null;
      room: string | null;
      status: string;
      note: string | null;
      roommates: string[];
    };
export const getMyHousing = () => request<MyHousing>("/academics/my/housing");

// --- Registrar: academic structure, policy and student success ---
export interface DepartmentRow {
  id: string;
  code: string;
  name: string;
  head: string | null;
  programs: number;
  courses: number;
}
export const getDepartments = () => request<DepartmentRow[]>("/registrar/departments");
export const upsertDepartment = (input: { id?: string; code: string; name: string; head?: string | null }) =>
  request<DepartmentRow>("/registrar/departments", { method: "POST", body: JSON.stringify(input) });

export interface AcademicYearRow {
  id: string;
  label: string;
  status: "draft" | "active" | "archived";
  _count: { terms: number };
}
export const getAcademicYears = () => request<AcademicYearRow[]>("/registrar/academic-years");
export const createAcademicYear = (label: string) =>
  request<AcademicYearRow>("/registrar/academic-years", { method: "POST", body: JSON.stringify({ label }) });
export const activateAcademicYear = (id: string) =>
  request<{ ok: boolean }>(`/registrar/academic-years/${id}/activate`, { method: "POST" });

export interface GradingSchemeRow {
  id: string;
  key: string;
  name: string;
  isDefault: boolean;
  rows: { id: string; grade: string; points: number | null; minScore: number | null; maxScore: number | null }[];
}
export const getGradingSchemes = () => request<GradingSchemeRow[]>("/registrar/grading-schemes");

export interface CourseRuleRow {
  courseId: string;
  code: string;
  title: string;
  credits: number;
  prerequisites: { code: string; minGrade: string | null }[];
  corequisites: string[];
  standingRequired: string | null;
  majorRestriction: string | null;
  capacity: number | null;
  waitlistEnabled: boolean;
}
export const getCourseRules = () => request<CourseRuleRow[]>("/registrar/rules");
export const setCourseRule = (
  courseId: string,
  input: { standingRequired?: string | null; majorRestriction?: string | null; capacity?: number | null; waitlistEnabled?: boolean },
) => request<unknown>(`/registrar/rules/${courseId}`, { method: "PATCH", body: JSON.stringify(input) });
/** Replace a course's prerequisite (with min grade) and corequisite lists. */
export const setCourseRequisites = (
  courseId: string,
  input: { prerequisites: { code: string; minGrade?: string | null }[]; corequisites: string[] },
) => request<{ ok: boolean }>(`/registrar/rules/${courseId}/requisites`, { method: "PUT", body: JSON.stringify(input) });

export interface GradeApprovalRow {
  id: string;
  status: string;
  submittedAt: string | null;
  approvedAt: string | null;
  note: string | null;
  course: string;
  sectionCode: string;
  term: string;
  instructor: string | null;
  students: number;
  graded: number;
  grades: { name: string; grade: string | null }[];
}
export const getGradeApprovals = () => request<GradeApprovalRow[]>("/registrar/grade-approvals");
export const decideGradeApproval = (id: string, decision: "approved" | "returned", note?: string) =>
  request<unknown>(`/registrar/grade-approvals/${id}/decide`, {
    method: "POST",
    body: JSON.stringify({ decision, note }),
  });

export interface FlaggedStudent {
  studentId: string;
  studentNo: string;
  name: string;
  program: string | null;
  gpa: number;
  attendance: number | null;
  flags: string[];
  level: "warning" | "critical";
  watching: boolean;
  lastWarnedAt: string | null;
}
export interface StudentSuccess {
  thresholds: { minGpa: number; minAttendance: number };
  total: number;
  atRisk: number;
  watch: number;
  warningsSent: number;
  flagged: FlaggedStudent[];
}
export const getStudentSuccess = () => request<StudentSuccess>("/registrar/student-success");
export const warnStudent = (studentId: string, reason: string, level?: "warning" | "critical") =>
  request<unknown>("/registrar/student-success/warn", { method: "POST", body: JSON.stringify({ studentId, reason, level }) });

export interface WatchedStudent { studentId: string; studentNo: string; name: string; program: string | null }
export const getWatching = () => request<WatchedStudent[]>("/registrar/student-success/watching");
export const watchStudent = (studentId: string) =>
  request<{ ok: boolean }>(`/registrar/student-success/watch/${studentId}`, { method: "POST" });
export const unwatchStudent = (studentId: string) =>
  request<{ ok: boolean }>(`/registrar/student-success/watch/${studentId}`, { method: "DELETE" });

export interface WarningRow { id: string; name: string; studentNo: string; reason: string; level: string; warnedAt: string | null }
export const getWarnings = () => request<WarningRow[]>("/registrar/student-success/warnings");

export interface CalendarEventRow {
  id: string;
  title: string;
  type: string;
  startsOn: string;
  endsOn: string | null;
  note: string | null;
}
export const getAcademicCalendar = () => request<CalendarEventRow[]>("/registrar/calendar");
export const createCalendarEvent = (input: {
  academicYearId: string;
  title: string;
  type: string;
  startsOn: string;
  endsOn?: string;
  note?: string;
}) => request<CalendarEventRow>("/registrar/calendar", { method: "POST", body: JSON.stringify(input) });
export const updateCalendarEvent = (
  id: string,
  input: { title?: string; type?: string; startsOn?: string; endsOn?: string | null; note?: string | null },
) => request<CalendarEventRow>(`/registrar/calendar/${id}`, { method: "PATCH", body: JSON.stringify(input) });
export const deleteCalendarEvent = (id: string) =>
  request<{ ok: boolean }>(`/registrar/calendar/${id}`, { method: "DELETE" });

// --- Registrar: grading-scheme rows ---
export const addGradeRow = (
  schemeId: string,
  input: { grade: string; points: number | null; minScore: number | null; maxScore: number | null },
) => request<unknown>(`/registrar/grading-schemes/${schemeId}/rows`, { method: "POST", body: JSON.stringify(input) });
export const updateGradeRow = (
  rowId: string,
  input: { grade?: string; points?: number | null; minScore?: number | null; maxScore?: number | null },
) => request<unknown>(`/registrar/grading-schemes/rows/${rowId}`, { method: "PATCH", body: JSON.stringify(input) });
export const deleteGradeRow = (rowId: string) =>
  request<{ ok: boolean }>(`/registrar/grading-schemes/rows/${rowId}`, { method: "DELETE" });

// --- Registrar: terms (calendar term cards) ---
export interface TermRow {
  id: string;
  name: string;
  status: string | null;
  startDate: string;
  endDate: string;
  addDeadline: string | null;
  dropDeadline: string | null;
  academicYear: string | null;
}
export const getTerms = () => request<TermRow[]>("/registrar/terms");
export const updateTerm = (
  id: string,
  input: { status?: "active" | "planning" | "draft"; startDate?: string; endDate?: string; addDeadline?: string | null; dropDeadline?: string | null },
) => request<TermRow>(`/registrar/terms/${id}`, { method: "PATCH", body: JSON.stringify(input) });

// --- Registrar: curriculum (programme x catalogue-year course map) ---
export interface CurriculumEntryRow { yearIndex: number; semester: string; courseCode: string; courseTitle: string; credits: number }
export interface CurriculumData {
  programCode: string;
  academicYearId: string;
  entries: CurriculumEntryRow[];
  allCourses: { id: string; code: string; title: string; credits: number }[];
}
export const getCurriculum = (programCode: string, academicYearId: string) =>
  request<CurriculumData>(`/registrar/curriculum?programCode=${encodeURIComponent(programCode)}&academicYearId=${academicYearId}`);
export const saveCurriculum = (
  programCode: string,
  academicYearId: string,
  entries: { yearIndex: number; semester: string; courseCode: string }[],
) => request<{ ok: boolean }>("/registrar/curriculum", { method: "PUT", body: JSON.stringify({ programCode, academicYearId, entries }) });

// --- Registrar: department delete ---
export const deleteDepartment = (id: string) =>
  request<{ ok: boolean }>(`/registrar/departments/${id}`, { method: "DELETE" });

// --- Registrar: broadcast composer ---
export interface BroadcastRow {
  id: string;
  audienceType: string;
  audienceValue: string | null;
  subject: string;
  body: string;
  recipientCount: number;
  createdAt: string;
}
export const getBroadcasts = () => request<BroadcastRow[]>("/comms/broadcasts");
export const sendBroadcast = (input: {
  audienceType: "individual" | "year" | "program" | "all";
  audienceValue?: string;
  subject: string;
  body: string;
}) => request<{ id: string; sent: number }>("/comms/broadcasts", { method: "POST", body: JSON.stringify(input) });
export const previewBroadcast = (audienceType: "individual" | "year" | "program" | "all", audienceValue?: string) => {
  const qs = new URLSearchParams({ audienceType, ...(audienceValue ? { audienceValue } : {}) });
  return request<{ count: number }>(`/comms/broadcasts/preview?${qs.toString()}`);
};
