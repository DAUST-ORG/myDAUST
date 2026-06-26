// ── Desktop data tables: Roster · Gradebook · Attendance ──────
function CoursePicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {COURSES.map(c => {
        const on = value === c.id;
        return (
          <button key={c.id} onClick={() => onChange(c.id)} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999, cursor: 'pointer',
            border: '1px solid ' + (on ? c.color : '#d7dee6'), background: on ? c.color : '#fff', color: on ? '#fff' : '#4d5965',
            fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: on ? '#fff' : c.color }} />
            {c.code}
          </button>
        );
      })}
    </div>
  );
}

const Th = ({ children, style }) => <th style={{ textAlign: 'left', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9da6ae', padding: '0 14px 12px', ...style }}>{children}</th>;
const Td = ({ children, style }) => <td style={{ padding: '12px 14px', fontFamily: 'Montserrat, sans-serif', fontSize: 13.5, color: '#36414d', borderTop: '1px solid #eef1f5', ...style }}>{children}</td>;

function StudentCell({ s, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      <Avatar initials={s.initials} size={34} color={color} />
      <div>
        <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13.5, color: '#141a21' }}>{s.n}</div>
        <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11.5, color: '#9da6ae' }}>{s.id}</div>
      </div>
    </div>
  );
}

function DRosterTable({ color = NAVY }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead><tr><Th>Student</Th><Th>ID</Th><Th style={{ textAlign: 'center' }}>Attendance</Th><Th style={{ textAlign: 'center' }}>Current grade</Th><Th style={{ textAlign: 'right' }}></Th></tr></thead>
      <tbody>
        {ROSTER.map(s => (
          <tr key={s.id}>
            <Td><StudentCell s={s} color={color} /></Td>
            <Td style={{ color: '#9da6ae' }}>{s.id}</Td>
            <Td style={{ textAlign: 'center' }}><Badge tone={s.att >= 90 ? 'green' : s.att >= 80 ? 'navy' : 'orange'}>{s.att}%</Badge></Td>
            <Td style={{ textAlign: 'center' }}><span style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 16, color }}>{s.grade}</span></Td>
            <Td style={{ textAlign: 'right' }}><button style={ghostBtn()}>View</button></Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
const ghostBtn = () => ({ border: '1px solid #d7dee6', background: '#fff', borderRadius: 8, padding: '6px 12px', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 12, color: '#4d5965', cursor: 'pointer' });

function DGradebookTable({ courseId }) {
  const c = COURSES.find(x => x.id === courseId) || COURSES[0];
  const [grades, setGrades] = React.useState({});
  React.useEffect(() => {
    const g = {};
    ROSTER.forEach((s, i) => ASSIGNMENTS.forEach((a, j) => { g[s.id + '_' + j] = (j < 3 || i < a.done) ? 64 + ((i * 7 + j * 13) % 36) : null; }));
    setGrades(g);
  }, [courseId]);
  const finalFor = (s) => {
    const vals = ASSIGNMENTS.map((a, j) => grades[s.id + '_' + j]).filter(v => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  };
  const letter = (n) => n == null ? '—' : n >= 90 ? 'A' : n >= 85 ? 'A−' : n >= 80 ? 'B+' : n >= 75 ? 'B' : n >= 70 ? 'B−' : n >= 65 ? 'C+' : 'C';
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
        <thead><tr>
          <Th style={{ position: 'sticky', left: 0, background: '#fff' }}>Student</Th>
          {ASSIGNMENTS.map((a, j) => <Th key={j} style={{ textAlign: 'center' }}>{a.name.split(' — ')[0]}{a.avg == null && <span style={{ color: ORANGE }}> ●</span>}</Th>)}
          <Th style={{ textAlign: 'center' }}>Final</Th>
        </tr></thead>
        <tbody>
          {ROSTER.map(s => {
            const f = finalFor(s);
            return (
              <tr key={s.id}>
                <Td style={{ position: 'sticky', left: 0, background: '#fff' }}><StudentCell s={s} color={c.color} /></Td>
                {ASSIGNMENTS.map((a, j) => {
                  const v = grades[s.id + '_' + j];
                  return <Td key={j} style={{ textAlign: 'center' }}>
                    <input value={v == null ? '' : v} placeholder="—" inputMode="numeric"
                      onChange={e => { const nv = e.target.value.replace(/\D/g, '').slice(0, 3); setGrades(p => ({ ...p, [s.id + '_' + j]: nv === '' ? null : Math.min(100, +nv) })); }}
                      style={{ width: 52, textAlign: 'center', padding: '7px 0', borderRadius: 8, border: '1px solid ' + (v == null ? '#f0c9a3' : '#e9edf2'), background: v == null ? '#fffaf4' : '#fff', fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 14, color: '#141a21', outline: 'none' }} />
                  </Td>;
                })}
                <Td style={{ textAlign: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
                    <span style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 16, color: c.color }}>{letter(f)}</span>
                    <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11.5, color: '#9da6ae' }}>{f != null ? f + '%' : ''}</span>
                  </span>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DAttendanceTable({ courseId, onSubmit }) {
  const c = COURSES.find(x => x.id === courseId) || COURSES[0];
  const [marks, setMarks] = React.useState({});
  React.useEffect(() => { setMarks(Object.fromEntries(ROSTER.map(s => [s.id, 'present']))); }, [courseId]);
  const counts = { present: 0, late: 0, absent: 0 };
  Object.values(marks).forEach(v => counts[v] != null && counts[v]++);
  const opts = [['present', '#e5f3ec', '#1f6e46', 'Present'], ['late', '#fdeede', '#c4660f', 'Late'], ['absent', '#fbeae8', '#a83024', 'Absent']];
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {opts.map(([k, bg, fg, lbl]) => (
          <div key={k} style={{ flex: 1, background: bg, borderRadius: 12, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 26, color: fg }}>{counts[k]}</div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12.5, fontWeight: 600, color: fg }}>{lbl}</div>
          </div>
        ))}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><Th>Student</Th><Th style={{ textAlign: 'center' }}>Term rate</Th><Th style={{ textAlign: 'right', paddingRight: 4 }}>Mark for today</Th></tr></thead>
        <tbody>
          {ROSTER.map(s => (
            <tr key={s.id}>
              <Td><StudentCell s={s} color={c.color} /></Td>
              <Td style={{ textAlign: 'center', color: '#9da6ae' }}>{s.att}%</Td>
              <Td style={{ textAlign: 'right' }}>
                <div style={{ display: 'inline-flex', gap: 6 }}>
                  {opts.map(([k, bg, fg, lbl]) => {
                    const on = marks[s.id] === k;
                    return <button key={k} onClick={() => setMarks(p => ({ ...p, [s.id]: k }))} style={{
                      padding: '7px 13px', borderRadius: 8, cursor: 'pointer', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 12.5,
                      border: '1px solid ' + (on ? 'transparent' : '#e9edf2'), background: on ? bg : '#fff', color: on ? fg : '#9da6ae',
                    }}>{lbl}</button>;
                  })}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
        <button onClick={onSubmit} style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 11, padding: '12px 24px', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 14, cursor: 'pointer', boxShadow: '0 6px 16px rgba(237,132,37,.26)' }}>Submit attendance</button>
      </div>
    </div>
  );
}

Object.assign(window, { CoursePicker, DRosterTable, DGradebookTable, DAttendanceTable, Th, Td, StudentCell, ghostBtn });
