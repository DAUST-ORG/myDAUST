// ============================================================
// DAUST Admin — Academics & HR modules
// ============================================================
const { useState: useStateAcad } = React;

function Academics({ go }) {
  const [tab, setTab] = useStateAcad('programs');
  return (
    <div className="fade-in">
      <PageHeader eyebrow="Academics" title="Programs & Courses" subtitle="Degree programs, course catalog, schedules and capacity across all schools."
        actions={<><Button variant="outline" icon="calendar-days">Spring 2026</Button><Button variant="primary" icon="plus">New course</Button></>} />
      <Tabs tabs={[{ value: 'programs', label: 'Programs' }, { value: 'courses', label: 'Course catalog' }, { value: 'schedule', label: 'Schedule grid' }]} active={tab} onChange={setTab} />
      {tab === 'programs' && <ProgramsGrid go={go} />}
      {tab === 'courses' && <CoursesTab />}
      {tab === 'schedule' && <ScheduleGrid />}
    </div>
  );
}

function ProgramsGrid({ go }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
      {window.PROGRAMS.map(p => (
        <Card key={p.code} hover padding={20}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)', background: p.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, letterSpacing: '-0.02em' }}>{p.code}</span>
            <Badge tone="neutral" dot={false} size="sm">{p.degree}</Badge>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>{p.name}</div>
          <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginBottom: 14 }}>{p.school} School</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 14, borderTop: '1px solid var(--divider)' }}>
            <div><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--fg)' }}>{p.students}</div><div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>students</div></div>
            <div style={{ textAlign: 'right' }}><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--fg)' }}>{fmtFCFA(p.tuition, { short: true })}</div><div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>FCFA / year</div></div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function CoursesTab() {
  const [q, setQ] = useStateAcad('');
  const rows = window.COURSES.filter(c => c.name.toLowerCase().includes(q.toLowerCase()) || c.code.toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SearchInput placeholder="Search courses…" value={q} onChange={setQ} width={280} />
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="dt">
            <thead><tr><th>Code</th><th>Course</th><th>Program</th><th>Credits</th><th>Instructor</th><th>Schedule</th><th>Room</th><th>Capacity</th></tr></thead>
            <tbody>
              {rows.map(c => {
                const full = c.enrolled / c.cap > 0.95;
                return (
                  <tr key={c.code}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--fg)', fontWeight: 600 }}>{c.code}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{c.name}</td>
                    <td><Badge tone="neutral" dot={false} size="sm">{c.prog}</Badge></td>
                    <td>{c.credits}</td>
                    <td>{c.instructor}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{c.sched}</td>
                    <td>{c.room}</td>
                    <td style={{ minWidth: 130 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Progress value={c.enrolled} max={c.cap} tone={full ? 'warning' : 'teal'} height={6} />
                        <span style={{ fontSize: 12, color: 'var(--fg-subtle)', whiteSpace: 'nowrap' }}>{c.enrolled}/{c.cap}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ScheduleGrid() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const slots = ['08:00', '10:00', '11:00', '13:00', '14:00'];
  const place = {
    '08:00-Mon': window.COURSES[2], '08:00-Tue': window.COURSES[6], '08:00-Wed': window.COURSES[2], '08:00-Fri': window.COURSES[2],
    '10:00-Mon': window.COURSES[0], '10:00-Wed': window.COURSES[0], '10:00-Fri': window.COURSES[0], '10:00-Tue': window.COURSES[3], '10:00-Thu': window.COURSES[3],
    '11:00-Mon': window.COURSES[5], '11:00-Wed': window.COURSES[5], '11:00-Fri': window.COURSES[5],
    '13:00-Tue': window.COURSES[1], '13:00-Thu': window.COURSES[1],
    '14:00-Mon': window.COURSES[4], '14:00-Wed': window.COURSES[4], '14:00-Fri': window.COURSES[4],
  };
  const progColor = c => (window.PROGRAMS.find(p => p.code === c.prog) || {}).color || 'var(--accent)';
  return (
    <Card padding={18} style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '64px repeat(5, minmax(120px, 1fr))', gap: 8, minWidth: 720 }}>
        <div />
        {days.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: 'var(--fg)', padding: '4px 0' }}>{d}</div>)}
        {slots.map(slot => (
          <React.Fragment key={slot}>
            <div style={{ fontSize: 11.5, color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6 }}>{slot}</div>
            {days.map(d => {
              const c = place[slot + '-' + d];
              return (
                <div key={d} style={{ minHeight: 58, borderRadius: 'var(--radius-md)', border: '1px solid var(--divider)', background: c ? `color-mix(in srgb, ${progColor(c)} 10%, var(--surface))` : 'var(--bg-subtle)', padding: c ? 8 : 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {c && <><span style={{ fontSize: 11.5, fontWeight: 700, color: progColor(c) }}>{c.code}</span><span style={{ fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.3 }}>{c.name}</span><span style={{ fontSize: 10.5, color: 'var(--fg-faint)' }}>{c.room}</span></>}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </Card>
  );
}

// ---------- HR / STAFF ----------
function HR({ go }) {
  const [q, setQ] = useStateAcad('');
  const [dept, setDept] = useStateAcad('All');
  const depts = ['All', ...Array.from(new Set(window.STAFF.map(s => s.dept)))];
  const rows = window.STAFF.filter(s => (dept === 'All' || s.dept === dept) && (s.name.toLowerCase().includes(q.toLowerCase())));
  const active = window.STAFF.filter(s => s.status === 'Active').length;
  return (
    <div className="fade-in">
      <PageHeader eyebrow="Human Resources" title="Faculty & Staff" subtitle="Employee records, departments, contracts and leave."
        actions={<><Button variant="outline" icon="calendar-clock">Leave requests</Button><Button variant="primary" icon="user-plus">Add employee</Button></>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 16, marginBottom: 22 }}>
        <Stat label="Total employees" value="142" icon="users" delta="+6 this term" deltaTone="up" />
        <Stat label="Active" value={active + 126} icon="user-check" delta="—" deltaTone="flat" />
        <Stat label="On leave" value="4" icon="plane" delta="2 returning" deltaTone="flat" />
        <Stat label="Open positions" value="7" icon="briefcase" delta="3 in review" deltaTone="flat" />
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <SearchInput placeholder="Search staff…" value={q} onChange={setQ} width={260} />
        <Select options={depts.map(d => ({ value: d, label: d === 'All' ? 'All departments' : d }))} value={dept} onChange={setDept} />
      </div>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="dt">
            <thead><tr><th>Employee</th><th>Department</th><th>Role</th><th>Type</th><th>Salary</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map(s => (
                <tr key={s.id}>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Avatar name={s.name} size={30} /><div><div style={{ color: 'var(--fg)', fontWeight: 600 }}>{s.name}</div><div style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>{s.email}</div></div></div></td>
                  <td>{s.dept}</td><td>{s.role}</td>
                  <td><Badge tone={s.type === 'Full-time' ? 'teal' : 'neutral'} dot={false} size="sm">{s.type}</Badge></td>
                  <td style={{ fontWeight: 600, color: 'var(--fg)' }}><FCFA value={s.salary} /></td>
                  <td><Badge tone={s.status === 'Active' ? 'success' : 'warning'} size="sm">{s.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

Object.assign(window, { Academics, HR });
