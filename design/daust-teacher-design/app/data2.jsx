// ── Extended mock data for new teacher modules ────────────────
// Assignments across all courses
const ALL_ASSIGNMENTS = [
  { id: 'as1', course: 'ce201', title: 'Lab 3 — Trees', type: 'Lab', due: 'May 30', submitted: 20, total: 32, graded: 0, avg: null },
  { id: 'as2', course: 'ce201', title: 'Problem Set 4', type: 'Homework', due: 'Jun 2', submitted: 28, total: 32, graded: 0, avg: null },
  { id: 'as3', course: 'ce305', title: 'Project Milestone 2', type: 'Project', due: 'May 28', submitted: 16, total: 18, graded: 11, avg: 82 },
  { id: 'as4', course: 'ce305', title: 'Lab 5 — UART Driver', type: 'Lab', due: 'Jun 4', submitted: 5, total: 18, graded: 0, avg: null },
  { id: 'as5', course: 'ee210', title: 'Midterm Exam', type: 'Exam', due: 'May 20', submitted: 41, total: 41, graded: 41, avg: 78 },
  { id: 'as6', course: 'ce410', title: 'Capstone Report — Draft', type: 'Report', due: 'Jun 6', submitted: 3, total: 9, graded: 0, avg: null },
];

// Submission state for an assignment, derived from ROSTER
function submissionsFor(asg) {
  return ROSTER.map((s, i) => {
    const submitted = i < asg.submitted;
    const late = submitted && (i % 9 === 4);
    const graded = i < asg.graded;
    return { ...s, status: !submitted ? 'missing' : late ? 'late' : 'on-time', graded, grade: graded ? 70 + ((i * 7) % 28) : null, when: submitted ? (late ? 'May 31 · late' : 'May 29') : '—' };
  });
}

// Advisees
const ADVISEES = [
  { n: 'Moussa Sow', id: 'CE23-014', year: 'Year 3', major: 'Computer Eng.', gpa: 3.6, standing: 'Good standing', risk: false, initials: 'MS', note: 'Capstone advising' },
  { n: 'Ibrahima Ba', id: 'CE23-018', year: 'Year 3', major: 'Computer Eng.', gpa: 2.1, standing: 'Academic probation', risk: true, initials: 'IB', note: 'Missed 3 labs · low CE 201 grade' },
  { n: 'Awa Diop', id: 'CE24-003', year: 'Year 2', major: 'Computer Eng.', gpa: 3.4, standing: 'Good standing', risk: false, initials: 'AD', note: 'Requested grade review' },
  { n: 'Modou Faye', id: 'CE23-027', year: 'Year 3', major: 'Electrical Eng.', gpa: 2.5, standing: 'Watch', risk: true, initials: 'MF', note: 'Attendance dropping' },
  { n: 'Mariama Gueye', id: 'CE24-011', year: 'Year 2', major: 'Computer Eng.', gpa: 3.9, standing: 'Dean\u2019s list', risk: false, initials: 'MG', note: 'Research assistant candidate' },
  { n: 'Pape Diouf', id: 'CE23-031', year: 'Year 3', major: 'Computer Eng.', gpa: 3.0, standing: 'Good standing', risk: false, initials: 'PD', note: 'Internship reference' },
];

// Office hours — today (Thursday) 14:00–16:00, 30-min slots
const OFFICE_SLOTS = [
  { time: '14:00', student: 'Moussa Sow', topic: 'Capstone topic discussion', initials: 'MS' },
  { time: '14:30', student: null },
  { time: '15:00', student: 'Awa Diop', topic: 'CE 201 grade review', initials: 'AD' },
  { time: '15:30', student: null },
];

// Analytics: grade distribution + attendance trend per course
const GRADE_DIST = {
  ce201: [9, 12, 7, 3, 1], ce305: [6, 8, 3, 1, 0], ee210: [10, 15, 11, 4, 1], ce410: [5, 3, 1, 0, 0],
};
const ATT_TREND = {
  ce201: [96, 94, 92, 95, 91, 94], ce305: [90, 88, 85, 89, 86, 88], ee210: [93, 91, 90, 92, 88, 91], ce410: [100, 97, 98, 96, 97, 97],
};
const DIST_LABELS = ['A', 'B', 'C', 'D', 'F'];
const DIST_COLORS = ['#2e7d52', '#1d4a82', '#ed8425', '#c4660f', '#c0392b'];

const AT_RISK = [
  { n: 'Ibrahima Ba', id: 'CE23-018', course: 'CE 201', why: 'Attendance 74% · grade C+ · 2 missing labs', initials: 'IB', sev: 'high' },
  { n: 'Modou Faye', id: 'CE23-027', course: 'CE 201', why: 'Attendance 79% · grade B− · trend down', initials: 'MF', sev: 'med' },
  { n: 'Cheikh Fall', id: 'CE23-021', course: 'CE 305', why: 'Missed Project Milestone 2', initials: 'CF', sev: 'med' },
];

// Per-course teaching materials (published to students or draft)
const MATERIALS = {
  ce201: [
    { name: 'Week 1 — Course Intro & Syllabus', type: 'PDF', size: '1.2 MB', pub: true },
    { name: 'Week 3 — Linked Lists (slides)', type: 'PPTX', size: '3.4 MB', pub: true },
    { name: 'Reading — Asymptotic Analysis', type: 'PDF', size: '640 KB', pub: true },
    { name: 'Week 5 — Trees (draft)', type: 'PPTX', size: '2.8 MB', pub: false },
  ],
  ce305: [
    { name: 'Embedded Toolchain Setup', type: 'PDF', size: '880 KB', pub: true },
    { name: 'Lab 5 — UART brief', type: 'PDF', size: '410 KB', pub: false },
  ],
  ee210: [{ name: 'Circuit Analysis — Formula Sheet', type: 'PDF', size: '220 KB', pub: true }],
  ce410: [{ name: 'Capstone Report Template', type: 'DOCX', size: '120 KB', pub: true }],
};

// Posts a teacher has made to a class
const CLASS_POSTS = {
  ce201: [
    { title: 'Midterm review session — Friday 16:00', body: 'Optional review in Lecture Hall B. Bring questions on trees and recursion.', time: '2 days ago', pinned: true },
    { title: 'Lab 3 deadline extended to May 30', body: 'Due to the maintenance window, the Lab 3 submission deadline has moved to Saturday.', time: '4 days ago', pinned: false },
  ],
  ce305: [{ title: 'Bring your dev boards Thursday', body: 'We will flash the UART driver in the lab session.', time: '1 day ago', pinned: false }],
  ee210: [], ce410: [],
};

Object.assign(window, { ALL_ASSIGNMENTS, submissionsFor, ADVISEES, OFFICE_SLOTS, GRADE_DIST, ATT_TREND, DIST_LABELS, DIST_COLORS, AT_RISK, MATERIALS, CLASS_POSTS });
