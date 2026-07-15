// ============================================================
// DAUST Admin — Academics & HR modules
// ============================================================
const { useState: useStateAcad } = React;

function Academics({ go }) {
  const [tab, setTab] = useStateAcad('programs');
  const [prog, setProg] = useStateAcad(null);
  const [newCourse, setNewCourse] = useStateAcad(false);
  const [newProgram, setNewProgram] = useStateAcad(false);
  const [, force] = useStateAcad(0);

  if (prog) return <ProgramDetail p={prog} onBack={() => setProg(null)} go={go} />;

  const actions = tab === 'programs'
    ? <><Button variant="outline" icon="book-plus" onClick={() => setNewCourse(true)}>New course</Button><Button variant="primary" icon="plus" onClick={() => setNewProgram(true)}>New program</Button></>
    : <><Button variant="outline" icon="calendar-days">Spring 2026</Button><Button variant="primary" icon="book-plus" onClick={() => setNewCourse(true)}>New course</Button></>;

  return (
    <div className="fade-in">
      <PageHeader eyebrow="Academics" title="Programs & Courses" subtitle="Degree programs, course catalog, schedules and capacity across all schools."
        actions={actions} />
      <Tabs tabs={[{ value: 'programs', label: 'Programs' }, { value: 'courses', label: 'Course catalog' }, { value: 'schedule', label: 'Schedule grid' }]} active={tab} onChange={setTab} />
      {tab === 'programs' && <ProgramsGrid go={go} onOpen={setProg} />}
      {tab === 'courses' && <CoursesTab />}
      {tab === 'schedule' && <ScheduleGrid />}
      <CourseEditModal open={newCourse} course={null} onClose={() => setNewCourse(false)} onSave={(c) => { window.COURSES.push(c); setNewCourse(false); setTab('courses'); force(n => n + 1); }} />
      <ProgramEditModal open={newProgram} program={null} onClose={() => setNewProgram(false)} onSave={(p) => { window.PROGRAMS.push(p); if (window.TOTAL_STUDENTS != null) window.TOTAL_STUDENTS += p.students; setNewProgram(false); force(n => n + 1); }} />
    </div>
  );
}

function ProgramsGrid({ go, onOpen }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
      {window.PROGRAMS.map(p => (
        <Card key={p.code} hover padding={20} onClick={() => onOpen(p)}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, color: 'var(--daust-orange)', fontSize: 12.5, fontWeight: 600 }}>View program <Icon name="arrow-right" size={14} /></div>
        </Card>
      ))}
    </div>
  );
}

function CoursesTab() {
  const [q, setQ] = useStateAcad('');
  const [edit, setEdit] = useStateAcad(null);
  const [, force] = useStateAcad(0);
  const rows = window.COURSES.filter(c => c.name.toLowerCase().includes(q.toLowerCase()) || c.code.toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SearchInput placeholder="Search courses…" value={q} onChange={setQ} width={280} />
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="dt">
            <thead><tr><th>Code</th><th>Course</th><th>Program</th><th>Credits</th><th>Instructor</th><th>Schedule</th><th>Room</th><th>Capacity</th><th></th></tr></thead>
            <tbody>
              {rows.map(c => {
                const full = c.enrolled / c.cap > 0.95;
                return (
                  <tr key={c.code} style={{ cursor: 'pointer' }} onClick={() => setEdit(c)}>
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
                    <td style={{ textAlign: 'right' }}><Icon name="pencil" size={14} style={{ color: 'var(--fg-faint)' }} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <CourseEditModal open={!!edit} course={edit} onClose={() => setEdit(null)} onSave={(c) => { Object.assign(edit, c); setEdit(null); force(n => n + 1); }} />
    </div>
  );
}

function CourseEditModal({ open, course, onClose, onSave }) {
  const progs = window.PROGRAMS;
  const blank = { code: '', name: '', prog: progs[0].code, credits: 3, instructor: '', sched: 'MWF 10:00', room: '', enrolled: 0, cap: 40 };
  const [f, setF] = useStateAcad(blank);
  React.useEffect(() => { setF(course ? { ...course } : blank); }, [course, open]);
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));
  const save = () => { if (!f.code.trim() || !f.name.trim()) return; onSave({ ...f, credits: parseInt(f.credits, 10) || 3, enrolled: parseInt(f.enrolled, 10) || 0, cap: parseInt(f.cap, 10) || 40 }); };
  return (
    <Modal open={open} onClose={onClose} title={course ? 'Edit course · ' + course.code : 'New course'} width={520}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon="check" onClick={save}>{course ? 'Save changes' : 'Create course'}</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
          <Field label="Course code"><Input value={f.code} onChange={e => set('code', e.target.value.toUpperCase())} placeholder="CS301" /></Field>
          <Field label="Course title"><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Algorithms & Data Structures" /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <Field label="Program"><Select options={progs.map(p => ({ value: p.code, label: p.code + ' · ' + p.name }))} value={f.prog} onChange={v => set('prog', v)} /></Field>
          <Field label="Credits"><Select options={[1, 2, 3, 4, 5, 6].map(n => ({ value: n, label: n + ' cr' }))} value={f.credits} onChange={v => set('credits', v)} /></Field>
        </div>
        <Field label="Instructor"><Input value={f.instructor} onChange={e => set('instructor', e.target.value)} placeholder="Dr. A. Diop" /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Schedule"><Input value={f.sched} onChange={e => set('sched', e.target.value)} placeholder="MWF 10:00" /></Field>
          <Field label="Room"><Input value={f.room} onChange={e => set('room', e.target.value)} placeholder="B-204" /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Enrolled"><Input type="number" value={f.enrolled} onChange={e => set('enrolled', e.target.value)} /></Field>
          <Field label="Capacity"><Input type="number" value={f.cap} onChange={e => set('cap', e.target.value)} /></Field>
        </div>
      </div>
    </Modal>
  );
}

function ProgramEditModal({ open, program, onClose, onSave }) {
  const COLORS = ['#0D9488', '#0EA5E9', '#8B5CF6', '#F97316', '#EC4899', '#6366F1', '#14B8A6', '#64748B'];
  const blank = { code: '', name: '', degree: 'B.Sc.', school: 'Engineering', students: 0, tuition: 3850000, color: COLORS[0] };
  const [f, setF] = useStateAcad(blank);
  React.useEffect(() => { setF(program ? { ...program } : blank); }, [program, open]);
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));
  const save = () => { if (!f.code.trim() || !f.name.trim()) return; onSave({ ...f, code: f.code.toUpperCase(), students: parseInt(f.students, 10) || 0, tuition: parseInt(f.tuition, 10) || 0 }); };
  return (
    <Modal open={open} onClose={onClose} title={program ? 'Edit program' : 'New program'} width={520}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon="check" onClick={save}>{program ? 'Save changes' : 'Create program'}</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
          <Field label="Code"><Input value={f.code} onChange={e => set('code', e.target.value.toUpperCase())} placeholder="CS" /></Field>
          <Field label="Program name"><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Computer Science" /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Degree"><Select options={['B.Sc.', 'M.Sc.', 'MBA', 'Cert.', 'Ph.D.']} value={f.degree} onChange={v => set('degree', v)} /></Field>
          <Field label="School"><Select options={['Engineering', 'Graduate', 'Business', 'Foundation', 'Sciences']} value={f.school} onChange={v => set('school', v)} /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Students"><Input type="number" value={f.students} onChange={e => set('students', e.target.value)} /></Field>
          <Field label="Annual tuition (FCFA)"><Input type="number" value={f.tuition} onChange={e => set('tuition', e.target.value)} /></Field>
        </div>
        <Field label="Accent color">
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            {COLORS.map(c => (
              <button key={c} onClick={() => set('color', c)} style={{ width: 30, height: 30, borderRadius: 8, background: c, border: f.color === c ? '3px solid var(--fg)' : '3px solid transparent', cursor: 'pointer', outline: f.color === c ? '1px solid var(--border)' : 'none' }} />
            ))}
          </div>
        </Field>
      </div>
    </Modal>
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

// ---------- PROGRAM DETAIL (full page) ----------
function AcadCard({ title, icon, children, action }) {
  return (
    <Card padding={0} style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', borderBottom: '1px solid var(--border)' }}>
        <h4 style={{ fontSize: 14.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 9 }}><Icon name={icon} size={16} style={{ color: 'var(--accent)' }} />{title}</h4>
        {action}
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </Card>
  );
}
function AcadKV({ k, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, padding: '9px 0', borderBottom: '1px solid var(--divider)', fontSize: 13 }}>
      <span style={{ color: 'var(--fg-subtle)', flexShrink: 0 }}>{k}</span>
      <span style={{ color: 'var(--fg)', fontWeight: 600, textAlign: 'right' }}>{v}</span>
    </div>
  );
}
function ProgramDetail({ p, onBack, go }) {
  const [tab, setTab] = useStateAcad('overview');
  const [editing, setEditing] = useStateAcad(false);
  const [, force] = useStateAcad(0);
  const editPencil = <button onClick={() => setEditing(true)} title="Edit program" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-faint)', display: 'inline-flex', padding: 4, borderRadius: 6 }} onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--fg-faint)'}><Icon name="pencil" size={14} /></button>;
  const courses = window.COURSES.filter(c => c.prog === p.code);
  const faculty = window.STAFF.filter(s => s.dept.toLowerCase().includes(p.name.split(' ')[0].toLowerCase()) || s.dept === p.school + ' School').slice(0, 5);
  const facList = faculty.length ? faculty : window.STAFF.slice(0, 4);
  const students = window.STUDENTS.filter(s => s.program === p.code);
  const annualRevenue = p.students * p.tuition;
  const yearDist = [1, 2, 3, 4].map(y => students.filter(s => s.year === y).length);
  const maxYear = Math.max(1, ...yearDist);
  // stable-ish curriculum sampling
  const curriculum = [
    { year: 'Year 1 — Foundation', items: ['Calculus I & II', 'Intro to Programming', 'Physics for Engineers', 'Intensive English', 'Engineering Design I'] },
    { year: 'Year 2 — Core', items: ['Data Structures', 'Linear Algebra', 'Circuit Fundamentals', 'Probability & Statistics', 'Technical Communication'] },
    { year: 'Year 3 — Specialisation', items: [p.name + ' Core I', p.name + ' Core II', 'Systems & Architecture', 'Research Methods', 'Industry Internship'] },
    { year: 'Year 4 — Capstone', items: ['Advanced ' + p.name, 'Technology Ventures', 'Ethics & Society', 'Capstone Project I', 'Capstone Project II'] },
  ];

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', fontWeight: 600, fontSize: 13.5, fontFamily: 'var(--font-sans)', padding: '6px 4px' }}>
          <Icon name="arrow-left" size={16} /> All programs
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="outline" icon="calendar-days" onClick={() => setTab('curriculum')}>Curriculum</Button>
          <Button variant="outline" icon="users" onClick={() => setTab('students')}>Students</Button>
          <Button variant="primary" icon="pencil" onClick={() => setEditing(true)}>Edit program</Button>
        </div>
      </div>

      {/* Hero */}
      <div style={{ background: 'var(--grad-dark-surface)', borderRadius: 'var(--radius-xl)', padding: '26px 28px', color: '#fff', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <span style={{ width: 72, height: 72, borderRadius: 'var(--radius-lg)', background: p.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 24, letterSpacing: '-0.02em', flexShrink: 0 }}>{p.code}</span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>{p.name}</div>
          <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.65)', marginTop: 3 }}>{p.school} School · Somone campus</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <AcadPill icon="graduation-cap">{p.degree}</AcadPill>
            <AcadPill icon="users">{p.students} students</AcadPill>
            <AcadPill icon="book-open">{courses.length} active courses</AcadPill>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginTop: 16 }}>
        <AcadStat label="Enrolled" value={p.students} unit="students" icon="users" />
        <AcadStat label="Annual tuition" value={fmtFCFA(p.tuition, { short: true })} unit="FCFA" icon="wallet" tone="accent" />
        <AcadStat label="Program revenue" value={fmtFCFA(annualRevenue, { short: true })} unit="FCFA / yr" icon="trending-up" />
        <AcadStat label="Faculty" value={facList.length} unit="members" icon="user-check" />
      </div>

      <div style={{ marginTop: 22 }}>
        <Tabs tabs={[{ value: 'overview', label: 'Overview' }, { value: 'courses', label: 'Courses' }, { value: 'faculty', label: 'Faculty' }, { value: 'students', label: 'Students' }, { value: 'curriculum', label: 'Curriculum' }]} active={tab} onChange={setTab} />
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
          <AcadCard title="About the program" icon="info" action={editPencil}>
            <p style={{ fontSize: 13.5, color: 'var(--fg-muted)', lineHeight: 1.6, margin: 0 }}>
              The {p.name} program ({p.degree}) sits within the {p.school} School. It follows DAUST's American-model, hands-on engineering curriculum — combining rigorous fundamentals, research, and a Technology Ventures track that turns student projects into real ventures.
            </p>
          </AcadCard>
          <AcadCard title="Key facts" icon="list" action={editPencil}>
            <AcadKV k="Degree awarded" v={p.degree} />
            <AcadKV k="School" v={p.school} />
            <AcadKV k="Duration" v={p.degree === 'MBA' || p.degree === 'M.Sc.' ? '2 years' : p.degree === 'Cert.' ? '1 year' : '4 years'} />
            <AcadKV k="Annual tuition" v={<FCFA value={p.tuition} />} />
            <AcadKV k="Language" v="English" />
          </AcadCard>
          <AcadCard title="Enrollment by year" icon="bar-chart-3" action={editPencil}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
              {yearDist.map((n, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <span style={{ width: 52, color: 'var(--fg-subtle)' }}>Year {i + 1}</span>
                  <div style={{ flex: 1, height: 8, background: 'var(--bg-subtle)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: (n / maxYear * 100) + '%', height: '100%', background: p.color, borderRadius: 999 }} />
                  </div>
                  <b style={{ minWidth: 20, textAlign: 'right', color: 'var(--fg)' }}>{n}</b>
                </div>
              ))}
            </div>
          </AcadCard>
        </div>
      )}

      {tab === 'courses' && (
        <AcadCard title={`Active courses — ${courses.length}`} icon="book-open" action={editPencil}>
          {courses.length ? (
            <table className="dt" style={{ margin: '-4px 0' }}>
              <thead><tr><th>Code</th><th>Course</th><th>Cr.</th><th>Instructor</th><th>Schedule</th><th>Room</th><th>Capacity</th></tr></thead>
              <tbody>
                {courses.map(c => {
                  const full = c.enrolled / c.cap > 0.95;
                  return (
                    <tr key={c.code}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--fg)', fontWeight: 600 }}>{c.code}</td>
                      <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{c.name}</td>
                      <td>{c.credits}</td>
                      <td style={{ fontSize: 12.5 }}>{c.instructor}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{c.sched}</td>
                      <td>{c.room}</td>
                      <td style={{ minWidth: 120 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Progress value={c.enrolled} max={c.cap} tone={full ? 'warning' : 'teal'} height={6} /><span style={{ fontSize: 12, color: 'var(--fg-subtle)', whiteSpace: 'nowrap' }}>{c.enrolled}/{c.cap}</span></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : <EmptyState icon="book-open" title="No courses listed" sub="This program has no active courses in the catalog yet." />}
        </AcadCard>
      )}

      {tab === 'faculty' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {facList.map(f => (
            <Card key={f.id} padding={18} style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <Avatar name={f.name} size={44} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--fg)' }}>{f.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{f.role}</div>
                <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 2 }}>{f.email}</div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'students' && (
        <AcadCard title={`Students in ${p.name} — ${students.length}`} icon="users">
          {students.length ? (
            <table className="dt" style={{ margin: '-4px 0' }}>
              <thead><tr><th>Student</th><th>Year</th><th>GPA</th><th>Balance</th><th>Status</th></tr></thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.id}>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Avatar name={s.name} size={28} /><div><div style={{ color: 'var(--fg)', fontWeight: 600 }}>{s.name}</div><div style={{ fontSize: 11.5, color: 'var(--fg-faint)', fontFamily: 'var(--font-mono)' }}>{s.id}</div></div></div></td>
                    <td>Year {s.year}</td>
                    <td><span style={{ fontWeight: 700, color: s.gpa >= 3.5 ? 'var(--success-500)' : s.gpa < 2.5 ? 'var(--warning-500)' : 'var(--fg)' }}>{s.gpa.toFixed(2)}</span></td>
                    <td style={{ color: s.balance > 0 ? 'var(--error-500)' : 'var(--fg-subtle)', fontWeight: s.balance > 0 ? 600 : 400 }}>{s.balance > 0 ? <FCFA value={s.balance} /> : 'Cleared'}</td>
                    <td><Badge tone={{ Enrolled: 'success', Probation: 'warning', Leave: 'neutral', 'On Hold': 'error' }[s.status]} size="sm">{s.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <EmptyState icon="users" title="No students enrolled" sub="No student records are linked to this program yet." />}
        </AcadCard>
      )}

      {tab === 'curriculum' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, alignItems: 'start' }}>
          {curriculum.map((yr, i) => (
            <AcadCard key={i} title={yr.year} icon="book-open" action={editPencil}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {yr.items.map((it, j) => (
                  <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: j < yr.items.length - 1 ? '1px solid var(--divider)' : 'none', fontSize: 13.5 }}>
                    <span style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--bg-tint)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{j + 1}</span>
                    <span style={{ color: 'var(--fg-muted)' }}>{it}</span>
                  </div>
                ))}
              </div>
            </AcadCard>
          ))}
        </div>
      )}

      <ProgramEditModal open={editing} program={p} onClose={() => setEditing(false)} onSave={(np) => { Object.assign(p, np); setEditing(false); force(n => n + 1); }} />
    </div>
  );
}

function AcadPill({ icon, children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: '5px 12px', fontSize: 11.5, fontWeight: 600, color: '#fff' }}>
      <Icon name={icon} size={13} style={{ color: 'var(--daust-orange)' }} />{children}
    </span>
  );
}
function AcadStat({ label, value, unit, icon, tone }) {
  const c = tone === 'accent' ? 'var(--accent)' : 'var(--fg)';
  return (
    <Card padding={16}>
      <div style={{ fontSize: 12, color: 'var(--fg-subtle)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}><Icon name={icon} size={14} style={{ color: 'var(--accent)' }} />{label}</div>
      <div style={{ fontSize: 23, fontWeight: 800, marginTop: 8, color: c, letterSpacing: '-0.01em' }}>{value}{unit && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-faint)', marginLeft: 4 }}>{unit}</span>}</div>
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
