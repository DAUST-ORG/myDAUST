/* DAUST Innovation Tracker — sample domain data.
   Deterministic (seeded) so the prototype is stable across reloads. */

// "Today" inside the prototype — mid Build/Test phase of AY 2025–26.
const TODAY = new Date('2026-03-15T09:00:00');

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtShort(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

// ---------- The modular roadmap: 7 phases, shared by every project ----------
const PHASES = [
  { id: 'proposal', name: 'Proposal',  short: 'Form team & submit proposal',        due: '2025-10-03' },
  { id: 'research', name: 'Research',   short: 'Literature review & problem framing', due: '2025-11-14' },
  { id: 'design',   name: 'Design',     short: 'Architecture, specs & plan',          due: '2025-12-19' },
  { id: 'build',    name: 'Build',      short: 'Prototype & implementation',          due: '2026-03-06' },
  { id: 'test',     name: 'Test',       short: 'Testing & iteration',                 due: '2026-04-17' },
  { id: 'showcase', name: 'Showcase',   short: 'Innovation Expo & Demo Day',          due: '2026-05-22' },
  { id: 'final',    name: 'Final',      short: 'Final report & handover',             due: '2026-06-12' },
];
const phaseIndex = (id) => PHASES.findIndex((p) => p.id === id);

// ---------- Global tasks: the "passes" EVERY project must complete ----------
// type:'global' means assigned to all 150 projects with a hard deadline.
const GLOBAL_TASKS = [
  { id: 'g1',  phase: 'proposal', title: 'Submit Project Proposal',      kind: 'Document', due: '2025-10-03', desc: 'One-page proposal with problem, approach and expected outcome.' },
  { id: 'g2',  phase: 'proposal', title: 'Team Charter & Roles',         kind: 'Document', due: '2025-10-10', desc: 'Define members, roles and a working agreement.' },
  { id: 'g3',  phase: 'research', title: 'Literature Review Report',      kind: 'Document', due: '2025-11-14', desc: 'Survey of prior work and the gap you address.' },
  { id: 'g4',  phase: 'research', title: 'Record a 2-min Pitch Video',    kind: 'Video',    due: '2025-11-28', desc: 'Short video pitching the problem and your idea.' },
  { id: 'g5',  phase: 'design',   title: 'Design Document & Architecture',kind: 'Document', due: '2025-12-19', desc: 'System architecture, key decisions and a build plan.' },
  { id: 'g6',  phase: 'build',    title: 'Mid-Year Progress Review',      kind: 'Review',   due: '2026-02-13', desc: 'Checkpoint with your advisor on progress vs plan.' },
  { id: 'g7',  phase: 'build',    title: 'Working Prototype Demo',        kind: 'Demo',     due: '2026-03-06', desc: 'Demonstrate a working end-to-end prototype.' },
  { id: 'g8',  phase: 'test',     title: 'Test Plan & Results',           kind: 'Document', due: '2026-04-17', desc: 'Evaluation methodology and measured results.' },
  { id: 'g9',  phase: 'showcase', title: 'Expo Poster Submission',        kind: 'Poster',   due: '2026-05-08', desc: 'A0 poster for the Innovation Expo.' },
  { id: 'g10', phase: 'showcase', title: 'Innovation Expo — Demo Day',    kind: 'Event',    due: '2026-05-22', desc: 'Present live at the DAUST Innovation Expo.' },
  { id: 'g11', phase: 'final',    title: 'Final Report Submission',       kind: 'Document', due: '2026-06-12', desc: 'Complete final report with results and reflection.' },
  { id: 'g12', phase: 'final',    title: 'Code & Asset Handover',         kind: 'Handover', due: '2026-06-12', desc: 'Repository, datasets and documentation handed over.' },
];

// ---------- Name & content pools ----------
const FIRST = ['Aïssatou','Mamadou','Fatou','Ousmane','Aminata','Cheikh','Mariama','Ibrahima','Awa','Modou',
  'Khadija','Abdoulaye','Ndeye','Moussa','Sokhna','Pape','Coumba','Babacar','Rokhaya','Lamine',
  'Adama','Seynabou','Idrissa','Bineta','Souleymane','Maïmouna','Cheikhouna','Dieynaba','Malick','Astou',
  'Serigne','Yacine','Boubacar','Nafissatou','Alioune','Ramatoulaye','Saliou','Mame','Daouda','Penda'];
const LAST = ['Diop','Ndiaye','Fall','Sow','Ba','Gueye','Sarr','Diallo','Faye','Cissé',
  'Sy','Mbaye','Kane','Niang','Touré','Sène','Camara','Diouf','Thiam','Seck',
  'Ndour','Bâ','Wade','Diagne','Sané','Tall','Mendy','Coly','Badji','Dieng'];
const ADVISORS = ['Prof. Sidy Ndao','Dr. Aïcha Diène','Dr. Mohamed Lo','Prof. Khadidiatou Sall','Dr. Elhadji Ndiaye',
  'Dr. Fatim Sow','Prof. Cheikh Diong','Dr. Marème Diédhiou','Dr. Ousseynou Ka','Prof. Bara Ndiaye'];
const PROGRAMS = ['Computer Engineering','Electrical Engineering','Technology Ventures'];
const TRACKS = ['AI & Data','Robotics','IoT & Embedded','Energy & Power','HealthTech','AgriTech','Software','Networks'];

const TECH = ['Solar-Powered','AI-Driven','Low-Cost','IoT-Based','Autonomous','Wearable','Drone-Based','Voice-Enabled',
  'Off-Grid','Edge-AI','Open-Source','Sensor-Based'];
const THING = ['Microgrid','Diagnostic Kit','Irrigation Controller','Air-Quality Monitor','Robotic Arm','Translator',
  'Water Purifier','Inventory Scanner','Flood Sensor','Tutoring Assistant','Soil Analyzer','Waste Sorter',
  'Health Tracker','Solar Dryer','Traffic Counter','Beehive Monitor','Cold-Chain Logger','Sign-Language Glove'];
const DOMAIN = ['Rural Clinics','Smallholder Farms','Coastal Towns','Local Markets','Public Transit','Fish Farming',
  'Maternal Health','Off-Grid Schools','Urban Dakar','Saloum Delta','Senegal River Valley','Artisanal Mining',
  'Street Vendors','Community Pharmacies','Peri-Urban Water','Northern Drylands'];

// hand-authored standout titles (shown first, feel real)
const FEATURED = [
  'Computer Vision for Crop-Disease Detection',
  'Low-Cost Neonatal Incubator with Remote Monitoring',
  'Solar Microgrid Controller for Off-Grid Villages',
  'Wolof Speech-to-Text for Public Services',
  'Autonomous Drone for Coastal-Erosion Mapping',
  'Smart Cold-Chain Logger for Vaccine Transport',
  'AI Triage Assistant for Rural Health Posts',
  'IoT Water-Quality Network for the Saloum Delta',
];

// ---------- Seeded RNG ----------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
function person(rng) { return `${pick(rng, FIRST)} ${pick(rng, LAST)}`; }

function makeTitle(rng, i) {
  if (i < FEATURED.length) return FEATURED[i];
  const r = rng();
  if (r < 0.45) return `${pick(rng, TECH)} ${pick(rng, THING)} for ${pick(rng, DOMAIN)}`;
  if (r < 0.75) return `Smart ${pick(rng, THING)} for ${pick(rng, DOMAIN)}`;
  return `${pick(rng, TECH)} ${pick(rng, THING)}`;
}

// Build a per-project task list from the global tasks + a few project tasks,
// with statuses consistent with how far along the project is.
const PROJ_TASK_TITLES = ['Component sourcing','Field interviews','Bench test rig','Dataset collection',
  'Enclosure design','Power budget','User testing round','Calibration pass','Firmware v2','Cost analysis'];

function buildTasks(rng, progressTarget) {
  const tasks = [];
  // global passes
  GLOBAL_TASKS.forEach((g) => {
    tasks.push({ ...g, type: 'global', status: 'pending' });
  });
  // a few project-specific tasks spread across phases
  const nProj = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < nProj; i++) {
    const ph = PHASES[Math.min(6, Math.floor(rng() * 6) + 1)];
    tasks.push({
      id: `p${i}`, phase: ph.id, type: 'project', kind: 'Task',
      title: pick(rng, PROJ_TASK_TITLES), due: ph.due,
      desc: 'Project-specific milestone defined with your advisor.', status: 'pending',
    });
  }
  // assign statuses by phase order + target progress
  tasks.sort((a, b) => phaseIndex(a.phase) - phaseIndex(b.phase));
  const n = tasks.length;
  const doneCount = Math.round((progressTarget / 100) * n);
  tasks.forEach((t, idx) => {
    const overdue = new Date(t.due) < TODAY;
    if (idx < doneCount) {
      t.status = t.type === 'global' && rng() < 0.55 ? 'approved' : 'done';
    } else if (idx === doneCount && overdue) {
      t.status = 'submitted'; // waiting on review
    } else if (overdue) {
      t.status = 'overdue';
    } else {
      t.status = rng() < 0.25 ? 'in-progress' : 'pending';
    }
  });
  return tasks;
}

function computeFromTasks(tasks) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done' || t.status === 'approved').length;
  const overdue = tasks.filter((t) => t.status === 'overdue').length;
  const submitted = tasks.filter((t) => t.status === 'submitted').length;
  const pct = Math.round((done / total) * 100);
  // current phase = first phase with an incomplete task, else last
  let current = PHASES[PHASES.length - 1].id;
  for (const ph of PHASES) {
    const phTasks = tasks.filter((t) => t.phase === ph.id);
    if (phTasks.some((t) => t.status !== 'done' && t.status !== 'approved')) { current = ph.id; break; }
  }
  let health = 'on-track';
  if (overdue >= 3) health = 'behind';
  else if (overdue >= 1) health = 'at-risk';
  return { pct, done, total, overdue, submitted, current, health };
}

function makeProject(i) {
  const rng = mulberry32(i * 2654435761 + 12345);
  const type = rng() < 0.34 ? 'Solo' : 'Group';
  const size = type === 'Solo' ? 1 : 2 + Math.floor(rng() * 4);
  const members = Array.from({ length: size }, () => person(rng));
  // progress skewed around mid-year, some ahead some behind
  let progressTarget = Math.round(35 + rng() * 55);
  if (rng() < 0.12) progressTarget = Math.round(rng() * 30); // a few struggling
  const tasks = buildTasks(rng, progressTarget);
  const meta = computeFromTasks(tasks);
  const program = pick(rng, PROGRAMS);
  const track = pick(rng, TRACKS);
  const title = makeTitle(rng, i);
  const code = `IP-${String(26000 + i).slice(-4)}`;
  const lastActive = daysBetween(new Date(TODAY.getTime() - Math.floor(rng() * 18) * 86400000), TODAY);
  return {
    id: i, code, title, type, program, track,
    members, lead: members[0], advisor: pick(rng, ADVISORS),
    pitch: `An engineering project applying ${track.toLowerCase()} to real problems in Senegal.`,
    abstract: `This project tackles a concrete challenge using a hands-on, research-driven approach. ` +
      `The team designs, builds and tests a working prototype over the academic year, ` +
      `evaluating impact for ${pick(rng, DOMAIN).toLowerCase()}.`,
    tasks, ...meta,
    grade: meta.pct > 60 && rng() < 0.4 ? (rng() < 0.5 ? 'A−' : 'B+') : null,
    lastActiveDays: lastActive,
    repo: 'github.com/daust-innovation/' + code.toLowerCase(),
  };
}

const PROJECTS = Array.from({ length: 150 }, (_, i) => makeProject(i));

// The logged-in student belongs to a mid-flight Build-phase group project.
const MY_PROJECT_ID = 3;
const ME = PROJECTS[MY_PROJECT_ID].members[0];

// ---------- Feedback / activity threads (for detail views) ----------
function feedbackFor(p) {
  const rng = mulberry32(p.id * 99 + 7);
  const notes = [
    { who: p.advisor, role: 'Advisor', when: '4 days ago', text: 'Strong progress on the prototype. Tighten the test plan before the mid-year review and document your power budget.' },
    { who: 'Review Committee', role: 'Admin', when: '2 weeks ago', text: 'Proposal and literature review approved. Please record the pitch video — it is still outstanding.' },
  ];
  if (p.health === 'behind') notes.unshift({ who: p.advisor, role: 'Advisor', when: '2 days ago', text: 'We are behind on several deliverables. Let us meet this week to re-plan the Build phase.' });
  return notes;
}

window.DAUST_DATA = {
  TODAY, PHASES, phaseIndex, GLOBAL_TASKS, PROJECTS, PROGRAMS, TRACKS, ADVISORS,
  MY_PROJECT_ID, ME, fmtDate, fmtShort, daysBetween, computeFromTasks, feedbackFor,
};
