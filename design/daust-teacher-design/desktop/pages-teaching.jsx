// ── Desktop pages: Assignments · Insights · Advising ──────────
function statusOf(a) {
  if (a.graded >= a.total) return ['Graded', 'green'];
  if (a.submitted > a.graded) return ['Needs grading', 'orange'];
  return ['Collecting', 'gray'];
}
function ProgressBar({ value, total, color = NAVY }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <div style={{ flex: 1, height: 7, borderRadius: 999, background: '#eef1f5', overflow: 'hidden', minWidth: 80 }}>
        <div style={{ width: (value / total * 100) + '%', height: '100%', background: color, borderRadius: 999 }} />
      </div>
      <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: '#6c7884', whiteSpace: 'nowrap', fontWeight: 600 }}>{value}/{total}</span>
    </div>
  );
}

function AssignmentsPage({ go }) {
  const [filter, setFilter] = React.useState('all');
  const [open, setOpen] = React.useState(null); // assignment object
  if (open) return <SubmissionInbox asg={open} onBack={() => setOpen(null)} />;
  const list = ALL_ASSIGNMENTS.filter(a => filter === 'all' || a.course === filter);
  return (
    <div style={{ padding: 28, maxWidth: 1320, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <button onClick={() => setFilter('all')} style={chip(filter === 'all', NAVY)}>All courses</button>
        {COURSES.map(c => <button key={c.id} onClick={() => setFilter(c.id)} style={chip(filter === c.id, c.color)}>{c.code}</button>)}
      </div>
      <Panel pad={'6px 20px 14px'}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><Th>Assignment</Th><Th>Course</Th><Th>Due</Th><Th style={{ width: 200 }}>Submitted</Th><Th>Status</Th><Th></Th></tr></thead>
          <tbody>
            {list.map(a => {
              const c = COURSES.find(x => x.id === a.course);
              const [lbl, tone] = statusOf(a);
              return (
                <tr key={a.id}>
                  <Td><div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, color: '#141a21' }}>{a.title}</div><div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11.5, color: '#9da6ae', marginTop: 1 }}>{a.type}</div></Td>
                  <Td><span style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 13, color: c.color }}>{c.code}</span></Td>
                  <Td style={{ color: '#6c7884' }}>{a.due}</Td>
                  <Td><ProgressBar value={a.submitted} total={a.total} color={c.color} /></Td>
                  <Td><Badge tone={tone}>{lbl}</Badge></Td>
                  <Td style={{ textAlign: 'right' }}><button onClick={() => setOpen(a)} style={{ border: 'none', background: NAVY, color: '#fff', borderRadius: 8, padding: '7px 14px', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>{lbl === 'Graded' ? 'Review' : 'Open'}</button></Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
const chip = (on, col) => ({ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 999, cursor: 'pointer', border: '1px solid ' + (on ? col : '#d7dee6'), background: on ? col : '#fff', color: on ? '#fff' : '#4d5965', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13 });

function SubmissionInbox({ asg, onBack }) {
  const c = COURSES.find(x => x.id === asg.course);
  const [subs, setSubs] = React.useState(() => submissionsFor(asg));
  const [toast, setToast] = React.useState(false);
  const tones = { 'on-time': ['#e5f3ec', '#1f6e46', 'Submitted'], late: ['#fdeede', '#c4660f', 'Late'], missing: ['#fbeae8', '#a83024', 'Missing'] };
  const submittedCount = subs.filter(s => s.status !== 'missing').length;
  const gradedCount = subs.filter(s => s.grade != null).length;
  return (
    <div style={{ padding: 28, maxWidth: 1100, margin: '0 auto' }}>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', cursor: 'pointer', color: NAVY, fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13, marginBottom: 14, padding: 0 }}><Icon name="chevL" size={18} color={NAVY} /> All assignments</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><span style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 13, color: c.color }}>{c.code}</span><span style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 22, color: '#141a21' }}>{asg.title}</span></div>
          <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 13, color: '#9da6ae', marginTop: 3 }}>{asg.type} · due {asg.due} · {submittedCount}/{asg.total} submitted · {gradedCount} graded</div>
        </div>
        <button style={ghostBtn()}>Download all</button>
      </div>
      <Panel pad={'2px 20px 14px'}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><Th>Student</Th><Th>Submitted</Th><Th>File</Th><Th style={{ textAlign: 'center' }}>Grade</Th></tr></thead>
          <tbody>
            {subs.map((s, i) => {
              const [bg, fg, lbl] = tones[s.status];
              return (
                <tr key={s.id}>
                  <Td><StudentCell s={s} color={c.color} /></Td>
                  <Td><span style={{ background: bg, color: fg, padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, fontFamily: 'Montserrat, sans-serif' }}>{lbl}</span> <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11.5, color: '#9da6ae', marginLeft: 6 }}>{s.when}</span></Td>
                  <Td>{s.status !== 'missing' ? <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #e9edf2', background: '#fff', borderRadius: 8, padding: '6px 11px', fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: '#4d5965', cursor: 'pointer' }}><Icon name="file" size={14} color={STEEL} /> {s.id.toLowerCase()}.pdf</button> : <span style={{ color: '#bcc6d1', fontSize: 12.5 }}>—</span>}</Td>
                  <Td style={{ textAlign: 'center' }}>
                    <input value={s.grade == null ? '' : s.grade} placeholder={s.status === 'missing' ? '0' : '—'} disabled={s.status === 'missing'} inputMode="numeric"
                      onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 3); setSubs(p => p.map((x, j) => j === i ? { ...x, grade: v === '' ? null : Math.min(100, +v) } : x)); }}
                      style={{ width: 56, textAlign: 'center', padding: '8px 0', borderRadius: 8, border: '1px solid ' + (s.grade == null && s.status !== 'missing' ? '#f0c9a3' : '#e9edf2'), background: s.status === 'missing' ? '#f5f7f9' : (s.grade == null ? '#fffaf4' : '#fff'), fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 14, color: '#141a21', outline: 'none' }} />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button onClick={() => setToast(true)} style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 11, padding: '12px 24px', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 14, cursor: 'pointer', boxShadow: '0 6px 16px rgba(237,132,37,.26)' }}>Save & release grades</button>
      </div>
      {toast && <Toast text="Grades saved and released to students." onDone={() => setToast(false)} />}
    </div>
  );
}

function InsightsPage() {
  const [cid, setCid] = React.useState('ce201');
  const c = COURSES.find(x => x.id === cid);
  const dist = GRADE_DIST[cid], trend = ATT_TREND[cid];
  const totalG = dist.reduce((a, b) => a + b, 0);
  const passRate = Math.round((dist[0] + dist[1] + dist[2]) / totalG * 100);
  const maxDist = Math.max(...dist);
  const tMin = Math.min(...trend) - 4, tMax = 100;
  const pts = trend.map((v, i) => [i / (trend.length - 1) * 100, 100 - (v - tMin) / (tMax - tMin) * 100]);
  const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
  return (
    <div style={{ padding: 28, maxWidth: 1320, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}><CoursePicker value={cid} onChange={setCid} /></div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        <StatCard value={c.attRate + '%'} label="Class attendance" icon="clipboard" color={c.color} />
        <StatCard value={passRate + '%'} label="Pass rate (A–C)" icon="award" color="#2e7d52" />
        <StatCard value={c.ungraded} label="Items to grade" icon="edit" color={ORANGE} />
        <StatCard value={AT_RISK.filter(r => r.course === c.code).length} label="At-risk students" icon="bell" color="#c0392b" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <Panel title="Grade distribution">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 180, padding: '0 8px' }}>
            {dist.map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 14, color: '#141a21' }}>{v}</span>
                <div style={{ width: '100%', maxWidth: 46, height: (v / maxDist) * 130 + 4, background: DIST_COLORS[i], borderRadius: 8, transition: 'height .3s' }} />
                <span style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 14, color: DIST_COLORS[i] }}>{DIST_LABELS[i]}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Attendance trend · last 6 sessions">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: 160 }}>
            {[25, 50, 75].map(y => <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#eef1f5" strokeWidth="0.5" />)}
            <path d={path} fill="none" stroke={c.color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
            {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="1.6" fill={c.color} vectorEffect="non-scaling-stroke" />)}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            {trend.map((v, i) => <span key={i} style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11, color: '#9da6ae' }}>{v}%</span>)}
          </div>
        </Panel>
      </div>
      <Panel title="Students needing attention" pad={'4px 20px 12px'}>
        {AT_RISK.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: i < AT_RISK.length - 1 ? '1px solid #eef1f5' : 'none' }}>
            <div style={{ position: 'relative' }}>
              <Avatar initials={r.initials} size={40} color="#6c7884" />
              <span style={{ position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: '50%', background: r.sev === 'high' ? '#c0392b' : ORANGE, border: '2px solid #fff' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 14, color: '#141a21' }}>{r.n} <span style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 12, color: STEEL, marginLeft: 4 }}>{r.course}</span></div>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12.5, color: '#6c7884', marginTop: 2 }}>{r.why}</div>
            </div>
            <Badge tone={r.sev === 'high' ? 'red' : 'orange'}>{r.sev === 'high' ? 'High risk' : 'Monitor'}</Badge>
            <button style={ghostBtn()}>Message</button>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function AdvisingPage() {
  const [slots, setSlots] = React.useState(OFFICE_SLOTS);
  return (
    <div style={{ padding: 28, maxWidth: 1320, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, alignItems: 'start' }}>
      <Panel title={'My advisees · ' + ADVISEES.length} pad={'4px 20px 12px'}>
        {ADVISEES.map((a, i) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: i < ADVISEES.length - 1 ? '1px solid #eef1f5' : 'none' }}>
            <Avatar initials={a.initials} size={42} color={a.risk ? '#6c7884' : NAVY} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 14, color: '#141a21' }}>{a.n}</span>
                {a.risk && <Badge tone="red">At risk</Badge>}
                {a.standing === 'Dean\u2019s list' && <Badge tone="green">{'Dean\u2019s list'}</Badge>}
              </div>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: '#9da6ae', marginTop: 2 }}>{a.id} · {a.year} · {a.major}</div>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: '#6c7884', marginTop: 3 }}>{a.note}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 18, color: a.gpa < 2.5 ? '#c0392b' : '#141a21' }}>{a.gpa.toFixed(1)}</div>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 10.5, color: '#9da6ae', letterSpacing: '.04em' }}>GPA</div>
            </div>
          </div>
        ))}
      </Panel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Panel title="Office hours · Today">
          <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12.5, color: '#6c7884', marginBottom: 14 }}>{TEACHER.officeHours} · {TEACHER.office}</div>
          {slots.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < slots.length - 1 ? '1px solid #eef1f5' : 'none' }}>
              <span style={{ fontFamily: 'Saira, sans-serif', fontWeight: 600, fontSize: 14, color: '#141a21', width: 46 }}>{s.time}</span>
              {s.student ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar initials={s.initials} size={30} color={NAVY} />
                  <div><div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13, color: '#141a21' }}>{s.student}</div><div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11.5, color: '#9da6ae' }}>{s.topic}</div></div>
                </div>
              ) : (
                <span style={{ flex: 1, fontFamily: 'Montserrat, sans-serif', fontSize: 13, color: '#bcc6d1' }}>Open slot</span>
              )}
              {!s.student && <button onClick={() => setSlots(p => p.map((x, j) => j === i ? { ...x, blocked: !x.blocked } : x))} style={{ border: '1px solid #e9edf2', background: s.blocked ? '#fbeae8' : '#fff', color: s.blocked ? '#a83024' : '#6c7884', borderRadius: 8, padding: '6px 11px', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 11.5, cursor: 'pointer' }}>{s.blocked ? 'Blocked' : 'Block'}</button>}
            </div>
          ))}
        </Panel>
        <Panel title="Booking link">
          <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 13, color: '#6c7884', lineHeight: 1.5 }}>Students can book open slots via your advising link.</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, background: '#f5f7f9', border: '1px solid #e9edf2', borderRadius: 9, padding: '10px 12px' }}>
            <Icon name="mapPin" size={15} color={STEEL} />
            <span style={{ flex: 1, fontFamily: 'Montserrat, sans-serif', fontSize: 12.5, color: '#4d5965', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>daust.edu.sn/advising/a.diallo</span>
            <button style={{ border: 'none', background: NAVY, color: '#fff', borderRadius: 7, padding: '6px 12px', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 11.5, cursor: 'pointer' }}>Copy</button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

Object.assign(window, { AssignmentsPage, InsightsPage, AdvisingPage, ProgressBar });
