/* MyDAUST — app shell: nav stack, bottom tab bar, sub-screen header,
   device scaling, tweaks wiring. Renders the app. */

const NavCtx = React.createContext(null);
const useNav = () => React.useContext(NavCtx);
const TweakCtx = React.createContext({});
const useT = () => React.useContext(TweakCtx);

// i18n — only the strings that benefit from a toggle
const STR = {
  en: {
    home: 'Home', schedule: 'Schedule', id: 'ID', grades: 'Grades', more: 'More',
    goodmorning: 'Good morning', goodafternoon: 'Good afternoon', goodevening: 'Good evening',
    nextclass: 'Next class', today: 'Today', quickactions: 'Quick actions',
    scanid: 'My ID', pay: 'Pay fees', viewgrades: 'Grades', timetable: 'Timetable',
    announcements: 'Announcements', viewall: 'View all', balance: 'Balance due',
    paynow: 'Pay now', thisterm: 'This term', termgpa: 'Term GPA', studentid: 'Student ID',
  },
  fr: {
    home: 'Accueil', schedule: 'Emploi', id: 'Carte', grades: 'Notes', more: 'Plus',
    goodmorning: 'Bonjour', goodafternoon: 'Bon après-midi', goodevening: 'Bonsoir',
    nextclass: 'Prochain cours', today: "Aujourd'hui", quickactions: 'Accès rapide',
    scanid: 'Ma carte', pay: 'Payer', viewgrades: 'Notes', timetable: 'Emploi du temps',
    announcements: 'Annonces', viewall: 'Tout voir', balance: 'Solde dû',
    paynow: 'Payer', thisterm: 'Ce semestre', termgpa: 'Moyenne', studentid: 'Carte étudiant',
  },
};

const TABS = [
  { id: 'home', icon: 'home', key: 'home' },
  { id: 'schedule', icon: 'calendar', key: 'schedule' },
  { id: 'id', icon: 'scan', key: 'id', center: true },
  { id: 'grades', icon: 'cap', key: 'grades' },
  { id: 'more', icon: 'grid', key: 'more' },
];

// ── Sub-screen header (back button) ───────────────────────────
function SubHeader({ title, accent }) {
  const nav = useNav();
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 6, background: 'rgba(245,247,249,.86)',
      backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      borderBottom: '1px solid var(--border)',
      padding: '52px 16px 12px', display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <button onClick={nav.back} style={{
        width: 38, height: 38, borderRadius: 999, border: '1px solid var(--border)',
        background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: 'var(--daust-navy)', flexShrink: 0,
      }}>
        <Icon name="chevL" size={20} />
      </button>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 21, color: 'var(--fg1)', letterSpacing: '.01em' }}>{title}</div>
    </div>
  );
}

// ── Bottom tab bar ────────────────────────────────────────────
function TabBar({ active, onTab }) {
  const t = useT();
  const s = STR[t.lang || 'en'];
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 40,
      paddingBottom: 22, paddingTop: 8,
      background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(18px) saturate(180%)',
      WebkitBackdropFilter: 'blur(18px) saturate(180%)',
      borderTop: '1px solid var(--border)',
      boxShadow: '0 -8px 24px rgba(15,44,80,.06)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', padding: '8px 8px 22px',
    }}>
      {TABS.map(tab => {
        const on = active === tab.id;
        if (tab.center) {
          return (
            <button key={tab.id} onClick={() => onTab(tab.id)} style={{
              border: 'none', background: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              transform: 'translateY(-14px)',
            }}>
              <div style={{
                width: 58, height: 58, borderRadius: 999,
                background: on ? 'linear-gradient(150deg, var(--daust-orange), var(--daust-orange-600))'
                  : 'linear-gradient(150deg, var(--daust-navy-700), var(--daust-navy))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: on ? '0 8px 20px rgba(237,132,37,.4)' : '0 8px 20px rgba(21,59,106,.32)',
                border: '3px solid #fff', transition: 'all .2s ease',
              }}>
                <Icon name="qr" size={26} color="#fff" strokeWidth={1.8} />
              </div>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 10.5, fontWeight: 600, color: on ? 'var(--daust-orange-600)' : 'var(--fg3)' }}>{s[tab.key]}</span>
            </button>
          );
        }
        return (
          <button key={tab.id} onClick={() => onTab(tab.id)} style={{
            border: 'none', background: 'none', cursor: 'pointer', flex: 1,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '4px 0',
          }}>
            <Icon name={tab.icon} size={24} color={on ? 'var(--daust-navy)' : 'var(--gray-400)'} strokeWidth={on ? 2.1 : 1.8} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 10.5, fontWeight: on ? 700 : 500, color: on ? 'var(--daust-navy)' : 'var(--fg3)' }}>{s[tab.key]}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Screen router ─────────────────────────────────────────────
function renderScreen(route) {
  const p = route.params || {};
  switch (route.id) {
    case 'home': return <HomeScreen />;
    case 'schedule': return <ScheduleScreen />;
    case 'id': return <IDScreen />;
    case 'grades': return <GradesScreen />;
    case 'more': return <MoreScreen />;
    case 'billing': return <BillingScreen />;
    case 'announcements': return <AnnouncementsScreen />;
    case 'announcement': return <AnnouncementDetail item={p.item} />;
    case 'events': return <EventsScreen />;
    case 'documents': return <DocumentsScreen />;
    case 'library': return <LibraryScreen />;
    case 'settings': return <SettingsScreen />;
    default: return <HomeScreen />;
  }
}

// ── App ───────────────────────────────────────────────────────
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "lang": "en",
  "idStyle": "navy",
  "accent": "#ed8425"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [stack, setStack] = React.useState([{ id: 'home' }]);
  const [scale, setScale] = React.useState(1);
  const [host, setHost] = React.useState(null);
  const W = 402, H = 874;

  React.useEffect(() => {
    const fit = () => setScale(Math.min(1, (window.innerWidth - 32) / W, (window.innerHeight - 32) / H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // apply accent override globally
  React.useEffect(() => {
    document.documentElement.style.setProperty('--daust-orange', t.accent);
  }, [t.accent]);

  const activeTab = stack[0].id;
  const current = stack[stack.length - 1];
  const depth = stack.length;

  const nav = {
    go: (id, params) => setStack(s => [...s, { id, params }]),
    back: () => setStack(s => s.length > 1 ? s.slice(0, -1) : s),
    setTab: (id) => setStack([{ id }]),
    depth, host,
  };

  const isTab = TABS.some(tb => tb.id === current.id) && depth === 1;

  return (
    <TweakCtx.Provider value={t}>
    <NavCtx.Provider value={nav}>
      <div style={{
        minHeight: '100vh', width: '100%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(120% 90% at 50% 0%, #1d3357 0%, #0f1d33 60%, #0a1424 100%)',
        padding: 16, boxSizing: 'border-box', overflow: 'hidden',
      }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}>
          <IOSDevice>
            <div ref={setHost} style={{ height: '100%', position: 'relative', background: 'var(--bg-subtle)', overflow: 'hidden' }}>
              <div key={depth + '-' + current.id} className="screen-anim" style={{
                height: '100%', overflowY: 'auto', overflowX: 'hidden',
                WebkitOverflowScrolling: 'touch',
              }}>
                {renderScreen(current)}
                <div style={{ height: 112 }} />
              </div>
              <TabBar active={activeTab} onTab={nav.setTab} />
            </div>
          </IOSDevice>
        </div>

        <TweaksPanel>
          <TweakSection label="Language" />
          <TweakRadio label="Interface" value={t.lang} options={['en', 'fr']}
            onChange={(v) => setTweak('lang', v)} />
          <TweakSection label="Student ID card" />
          <TweakRadio label="Style" value={t.idStyle} options={['navy', 'gradient', 'light']}
            onChange={(v) => setTweak('idStyle', v)} />
          <TweakSection label="Accent" />
          <TweakColor label="Highlight" value={t.accent}
            options={['#ed8425', '#153b6a', '#2e7d52', '#c0392b']}
            onChange={(v) => setTweak('accent', v)} />
        </TweaksPanel>
      </div>
    </NavCtx.Provider>
    </TweakCtx.Provider>
  );
}

Object.assign(window, { useNav, useT, STR, SubHeader });

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
