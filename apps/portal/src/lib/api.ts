"use client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    credentials: "include", // send/receive the session cookie
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
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
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
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
  capacity: number;
  seatsTaken: number;
  seatsLeft: number;
  schedule: string;
  room: string | null;
  instructor: string | null;
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
  courses: { code: string; title: string; credits: number; department: string }[];
  departments: { id: string; code: string; name: string }[];
}
export const createProgram = (input: { code: string; name: string; departmentId: string; degree?: string | null; school?: string | null; tuition?: number | null; color?: string | null }) =>
  request<{ id: string }>("/academics/admin/programs", { method: "POST", body: JSON.stringify(input) });
export const createCourse = (input: { code: string; title: string; credits: number; departmentId: string }) =>
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
  department: string;
  departmentId: string;
  prerequisites: { code: string; title: string }[];
  sections: CourseSection[];
  allCourses: { code: string; title: string }[];
  departments: { id: string; code: string; name: string }[];
  terms: { id: string; name: string }[];
}
export const getAdminCourseDetail = (code: string) => request<AdminCourseDetail>(`/academics/admin/courses/${encodeURIComponent(code)}`);
export const updateCourse = (code: string, input: { title?: string; credits?: number; departmentId?: string; prerequisiteCodes?: string[] }) =>
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
export const updateSection = (id: string, input: Partial<Omit<SectionInput, "courseCode">>) =>
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
}
export const listStudentAccounts = () => request<StudentAccountRow[]>("/finance/admin/accounts");

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
}) => request<{ ok: boolean; count: number }>("/finance/admin/charges", { method: "POST", body: JSON.stringify(input) });
export const removeCharge = (invoiceId: string) =>
  request<{ ok: boolean }>(`/finance/admin/charges/${invoiceId}`, { method: "DELETE" });
export const applyDiscount = (input: { studentId: string; label: string; amountXof: number; kind?: "discount" | "scholarship"; costCenterCode?: string }) =>
  request<{ ok: boolean; creditId: string }>("/finance/admin/discounts", { method: "POST", body: JSON.stringify(input) });
export const updatePaymentPlan = (
  invoiceId: string,
  installments: { id: string; dueDate: string; amountDue: number }[],
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
export const createApplicant = (input: {
  firstName: string;
  lastName: string;
  email: string;
  programCode?: string | null;
  country?: string | null;
  score?: number | null;
}) => request<{ id: string }>("/admissions/applicants", { method: "POST", body: JSON.stringify(input) });
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
