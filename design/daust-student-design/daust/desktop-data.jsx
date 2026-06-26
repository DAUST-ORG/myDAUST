/* MyDAUST Desktop — extended data: assignments, per-course content,
   messaging. Loaded after data.jsx. */

// ── Assignments / to-do (across courses) ──────────────────────
// status: upcoming | submitted | graded ; days = days from "today"
const ASSIGNMENTS = [
  { id: 'a1', course: 'CSC 301', title: 'PA3 — Balanced BST (AVL Trees)', type: 'Project', due: 'Tue, Jun 2', days: 4, points: 100, status: 'upcoming' },
  { id: 'a2', course: 'CSC 301', title: 'Quiz 4 — Heaps & Priority Queues', type: 'Quiz', due: 'Fri, May 30', days: 1, points: 20, status: 'upcoming' },
  { id: 'a3', course: 'ECE 311', title: 'Lab 6 — Finite State Machines', type: 'Lab', due: 'Mon, Jun 1', days: 3, points: 50, status: 'upcoming' },
  { id: 'a4', course: 'ECE 320', title: 'Problem Set 7 — Fourier Transforms', type: 'Assignment', due: 'Wed, Jun 3', days: 5, points: 40, status: 'upcoming' },
  { id: 'a5', course: 'MTH 210', title: 'HW 9 — Eigenvalues & Eigenvectors', type: 'Assignment', due: 'Thu, Jun 4', days: 6, points: 30, status: 'upcoming' },
  { id: 'a6', course: 'TVP 200', title: 'Venture Pitch Deck v2', type: 'Project', due: 'Fri, Jun 5', days: 7, points: 100, status: 'upcoming' },
  { id: 'a7', course: 'ENG 250', title: 'Technical Report — First Draft', type: 'Report', due: 'Sat, May 31', days: 2, points: 100, status: 'submitted' },
  { id: 'a8', course: 'CSC 301', title: 'PA2 — Hash Maps', type: 'Project', due: 'May 12', days: -17, points: 100, status: 'graded', score: 92 },
  { id: 'a9', course: 'ECE 311', title: 'Lab 5 — ALU Design', type: 'Lab', due: 'May 9', days: -20, points: 50, status: 'graded', score: 44 },
  { id: 'a10', course: 'ECE 320', title: 'Midterm Exam', type: 'Exam', due: 'Apr 24', days: -35, points: 100, status: 'graded', score: 90 },
  { id: 'a11', course: 'MTH 210', title: 'HW 8 — Diagonalization', type: 'Assignment', due: 'May 14', days: -15, points: 30, status: 'graded', score: 26 },
];

// ── Per-course content (Canvas-style course pages) ────────────
const COURSE_EXTRA = {
  'CSC 301': {
    desc: 'Core data structures and algorithm design: trees, heaps, hashing, graphs, and complexity analysis, with hands-on programming in C++.',
    progress: 68,
    announce: [
      { title: 'PA3 starter code released', time: '1 day ago', body: 'The AVL tree starter repository is on the course server. Office hours Thursday 14:00–16:00.' },
    ],
    gradeCats: [
      { name: 'Programming Assignments', weight: 40, items: [{ title: 'PA1 — Dynamic Arrays', score: 95, max: 100 }, { title: 'PA2 — Hash Maps', score: 92, max: 100 }, { title: 'PA3 — Balanced BST', score: null, max: 100 }] },
      { name: 'Quizzes', weight: 20, items: [{ title: 'Quiz 1', score: 18, max: 20 }, { title: 'Quiz 2', score: 19, max: 20 }, { title: 'Quiz 3', score: 17, max: 20 }, { title: 'Quiz 4', score: null, max: 20 }] },
      { name: 'Midterm', weight: 15, items: [{ title: 'Midterm Exam', score: 88, max: 100 }] },
      { name: 'Final Exam', weight: 25, items: [{ title: 'Final Exam', score: null, max: 100 }] },
    ],
    modules: [
      { title: 'Module 5 · Trees & Heaps', items: [
        { type: 'reading', title: 'Ch. 12 — Binary Search Trees', status: 'done' },
        { type: 'video', title: 'Lecture: AVL Rotations (42 min)', status: 'done' },
        { type: 'assignment', title: 'PA3 — Balanced BST', status: 'todo' },
        { type: 'quiz', title: 'Quiz 4 — Heaps', status: 'todo' },
      ] },
      { title: 'Module 6 · Graph Algorithms', locked: true, items: [
        { type: 'reading', title: 'Ch. 22 — Elementary Graph Algorithms', status: 'locked' },
        { type: 'video', title: 'Lecture: BFS & DFS', status: 'locked' },
      ] },
    ],
  },
  'ECE 311': {
    desc: 'Combinational and sequential digital logic, HDL design, finite state machines, and FPGA implementation.',
    progress: 61,
    announce: [{ title: 'Lab 6 groups posted', time: '3 days ago', body: 'Check the Materials tab for your assigned bench and partner.' }],
    gradeCats: [
      { name: 'Labs', weight: 45, items: [{ title: 'Lab 4 — Adders', score: 47, max: 50 }, { title: 'Lab 5 — ALU', score: 44, max: 50 }, { title: 'Lab 6 — FSM', score: null, max: 50 }] },
      { name: 'Midterm', weight: 25, items: [{ title: 'Midterm', score: 82, max: 100 }] },
      { name: 'Final Project', weight: 30, items: [{ title: 'FPGA Project', score: null, max: 100 }] },
    ],
    modules: [
      { title: 'Module 5 · Sequential Logic', items: [
        { type: 'reading', title: 'Flip-flops & Registers', status: 'done' },
        { type: 'lab', title: 'Lab 6 — Finite State Machines', status: 'todo' },
      ] },
    ],
  },
  'ECE 320': {
    desc: 'Continuous and discrete-time signals, LTI systems, convolution, Fourier and Laplace transforms.',
    progress: 74,
    announce: [{ title: 'Problem Set 7 posted', time: '2 days ago', body: 'Focus on the Fourier transform pairs table from lecture.' }],
    gradeCats: [
      { name: 'Problem Sets', weight: 30, items: [{ title: 'PS 5', score: 38, max: 40 }, { title: 'PS 6', score: 37, max: 40 }, { title: 'PS 7', score: null, max: 40 }] },
      { name: 'Midterm', weight: 30, items: [{ title: 'Midterm', score: 90, max: 100 }] },
      { name: 'Final Exam', weight: 40, items: [{ title: 'Final Exam', score: null, max: 100 }] },
    ],
    modules: [
      { title: 'Module 6 · Fourier Analysis', items: [
        { type: 'reading', title: 'The Continuous-Time Fourier Transform', status: 'done' },
        { type: 'video', title: 'Lecture: Properties of the FT', status: 'done' },
        { type: 'assignment', title: 'Problem Set 7', status: 'todo' },
      ] },
    ],
  },
  'MTH 210': {
    desc: 'Vector spaces, linear transformations, eigenvalues, and systems of differential equations.',
    progress: 58,
    announce: [{ title: 'HW 9 due Thursday', time: '1 day ago', body: 'Covers eigenvalues, eigenvectors and diagonalization.' }],
    gradeCats: [
      { name: 'Homework', weight: 25, items: [{ title: 'HW 7', score: 28, max: 30 }, { title: 'HW 8', score: 26, max: 30 }, { title: 'HW 9', score: null, max: 30 }] },
      { name: 'Midterm', weight: 35, items: [{ title: 'Midterm', score: 80, max: 100 }] },
      { name: 'Final Exam', weight: 40, items: [{ title: 'Final Exam', score: null, max: 100 }] },
    ],
    modules: [{ title: 'Module 7 · Eigentheory', items: [
      { type: 'reading', title: 'Eigenvalues & Eigenvectors', status: 'done' },
      { type: 'assignment', title: 'HW 9 — Eigenvalues', status: 'todo' },
    ] }],
  },
  'ENG 250': {
    desc: 'Technical writing, documentation, and professional communication for engineers.',
    progress: 80,
    announce: [{ title: 'Peer review pairs assigned', time: '4 days ago', body: 'Exchange drafts with your partner before Monday.' }],
    gradeCats: [
      { name: 'Assignments', weight: 60, items: [{ title: 'Memo & Email', score: 19, max: 20 }, { title: 'Technical Report', score: null, max: 100 }] },
      { name: 'Presentation', weight: 40, items: [{ title: 'Final Presentation', score: null, max: 100 }] },
    ],
    modules: [{ title: 'Module 6 · Technical Reports', items: [
      { type: 'reading', title: 'Structuring a Technical Report', status: 'done' },
      { type: 'assignment', title: 'Technical Report — Draft', status: 'done' },
    ] }],
  },
  'TVP 200': {
    desc: 'Hands-on technology entrepreneurship: ideation, validation, prototyping, and pitching a venture.',
    progress: 65,
    announce: [{ title: 'Pitch day scheduled', time: '5 days ago', body: 'Final pitches Jun 12 in the Innovation Hub. Investors attending.' }],
    gradeCats: [
      { name: 'Milestones', weight: 50, items: [{ title: 'Problem Validation', score: 92, max: 100 }, { title: 'Prototype Demo', score: 88, max: 100 }] },
      { name: 'Final Pitch', weight: 50, items: [{ title: 'Venture Pitch', score: null, max: 100 }] },
    ],
    modules: [{ title: 'Module 5 · Pitching', items: [
      { type: 'video', title: 'Lecture: Telling your venture story', status: 'done' },
      { type: 'assignment', title: 'Pitch Deck v2', status: 'todo' },
    ] }],
  },
};

// ── Messaging / Inbox ─────────────────────────────────────────
const CONVERSATIONS = [
  {
    id: 'c1', name: 'Prof. M. Sow', role: 'CSC 301 · Instructor', initials: 'MS', color: '#153b6a',
    subject: 'Re: PA3 deadline extension', course: 'CSC 301', time: '9:24', unread: true,
    messages: [
      { me: true, name: 'You', time: 'Yesterday 16:40', text: 'Good afternoon Professor, I am juggling the ECE 311 lab this week — would a 48-hour extension on PA3 be possible?' },
      { me: false, name: 'Prof. M. Sow', time: 'Today 9:24', text: 'Hello Aïssatou — yes, that is fine. I have moved your PA3 deadline to Thursday Jun 4, 23:59. Please cite it in your submission notes.' },
    ],
  },
  {
    id: 'c2', name: 'Office of the Registrar', role: 'Administration', initials: 'OR', color: '#1d4a82',
    subject: 'Fall 2026 registration opens Jun 15', time: 'Yesterday', unread: true,
    messages: [
      { me: false, name: 'Registrar', time: 'Yesterday 11:02', text: 'Your registration window for Fall 2026 opens June 15 at 08:00. Meet your advisor to finalize your course plan before then.' },
    ],
  },
  {
    id: 'c3', name: 'Prof. K. Faye', role: 'ECE 311 · Instructor', initials: 'KF', color: '#36414d',
    subject: 'Lab 6 group assignments', course: 'ECE 311', time: 'Wed', unread: false,
    messages: [
      { me: false, name: 'Prof. K. Faye', time: 'Wed 14:10', text: 'Lab 6 groups are posted. You are at Bench 4 with Ousmane. Bring your FSM state diagrams to the session.' },
      { me: true, name: 'You', time: 'Wed 15:30', text: 'Thank you Professor, noted.' },
    ],
  },
  {
    id: 'c4', name: 'Dr. Mariama Sow', role: 'Academic Advisor', initials: 'MS', color: '#ed8425',
    subject: 'Advising — Fall course plan', time: 'Mon', unread: false,
    messages: [
      { me: false, name: 'Dr. Sow', time: 'Mon 10:00', text: 'Let us meet to plan your Fall semester. I have slots Tuesday and Thursday afternoon — which works for you?' },
    ],
  },
  {
    id: 'c5', name: 'Financial Office', role: 'Administration', initials: 'FO', color: '#2e7d52',
    subject: 'Tuition installment reminder', time: 'May 24', unread: false,
    messages: [
      { me: false, name: 'Financial Office', time: 'May 24 09:00', text: 'A friendly reminder that your remaining tuition balance of 1 250 000 CFA is due June 5. You can pay online via the Billing page.' },
    ],
  },
];

const RECIPIENTS = [
  ...COURSES.map(c => ({ label: `${c.instructor} — ${c.code}`, group: 'Instructors' })),
  { label: 'Office of the Registrar', group: 'Administration' },
  { label: 'Dr. Mariama Sow — Academic Advisor', group: 'Administration' },
  { label: 'Financial Office', group: 'Administration' },
  { label: 'IT Help Desk', group: 'Administration' },
];

Object.assign(window, { ASSIGNMENTS, COURSE_EXTRA, CONVERSATIONS, RECIPIENTS });
