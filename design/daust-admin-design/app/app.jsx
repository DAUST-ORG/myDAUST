// ============================================================
// DAUST Admin — app shell: login, sidebar, topbar, routing, role switcher
// ============================================================
const { useState: useStateApp, useEffect: useEffectApp } = React;

// ---- DAUST logomark: wordmark + signature tri-dash ----
function DaustLogo({ onNavy, size = 26 }) {
  const txt = onNavy ? '#fff' : 'var(--daust-navy)';
  const sub = onNavy ? 'rgba(255,255,255,0.62)' : 'var(--fg-subtle)';
  return (
    <div style={{ lineHeight: 1 }}>
      <div className="daust-wordmark" style={{ fontSize: size, color: txt, display: 'block' }}>DAUST</div>
      <div className={'tri-dash' + (onNavy ? ' on-navy' : '')} style={{ margin: '7px 0 6px' }}><span /><span /><span /></div>
      <div style={{ fontSize: 9.5, color: sub, fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase' }}>Admin Portal</div>
    </div>
  );
}

// ---- Nav definition + role access ----
const NAV = [
  { group: 'Main', items: [{ id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' }] },
  { group: 'Academic', items: [
    { id: 'admissions', label: 'Admissions', icon: 'clipboard-list' },
    { id: 'students', label: 'Students', icon: 'graduation-cap' },
    { id: 'academics', label: 'Programs & Courses', icon: 'book-open' },
  ] },
  { group: 'Operations', items: [
    { id: 'finance', label: 'Finance', icon: 'wallet' },
    { id: 'hr', label: 'Faculty & Staff', icon: 'briefcase' },
    { id: 'housing', label: 'Housing', icon: 'building-2' },
    { id: 'library', label: 'Library', icon: 'library' },
  ] },
  { group: 'Engagement', items: [
    { id: 'comms', label: 'Announcements', icon: 'megaphone' },
    { id: 'reports', label: 'Reports', icon: 'bar-chart-3' },
  ] },
  { group: 'System', items: [{ id: 'settings', label: 'Settings', icon: 'settings' }] },
];

const ROLE_ACCESS = {
  'Super Admin': 'all',
  'Accountant': ['dashboard', 'finance', 'reports'],
  'Registrar': ['dashboard', 'admissions', 'students', 'academics', 'reports'],
  'Dean / Dept Head': ['dashboard', 'academics', 'students', 'hr'],
  'HR Officer': ['dashboard', 'hr', 'reports'],
  'IT Admin': ['dashboard', 'settings', 'reports'],
};
const ROLE_USER = {
  'Super Admin': 'Dr. Léopold Senghor',
  'Accountant': 'Aïssatou Faye',
  'Registrar': 'Moussa Diouf',
  'Dean / Dept Head': 'Pape Sarr',
  'HR Officer': 'Khady Mbaye',
  'IT Admin': 'Ibrahima Kane',
};

// ---- Sidebar ----
function Sidebar({ page, go, role, allowed }) {
  return (
    <aside className="app-sidebar" style={{ width: 'var(--nav-w)', flexShrink: 0, height: '100vh', position: 'sticky', top: 0, background: 'var(--surface)',
      borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '22px 20px 18px' }}><DaustLogo onNavy /></div>
      <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 12px' }}>
        {NAV.map(section => {
          const items = section.items.filter(it => allowed === 'all' || allowed.includes(it.id));
          if (!items.length) return null;
          return (
            <div key={section.group} style={{ marginBottom: 14 }}>
              <div className="sb-section-label" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '8px 12px 6px' }}>{section.group}</div>
              {items.map(it => (
                <div key={it.id} className={'nav-item' + (page === it.id ? ' active' : '')} onClick={() => go(it.id)} style={{ marginBottom: 2 }}>
                  <Icon name={it.icon} size={18} />
                  <span style={{ flex: 1 }}>{it.label}</span>
                  {it.id === 'finance' && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', background: 'var(--cta)', padding: '1px 7px', borderRadius: 999 }}>18</span>}
                  {it.id === 'admissions' && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.16)', padding: '1px 7px', borderRadius: 999 }}>342</span>}
                </div>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="sb-divider" style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px' }}>
          <Avatar name={ROLE_USER[role]} size={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sb-user-name" style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ROLE_USER[role]}</div>
            <div className="sb-user-role" style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>{role}</div>
          </div>
          <IconButton name="log-out" title="Sign out" size={16} />
        </div>
      </div>
    </aside>
  );
}

// ---- Topbar ----
function Topbar({ role, setRole, dark, setDark, title }) {
  const [openRole, setOpenRole] = useStateApp(false);
  return (
    <header style={{ height: 'var(--topbar-h)', position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', gap: 16,
      padding: '0 28px', background: dark ? 'rgba(12,31,56,0.88)' : 'rgba(255,255,255,0.88)', backdropFilter: 'blur(16px)',
      borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>{title}</div>
      <div style={{ flex: 1, maxWidth: 420 }}>
        <SearchInput placeholder="Search students, invoices, courses…" value="" onChange={() => {}} />
      </div>
      <div style={{ flex: 1 }} />
      {/* Role switcher */}
      <div style={{ position: 'relative' }}>
        <button onClick={() => setOpenRole(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-muted)', fontWeight: 600 }}>
          <Icon name="repeat" size={15} style={{ color: 'var(--accent)' }} />
          Viewing as: <b style={{ color: 'var(--fg)' }}>{role}</b>
          <Icon name="chevron-down" size={15} />
        </button>
        {openRole && (
          <>
            <div onClick={() => setOpenRole(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 61, width: 230, background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: 6, animation: 'daust-fade-in 160ms var(--ease-out)' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 10px 4px' }}>Switch role</div>
              {Object.keys(ROLE_ACCESS).map(r => (
                <div key={r} onClick={() => { setRole(r); setOpenRole(false); }} className="row-hover" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  background: r === role ? 'var(--accent-bg)' : 'transparent' }}>
                  <Avatar name={ROLE_USER[r]} size={28} />
                  <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: r === role ? 'var(--accent)' : 'var(--fg)' }}>{r}</div></div>
                  {r === role && <Icon name="check" size={15} style={{ color: 'var(--accent)' }} />}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <IconButton name={dark ? 'sun' : 'moon'} title="Toggle theme" onClick={() => setDark(d => !d)} />
      <IconButton name="bell" title="Notifications" badge="4" />
      <IconButton name="help-circle" title="Help" />
    </header>
  );
}

// ---- Login ----
function Login({ onSignIn }) {
  const [role, setRole] = useStateApp('Super Admin');
  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
      {/* Left brand panel */}
      <div style={{ background: 'var(--grad-dark-surface)', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 56, color: '#fff' }}>
        <div aria-hidden="true" style={{ position: 'absolute', right: -40, bottom: 40, fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 280, lineHeight: 0.8, color: 'rgba(255,255,255,0.04)', letterSpacing: '0.02em', userSelect: 'none' }}>D</div>
        <img src="assets/logo-daust-white.png" alt="DAUST" style={{ height: 52, width: 'auto', objectFit: 'contain', alignSelf: 'flex-start', position: 'relative', zIndex: 1 }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="label" style={{ color: 'var(--daust-orange)', marginBottom: 16 }}>Administration · 2025–26</div>
          <h1 style={{ color: '#fff', fontSize: 42, lineHeight: 1.06, letterSpacing: '0.01em', maxWidth: '15ch' }}>Run the university from one console.</h1>
          <p style={{ color: 'rgba(255,255,255,0.72)', marginTop: 18, maxWidth: '42ch', fontSize: 15.5 }}>Admissions, finance, academics, faculty and facilities — every operation, one source of truth.</p>
          <div className="tri-dash on-navy" style={{ marginTop: 24 }}><span /><span /><span /></div>
        </div>
        <div style={{ display: 'flex', gap: 22, fontSize: 12.5, color: 'rgba(255,255,255,0.6)', position: 'relative', zIndex: 1 }}>
          <span>1,486 students</span><span>·</span><span>8 programs</span><span>·</span><span>142 staff</span>
        </div>
      </div>
      {/* Right form */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, background: 'var(--bg)' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <h2 style={{ fontSize: 26, marginBottom: 6 }}>Sign in</h2>
          <p style={{ color: 'var(--fg-subtle)', marginBottom: 28 }}>Welcome back. Choose how you'd like to enter the portal.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Email"><Input defaultValue="admin@daust.edu.sn" /></Field>
            <Field label="Password"><Input type="password" defaultValue="••••••••••" /></Field>
            <Field label="Sign in as" hint="Demo — pick a role to preview its access level">
              <Select options={Object.keys(ROLE_ACCESS)} value={role} onChange={setRole} />
            </Field>
            <Button variant="primary" size="lg" icon="log-in" onClick={() => onSignIn(role)} style={{ width: '100%', marginTop: 4 }}>Sign in to DAUST</Button>
            <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--fg-faint)', marginTop: 4 }}>Protected by 2FA · SSO available for staff</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Root App ----
const PAGE_TITLES = { dashboard: 'Dashboard', admissions: 'Admissions', students: 'Students', academics: 'Programs & Courses', finance: 'Finance', hr: 'Faculty & Staff', housing: 'Housing', library: 'Library', comms: 'Announcements', reports: 'Reports', settings: 'Settings' };

function App() {
  const [authed, setAuthed] = useStateApp(false);
  const [role, setRole] = useStateApp('Super Admin');
  const [page, setPage] = useStateApp('dashboard');
  const [dark, setDark] = useStateApp(false);

  useEffectApp(() => { document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light'); }, [dark]);
  useEffectApp(() => { if (window.lucide) window.lucide.createIcons(); });

  const allowed = ROLE_ACCESS[role];
  useEffectApp(() => { if (allowed !== 'all' && !allowed.includes(page)) setPage('dashboard'); }, [role]);

  const go = (p) => { setPage(p); window.scrollTo(0, 0); };

  if (!authed) return <Login onSignIn={(r) => { setRole(r); setAuthed(true); setPage('dashboard'); }} />;

  const Pages = {
    dashboard: window.Dashboard, admissions: window.Admissions, students: window.Students, academics: window.Academics,
    finance: window.Finance, hr: window.HR, housing: window.Housing, library: window.Library,
    comms: window.Comms, reports: window.Reports, settings: window.Settings,
  };
  const Current = Pages[page] || window.Dashboard;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-subtle)' }}>
      <Sidebar page={page} go={go} role={role} allowed={allowed} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Topbar role={role} setRole={setRole} dark={dark} setDark={setDark} title={PAGE_TITLES[page]} />
        <main style={{ flex: 1, padding: '28px 32px 64px', maxWidth: 'var(--content-max)', width: '100%', margin: '0 auto' }}>
          <Current go={go} key={page} />
        </main>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
