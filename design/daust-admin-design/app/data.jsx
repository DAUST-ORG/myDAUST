// ============================================================
// DAUST Admin — mock data (Dakar American University of Science & Technology)
// Senegal · FCFA · academic year 2025–26
// ============================================================

const PROGRAMS = [
  { code: 'CS',  name: 'Computer Science',          degree: 'B.Sc.', school: 'Engineering', students: 312, tuition: 3850000, color: '#153B6A' },
  { code: 'EE',  name: 'Electrical Engineering',    degree: 'B.Sc.', school: 'Engineering', students: 248, tuition: 3950000, color: '#0EA5E9' },
  { code: 'PE',  name: 'Petroleum Engineering',     degree: 'B.Sc.', school: 'Engineering', students: 176, tuition: 4250000, color: '#8B5CF6' },
  { code: 'CHE', name: 'Chemical Engineering',      degree: 'B.Sc.', school: 'Engineering', students: 154, tuition: 4100000, color: '#F97316' },
  { code: 'ME',  name: 'Mechanical Engineering',    degree: 'B.Sc.', school: 'Engineering', students: 198, tuition: 3950000, color: '#EC4899' },
  { code: 'DS',  name: 'Data Science & AI',         degree: 'M.Sc.', school: 'Graduate',    students: 96,  tuition: 4600000, color: '#6366F1' },
  { code: 'MBA', name: 'Tech Management',           degree: 'MBA',   school: 'Business',    students: 78,  tuition: 5200000, color: '#1D4A82' },
  { code: 'FYE', name: 'Foundation Year',           degree: 'Cert.', school: 'Foundation',  students: 224, tuition: 2900000, color: '#64748B' },
];
const TOTAL_STUDENTS = PROGRAMS.reduce((a, p) => a + p.students, 0);

const FIRST = ['Awa', 'Mamadou', 'Fatou', 'Ousmane', 'Aminata', 'Cheikh', 'Bineta', 'Ibrahima', 'Khady', 'Modou', 'Sokhna', 'Abdoulaye', 'Ndeye', 'Pape', 'Mariama', 'Lamine', 'Coumba', 'Moussa', 'Aïssatou', 'Babacar', 'Rama', 'Serigne', 'Dieynaba', 'Alioune', 'Grace', 'Daniel', 'Chidi', 'Amara', 'Yaw', 'Lindiwe'];
const LAST = ['Diop', 'Ndiaye', 'Fall', 'Sow', 'Ba', 'Gueye', 'Diallo', 'Sarr', 'Faye', 'Cissé', 'Sy', 'Mbaye', 'Kane', 'Touré', 'Camara', 'Sané', 'Diouf', 'Thiam', 'Seck', 'Niang', 'Okafor', 'Mensah', 'Bello', 'Osei', 'Dlamini'];

function seeded(seed) { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
const rnd = seeded(42);
const pick = arr => arr[Math.floor(rnd() * arr.length)];

const STUDENTS = Array.from({ length: 28 }, (_, i) => {
  const prog = pick(PROGRAMS);
  const yr = pick([1, 1, 2, 2, 3, 3, 4]);
  const balance = pick([0, 0, 0, 425000, 1925000, 950000, 0, 1200000]);
  const gpa = (2.4 + rnd() * 1.55).toFixed(2);
  const fn = pick(FIRST), ln = pick(LAST);
  return {
    id: 'DA' + (24000 + i + 1),
    name: fn + ' ' + ln,
    email: (fn[0] + ln).toLowerCase() + '@daust.edu.sn',
    program: prog.code, programName: prog.name, year: yr,
    status: balance > 1500000 ? 'On Hold' : pick(['Enrolled', 'Enrolled', 'Enrolled', 'Probation', 'Leave']),
    gpa: +gpa, balance, credits: 12 + Math.floor(rnd() * 6),
    enrolled: '2022-09', country: pick(['Senegal', 'Senegal', 'Senegal', 'Mali', 'Côte d\'Ivoire', 'Nigeria', 'Ghana', 'Guinea']),
  };
});

const APPLICANTS = Array.from({ length: 16 }, (_, i) => {
  const prog = pick(PROGRAMS.filter(p => p.degree !== 'Cert.'));
  const fn = pick(FIRST), ln = pick(LAST);
  const stages = ['Submitted', 'Under Review', 'Interview', 'Offer', 'Accepted', 'Waitlist', 'Rejected'];
  return {
    id: 'APP' + (5000 + i),
    name: fn + ' ' + ln,
    program: prog.code, programName: prog.name,
    stage: pick(stages),
    score: 60 + Math.floor(rnd() * 40),
    submitted: '2026-0' + (3 + Math.floor(rnd() * 2)) + '-' + (10 + Math.floor(rnd() * 18)),
    country: pick(['Senegal', 'Mali', 'Nigeria', 'Ghana', 'Côte d\'Ivoire', 'Cameroon', 'Guinea']),
    docs: rnd() > 0.3,
  };
});

// Finance — monthly revenue vs expense (FCFA millions handled as raw)
const MONTHS = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'];
const FINANCE = {
  revenue: [1240, 980, 760, 540, 1380, 1120, 890, 1010, 720].map(v => v * 1e6),
  expense: [820, 760, 710, 690, 940, 880, 810, 870, 690].map(v => v * 1e6),
  tuitionCollected: 4_185_600_000,
  tuitionBilled: 5_240_000_000,
  outstanding: 1_054_400_000,
  payrollMonthly: 412_800_000,
  endowment: 8_650_000_000,
  cashOnHand: 2_310_000_000,
};

const INVOICES = Array.from({ length: 14 }, (_, i) => {
  const s = STUDENTS[i % STUDENTS.length];
  const amt = pick([1925000, 1925000, 962500, 2125000, 1450000]);
  const st = pick(['Paid', 'Paid', 'Pending', 'Overdue', 'Partial']);
  return {
    id: 'INV-26-' + (1040 + i),
    student: s.name, studentId: s.id, program: s.program,
    amount: amt, status: st,
    due: '2026-0' + (4 + (i % 2)) + '-' + (5 + i),
    method: st === 'Paid' ? pick(['Orange Money', 'Bank Transfer', 'Wave', 'Card']) : '—',
  };
});

const BUDGET = [
  { category: 'Faculty Salaries', allocated: 2_640_000_000, spent: 2_180_000_000, color: '#153B6A' },
  { category: 'Facilities & Labs', allocated: 1_120_000_000, spent: 870_000_000, color: '#0EA5E9' },
  { category: 'Financial Aid', allocated: 980_000_000, spent: 940_000_000, color: '#8B5CF6' },
  { category: 'Research Grants', allocated: 640_000_000, spent: 410_000_000, color: '#F97316' },
  { category: 'IT & Systems', allocated: 380_000_000, spent: 295_000_000, color: '#EC4899' },
  { category: 'Operations', allocated: 520_000_000, spent: 488_000_000, color: '#6366F1' },
];

const STAFF = Array.from({ length: 16 }, (_, i) => {
  const fn = pick(FIRST), ln = pick(LAST);
  const dept = pick(['Computer Science', 'Electrical Eng.', 'Petroleum Eng.', 'Mathematics', 'Administration', 'Finance', 'Admissions', 'Facilities']);
  const role = pick(['Professor', 'Associate Prof.', 'Lecturer', 'Lab Engineer', 'Coordinator', 'Officer']);
  return {
    id: 'EMP' + (300 + i),
    name: fn + ' ' + ln, dept, role,
    salary: pick([580000, 720000, 940000, 1250000, 1480000]),
    type: pick(['Full-time', 'Full-time', 'Full-time', 'Adjunct', 'Contract']),
    status: pick(['Active', 'Active', 'Active', 'On Leave']),
    email: (fn[0] + ln).toLowerCase() + '@daust.edu.sn',
  };
});

const COURSES = [
  { code: 'CS301', name: 'Algorithms & Data Structures', prog: 'CS', credits: 4, enrolled: 64, cap: 70, instructor: 'Dr. A. Diop', sched: 'MWF 10:00', room: 'B-204' },
  { code: 'CS412', name: 'Machine Learning',             prog: 'DS', credits: 4, enrolled: 48, cap: 50, instructor: 'Dr. K. Fall',  sched: 'TTh 13:00', room: 'B-110' },
  { code: 'EE220', name: 'Circuit Analysis',             prog: 'EE', credits: 3, enrolled: 71, cap: 72, instructor: 'Dr. M. Sow',   sched: 'MWF 08:00', room: 'A-301' },
  { code: 'PE350', name: 'Reservoir Engineering',        prog: 'PE', credits: 4, enrolled: 39, cap: 45, instructor: 'Dr. I. Bâ',    sched: 'TTh 10:00', room: 'C-105' },
  { code: 'CHE310', name: 'Thermodynamics II',           prog: 'CHE', credits: 3, enrolled: 42, cap: 48, instructor: 'Dr. F. Sarr', sched: 'MWF 14:00', room: 'C-220' },
  { code: 'ME201', name: 'Statics & Dynamics',           prog: 'ME', credits: 4, enrolled: 58, cap: 60, instructor: 'Dr. O. Gueye', sched: 'MWF 11:00', room: 'A-118' },
  { code: 'MTH205', name: 'Linear Algebra',              prog: 'FYE', credits: 3, enrolled: 88, cap: 90, instructor: 'Dr. B. Ndiaye', sched: 'TTh 08:00', room: 'A-Hall' },
  { code: 'MBA510', name: 'Operations Strategy',         prog: 'MBA', credits: 3, enrolled: 31, cap: 35, instructor: 'Dr. G. Mensah', sched: 'Sat 09:00', room: 'D-201' },
];

const ANNOUNCEMENTS = [
  { id: 1, title: 'Spring final exam schedule published', audience: 'All students', author: 'Registrar', date: '2026-05-26', tag: 'Academics', pinned: true },
  { id: 2, title: 'Tuition payment deadline extended to June 15', audience: 'All students', author: 'Finance Office', date: '2026-05-24', tag: 'Finance', pinned: true },
  { id: 3, title: 'Faculty senate meeting — agenda items due', audience: 'Faculty', author: 'Provost', date: '2026-05-22', tag: 'Staff', pinned: false },
  { id: 4, title: 'New AI research lab opening in Block C', audience: 'Campus', author: 'Communications', date: '2026-05-19', tag: 'Campus', pinned: false },
  { id: 5, title: 'Housing applications for Fall 2026 now open', audience: 'All students', author: 'Housing', date: '2026-05-15', tag: 'Housing', pinned: false },
];

const ACTIVITY = [
  { who: 'Aïssatou Faye', action: 'approved tuition waiver for', target: 'DA24012', time: '12 min ago', icon: 'badge-check', tone: 'success' },
  { who: 'System', action: 'flagged 18 invoices as', target: 'overdue', time: '40 min ago', icon: 'alert-triangle', tone: 'warning' },
  { who: 'Moussa Diouf', action: 'published', target: 'Spring exam schedule', time: '1 h ago', icon: 'megaphone', tone: 'info' },
  { who: 'Admissions', action: 'moved 6 applicants to', target: 'Interview stage', time: '2 h ago', icon: 'users', tone: 'teal' },
  { who: 'Finance', action: 'processed May', target: 'payroll run', time: '3 h ago', icon: 'wallet', tone: 'success' },
  { who: 'Pape Sarr', action: 'updated course cap for', target: 'CS301', time: '5 h ago', icon: 'pencil', tone: 'neutral' },
];

const HOUSING = [
  { block: 'Block A — Teranga', capacity: 180, occupied: 172, gender: 'Mixed' },
  { block: 'Block B — Baobab', capacity: 160, occupied: 138, gender: 'Women' },
  { block: 'Block C — Sahel', capacity: 200, occupied: 196, gender: 'Men' },
  { block: 'Block D — Faculty', capacity: 48, occupied: 41, gender: 'Staff' },
];

const ROLES_LIST = [
  { role: 'Super Admin', users: 3, desc: 'Full access to every module and setting', perms: 'All' },
  { role: 'Accountant', users: 6, desc: 'Finance, invoices, payroll, budgets', perms: 'Finance · Reports' },
  { role: 'Registrar', users: 4, desc: 'Admissions, enrollment, records, transcripts', perms: 'Students · Academics · Admissions' },
  { role: 'Dean / Dept Head', users: 9, desc: 'Academics, courses, faculty within school', perms: 'Academics · Faculty (scoped)' },
  { role: 'HR Officer', users: 2, desc: 'Staff records, payroll input, leave', perms: 'HR · Reports' },
  { role: 'IT Admin', users: 2, desc: 'Users, roles, system settings, audit logs', perms: 'Settings · Audit' },
];

Object.assign(window, {
  PROGRAMS, TOTAL_STUDENTS, STUDENTS, APPLICANTS, MONTHS, FINANCE, INVOICES, BUDGET, STAFF, COURSES,
  ANNOUNCEMENTS, ACTIVITY, HOUSING, ROLES_LIST,
});
