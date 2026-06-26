// ── Classes list + Course detail + Attendance + Gradebook ─────
function ClassesScreen({ nav }) {
  return (
    <div style={{ padding: '6px 16px 0' }}>
      {COURSES.map(c => (
        <Card key={c.id} onClick={() => nav('course', { id: c.id })} style={{ marginBottom: 12, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex' }}>
            <div style={{ width: 6, background: c.color, flexShrink: 0 }} />
            <div style={{ flex: 1, padding: 15 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 14, color: c.color }}>{c.code}</span>
                <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11, color: '#9da6ae' }}>· {c.term}</span>
                {c.ungraded > 0 && <span style={{ marginLeft: 'auto' }}><Badge tone="orange">{c.ungraded} to grade</Badge></span>}
              </div>
              <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 600, fontSize: 17, color: '#141a21', marginTop: 6 }}>{c.name}</div>
              <div style={{ display: 'flex', gap: 16, marginTop: 11, fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: '#6c7884' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="users" size={14} color="#9da6ae" />{c.students}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="calendar" size={14} color="#9da6ae" />{c.meets}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="mapPin" size={14} color="#9da6ae" />{c.room}</span>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function QuickAction({ icon, label, color, onClick }) {
  return (
    <Card onClick={onClick} pad={13} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={19} color={color} />
      </div>
      <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 12.5, color: '#141a21', lineHeight: 1.25 }}>{label}</div>
    </Card>
  );
}

function CourseScreen({ params, nav }) {
  const c = COURSES.find(x => x.id === params.id) || COURSES[0];
  return (
    <div>
      <div style={{ background: `linear-gradient(135deg, ${c.color} 0%, ${c.color}cc 100%)`, padding: '4px 16px 22px', color: '#fff' }}>
        <Eyebrow color="rgba(255,255,255,.75)">{c.term} · {c.meets} · {c.time}</Eyebrow>
        <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 26, marginTop: 8, letterSpacing: '.01em' }}>{c.code}</div>
        <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500, fontSize: 15, color: 'rgba(255,255,255,.9)', marginTop: 2 }}>{c.name}</div>
        <div style={{ display: 'flex', gap: 22, marginTop: 18 }}>
          {[['Students', c.students], ['Attendance', c.attRate + '%'], ['To grade', c.ungraded]].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 21 }}>{v}</div>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11, color: 'rgba(255,255,255,.7)', letterSpacing: '.04em', textTransform: 'uppercase', marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '18px 16px 0' }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <QuickAction icon="clipboard" label="Take attendance" color={ORANGE} onClick={() => nav('attendance', { id: c.id })} />
          <QuickAction icon="chart" label="Gradebook" color={NAVY} onClick={() => nav('gradebook', { id: c.id })} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
          <QuickAction icon="message" label="Message class" color="#1d4a82" onClick={() => nav('messages')} />
          <QuickAction icon="file" label="Materials" color="#2e7d52" onClick={() => nav('documents')} />
        </div>

        <SectionTitle action="View all" onAction={() => nav('attendance', { id: c.id })}>Roster · {c.students}</SectionTitle>
        <Card pad={4} style={{ padding: '6px 14px 8px' }}>
          {ROSTER.slice(0, 6).map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: i < 5 ? '1px solid #eef1f5' : 'none' }}>
              <Avatar initials={s.initials} size={34} color={c.color} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13.5, color: '#141a21' }}>{s.n}</div>
                <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11.5, color: '#9da6ae' }}>{s.id}</div>
              </div>
              <Badge tone={s.att >= 90 ? 'green' : s.att >= 80 ? 'navy' : 'orange'}>{s.att}%</Badge>
              <span style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 15, color: c.color, width: 30, textAlign: 'right' }}>{s.grade}</span>
            </div>
          ))}
        </Card>
        <div style={{ height: 16 }} />
      </div>
    </div>
  );
}

function AttendanceScreen({ params, nav, back }) {
  const c = COURSES.find(x => x.id === params.id) || COURSES[0];
  const [marks, setMarks] = React.useState(() => Object.fromEntries(ROSTER.map(s => [s.id, 'present'])));
  const [done, setDone] = React.useState(false);
  const counts = { present: 0, late: 0, absent: 0 };
  Object.values(marks).forEach(v => counts[v]++);
  const cycle = { present: 'late', late: 'absent', absent: 'present' };
  const toneFor = { present: ['#e5f3ec', '#1f6e46', 'P'], late: ['#fdeede', '#c4660f', 'L'], absent: ['#fbeae8', '#a83024', 'A'] };

  if (done) {
    return (
      <div style={{ padding: '60px 28px', textAlign: 'center' }}>
        <div style={{ width: 76, height: 76, borderRadius: '50%', background: '#e5f3ec', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <Icon name="check" size={38} color="#1f6e46" />
        </div>
        <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 22, color: '#141a21' }}>Attendance submitted</div>
        <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 14, color: '#6c7884', marginTop: 8, lineHeight: 1.5 }}>{c.code} · {counts.present} present, {counts.late} late, {counts.absent} absent.</div>
        <button onClick={back} style={{ marginTop: 26, background: NAVY, color: '#fff', border: 'none', borderRadius: 999, padding: '13px 28px', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Back to class</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '4px 16px 14px' }}>
        <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 13, color: '#6c7884', marginBottom: 12 }}>Thursday, May 29 · {c.time} · {c.room}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['present', counts.present], ['late', counts.late], ['absent', counts.absent]].map(([k, v]) => {
            const [bg, fg] = toneFor[k];
            return <div key={k} style={{ flex: 1, background: bg, borderRadius: 10, padding: '9px 0', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 19, color: fg }}>{v}</div>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 10.5, color: fg, textTransform: 'capitalize', fontWeight: 600 }}>{k}</div>
            </div>;
          })}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
        <Card pad={4} style={{ padding: '2px 14px' }}>
          {ROSTER.map((s, i) => {
            const m = marks[s.id]; const [bg, fg, lbl] = toneFor[m];
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: i < ROSTER.length - 1 ? '1px solid #eef1f5' : 'none' }}>
                <Avatar initials={s.initials} size={36} color={c.color} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13.5, color: '#141a21' }}>{s.n}</div>
                  <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11.5, color: '#9da6ae' }}>{s.id}</div>
                </div>
                <button onClick={() => setMarks(p => ({ ...p, [s.id]: cycle[p[s.id]] }))}
                  style={{ width: 38, height: 38, borderRadius: 10, border: 'none', background: bg, color: fg, fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 16, cursor: 'pointer', transition: 'all .12s' }}>{lbl}</button>
              </div>
            );
          })}
        </Card>
        <div style={{ height: 12 }} />
      </div>
      <div style={{ padding: '12px 16px 14px', borderTop: '1px solid #eef1f5', background: '#fff' }}>
        <button onClick={() => setDone(true)} style={{ width: '100%', background: ORANGE, color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Submit attendance</button>
      </div>
    </div>
  );
}

function GradebookScreen({ params, nav }) {
  const c = COURSES.find(x => x.id === params.id) || COURSES[0];
  const [active, setActive] = React.useState(3); // Lab 3 — needs grading
  const asg = ASSIGNMENTS[active];
  const [grades, setGrades] = React.useState(() => ROSTER.map((s, i) => i < asg.done ? 75 + ((i * 7) % 22) : null));

  React.useEffect(() => {
    const a = ASSIGNMENTS[active];
    setGrades(ROSTER.map((s, i) => i < a.done ? 70 + ((i * 9) % 28) : null));
  }, [active]);

  const graded = grades.filter(g => g != null).length;
  const avg = graded ? Math.round(grades.filter(g => g != null).reduce((a, b) => a + b, 0) / graded) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '2px 16px 10px' }}>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -16px', padding: '2px 16px', scrollbarWidth: 'none' }}>
          {ASSIGNMENTS.map((a, i) => (
            <button key={a.name} onClick={() => setActive(i)} style={{
              flexShrink: 0, padding: '9px 14px', borderRadius: 999, cursor: 'pointer',
              border: '1px solid ' + (active === i ? c.color : '#d7dee6'),
              background: active === i ? c.color : '#fff', color: active === i ? '#fff' : '#4d5965',
              fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap',
            }}>{a.name.split(' — ')[0]}{a.avg == null && <span style={{ marginLeft: 6, color: active === i ? '#fff' : ORANGE }}>●</span>}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
          <Ring value={(graded / ROSTER.length) * 100} label={graded + '/' + ROSTER.length} color={c.color} size={50} />
          <div>
            <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 600, fontSize: 16, color: '#141a21' }}>{asg.name}</div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12.5, color: '#6c7884', marginTop: 2 }}>Class average <b style={{ color: c.color }}>{avg}%</b> · {ROSTER.length - graded} ungraded</div>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 14px' }}>
        <Card pad={4} style={{ padding: '2px 14px' }}>
          {ROSTER.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: i < ROSTER.length - 1 ? '1px solid #eef1f5' : 'none' }}>
              <Avatar initials={s.initials} size={34} color={c.color} />
              <div style={{ flex: 1, minWidth: 0, fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13.5, color: '#141a21' }}>{s.n}</div>
              <input value={grades[i] == null ? '' : grades[i]} placeholder="—" inputMode="numeric"
                onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 3); setGrades(p => { const n = [...p]; n[i] = v === '' ? null : Math.min(100, +v); return n; }); }}
                style={{ width: 56, textAlign: 'center', padding: '8px 0', borderRadius: 9, border: '1px solid ' + (grades[i] == null ? '#f0c9a3' : '#d7dee6'), background: grades[i] == null ? '#fffaf4' : '#fff', fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 15, color: '#141a21', outline: 'none' }} />
              <span style={{ width: 16, fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: '#9da6ae' }}>%</span>
            </div>
          ))}
        </Card>
      </div>
      <div style={{ padding: '12px 16px 14px', borderTop: '1px solid #eef1f5', background: '#fff' }}>
        <button onClick={() => nav('classes')} style={{ width: '100%', background: NAVY, color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Save grades</button>
      </div>
    </div>
  );
}

Object.assign(window, { ClassesScreen, CourseScreen, AttendanceScreen, GradebookScreen });
