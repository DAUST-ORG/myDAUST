// ── Desktop app: router + layout ──────────────────────────────
const PAGES = {
  dashboard: { fn: () => DashboardPage, title: 'Dashboard', subtitle: 'Thursday, May 29 · Spring 2026', cta: { icon: 'clipboard', label: 'Take attendance' }, ctaGo: 'attendance' },
  classes: { fn: () => ClassesPage, title: 'My Classes', subtitle: COURSES.length + ' active courses · Spring 2026' },
  course: { fn: () => CoursePage, title: 'Class', subtitle: '' },
  schedule: { fn: () => SchedulePage, title: 'Schedule', subtitle: 'Week of May 26 – 30, 2026' },
  assignments: { fn: () => AssignmentsPage, title: 'Assignments', subtitle: 'Collect, track & grade submissions' },
  gradebook: { fn: () => GradebookPage, title: 'Gradebook', subtitle: 'Enter and review student grades' },
  attendance: { fn: () => AttendancePage, title: 'Attendance', subtitle: 'Mark and track class attendance' },
  insights: { fn: () => InsightsPage, title: 'Insights', subtitle: 'Performance, attendance & at-risk students' },
  advising: { fn: () => AdvisingPage, title: 'Advising', subtitle: 'Advisees & office hours' },
  messages: { fn: () => MessagesPage, title: 'Messages', subtitle: '' },
  notifications: { fn: () => NotificationsPage, title: 'Announcements', subtitle: 'Campus & academic notices' },
  dining: { fn: () => DiningPage, title: 'Dining', subtitle: 'Faculty meal plan & menu' },
  pay: { fn: () => PayPage, title: 'Pay & Payslips', subtitle: 'Salary, payslips & history' },
  leave: { fn: () => LeavePage, title: 'Leave & Absence', subtitle: 'Balances & requests' },
  booking: { fn: () => BookingPage, title: 'Room & Lab Booking', subtitle: 'Reserve campus spaces' },
  documents: { fn: () => DocumentsPage, title: 'Documents', subtitle: 'Handbook, calendar & resources' },
  profile: { fn: () => ProfilePage, title: 'My Profile', subtitle: 'Faculty account details' },
};

function DesktopApp() {
  const [page, setPage] = React.useState('dashboard');
  const [params, setParams] = React.useState({});
  const scrollRef = React.useRef(null);
  const go = (p, pp = {}) => { setPage(p); setParams(pp); };
  React.useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [page, params]);

  const cfg = PAGES[page] || PAGES.dashboard;
  const Page = cfg.fn();
  let title = cfg.title, subtitle = cfg.subtitle;
  if (page === 'course') { const c = COURSES.find(x => x.id === params.id); if (c) { title = c.code + ' — ' + c.name; subtitle = c.meets + ' · ' + c.time + ' · ' + c.room; } }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', background: '#f5f7f9', overflow: 'hidden' }}>
      <Sidebar active={page} go={go} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Topbar title={title} subtitle={subtitle} cta={cfg.cta} onCta={() => go(cfg.ctaGo)} go={go} />
        <main ref={scrollRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <Page params={params} go={go} />
        </main>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<DesktopApp />);
