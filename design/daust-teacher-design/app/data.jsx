// ── DAUST Teacher Portal — mock data ──────────────────────────
const TEACHER = {
  name: 'Dr. Aminata Diallo',
  first: 'Aminata',
  title: 'Associate Professor',
  dept: 'Computer & Electrical Engineering',
  initials: 'AD',
  email: 'a.diallo@daust.edu.sn',
  office: 'Engineering Block · Room 214',
  officeHours: 'Tue & Thu · 14:00–16:00',
  id: 'FAC-0418',
};

// Brand-derived course colors (navy family + accents, used sparingly)
const COURSES = [
  { id: 'ce201', code: 'CE 201', name: 'Data Structures & Algorithms', students: 32, room: 'Lecture Hall B', meets: 'Mon · Wed · Fri', time: '09:00', color: '#153b6a', ungraded: 12, attRate: 94, term: 'Spring 2026' },
  { id: 'ce305', code: 'CE 305', name: 'Embedded Systems', students: 18, room: 'Hardware Lab 3', meets: 'Tue · Thu', time: '11:00', color: '#ed8425', ungraded: 5, attRate: 88, term: 'Spring 2026' },
  { id: 'ee210', code: 'EE 210', name: 'Circuit Analysis', students: 41, room: 'Lecture Hall A', meets: 'Mon · Wed', time: '14:00', color: '#1d4a82', ungraded: 0, attRate: 91, term: 'Spring 2026' },
  { id: 'ce410', code: 'CE 410', name: 'Senior Design Capstone', students: 9, room: 'Innovation Lab', meets: 'Fri', time: '15:00', color: '#2e7d52', ungraded: 3, attRate: 97, term: 'Spring 2026' },
];

// Today is a Thursday in this prototype
const TODAY = [
  { id: 't1', time: '09:00', end: '10:30', label: 'CE 201 — Lecture', sub: 'Lecture Hall B · 32 students', kind: 'class', course: 'ce201', status: 'done' },
  { id: 't2', time: '11:00', end: '12:30', label: 'CE 305 — Lab Session', sub: 'Hardware Lab 3 · 18 students', kind: 'class', course: 'ce305', status: 'now' },
  { id: 't3', time: '14:00', end: '16:00', label: 'Office Hours', sub: 'Engineering Block · Room 214', kind: 'office', status: 'next' },
  { id: 't4', time: '16:30', end: '17:30', label: 'Faculty Meeting', sub: 'Conference Room · Admin Block', kind: 'meeting', status: 'next' },
];

const ACTIONS = [
  { id: 'a1', icon: 'clipboard', label: 'Take attendance for CE 305', meta: 'Starts 11:00 · in 25 min', tone: 'urgent', go: 'attendance' },
  { id: 'a2', icon: 'edit', label: 'Grade 12 lab reports', meta: 'CE 201 · due tomorrow', tone: 'warn', go: 'gradebook' },
  { id: 'a3', icon: 'award', label: 'Submit midterm grades', meta: 'Registrar deadline · May 31', tone: 'warn', go: null },
  { id: 'a4', icon: 'mail', label: 'Approve advising request', meta: 'Moussa Sow · BSc CE Year 3', tone: 'info', go: 'messages' },
];

const ANNOUNCEMENTS = [
  { id: 'n1', from: 'Office of the Registrar', tag: 'Academics', time: '2h ago', title: 'Spring 2026 midterm grades due May 31', body: 'All midterm grades must be entered in the portal by 23:59 on Friday, May 31. Late submissions require Dean approval.', unread: true },
  { id: 'n2', from: 'IT Services', tag: 'Notice', time: 'Yesterday', title: 'Scheduled maintenance — Saturday 02:00–05:00', body: 'The learning platform and portal will be briefly unavailable during the maintenance window.', unread: true },
  { id: 'n3', from: 'Human Resources', tag: 'HR', time: '2 days ago', title: 'Your May payslip is now available', body: 'View and download your May 2026 payslip from the Pay section.', unread: false },
  { id: 'n4', from: 'Prof. Sidy Ndao — President', tag: 'Campus', time: '3 days ago', title: 'Innovation Week kicks off June 9', body: '100+ student projects will be on display. Faculty are warmly invited to the opening showcase.', unread: false },
];

const THREADS = [
  { id: 'm1', who: 'Moussa Sow', role: 'CE · Year 3', initials: 'MS', preview: 'Professor, may I schedule an advising session about my capstone topic?', time: '10:12', unread: true, color: '#153b6a' },
  { id: 'm2', who: 'Fatou Ndiaye', role: 'CE · Year 2', initials: 'FN', preview: 'Thank you for the feedback on lab report 3!', time: '09:40', unread: false, color: '#ed8425' },
  { id: 'm3', who: 'CE 305 — Group', role: '18 members', initials: 'CE', preview: 'You: Remember to bring your dev boards on Thursday.', time: 'Yesterday', unread: false, color: '#1d4a82' },
  { id: 'm4', who: 'Dr. Omar Cissé', role: 'Dept. Chair', initials: 'OC', preview: 'Can we sync on the new embedded systems curriculum?', time: 'Mon', unread: false, color: '#2e7d52' },
];

const ROSTER = [
  { n: 'Moussa Sow', id: 'CE23-014', att: 96, grade: 'A−', initials: 'MS' },
  { n: 'Fatou Ndiaye', id: 'CE24-007', att: 100, grade: 'A', initials: 'FN' },
  { n: 'Cheikh Fall', id: 'CE23-021', att: 82, grade: 'B', initials: 'CF' },
  { n: 'Awa Diop', id: 'CE24-003', att: 91, grade: 'A−', initials: 'AD' },
  { n: 'Ibrahima Ba', id: 'CE23-018', att: 74, grade: 'C+', initials: 'IB' },
  { n: 'Mariama Gueye', id: 'CE24-011', att: 98, grade: 'A', initials: 'MG' },
  { n: 'Ousmane Sarr', id: 'CE23-009', att: 88, grade: 'B+', initials: 'OS' },
  { n: 'Aïssatou Bâ', id: 'CE24-015', att: 93, grade: 'A−', initials: 'AB' },
  { n: 'Modou Faye', id: 'CE23-027', att: 79, grade: 'B−', initials: 'MF' },
  { n: 'Khady Cissé', id: 'CE24-002', att: 100, grade: 'A', initials: 'KC' },
  { n: 'Pape Diouf', id: 'CE23-031', att: 85, grade: 'B', initials: 'PD' },
  { n: 'Ndèye Thiam', id: 'CE24-019', att: 95, grade: 'A−', initials: 'NT' },
];

const ASSIGNMENTS = [
  { name: 'Lab 1 — Linked Lists', avg: 87, done: 32, total: 32 },
  { name: 'Lab 2 — Stacks & Queues', avg: 84, done: 32, total: 32 },
  { name: 'Midterm Exam', avg: 78, done: 32, total: 32 },
  { name: 'Lab 3 — Trees', avg: null, done: 20, total: 32 },
];

// More-hub destinations
const DINING = {
  plan: 'Faculty Dining — Standard',
  balance: 18500,
  meals: 14,
  hours: '07:30 – 21:00',
  today: [
    { meal: 'Breakfast', item: 'Café Touba · Beignets · Fresh fruit', time: '07:30 – 09:30' },
    { meal: 'Lunch', item: 'Thiéboudienne · Salad bar · Bissap', time: '12:00 – 14:30', feat: true },
    { meal: 'Dinner', item: 'Yassa Poulet · Couscous · Seasonal veg', time: '18:30 – 21:00' },
  ],
};

const PAYSLIPS = [
  { month: 'May 2026', net: 985000, status: 'Available', cur: true },
  { month: 'April 2026', net: 985000, status: 'Paid' },
  { month: 'March 2026', net: 985000, status: 'Paid' },
  { month: 'February 2026', net: 962000, status: 'Paid' },
];

const LEAVE = {
  annual: { used: 6, total: 24 },
  sick: { used: 1, total: 12 },
  requests: [
    { type: 'Annual Leave', dates: 'Jun 16 – Jun 20', days: 5, status: 'Pending' },
    { type: 'Conference', dates: 'May 5 – May 7', days: 3, status: 'Approved' },
    { type: 'Sick Leave', dates: 'Mar 12', days: 1, status: 'Approved' },
  ],
};

const ROOMS = [
  { name: 'Hardware Lab 3', cap: 24, status: 'Free until 11:00', open: true },
  { name: 'Lecture Hall A', cap: 90, status: 'In use · CE 201', open: false },
  { name: 'Innovation Lab', cap: 30, status: 'Free all afternoon', open: true },
  { name: 'Conference Room', cap: 16, status: 'Booked 16:30', open: false },
];

const DOCS = [
  { name: 'Spring 2026 Academic Calendar', type: 'PDF', size: '420 KB' },
  { name: 'Faculty Handbook 2025–26', type: 'PDF', size: '2.1 MB' },
  { name: 'CE 201 — Syllabus', type: 'DOCX', size: '88 KB' },
  { name: 'Grade Submission Guidelines', type: 'PDF', size: '156 KB' },
];

const fmtCFA = (n) => n.toLocaleString('fr-FR').replace(/\u202f/g, ' ') + ' CFA';

Object.assign(window, {
  TEACHER, COURSES, TODAY, ACTIONS, ANNOUNCEMENTS, THREADS, ROSTER,
  ASSIGNMENTS, DINING, PAYSLIPS, LEAVE, ROOMS, DOCS, fmtCFA,
});
