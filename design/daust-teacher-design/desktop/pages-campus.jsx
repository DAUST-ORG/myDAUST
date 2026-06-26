// ── Desktop pages: Schedule · Messages · Campus · standalone Grade/Att ──
const WEEK_CLASSES = {
  Mon: [['09:00', 'ce201', 'Lecture'], ['14:00', 'ee210', 'Lecture']],
  Tue: [['11:00', 'ce305', 'Lab Session'], ['14:00', 'office', 'Office Hours']],
  Wed: [['09:00', 'ce201', 'Lecture'], ['14:00', 'ee210', 'Lecture']],
  Thu: [['09:00', 'ce201', 'Lecture'], ['11:00', 'ce305', 'Lab Session'], ['14:00', 'office', 'Office Hours'], ['16:30', 'meeting', 'Faculty Meeting']],
  Fri: [['09:00', 'ce201', 'Lecture'], ['15:00', 'ce410', 'Capstone Studio']],
};
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const DAY_NUM = { Mon: 26, Tue: 27, Wed: 28, Thu: 29, Fri: 30 };
const DUR = { Lecture: 1.5, 'Lab Session': 1.5, 'Office Hours': 2, 'Faculty Meeting': 1, 'Capstone Studio': 2 };
const HOUR0 = 8, HOUR1 = 18, ROWH = 62;

function SchedulePage({ go }) {
  return (
    <div style={{ padding: 28, maxWidth: 1320, margin: '0 auto' }}>
      <Panel pad={0}>
        <div style={{ display: 'grid', gridTemplateColumns: '62px repeat(5, 1fr)', borderBottom: '1px solid #eef1f5' }}>
          <div />
          {DAYS.map(d => (
            <div key={d} style={{ padding: '14px 0', textAlign: 'center', borderLeft: '1px solid #eef1f5', background: d === 'Thu' ? '#f5f8fc' : '#fff' }}>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '.06em', color: d === 'Thu' ? NAVY : '#9da6ae' }}>{d.toUpperCase()}</div>
              <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 22, color: d === 'Thu' ? NAVY : '#141a21', marginTop: 2 }}>{DAY_NUM[d]}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '62px repeat(5, 1fr)', position: 'relative' }}>
          <div>
            {Array.from({ length: HOUR1 - HOUR0 }, (_, i) => (
              <div key={i} style={{ height: ROWH, position: 'relative' }}>
                <span style={{ position: 'absolute', top: -7, right: 8, fontFamily: 'Montserrat, sans-serif', fontSize: 11, color: '#bcc6d1' }}>{String(HOUR0 + i).padStart(2, '0')}:00</span>
              </div>
            ))}
          </div>
          {DAYS.map(d => (
            <div key={d} style={{ borderLeft: '1px solid #eef1f5', position: 'relative', background: d === 'Thu' ? '#fafbfd' : '#fff' }}>
              {Array.from({ length: HOUR1 - HOUR0 }, (_, i) => <div key={i} style={{ height: ROWH, borderTop: i ? '1px solid #f2f5f8' : 'none' }} />)}
              {(WEEK_CLASSES[d] || []).map(([time, key, label], idx) => {
                const c = COURSES.find(x => x.id === key);
                const color = c ? c.color : (key === 'meeting' ? '#6c7884' : '#1d4a82');
                const [h, m] = time.split(':').map(Number);
                const top = ((h + m / 60) - HOUR0) * ROWH;
                const height = (DUR[label] || 1) * ROWH - 6;
                return (
                  <div key={idx} onClick={() => c && go('course', { id: c.id })} style={{ position: 'absolute', top: top + 2, left: 5, right: 5, height, background: color, borderRadius: 9, padding: '8px 10px', color: '#fff', cursor: c ? 'pointer' : 'default', overflow: 'hidden', boxShadow: '0 4px 12px ' + color + '40' }}>
                    <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 12.5 }}>{c ? c.code : label}</div>
                    <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 10.5, opacity: .9, marginTop: 1 }}>{c ? label : ''} {time}</div>
                    {c && <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 10, opacity: .8, marginTop: 1 }}>{c.room}</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function MessagesPage() {
  const [sel, setSel] = React.useState(THREADS[0].id);
  const m = THREADS.find(x => x.id === sel);
  const [msgs, setMsgs] = React.useState([]);
  const [draft, setDraft] = React.useState('');
  React.useEffect(() => {
    setMsgs([
      { me: false, text: m.preview, t: '10:12' },
      { me: true, text: 'Of course — happy to help. Does Thursday at 14:00 during office hours work?', t: '10:14' },
      { me: false, text: 'That works perfectly. Thank you, Professor!', t: '10:15' },
    ]);
  }, [sel]);
  const now = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const send = () => { if (!draft.trim()) return; setMsgs(p => [...p, { me: true, text: draft, t: now() }]); setDraft(''); };
  return (
    <div style={{ padding: 28, maxWidth: 1320, margin: '0 auto', height: 'calc(100% - 56px)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: 'calc(100vh - 74px - 56px)', overflow: 'hidden', background: '#fff', border: '1px solid #e9edf2', borderRadius: 16, boxShadow: '0 1px 2px rgba(15,44,80,.05)' }}>
        <div style={{ borderRight: '1px solid #eef1f5', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 16px 12px', borderBottom: '1px solid #eef1f5' }}>
            <span style={{ fontFamily: 'Saira, sans-serif', fontWeight: 600, fontSize: 15, color: '#141a21' }}>Inbox</span>
            <button style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: NAVY, color: '#fff', borderRadius: 9, padding: '7px 12px', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}><Icon name="plus" size={14} color="#fff" /> New</button>
          </div>
          {THREADS.map(th => (
            <div key={th.id} onClick={() => setSel(th.id)} style={{ display: 'flex', gap: 12, padding: '14px 16px', cursor: 'pointer', background: sel === th.id ? '#f5f8fc' : '#fff', borderBottom: '1px solid #f2f5f8', borderLeft: '3px solid ' + (sel === th.id ? NAVY : 'transparent') }}>
              <Avatar initials={th.initials} color={th.color} size={42} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: th.unread ? 700 : 600, fontSize: 13.5, color: '#141a21' }}>{th.who}</span><span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11, color: '#9da6ae' }}>{th.time}</span></div>
                <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11, color: STEEL, marginTop: 1 }}>{th.role}</div>
                <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12.5, color: '#6c7884', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{th.preview}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '13px 22px', borderBottom: '1px solid #eef1f5', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar initials={m.initials} color={m.color} size={38} />
            <div style={{ flex: 1 }}><div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 600, fontSize: 16, color: '#141a21' }}>{m.who}</div><div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: '#9da6ae' }}>{m.role}</div></div>
            {[['mail', () => {}], ['users', () => {}]].map(([ic], k) => (
              <button key={k} style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid #e9edf2', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name={ic} size={17} color={STEEL} /></button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 4, background: '#f5f7f9' }}>
            <div style={{ textAlign: 'center', marginBottom: 8 }}><span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11, fontWeight: 600, color: '#9da6ae', background: '#e9edf2', padding: '4px 12px', borderRadius: 999 }}>Today</span></div>
            {msgs.map((b, i) => (
              <div key={i} style={{ alignSelf: b.me ? 'flex-end' : 'flex-start', maxWidth: '66%', display: 'flex', flexDirection: 'column', alignItems: b.me ? 'flex-end' : 'flex-start', marginTop: i && msgs[i - 1].me !== b.me ? 8 : 0 }}>
                <div style={{ background: b.me ? NAVY : '#fff', color: b.me ? '#fff' : '#141a21', border: b.me ? 'none' : '1px solid #e9edf2', borderRadius: 16, borderBottomRightRadius: b.me ? 5 : 16, borderBottomLeftRadius: b.me ? 16 : 5, padding: '10px 15px', fontFamily: 'Montserrat, sans-serif', fontSize: 13.5, lineHeight: 1.45, boxShadow: b.me ? '0 2px 8px rgba(15,44,80,.18)' : '0 1px 2px rgba(15,44,80,.05)' }}>{b.text}</div>
                <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 10.5, color: '#bcc6d1', margin: '3px 6px 0' }}>{b.t}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: 16, borderTop: '1px solid #eef1f5', display: 'flex', gap: 10 }}>
            <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Write a message…" style={{ flex: 1, border: '1px solid #d7dee6', borderRadius: 10, padding: '12px 15px', fontFamily: 'Montserrat, sans-serif', fontSize: 13.5, outline: 'none' }} />
            <button onClick={send} style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 10, padding: '0 22px', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotificationsPage() {
  return (
    <div style={{ padding: 28, maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {ANNOUNCEMENTS.map(n => (
        <Panel key={n.id} pad={20}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
            <Badge tone={n.tag === 'Academics' ? 'navy' : n.tag === 'HR' ? 'green' : n.tag === 'Campus' ? 'orange' : 'gray'}>{n.tag}</Badge>
            <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13, color: NAVY }}>{n.from}</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: '#9da6ae' }}>{n.time}</span>
            {n.unread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: ORANGE }} />}
          </div>
          <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 600, fontSize: 17, color: '#141a21' }}>{n.title}</div>
          <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 13.5, color: '#6c7884', marginTop: 6, lineHeight: 1.55 }}>{n.body}</div>
        </Panel>
      ))}
    </div>
  );
}

function FinalGradesModal({ onClose }) {
  const [done, setDone] = React.useState(false);
  const rows = COURSES.map(c => ({ c, ready: c.ungraded === 0 }));
  const [submitted, setSubmitted] = React.useState({});
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,28,50,.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, width: 540, maxWidth: '100%', overflow: 'hidden', boxShadow: '0 30px 80px rgba(15,44,80,.35)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #eef1f5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div><div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 19, color: '#141a21' }}>Submit final grades</div><div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12.5, color: '#9da6ae', marginTop: 2 }}>Registrar deadline · Friday, May 31</div></div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 9, border: 'none', background: '#f5f7f9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={18} color="#6c7884" /></button>
        </div>
        <div style={{ padding: '8px 24px' }}>
          {rows.map(({ c, ready }, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 0', borderBottom: i < rows.length - 1 ? '1px solid #eef1f5' : 'none' }}>
              <span style={{ width: 6, height: 30, borderRadius: 3, background: c.color }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 14, color: '#141a21' }}>{c.code} — {c.name}</div>
                <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: ready ? '#1f6e46' : ORANGE, marginTop: 2 }}>{submitted[c.id] ? 'Submitted to registrar' : ready ? 'All grades entered · ready' : c.ungraded + ' grades outstanding'}</div>
              </div>
              {submitted[c.id] ? <Badge tone="green"><Icon name="check" size={12} color="#1f6e46" /> Done</Badge>
                : <button disabled={!ready} onClick={() => setSubmitted(p => ({ ...p, [c.id]: true }))} style={{ border: 'none', borderRadius: 9, padding: '8px 14px', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 12.5, cursor: ready ? 'pointer' : 'default', background: ready ? NAVY : '#eef1f5', color: ready ? '#fff' : '#bcc6d1' }}>Submit</button>}
            </div>
          ))}
        </div>
        <div style={{ padding: '16px 24px', background: '#f5f7f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12.5, color: '#6c7884' }}>{Object.keys(submitted).length} of {COURSES.length} courses submitted</span>
          <button onClick={onClose} style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 10, padding: '11px 20px', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>Done</button>
        </div>
      </div>
    </div>
  );
}

function GradebookPage() {
  const [cid, setCid] = React.useState('ce201');
  const [modal, setModal] = React.useState(false);
  return (
    <div style={{ padding: 28, maxWidth: 1320, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ flex: 1 }}><CoursePicker value={cid} onChange={setCid} /></div>
        <button onClick={() => setModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: NAVY, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 6px 16px rgba(15,44,80,.18)' }}><Icon name="award" size={16} color="#fff" /> Submit final grades</button>
      </div>
      <Panel title="Gradebook" action="Export CSV" pad={'6px 20px 14px'}><DGradebookTable courseId={cid} /></Panel>
      {modal && <FinalGradesModal onClose={() => setModal(false)} />}
    </div>
  );
}

function AttendancePage() {
  const [cid, setCid] = React.useState('ce305');
  const [toast, setToast] = React.useState(false);
  return (
    <div style={{ padding: 28, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 18 }}><CoursePicker value={cid} onChange={setCid} /></div>
      <Panel title="Mark attendance · Thursday, May 29" pad={20}><DAttendanceTable courseId={cid} onSubmit={() => setToast(true)} /></Panel>
      {toast && <Toast text="Attendance submitted for today." onDone={() => setToast(false)} />}
    </div>
  );
}

Object.assign(window, { SchedulePage, MessagesPage, NotificationsPage, GradebookPage, AttendancePage });
