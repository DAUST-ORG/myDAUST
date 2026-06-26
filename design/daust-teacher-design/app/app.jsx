// ── App shell: router + top bar + tab bar + tweaks ────────────
const TABS = [
  { id: 'home', icon: 'home', label: 'Home' },
  { id: 'classes', icon: 'book', label: 'Classes' },
  { id: 'schedule', icon: 'calendar', label: 'Schedule' },
  { id: 'messages', icon: 'message', label: 'Messages', badge: 2 },
  { id: 'more', icon: 'grid', label: 'More' },
];

// screen -> { tab, title, full(no tab bar, self-managed height) }
const META = {
  home: { tab: 'home' },
  classes: { tab: 'classes', title: 'My Classes' },
  course: { tab: 'classes', title: '' },
  attendance: { tab: 'classes', title: 'Attendance', full: true },
  gradebook: { tab: 'classes', title: 'Gradebook', full: true },
  schedule: { tab: 'schedule', title: 'Schedule' },
  messages: { tab: 'messages', title: 'Messages' },
  thread: { tab: 'messages', title: '', full: true },
  notifications: { tab: 'home', title: 'Announcements' },
  more: { tab: 'more', title: 'More' },
  dining: { tab: 'more', title: 'Dining' },
  pay: { tab: 'more', title: 'Pay & Payslips' },
  leave: { tab: 'more', title: 'Leave & Absence' },
  booking: { tab: 'more', title: 'Room Booking' },
  documents: { tab: 'more', title: 'Documents' },
  profile: { tab: 'more', title: 'Profile' },
};

const SCREEN_FN = {
  home: HomeScreen, classes: ClassesScreen, course: CourseScreen,
  attendance: AttendanceScreen, gradebook: GradebookScreen, schedule: ScheduleScreen,
  messages: MessagesScreen, thread: ThreadScreen, notifications: NotificationsScreen,
  more: MoreScreen, dining: DiningScreen, pay: PayScreen, leave: LeaveScreen,
  booking: BookingScreen, documents: DocumentsScreen, profile: ProfileScreen,
};

function TopBar({ entry, onBack, nav, accent }) {
  const meta = META[entry.screen];
  if (entry.screen === 'home') {
    return (
      <div style={{ paddingTop: 54, background: '#fff', borderBottom: '1px solid #eef1f5' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px 14px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12.5, color: '#9da6ae', fontWeight: 500 }}>Good morning,</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ margin: 0, fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 24, color: '#141a21', letterSpacing: '.01em' }}>{TEACHER.first}</h1>
            </div>
            <div style={{ marginTop: 6 }}><TriDash w={18} /></div>
          </div>
          <button onClick={() => nav('notifications')} style={iconBtn()}>
            <Icon name="bell" size={21} color={NAVY} />
            <span style={{ position: 'absolute', top: 7, right: 7, width: 8, height: 8, borderRadius: '50%', background: accent, border: '1.5px solid #fff' }} />
          </button>
          <button onClick={() => nav('profile')} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}>
            <Avatar initials={TEACHER.initials} size={40} color={NAVY} />
          </button>
        </div>
      </div>
    );
  }
  let title = meta.title;
  if (entry.screen === 'course') { const c = COURSES.find(x => x.id === entry.params.id); title = c ? c.code : 'Class'; }
  if (entry.screen === 'thread') { const m = THREADS.find(x => x.id === entry.params.id); title = m ? m.who : 'Message'; }
  if (entry.screen === 'attendance' || entry.screen === 'gradebook') { const c = COURSES.find(x => x.id === entry.params.id); title = (c ? c.code + ' · ' : '') + meta.title; }
  return (
    <div style={{ paddingTop: 54, background: '#fff', borderBottom: '1px solid #eef1f5' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px 12px' }}>
        <button onClick={onBack} style={iconBtn()}>
          <Icon name="chevL" size={22} color={NAVY} />
        </button>
        <h1 style={{ flex: 1, margin: 0, fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 19, color: '#141a21', letterSpacing: '.01em', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h1>
        <div style={{ width: 40 }} />
      </div>
    </div>
  );
}
const iconBtn = () => ({ position: 'relative', width: 40, height: 40, borderRadius: '50%', border: 'none', background: '#f5f7f9', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 });

function TabBar({ activeTab, onTab, labels, accent }) {
  return (
    <div style={{ display: 'flex', background: 'rgba(255,255,255,.94)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderTop: '1px solid #eef1f5', padding: '9px 6px 24px', flexShrink: 0 }}>
      {TABS.map(t => {
        const on = activeTab === t.id;
        return (
          <button key={t.id} onClick={() => onTab(t.id)} style={{ flex: 1, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '2px 0' }}>
            <div style={{ position: 'relative' }}>
              <Icon name={t.icon} size={24} color={on ? accent : '#9da6ae'} stroke={on ? 2.4 : 2} />
              {t.badge && <span style={{ position: 'absolute', top: -3, right: -7, minWidth: 15, height: 15, padding: '0 4px', borderRadius: 999, background: ORANGE, color: '#fff', fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 9.5, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #fff' }}>{t.badge}</span>}
            </div>
            {labels && <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 10, fontWeight: on ? 600 : 500, color: on ? accent : '#9da6ae' }}>{t.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "homeLayout": "schedule",
  "navLabels": true,
  "accent": "#ed8425"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [stack, setStack] = React.useState([{ screen: 'home', params: {} }]);
  const scrollRef = React.useRef(null);
  const entry = stack[stack.length - 1];
  const meta = META[entry.screen];
  const accent = t.accent || ORANGE;

  const nav = (screen, params = {}) => {
    if (META[screen] && META[screen].tab !== meta.tab) {
      setStack([{ screen, params }]); // switching section -> reset
    } else if (TABS.find(x => x.id === screen)) {
      setStack([{ screen, params }]);
    } else {
      setStack(s => [...s, { screen, params }]);
    }
  };
  const onTab = (tab) => {
    const root = tab === 'more' ? 'more' : tab;
    setStack([{ screen: root, params: {} }]);
  };
  const back = () => setStack(s => s.length > 1 ? s.slice(0, -1) : s);

  React.useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [stack.length, entry.screen]);

  const Screen = SCREEN_FN[entry.screen];

  return (
    <IOSDevice>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#f5f7f9', position: 'relative' }}>
        <TopBar entry={entry} onBack={back} nav={nav} accent={accent} />
        {meta.full ? (
          <div style={{ flex: 1, minHeight: 0, paddingBottom: 22, boxSizing: 'border-box' }}>
            <Screen params={entry.params} nav={nav} back={back} t={t} />
          </div>
        ) : (
          <React.Fragment>
            <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <div style={{ paddingTop: 14 }}>
                <Screen params={entry.params} nav={nav} back={back} t={t} />
              </div>
              <div style={{ height: 14 }} />
            </div>
            <TabBar activeTab={meta.tab} onTab={onTab} labels={t.navLabels} accent={accent} />
          </React.Fragment>
        )}
      </div>

      <TweaksPanel>
        <TweakSection label="Home screen" />
        <TweakRadio label="Lead with" value={t.homeLayout}
          options={[{ value: 'schedule', label: 'Today' }, { value: 'actions', label: 'To-dos' }, { value: 'overview', label: 'Overview' }]}
          onChange={v => setTweak('homeLayout', v)} />
        <TweakSection label="Navigation" />
        <TweakToggle label="Tab labels" value={t.navLabels} onChange={v => setTweak('navLabels', v)} />
        <TweakSection label="Theme" />
        <TweakColor label="Accent" value={t.accent} options={['#ed8425', '#153b6a', '#1d4a82', '#2e7d52']} onChange={v => setTweak('accent', v)} />
      </TweaksPanel>
    </IOSDevice>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
