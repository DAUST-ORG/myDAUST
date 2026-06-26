// ── Home dashboard ────────────────────────────────────────────
function StatPill({ value, label, color = NAVY, onClick }) {
  return (
    <Card pad={13} onClick={onClick} style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 26, lineHeight: 1, color }}>{value}</div>
      <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11.5, color: '#6c7884', marginTop: 5, lineHeight: 1.25 }}>{label}</div>
    </Card>
  );
}

function NowCard({ nav }) {
  const now = TODAY.find(t => t.status === 'now');
  const next = TODAY.find(t => t.status === 'next');
  const item = now || next;
  const c = COURSES.find(x => x.id === item.course);
  return (
    <div style={{
      borderRadius: 16, padding: 18, position: 'relative', overflow: 'hidden',
      background: 'linear-gradient(135deg, #153b6a 0%, #1d4a82 100%)',
      boxShadow: '0 14px 34px rgba(15,44,80,.28)',
    }}>
      <div style={{ position: 'absolute', right: -28, top: -28, width: 120, height: 120, borderRadius: '50%', background: 'rgba(237,132,37,.16)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: now ? '#5fd08a' : ORANGE, boxShadow: now ? '0 0 0 4px rgba(95,208,138,.25)' : 'none' }} />
        <Eyebrow color="rgba(255,255,255,.78)">{now ? 'Happening now' : 'Up next'}</Eyebrow>
        <span style={{ marginLeft: 'auto', fontFamily: 'Saira, sans-serif', fontWeight: 600, fontSize: 15, color: '#fff' }}>{item.time}<span style={{ opacity: .6, fontWeight: 400 }}>–{item.end}</span></span>
      </div>
      <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 23, color: '#fff', marginTop: 12, letterSpacing: '.01em' }}>{item.label}</div>
      <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 13, color: '#b9c4d4', marginTop: 4 }}>{item.sub}</div>
      <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
        {item.kind === 'class' && (
          <button onClick={() => nav('attendance', { id: item.course })} style={heroBtn(true)}>
            <Icon name="clipboard" size={16} color="#153b6a" /> Take attendance
          </button>
        )}
        <button onClick={() => c ? nav('course', { id: c.id }) : nav('schedule')} style={heroBtn(false)}>
          {item.kind === 'class' ? 'Open class' : 'View schedule'}
        </button>
      </div>
    </div>
  );
}
const heroBtn = (primary) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13,
  padding: '10px 15px', borderRadius: 999, cursor: 'pointer',
  border: primary ? 'none' : '1px solid rgba(255,255,255,.35)',
  background: primary ? '#fff' : 'transparent',
  color: primary ? '#153b6a' : '#fff',
});

function ActionItem({ a, nav, last }) {
  const tones = { urgent: ORANGE, warn: '#d6731a', info: NAVY };
  const col = tones[a.tone] || NAVY;
  return (
    <div onClick={() => a.go && nav(a.go, a.go === 'gradebook' || a.go === 'attendance' ? { id: 'ce201' } : {})}
      style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 2px', borderBottom: last ? 'none' : '1px solid #eef1f5', cursor: a.go ? 'pointer' : 'default' }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: col + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon name={a.icon} size={19} color={col} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 14, color: '#141a21' }}>{a.label}</div>
        <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: a.tone === 'urgent' ? ORANGE : '#6c7884', marginTop: 2, fontWeight: a.tone === 'urgent' ? 600 : 400 }}>{a.meta}</div>
      </div>
      {a.go && <Icon name="chevR" size={17} color="#bcc6d1" />}
    </div>
  );
}

function Timeline({ nav }) {
  return (
    <div>
      {TODAY.map((t, i) => {
        const c = COURSES.find(x => x.id === t.course);
        const dotColor = t.status === 'now' ? ORANGE : t.status === 'done' ? '#bcc6d1' : NAVY;
        return (
          <div key={t.id} onClick={() => c ? nav('course', { id: c.id }) : null}
            style={{ display: 'flex', gap: 13, cursor: c ? 'pointer' : 'default' }}>
            <div style={{ width: 46, textAlign: 'right', flexShrink: 0, paddingTop: 13 }}>
              <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 600, fontSize: 14, color: t.status === 'done' ? '#9da6ae' : '#141a21' }}>{t.time}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: t.status === 'now' ? ORANGE : '#fff', border: `2.5px solid ${dotColor}`, marginTop: 15 }} />
              {i < TODAY.length - 1 && <span style={{ flex: 1, width: 2, background: '#e9edf2', marginTop: 2 }} />}
            </div>
            <div style={{ flex: 1, paddingBottom: i < TODAY.length - 1 ? 14 : 0 }}>
              <Card pad={12} style={{ opacity: t.status === 'done' ? 0.62 : 1, borderColor: t.status === 'now' ? '#f6d6b3' : '#e9edf2', background: t.status === 'now' ? '#fffaf4' : '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 14, color: '#141a21' }}>{t.label}</div>
                  {t.status === 'now' && <Badge tone="orange">Now</Badge>}
                  {t.status === 'done' && <Icon name="check" size={15} color="#9da6ae" />}
                </div>
                <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: '#6c7884', marginTop: 3 }}>{t.sub}</div>
              </Card>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ClassStrip({ nav }) {
  return (
    <div style={{ display: 'flex', gap: 11, overflowX: 'auto', padding: '2px 16px 4px', margin: '0 -16px', scrollbarWidth: 'none' }}>
      {COURSES.map(c => (
        <div key={c.id} onClick={() => nav('course', { id: c.id })}
          style={{ width: 156, flexShrink: 0, background: '#fff', border: '1px solid #e9edf2', borderRadius: 14, padding: 14, cursor: 'pointer', boxShadow: '0 1px 2px rgba(15,44,80,.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 14, color: c.color, background: c.color + '14', padding: '3px 8px', borderRadius: 7 }}>{c.code}</span>
            {c.ungraded > 0 && <span style={{ width: 8, height: 8, borderRadius: '50%', background: ORANGE }} />}
          </div>
          <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13, color: '#141a21', marginTop: 10, lineHeight: 1.3, minHeight: 34 }}>{c.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, fontFamily: 'Montserrat, sans-serif', fontSize: 11.5, color: '#6c7884' }}>
            <Icon name="users" size={13} color="#9da6ae" />{c.students} students
          </div>
        </div>
      ))}
    </div>
  );
}

function AnnouncePreview({ nav }) {
  return ANNOUNCEMENTS.slice(0, 2).map((n, i) => (
    <div key={n.id} onClick={() => nav('notifications')} style={{ display: 'flex', gap: 11, padding: '12px 2px', borderBottom: i === 0 ? '1px solid #eef1f5' : 'none', cursor: 'pointer' }}>
      <div style={{ width: 7, paddingTop: 5 }}>{n.unread && <span style={{ width: 7, height: 7, borderRadius: '50%', background: ORANGE, display: 'block' }} />}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 12, color: NAVY }}>{n.from}</span>
          <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11, color: '#9da6ae', flexShrink: 0 }}>{n.time}</span>
        </div>
        <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 13, color: '#36414d', marginTop: 3, lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{n.title}</div>
      </div>
    </div>
  ));
}

function HomeScreen({ nav, t }) {
  const totalUngraded = COURSES.reduce((s, c) => s + c.ungraded, 0);
  const layout = t.homeLayout || 'schedule';

  const blocks = {
    now: <div key="now" style={{ marginBottom: 22 }}><NowCard nav={nav} /></div>,
    stats: (
      <div key="stats" style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
        <StatPill value={COURSES.length} label="Active courses" onClick={() => nav('classes')} />
        <StatPill value={totalUngraded} label="To grade" color={ORANGE} onClick={() => nav('gradebook', { id: 'ce201' })} />
        <StatPill value={TODAY.filter(x => x.kind === 'class').length} label="Classes today" color="#1d4a82" />
      </div>
    ),
    actions: (
      <div key="actions" style={{ marginBottom: 22 }}>
        <SectionTitle>Needs your attention</SectionTitle>
        <Card pad={4} style={{ padding: '4px 14px' }}>
          {ACTIONS.map((a, i) => <ActionItem key={a.id} a={a} nav={nav} last={i === ACTIONS.length - 1} />)}
        </Card>
      </div>
    ),
    schedule: (
      <div key="sched" style={{ marginBottom: 22 }}>
        <SectionTitle action="Full schedule" onAction={() => nav('schedule')}>Today · Thursday</SectionTitle>
        <Timeline nav={nav} />
      </div>
    ),
    classes: (
      <div key="cls" style={{ marginBottom: 22 }}>
        <SectionTitle action="All classes" onAction={() => nav('classes')}>My classes</SectionTitle>
        <ClassStrip nav={nav} />
      </div>
    ),
    announce: (
      <div key="ann" style={{ marginBottom: 8 }}>
        <SectionTitle action="View all" onAction={() => nav('notifications')}>Announcements</SectionTitle>
        <Card pad={4} style={{ padding: '4px 14px' }}>
          <AnnouncePreview nav={nav} />
        </Card>
      </div>
    ),
  };

  const orders = {
    schedule: ['now', 'stats', 'schedule', 'actions', 'classes', 'announce'],
    actions:  ['stats', 'actions', 'now', 'schedule', 'classes', 'announce'],
    overview: ['stats', 'now', 'classes', 'schedule', 'actions', 'announce'],
  };

  return <div style={{ padding: '8px 16px 0' }}>{orders[layout].map(k => blocks[k])}</div>;
}

Object.assign(window, { HomeScreen });
