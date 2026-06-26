/* MyDAUST — data layer. Realistic Spring 2026 student persona + content.
   All content is fictional but grounded in DAUST's real programs/context. */

const STUDENT = {
  firstName: 'Aïssatou',
  lastName: 'Diallo',
  name: 'Aïssatou Diallo',
  initials: 'AD',
  program: 'B.Sc. Computer Engineering',
  programShort: 'Computer Eng.',
  year: 'Year 3',
  level: 'Undergraduate',
  id: 'DAUST-CE-23-0142',
  email: 'aissatou.diallo@daust.edu.sn',
  phone: '+221 77 412 88 09',
  term: 'Spring 2026',
  gpa: 3.74,
  cumulativeGpa: 3.68,
  credits: 19,
  creditsEarned: 81,
  creditsRequired: 132,
  advisor: 'Dr. Mariama Sow',
  validThru: '08 / 2027',
  cohort: 'Class of 2027',
};

// ── Courses, Spring 2026 (CE Year 3) ──────────────────────────
const COURSES = [
  { code: 'CSC 301', title: 'Data Structures & Algorithms', credits: 4, instructor: 'Prof. M. Sow', grade: 'A-', gradePts: 3.7, attendance: 96, color: 'navy' },
  { code: 'ECE 311', title: 'Digital Systems Design', credits: 4, instructor: 'Prof. K. Faye', grade: 'B+', gradePts: 3.3, attendance: 92, color: 'orange' },
  { code: 'ECE 320', title: 'Signals & Systems', credits: 3, instructor: 'Prof. A. Ba', grade: 'A', gradePts: 4.0, attendance: 100, color: 'steel' },
  { code: 'MTH 210', title: 'Linear Algebra & Diff. Equations', credits: 3, instructor: 'Prof. F. Diop', grade: 'B+', gradePts: 3.3, attendance: 88, color: 'navy' },
  { code: 'ENG 250', title: 'Technical Writing & Communication', credits: 2, instructor: 'Ms. L. Mendy', grade: 'A', gradePts: 4.0, attendance: 94, color: 'orange' },
  { code: 'TVP 200', title: 'Technology Ventures Lab', credits: 3, instructor: 'Prof. S. Ndao', grade: 'IP', gradePts: null, attendance: 97, color: 'steel' },
];

// ── Weekly timetable ──────────────────────────────────────────
// day: 0=Mon … 4=Fri. time in 24h.
const SCHEDULE = [
  { day: 0, code: 'CSC 301', title: 'Data Structures & Algorithms', start: '08:30', end: '10:00', room: 'Bldg A · 204', type: 'Lecture' },
  { day: 0, code: 'MTH 210', title: 'Linear Algebra & Diff. Eq.', start: '10:15', end: '11:45', room: 'Bldg B · 101', type: 'Lecture' },
  { day: 0, code: 'ENG 250', title: 'Technical Writing', start: '14:00', end: '15:30', room: 'Bldg C · 105', type: 'Seminar' },

  { day: 1, code: 'ECE 311', title: 'Digital Systems Design', start: '09:00', end: '10:30', room: 'ECE Lab 2', type: 'Lecture' },
  { day: 1, code: 'ECE 320', title: 'Signals & Systems', start: '11:00', end: '12:30', room: 'Bldg A · 210', type: 'Lecture' },
  { day: 1, code: 'TVP 200', title: 'Technology Ventures Lab', start: '15:00', end: '17:00', room: 'Innovation Hub', type: 'Studio' },

  { day: 2, code: 'CSC 301', title: 'Data Structures Lab', start: '09:00', end: '11:00', room: 'CS Lab 1', type: 'Lab' },
  { day: 2, code: 'MTH 210', title: 'Linear Algebra & Diff. Eq.', start: '11:15', end: '12:45', room: 'Bldg B · 101', type: 'Lecture' },

  { day: 3, code: 'ECE 311', title: 'Digital Systems Lab', start: '09:00', end: '11:00', room: 'ECE Lab 2', type: 'Lab' },
  { day: 3, code: 'ECE 320', title: 'Signals & Systems', start: '11:15', end: '12:45', room: 'Bldg A · 210', type: 'Lecture' },

  { day: 4, code: 'CSC 301', title: 'Data Structures & Algorithms', start: '08:30', end: '10:00', room: 'Bldg A · 204', type: 'Lecture' },
  { day: 4, code: 'TVP 200', title: 'Technology Ventures Lab', start: '14:00', end: '16:00', room: 'Innovation Hub', type: 'Studio' },
];

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// ── Announcements / campus news (EN + occasional FR, DAUST tone) ─
const ANNOUNCEMENTS = [
  { tag: 'REGISTRAR', pinned: true, title: 'Spring 2026 final exams begin Monday, June 8', body: 'The examination timetable is now published. Check your personal schedule under Documents.', time: '2h ago', accent: 'orange' },
  { tag: 'LIFE @ DAUST', title: 'Robotics Club — Line-Follower Challenge', body: 'Saturday 31 May, 10:00 · Innovation Hub. Open to all departments. Build, test, and race your bot.', time: 'Yesterday', accent: 'navy' },
  { tag: 'CAREER', title: 'Career Fair 2026 — 40+ companies on campus', body: 'Wednesday 3 June, Main Hall. Bring your CV. Internship & graduate roles in software, energy, and telecom.', time: '2 days ago', accent: 'navy' },
  { tag: 'BIBLIOTHÈQUE', title: 'Horaires étendus pendant les examens', body: 'La bibliothèque est ouverte jusqu’à minuit du 6 au 18 juin.', time: '3 days ago', accent: 'steel' },
];

// ── Billing (CFA / XOF) ───────────────────────────────────────
const BILLING = {
  currency: 'CFA',
  balance: 1250000,
  dueDate: 'June 5, 2026',
  termTotal: 3500000,
  termPaid: 2250000,
  transactions: [
    { date: 'Apr 2, 2026', label: 'Tuition installment 2', method: 'Wave', amount: -1000000, status: 'Paid' },
    { date: 'Feb 14, 2026', label: 'Tuition installment 1', method: 'Orange Money', amount: -1250000, status: 'Paid' },
    { date: 'Feb 1, 2026', label: 'Spring 2026 tuition', method: 'Invoice', amount: 3500000, status: 'Billed' },
    { date: 'Jan 28, 2026', label: 'Student services fee', method: 'Wave', amount: -150000, status: 'Paid' },
  ],
};

// ── Life @ DAUST events ───────────────────────────────────────
const EVENTS = [
  { date: 'MAY 31', day: 'SAT', title: 'Robotics Line-Follower Challenge', loc: 'Innovation Hub · 10:00', cat: 'Clubs' },
  { date: 'JUN 03', day: 'WED', title: 'Career Fair 2026', loc: 'Main Hall · 09:00', cat: 'Career' },
  { date: 'JUN 06', day: 'SAT', title: 'Inter-Department Football Cup', loc: 'Campus Field · 16:00', cat: 'Sports' },
  { date: 'JUN 12', day: 'FRI', title: 'Cultural Night — Pan-African Showcase', loc: 'Amphitheatre · 19:00', cat: 'Culture' },
];

// ── Documents ─────────────────────────────────────────────────
const DOCUMENTS = [
  { title: 'Enrollment certificate', sub: 'Spring 2026 · Official', icon: 'badge-check' },
  { title: 'Unofficial transcript', sub: 'Updated May 20, 2026', icon: 'file-text' },
  { title: 'Class schedule', sub: 'Spring 2026 · PDF', icon: 'calendar' },
  { title: 'Fee statement & receipts', sub: 'Academic year 2025–26', icon: 'receipt' },
  { title: 'Student handbook', sub: '2025–26 edition', icon: 'book-open' },
];

Object.assign(window, {
  STUDENT, COURSES, SCHEDULE, DAY_NAMES, DAY_FULL,
  ANNOUNCEMENTS, BILLING, EVENTS, DOCUMENTS,
});
