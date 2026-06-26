/* MyDAUST Desktop — app shell: navy sidebar, top bar, routing, tweaks. */

const NAV = [
  { group: null, items: [{ id: 'dashboard', icon: 'home' }] },
  { group: 'academics', items: [
    { id: 'courses', icon: 'book' },
    { id: 'assignments', icon: 'clipboard' },
    { id: 'schedule', icon: 'calendar' },
    { id: 'grades', icon: 'cap' },
  ] },
  { group: 'communication', items: [
    { id: 'inbox', icon: 'inbox' },
    { id: 'announcements', icon: 'megaphone' },
  ] },
  { group: 'campus', items: [
    { id: 'events', icon: 'sparkles' },
    { id: 'library', icon: 'bookmark' },
  ] },
  { group: 'account', items: [
    { id: 'billing', icon: 'wallet' },
    { id: 'documents', icon: 'file' },
    { id: 'id', icon: 'scan' },
    { id: 'settings', icon: 'settings' },
  ] },
];

function Sidebar({ active, go, lang }) {
  const s = DSTR[lang];
  return (
    <aside style={{
      width: 256, flexShrink: 0, height: '100vh',
      background: 'linear-gradient(180deg, var(--daust-navy) 0%, var(--daust-navy-deep) 100%)',
      display: 'flex', flexDirection: 'column', overflowY: 'auto',
    }}>
      <div style={{ padding: '26px 22px 18px' }}>
        <img src="daust/assets/logo-daust-white.png" alt="DAUST" style={{ height: 40 }} />
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 10.5, letterSpacing: '.18em', color: 'var(--fg-on-navy-muted)', marginTop: 10 }}>STUDENT PORTAL</div>
      </div>
      <nav style={{ flex: 1, padding: '6px 14px' }}>
        {NAV.map((sec, si) => (
          <div key={si} style={{ marginBottom: 14 }}>
            {sec.group && <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'rgba(185,196,212,.5)', padding: '6px 12px 7px' }}>{s[sec.group]}</div>}
            {sec.items.map(it => {
              const on = active === it.id;
              return (
                <button key={it.id} onClick={() => go(it.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                  border: 'none', cursor: 'pointer', borderRadius: 10, padding: '10px 12px', marginBottom: 2,
                  background: on ? 'rgba(255,255,255,.12)' : 'transparent',
                  position: 'relative', transition: 'background .14s ease',
                }}
                onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,.06)'; }}
                onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent'; }}>
                  {on && <span style={{ position: 'absolute', left: -14, top: 8, bottom: 8, width: 3, borderRadius: 999, background: 'var(--daust-orange)' }} />}
                  <Icon name={it.icon} size={20} color={on ? '#fff' : 'var(--fg-on-navy-muted)'} strokeWidth={on ? 2.1 : 1.8} />
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: on ? 600 : 500, color: on ? '#fff' : 'var(--fg-on-navy-muted)' }}>{s[it.id]}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <div style={{ padding: 14, borderTop: '1px solid rgba(255,255,255,.1)' }}>
        <a href="MyDAUST.html" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', padding: '10px 12px', borderRadius: 10, color: 'var(--fg-on-navy-muted)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.06)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <Icon name="phone" size={18} color="var(--fg-on-navy-muted)" />
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500 }}>Open mobile app</span>
        </a>
      </div>
    </aside>
  );
}

function TopBar({ title, lang, setTweak, go }) {
  const s = DSTR[lang];
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 20, background: 'rgba(255,255,255,.85)',
      backdropFilter: 'blur(16px) saturate(180%)', WebkitBackdropFilter: 'blur(16px) saturate(180%)',
      borderBottom: '1px solid var(--border)', padding: '14px 32px',
      display: 'flex', alignItems: 'center', gap: 20,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--fg1)' }}>{title}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 999, padding: '9px 16px', width: 280 }}>
        <Icon name="grid" size={16} color="var(--fg3)" />
        <input placeholder={s.search} style={{ border: 'none', background: 'none', outline: 'none', fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--fg1)', flex: 1, width: '100%' }} />
      </div>
      <div style={{ display: 'flex', gap: 5, background: 'var(--bg-subtle)', padding: 3, borderRadius: 999, border: '1px solid var(--border)' }}>
        {['en', 'fr'].map(l => (
          <button key={l} onClick={() => setTweak('lang', l)} style={{ border: 'none', cursor: 'pointer', borderRadius: 999, padding: '6px 13px', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase',
            background: lang === l ? '#fff' : 'transparent', color: lang === l ? 'var(--daust-navy)' : 'var(--fg3)', boxShadow: lang === l ? 'var(--shadow-sm)' : 'none' }}>{l}</button>
        ))}
      </div>
      <button style={{ position: 'relative', width: 42, height: 42, borderRadius: 999, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="bell" size={20} color="var(--daust-navy)" />
        <span style={{ position: 'absolute', top: 9, right: 11, width: 8, height: 8, borderRadius: 999, background: 'var(--daust-orange)', border: '1.5px solid #fff' }} />
      </button>
      <button onClick={() => go('settings')} style={{ display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'none', cursor: 'pointer' }}>
        <Avatar initials={STUDENT.initials} size={40} />
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13.5, color: 'var(--fg1)' }}>{STUDENT.firstName} {STUDENT.lastName}</div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--fg3)' }}>{STUDENT.programShort}</div>
        </div>
      </button>
    </header>
  );
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "lang": "en",
  "idStyle": "navy",
  "accent": "#ed8425"
}/*EDITMODE-END*/;

function DApp() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [page, setPage] = React.useState('dashboard');
  const [param, setParam] = React.useState(null);
  const lang = t.lang || 'en';
  const s = DSTR[lang];

  React.useEffect(() => { document.documentElement.style.setProperty('--daust-orange', t.accent); }, [t.accent]);
  const go = (id, p = null) => { setPage(id); setParam(p); document.getElementById('d-content')?.scrollTo({ top: 0 }); };

  const screens = {
    dashboard: <DDashboard go={go} lang={lang} />,
    courses: <DCourses go={go} lang={lang} />,
    course: <DCourseDetail code={param} go={go} lang={lang} />,
    assignments: <DAssignments go={go} lang={lang} />,
    schedule: <DSchedule lang={lang} />,
    grades: <DGrades lang={lang} />,
    inbox: <DInbox lang={lang} />,
    id: <DID lang={lang} idStyle={t.idStyle} />,
    billing: <DBilling lang={lang} />,
    announcements: <DAnnouncements lang={lang} />,
    events: <DEvents lang={lang} />,
    documents: <DDocuments lang={lang} />,
    library: <DLibrary lang={lang} />,
    settings: <DSettings lang={lang} setTweak={setTweak} t={t} />,
  };
  const titles = { dashboard: s.dashboard, courses: s.courses, assignments: s.assignments, schedule: s.schedule, grades: s.grades, inbox: s.inbox, id: s.id, billing: s.billing, announcements: s.announcements, events: s.events, documents: s.documents, library: s.library, settings: s.settings };
  const title = page === 'course' ? (COURSES.find(c => c.code === param)?.code || s.courses) : titles[page];
  const activeNav = page === 'course' ? 'courses' : page;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-subtle)' }}>
      <Sidebar active={activeNav} go={go} lang={lang} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <TopBar title={title} lang={lang} setTweak={setTweak} go={go} />
        <div id="d-content" style={{ flex: 1, overflowY: 'auto', padding: '28px 32px 48px' }}>
          <div key={page} className="d-fade" style={{ maxWidth: 1180, margin: '0 auto' }}>
            {screens[page]}
          </div>
        </div>
      </div>

      <TweaksPanel>
        <TweakSection label="Language" />
        <TweakRadio label="Interface" value={t.lang} options={['en', 'fr']} onChange={(v) => setTweak('lang', v)} />
        <TweakSection label="Student ID card" />
        <TweakRadio label="Style" value={t.idStyle} options={['navy', 'gradient', 'light']} onChange={(v) => setTweak('idStyle', v)} />
        <TweakSection label="Accent" />
        <TweakColor label="Highlight" value={t.accent} options={['#ed8425', '#153b6a', '#2e7d52', '#c0392b']} onChange={(v) => setTweak('accent', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<DApp />);
