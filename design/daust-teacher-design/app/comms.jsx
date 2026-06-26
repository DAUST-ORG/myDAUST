// ── Schedule · Messages · Notifications ───────────────────────
const WEEK = [
  { d: 'Mon', n: 26 }, { d: 'Tue', n: 27 }, { d: 'Wed', n: 28 },
  { d: 'Thu', n: 29, today: true }, { d: 'Fri', n: 30 },
];
const WEEK_CLASSES = {
  Mon: [['09:00', 'ce201', 'Lecture'], ['14:00', 'ee210', 'Lecture']],
  Tue: [['11:00', 'ce305', 'Lab Session'], ['14:00', 'office', 'Office Hours']],
  Wed: [['09:00', 'ce201', 'Lecture'], ['14:00', 'ee210', 'Lecture']],
  Thu: [['09:00', 'ce201', 'Lecture'], ['11:00', 'ce305', 'Lab Session'], ['14:00', 'office', 'Office Hours'], ['16:30', 'meeting', 'Faculty Meeting']],
  Fri: [['09:00', 'ce201', 'Lecture'], ['15:00', 'ce410', 'Capstone Studio']],
};

function ScheduleScreen({ nav }) {
  const [day, setDay] = React.useState('Thu');
  const items = WEEK_CLASSES[day] || [];
  return (
    <div style={{ padding: '4px 16px 0' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {WEEK.map(w => (
          <button key={w.d} onClick={() => setDay(w.d)} style={{
            flex: 1, padding: '10px 0', borderRadius: 13, cursor: 'pointer', border: 'none',
            background: day === w.d ? NAVY : '#fff', boxShadow: day === w.d ? '0 6px 16px rgba(15,44,80,.22)' : '0 1px 2px rgba(15,44,80,.05)',
          }}>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '.04em', color: day === w.d ? 'rgba(255,255,255,.7)' : '#9da6ae' }}>{w.d}</div>
            <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 19, color: day === w.d ? '#fff' : '#141a21', marginTop: 3, position: 'relative' }}>
              {w.n}{w.today && <span style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: day === w.d ? ORANGE : ORANGE }} />}
            </div>
          </button>
        ))}
      </div>
      {items.length === 0 && <div style={{ textAlign: 'center', color: '#9da6ae', fontFamily: 'Montserrat, sans-serif', padding: 40 }}>No classes scheduled.</div>}
      {items.map(([time, key, label], i) => {
        const c = COURSES.find(x => x.id === key);
        const color = c ? c.color : (key === 'meeting' ? STEEL : '#1d4a82');
        return (
          <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 50, paddingTop: 14, textAlign: 'right', fontFamily: 'Saira, sans-serif', fontWeight: 600, fontSize: 13.5, color: '#6c7884', flexShrink: 0 }}>{time}</div>
            <Card onClick={() => c && nav('course', { id: c.id })} style={{ flex: 1, padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex' }}>
                <div style={{ width: 5, background: color }} />
                <div style={{ padding: '13px 15px', flex: 1 }}>
                  <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 600, fontSize: 15.5, color: '#141a21' }}>{c ? c.code + ' — ' + label : label}</div>
                  <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: '#6c7884', marginTop: 3 }}>{c ? c.name + ' · ' + c.room : (key === 'office' ? TEACHER.office : 'Conference Room · Admin Block')}</div>
                </div>
              </div>
            </Card>
          </div>
        );
      })}
      <div style={{ height: 16 }} />
    </div>
  );
}

function MessagesScreen({ nav }) {
  return (
    <div style={{ padding: '4px 16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid #e9edf2', borderRadius: 12, padding: '11px 14px', marginBottom: 14 }}>
        <Icon name="search" size={18} color="#9da6ae" />
        <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 14, color: '#9da6ae' }}>Search messages</span>
      </div>
      <Card pad={4} style={{ padding: '4px 14px' }}>
        {THREADS.map((m, i) => (
          <div key={m.id} onClick={() => nav('thread', { id: m.id })} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < THREADS.length - 1 ? '1px solid #eef1f5' : 'none', cursor: 'pointer' }}>
            <Avatar initials={m.initials} color={m.color} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: m.unread ? 700 : 600, fontSize: 14, color: '#141a21' }}>{m.who}</span>
                <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11.5, color: m.unread ? ORANGE : '#9da6ae', flexShrink: 0, fontWeight: m.unread ? 600 : 400 }}>{m.time}</span>
              </div>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11.5, color: STEEL, marginTop: 1 }}>{m.role}</div>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 13, color: m.unread ? '#36414d' : '#6c7884', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: m.unread ? 600 : 400 }}>{m.preview}</div>
            </div>
            {m.unread && <span style={{ width: 9, height: 9, borderRadius: '50%', background: ORANGE, flexShrink: 0 }} />}
          </div>
        ))}
      </Card>
    </div>
  );
}

function ThreadScreen({ params }) {
  const m = THREADS.find(x => x.id === params.id) || THREADS[0];
  const [msgs, setMsgs] = React.useState([
    { me: false, text: m.preview, t: m.time },
    { me: true, text: 'Of course — happy to help. Does Thursday at 14:00 during office hours work for you?', t: m.time },
    { me: false, text: 'That works perfectly. Thank you, Professor!', t: m.time },
  ]);
  const [draft, setDraft] = React.useState('');
  const send = () => { if (!draft.trim()) return; setMsgs(p => [...p, { me: true, text: draft, t: 'now' }]); setDraft(''); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {msgs.map((b, i) => (
          <div key={i} style={{ alignSelf: b.me ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
            <div style={{
              background: b.me ? NAVY : '#fff', color: b.me ? '#fff' : '#141a21',
              border: b.me ? 'none' : '1px solid #e9edf2',
              borderRadius: 16, borderBottomRightRadius: b.me ? 5 : 16, borderBottomLeftRadius: b.me ? 16 : 5,
              padding: '10px 14px', fontFamily: 'Montserrat, sans-serif', fontSize: 13.5, lineHeight: 1.45,
            }}>{b.text}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: '10px 14px 14px', borderTop: '1px solid #eef1f5', background: '#fff', display: 'flex', gap: 9, alignItems: 'center' }}>
        <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Message…"
          style={{ flex: 1, border: '1px solid #d7dee6', borderRadius: 999, padding: '11px 16px', fontFamily: 'Montserrat, sans-serif', fontSize: 14, outline: 'none' }} />
        <button onClick={send} style={{ width: 42, height: 42, borderRadius: '50%', border: 'none', background: ORANGE, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <Icon name="arrowR" size={20} color="#fff" />
        </button>
      </div>
    </div>
  );
}

function NotificationsScreen() {
  return (
    <div style={{ padding: '4px 16px 16px' }}>
      {ANNOUNCEMENTS.map(n => (
        <Card key={n.id} style={{ marginBottom: 11 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Badge tone={n.tag === 'Academics' ? 'navy' : n.tag === 'HR' ? 'green' : n.tag === 'Campus' ? 'orange' : 'gray'}>{n.tag}</Badge>
            <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 12.5, color: NAVY }}>{n.from}</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'Montserrat, sans-serif', fontSize: 11, color: '#9da6ae' }}>{n.time}</span>
            {n.unread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: ORANGE }} />}
          </div>
          <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 600, fontSize: 15.5, color: '#141a21', lineHeight: 1.3 }}>{n.title}</div>
          <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 13, color: '#6c7884', marginTop: 6, lineHeight: 1.5 }}>{n.body}</div>
        </Card>
      ))}
    </div>
  );
}

Object.assign(window, { ScheduleScreen, MessagesScreen, ThreadScreen, NotificationsScreen });
