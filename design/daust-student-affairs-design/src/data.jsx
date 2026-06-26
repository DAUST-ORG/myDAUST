// ============================================================
// DAUST Student Affairs — sample data
// DAUST = Dakar American University of Science & Technology (Senegal)
// All names/figures are illustrative.
// ============================================================

// ---------- Dashboard KPIs ----------
const KPIS = [
  { id: 'occupancy', label: 'Residence occupancy', value: '94.2', unit: '%', trend: 'up', delta: '+2.1', tone: 'accent', sub: '1,184 of 1,256 beds' },
  { id: 'pending',   label: 'Pending assignments', value: '37',   unit: '',  trend: 'up', delta: '+9',  tone: 'warning', sub: '12 flagged for review' },
  { id: 'cases',     label: 'Open conduct cases',  value: '14',   unit: '',  trend: 'down', delta: '−3', tone: 'error',   sub: '3 awaiting hearing' },
  { id: 'budget',    label: 'Co-curricular budget used', value: '61', unit: '%', trend: 'up', delta: '+7', tone: 'info', sub: 'FCFA 28.4M of 46.5M' },
];

// ---------- Residence halls ----------
const HALLS = [
  { id: 'teranga', name: 'Teranga Hall', kind: 'First-year · Mixed', beds: 320, filled: 311, flags: 4, intl: 38, color: '#153b6a' },
  { id: 'goree',   name: 'Gorée Hall',   kind: 'Upper-year · Women', beds: 264, filled: 251, flags: 2, intl: 21, color: '#1d4a82' },
  { id: 'sahel',   name: 'Sahel Hall',   kind: 'Upper-year · Men',   beds: 288, filled: 268, flags: 5, intl: 19, color: '#3a6ea5' },
  { id: 'baobab',  name: 'Baobab Hall',  kind: 'Graduate · Mixed',   beds: 196, filled: 180, flags: 1, intl: 44, color: '#ed8425' },
  { id: 'atlantic',name: 'Atlantic Hall',kind: 'Exchange · Mixed',   beds: 188, filled: 174, flags: 3, intl: 96, color: '#6c7884' },
];

// ---------- Students (housing roster) ----------
const STUDENTS = [
  { id: 'DA-24018', name: 'Aïssatou Diallo',   year: 'Sophomore', major: 'Computer Science', hall: 'Gorée Hall',   room: 'G-214', origin: 'Thiès, SN', intl: false, status: 'assigned' },
  { id: 'DA-25102', name: 'Mamadou Ba',        year: 'First-year', major: 'Mechanical Eng.', hall: 'Teranga Hall', room: 'T-118', origin: 'Saint-Louis, SN', intl: false, status: 'assigned' },
  { id: 'DA-25140', name: 'Chidinma Okeke',    year: 'First-year', major: 'Data Science',     hall: '—', room: '—', origin: 'Lagos, NG', intl: true, status: 'pending' },
  { id: 'DA-23077', name: 'Ousmane Sow',       year: 'Junior',     major: 'Electrical Eng.',  hall: 'Sahel Hall',   room: 'S-303', origin: 'Dakar, SN', intl: false, status: 'assigned' },
  { id: 'DA-25201', name: 'Emily Carter',      year: 'Exchange',   major: 'Civil Eng.',       hall: '—', room: '—', origin: 'Boston, US', intl: true, status: 'pending' },
  { id: 'DA-24233', name: 'Fatou Ndiaye',      year: 'Sophomore',  major: 'Applied Physics',  hall: 'Gorée Hall',   room: 'G-119', origin: 'Kaolack, SN', intl: false, status: 'assigned' },
  { id: 'DA-25166', name: 'Kwame Mensah',      year: 'First-year', major: 'Computer Science', hall: '—', room: '—', origin: 'Accra, GH', intl: true, status: 'pending' },
  { id: 'DA-22019', name: 'Marième Faye',      year: 'Senior',     major: 'Chemical Eng.',    hall: 'Gorée Hall',   room: 'G-401', origin: 'Mbour, SN', intl: false, status: 'assigned' },
  { id: 'DA-25188', name: 'Lucas Moreau',      year: 'Exchange',   major: 'Robotics',         hall: '—', room: '—', origin: 'Lyon, FR', intl: true, status: 'pending' },
  { id: 'DA-23145', name: 'Ibrahima Cissé',    year: 'Junior',     major: 'Mechanical Eng.',  hall: 'Sahel Hall',   room: 'S-211', origin: 'Ziguinchor, SN', intl: false, status: 'assigned' },
  { id: 'DA-24290', name: 'Aminata Gueye',     year: 'Sophomore',  major: 'Data Science',     hall: 'Baobab Hall',  room: 'B-106', origin: 'Touba, SN', intl: false, status: 'assigned' },
  { id: 'DA-25212', name: 'Sofia Hassan',      year: 'Graduate',   major: 'AI & Society',     hall: '—', room: '—', origin: 'Cairo, EG', intl: true, status: 'pending' },
];

// ---------- Pending assignment requests ----------
const REQUESTS = [
  { id: 'REQ-1042', student: 'Chidinma Okeke', sid: 'DA-25140', type: 'New assignment', need: 'Quiet floor · near labs', intl: true,  submitted: '2 days ago', priority: 'high' },
  { id: 'REQ-1043', student: 'Emily Carter',   sid: 'DA-25201', type: 'Exchange placement', need: 'Atlantic Hall · semester', intl: true, submitted: '2 days ago', priority: 'high' },
  { id: 'REQ-1039', student: 'Mamadou Ba',     sid: 'DA-25102', type: 'Room change', need: 'Roommate conflict', intl: false, submitted: '4 days ago', priority: 'med' },
  { id: 'REQ-1044', student: 'Kwame Mensah',   sid: 'DA-25166', type: 'New assignment', need: 'Halal dining proximity', intl: true, submitted: '1 day ago', priority: 'med' },
  { id: 'REQ-1037', student: 'Lucas Moreau',   sid: 'DA-25188', type: 'Exchange placement', need: 'French-speaking floor', intl: true, submitted: '5 days ago', priority: 'low' },
  { id: 'REQ-1045', student: 'Sofia Hassan',   sid: 'DA-25212', type: 'Graduate housing', need: 'Single · Baobab Hall', intl: true, submitted: '6 hours ago', priority: 'med' },
];

// ---------- Housing flags / risk triage ----------
const FLAGS = [
  { id: 'F-301', student: 'Chidinma Okeke', hall: 'Unassigned', kind: 'Arrival in 3 days', sev: 'high', note: 'International first-year — no bed assigned yet.' },
  { id: 'F-288', student: 'Ousmane Sow', hall: 'Sahel Hall', kind: 'Noise complaints ×2', sev: 'med', note: 'Two roommate-reported incidents this month.' },
  { id: 'F-295', student: 'Lucas Moreau', hall: 'Unassigned', kind: 'Visa-linked deadline', sev: 'high', note: 'Housing letter needed for residency permit.' },
  { id: 'F-277', student: 'Aminata Gueye', hall: 'Baobab Hall', kind: 'Maintenance ticket open 11d', sev: 'low', note: 'AC unit unresolved — follow up with facilities.' },
];

// ---------- Roommate matching candidates (for Chidinma Okeke) ----------
const MATCH_SUBJECT = {
  name: 'Chidinma Okeke', sid: 'DA-25140', year: 'First-year', origin: 'Lagos, NG', intl: true,
  prefs: { sleep: 'Early riser', tidy: 'Very tidy', social: 'Moderate', study: 'Quiet room', smoke: 'No' },
};
const MATCHES = [
  { name: 'Aïssatou Diallo', sid: 'DA-24018', hall: 'Gorée Hall', room: 'G-214', score: 94, shared: ['Early riser', 'Very tidy', 'Quiet study'], diff: ['Year'], note: 'Strong lifestyle overlap; both early risers, both prioritise quiet study.' },
  { name: 'Fatou Ndiaye',   sid: 'DA-24233', hall: 'Gorée Hall', room: 'G-119', score: 88, shared: ['Tidy', 'Moderate social'], diff: ['Sleep schedule'], note: 'Compatible tidiness and social energy; slight sleep mismatch.' },
  { name: 'Marième Faye',   sid: 'DA-22019', hall: 'Gorée Hall', room: 'G-401', score: 71, shared: ['Quiet study'], diff: ['Year gap', 'Social'], note: 'Senior — mentorship potential, but social preferences differ.' },
];

// ---------- International student support ----------
const INTL = [
  { name: 'Emily Carter', origin: 'Boston, US', kind: 'Exchange · 1 sem', visa: 'Valid', arrival: 'Sep 2', tasks: ['Airport pickup', 'SIM + bank'], done: 1 },
  { name: 'Sofia Hassan', origin: 'Cairo, EG', kind: 'Graduate', visa: 'Pending', arrival: 'Sep 5', tasks: ['Residency permit', 'Housing letter', 'Orientation'], done: 0 },
  { name: 'Lucas Moreau', origin: 'Lyon, FR', kind: 'Exchange · 1 yr', visa: 'Action needed', arrival: 'Aug 30', tasks: ['Housing letter', 'Permit appt'], done: 0 },
  { name: 'Kwame Mensah', origin: 'Accra, GH', kind: 'Degree-seeking', visa: 'Valid', arrival: 'Aug 28', tasks: ['Orientation', 'Buddy match'], done: 2 },
];

// ---------- Conduct & disputes ----------
const CASES = [
  { id: 'CD-2026-041', student: 'Anonymous (referral)', type: 'Academic integrity', stage: 'Investigation', sev: 'high', opened: 'May 18', officer: 'Dean Faye', sla: '2 days left' },
  { id: 'CD-2026-039', student: 'Ousmane Sow', type: 'Residence noise', stage: 'Mediation', sev: 'med', opened: 'May 14', officer: 'A. Ndour', sla: 'On track' },
  { id: 'CD-2026-044', student: 'Roommate dispute', type: 'Interpersonal conflict', stage: 'Intake', sev: 'med', opened: 'May 24', officer: 'Unassigned', sla: 'New' },
  { id: 'CD-2026-031', student: 'Lab safety violation', type: 'Policy breach', stage: 'Hearing', sev: 'high', opened: 'May 2', officer: 'Dean Faye', sla: 'Scheduled May 31' },
  { id: 'CD-2026-046', student: 'Parking · repeat', type: 'Campus policy', stage: 'Resolved', sev: 'low', opened: 'May 26', officer: 'A. Ndour', sla: 'Closed' },
];

// ---------- Clubs & organizations ----------
const CLUBS = [
  { name: 'Robotics & Automation Society', cat: 'Engineering', members: 84, budget: 3.2, status: 'active', lead: 'Ousmane Sow' },
  { name: 'DAUST Women in STEM',           cat: 'Advocacy',    members: 132, budget: 2.6, status: 'active', lead: 'Aïssatou Diallo' },
  { name: 'Teranga Cultural Collective',   cat: 'Culture',     members: 210, budget: 4.1, status: 'active', lead: 'Marième Faye' },
  { name: 'Entrepreneurship Lab',          cat: 'Business',    members: 96,  budget: 3.8, status: 'active', lead: 'Ibrahima Cissé' },
  { name: 'Coding & Open Source Guild',    cat: 'Engineering', members: 158, budget: 2.2, status: 'active', lead: 'Aminata Gueye' },
  { name: 'Debate & Model UN',             cat: 'Academic',    members: 61,  budget: 1.4, status: 'review', lead: 'Fatou Ndiaye' },
];

// ---------- Events & programs ----------
const EVENTS = [
  { name: 'DAUST Hack 48 — Hackathon', date: 'Jun 6–8', venue: 'Innovation Studio', org: 'Coding Guild', attendees: 240, budget: 6.5, status: 'upcoming', tag: 'Flagship' },
  { name: 'Career & Internship Fair',  date: 'Jun 12',  venue: 'Atlantic Atrium', org: 'Career Services', attendees: 520, budget: 4.2, status: 'upcoming', tag: 'Career' },
  { name: 'Women in STEM Summit',      date: 'Jun 18',  venue: 'Auditorium A',    org: 'Women in STEM', attendees: 180, budget: 3.0, status: 'planning', tag: 'Advocacy' },
  { name: 'Teranga Cultural Night',    date: 'Jun 21',  venue: 'Central Quad',    org: 'Cultural Collective', attendees: 600, budget: 5.5, status: 'planning', tag: 'Culture' },
  { name: 'Robotics Showcase',         date: 'May 29',  venue: 'Eng. Hall Lobby', org: 'Robotics Society', attendees: 150, budget: 2.4, status: 'past', tag: 'Engineering' },
];

// ---------- Co-curricular budget (figures in millions CFA) ----------
const BUDGET = [
  { line: 'Clubs & organizations', allocated: 14.0, spent: 9.6, color: '#153b6a' },
  { line: 'Events & programming',  allocated: 16.5, spent: 11.2, color: '#1d4a82' },
  { line: 'Study abroad support',  allocated: 8.0,  spent: 4.1, color: '#3a6ea5' },
  { line: 'Internship stipends',   allocated: 5.0,  spent: 2.3, color: '#ed8425' },
  { line: 'Wellness & support',    allocated: 3.0,  spent: 1.2, color: '#6c7884' },
];

// ---------- Study abroad / internships ----------
const ABROAD = [
  { name: 'MIT Summer Exchange', kind: 'Study abroad', partner: 'Cambridge, US', seats: '6 / 8', deadline: 'Jun 15', status: 'open' },
  { name: 'Siemens Engineering Internship', kind: 'Internship', partner: 'Munich, DE', seats: '3 / 4', deadline: 'Jun 20', status: 'open' },
  { name: 'Sonatel Data Science Co-op', kind: 'Internship', partner: 'Dakar, SN', seats: '12 / 12', deadline: 'Closed', status: 'full' },
  { name: 'Sorbonne Research Semester', kind: 'Study abroad', partner: 'Paris, FR', seats: '2 / 5', deadline: 'Jul 1', status: 'open' },
];

Object.assign(window, {
  KPIS, HALLS, STUDENTS, REQUESTS, FLAGS, MATCH_SUBJECT, MATCHES,
  INTL, CASES, CLUBS, EVENTS, BUDGET, ABROAD,
});
