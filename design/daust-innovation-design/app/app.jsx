/* DAUST Innovation Tracker — root app: routing, role switch, tweaks, submit modal */

const { T } = window.DAUST_UI;
const DATA = window.DAUST_DATA;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "progressStyle": "bar",
  "density": "comfortable"
}/*EDITMODE-END*/;

function SubmitModal({ task, onClose, onSubmit }) {
  if (!task) return null;
  const { PHASES, phaseIndex, fmtDate } = DATA;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,28,50,.55)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(2px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: 'min(520px, 94vw)', boxShadow: T.shadowLg, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Eyebrow style={{ marginBottom: 5 }}>{PHASES[phaseIndex(task.phase)].name} phase · {task.kind}</Eyebrow>
            <h3 style={{ fontFamily: T.display, fontWeight: 700, fontSize: 19, color: T.fg1, margin: 0 }}>{task.title}</h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.fg3, padding: 4 }}><Icon name="x" size={20} /></button>
        </div>
        <div style={{ padding: 24 }}>
          <p style={{ fontFamily: T.body, fontSize: 13.5, color: T.fg2, lineHeight: 1.55, margin: '0 0 8px' }}>{task.desc}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: T.body, fontSize: 12.5, color: T.fg3, marginBottom: 16 }}>
            <Icon name="calendar" size={14} />Due {fmtDate(task.due)}
          </div>
          <div style={{ border: `2px dashed ${T.border}`, borderRadius: 12, padding: '28px 20px', textAlign: 'center', background: T.g50 }}>
            <div style={{ width: 46, height: 46, borderRadius: 999, background: '#fff', color: T.navy, margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: T.shadowSm }}>
              <Icon name={task.kind === 'Video' ? 'video' : 'upload-cloud'} size={22} />
            </div>
            <div style={{ fontFamily: T.body, fontWeight: 600, fontSize: 13.5, color: T.fg1 }}>Drop your {task.kind.toLowerCase()} here</div>
            <div style={{ fontFamily: T.body, fontSize: 12, color: T.fg3, marginTop: 3 }}>or click to browse — PDF, MP4, PNG up to 50 MB</div>
          </div>
        </div>
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${T.border}`, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="send" onClick={() => onSubmit(task)}>Submit for review</Button>
        </div>
      </div>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) return <pre style={{ padding: 30, fontFamily: 'monospace', color: '#c0392b', whiteSpace: 'pre-wrap' }}>
      {String(this.state.err && this.state.err.stack || this.state.err)}</pre>;
    return this.props.children;
  }
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [role, setRole] = React.useState(() => localStorage.getItem('daust-role') || 'student');
  const [studentView, setStudentView] = React.useState('dashboard');
  const [adminView, setAdminView] = React.useState('overview');
  const [selected, setSelected] = React.useState(null);
  const [submitTask, setSubmitTask] = React.useState(null);
  const [toast, setToast] = React.useState(null);

  // mutable copy of the student's project so submissions persist in-session
  const [projects, setProjects] = React.useState(DATA.PROJECTS);
  const myProject = projects[DATA.MY_PROJECT_ID];

  useLucide();
  React.useEffect(() => { localStorage.setItem('daust-role', role); }, [role]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const doSubmit = (task) => {
    setProjects((ps) => ps.map((p, i) => i === DATA.MY_PROJECT_ID
      ? { ...p, ...DATA.computeFromTasks(p.tasks.map((x) => (x.id === task.id && x.phase === task.phase ? { ...x, status: 'submitted' } : x))),
          tasks: p.tasks.map((x) => (x.id === task.id && x.phase === task.phase ? { ...x, status: 'submitted' } : x)) }
      : p));
    setSubmitTask(null);
    showToast('Submitted for review');
  };

  const view = role === 'student' ? studentView : adminView;
  const onNav = role === 'student' ? setStudentView : (v) => { setSelected(null); setAdminView(v); };

  const TITLES = {
    student: { dashboard: ['My Project', myProject.title], roadmap: ['Roadmap', 'Phase-by-phase plan for the year'],
      tasks: ['Tasks & Deadlines', 'Everything your team needs to submit'], team: ['My Team', myProject.title] },
    admin: { overview: ['Innovation Program', 'Academic Year 2025–2026'], projects: ['All Projects', `${projects.length} active innovation projects`],
      review: ['Review Queue', 'Submissions awaiting your decision'], global: ['Global Tasks', 'Required milestones for every project'] },
  };
  let title, subtitle;
  if (role === 'admin' && selected) { title = selected.title; subtitle = `${selected.code} · ${selected.program}`; }
  else { [title, subtitle] = TITLES[role][view]; }

  const pad = t.density === 'compact' ? '20px 26px' : '28px 32px';

  let content;
  if (role === 'student') {
    if (view === 'dashboard') content = <StudentDashboard project={myProject} tweaks={t} onNav={setStudentView} onOpenTask={setSubmitTask} />;
    else if (view === 'roadmap') content = <StudentRoadmap project={myProject} onOpenTask={setSubmitTask} />;
    else if (view === 'tasks') content = <StudentTasks project={myProject} onOpenTask={setSubmitTask} />;
    else content = <StudentTeam project={myProject} />;
  } else {
    if (selected) content = <AdminProjectDetail project={selected} tweaks={t} onBack={() => setSelected(null)} />;
    else if (view === 'overview') content = <AdminOverview projects={projects} onNav={setAdminView} onOpenProject={setSelected} />;
    else if (view === 'projects') content = <AdminProjects projects={projects} onOpenProject={setSelected} />;
    else if (view === 'review') content = <AdminReviewQueue projects={projects} onOpenProject={setSelected} />;
    else content = <AdminGlobalTasks projects={projects} />;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: T.subtle, fontFamily: T.body }}>
      <Sidebar role={role} view={view} onNav={onNav} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar role={role} onRole={(r) => { setRole(r); setSelected(null); }} title={title} subtitle={subtitle} />
        <main style={{ flex: 1, padding: pad, maxWidth: 1320, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          {content}
        </main>
      </div>

      <SubmitModal task={submitTask} onClose={() => setSubmitTask(null)} onSubmit={doSubmit} />

      {toast && (
        <div style={{ position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)', zIndex: 300,
          background: T.navy, color: '#fff', fontFamily: T.body, fontWeight: 600, fontSize: 13.5, padding: '11px 20px',
          borderRadius: 999, boxShadow: T.shadowLg, display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name="check-circle" size={16} color={T.orange} />{toast}
        </div>
      )}

      <TweaksPanel>
        <TweakSection label="Progress visualization" />
        <TweakRadio label="Style" value={t.progressStyle} options={['bar', 'ring', 'segments', 'steps']}
          onChange={(v) => setTweak('progressStyle', v)} />
        <div style={{ fontFamily: T.body, fontSize: 11.5, color: '#8a93a0', padding: '2px 2px 8px', lineHeight: 1.4 }}>
          How completion shows across cards, tables and detail views.
        </div>
        <TweakSection label="Layout" />
        <TweakRadio label="Density" value={t.density} options={['compact', 'comfortable']}
          onChange={(v) => setTweak('density', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
