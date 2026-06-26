// ── More hub + Dining · Pay · Leave · Booking · Documents · Profile ──
const MORE_ITEMS = [
  { go: 'dining', icon: 'utensils', label: 'Dining', sub: 'Meal plan & menu', color: ORANGE },
  { go: 'pay', icon: 'wallet', label: 'Pay & Payslips', sub: 'May payslip ready', color: '#2e7d52' },
  { go: 'leave', icon: 'plane', label: 'Leave & Absence', sub: '1 pending request', color: '#1d4a82' },
  { go: 'booking', icon: 'door', label: 'Room & Lab Booking', sub: 'Reserve a space', color: NAVY },
  { go: 'documents', icon: 'file', label: 'Documents', sub: 'Handbook, calendar', color: STEEL },
  { go: 'schedule', icon: 'clock', label: 'Office Hours', sub: TEACHER.officeHours, color: '#6c7884' },
];

function MoreScreen({ nav }) {
  return (
    <div style={{ padding: '4px 16px 16px' }}>
      <Card onClick={() => nav('profile')} style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <Avatar initials={TEACHER.initials} size={54} color={NAVY} ring />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 18, color: '#141a21' }}>{TEACHER.name}</div>
          <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12.5, color: '#6c7884', marginTop: 2 }}>{TEACHER.title}</div>
          <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: STEEL, marginTop: 1 }}>{TEACHER.dept}</div>
        </div>
        <Icon name="chevR" size={20} color="#bcc6d1" />
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
        {MORE_ITEMS.map(it => (
          <Card key={it.go} onClick={() => nav(it.go)} style={{ padding: 15 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: it.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Icon name={it.icon} size={21} color={it.color} />
            </div>
            <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 600, fontSize: 15, color: '#141a21' }}>{it.label}</div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11.5, color: '#9da6ae', marginTop: 3, lineHeight: 1.3 }}>{it.sub}</div>
          </Card>
        ))}
      </div>
      <button onClick={() => nav('home')} style={{ width: '100%', marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#fff', border: '1px solid #e9edf2', borderRadius: 12, padding: 14, fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 14, color: '#a83024', cursor: 'pointer' }}>
        <Icon name="logout" size={18} color="#a83024" /> Sign out
      </button>
    </div>
  );
}

function DiningScreen() {
  return (
    <div style={{ padding: '4px 16px 16px' }}>
      <div style={{ borderRadius: 16, padding: 18, color: '#fff', background: 'linear-gradient(135deg, #ed8425 0%, #d6731a 100%)', boxShadow: '0 12px 30px rgba(237,132,37,.28)' }}>
        <Eyebrow color="rgba(255,255,255,.8)">{DINING.plan}</Eyebrow>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 12 }}>
          <div>
            <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 30, letterSpacing: '.01em' }}>{fmtCFA(DINING.balance)}</div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: 'rgba(255,255,255,.85)', marginTop: 2 }}>Card balance · {DINING.meals} meals left</div>
          </div>
          <Icon name="utensils" size={30} color="rgba(255,255,255,.85)" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 9, margin: '14px 0 6px' }}>
        <button style={diningBtn(true)}>Top up card</button>
        <button style={diningBtn(false)}>Transaction history</button>
      </div>
      <SectionTitle>Today's menu · Faculty Refectory</SectionTitle>
      {DINING.today.map((m, i) => (
        <Card key={i} style={{ marginBottom: 10, borderColor: m.feat ? '#f6d6b3' : '#e9edf2', background: m.feat ? '#fffaf4' : '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 15, color: m.feat ? '#c4660f' : '#141a21' }}>{m.meal}</span>
            <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11.5, color: '#9da6ae' }}>{m.time}</span>
          </div>
          <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 13, color: '#4d5965', marginTop: 5, lineHeight: 1.4 }}>{m.item}</div>
          {m.feat && <div style={{ marginTop: 8 }}><Badge tone="orange">Today's special</Badge></div>}
        </Card>
      ))}
      <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: '#9da6ae', textAlign: 'center', marginTop: 6 }}>Refectory open daily · {DINING.hours}</div>
    </div>
  );
}
const diningBtn = (p) => ({ flex: 1, padding: '11px 0', borderRadius: 11, cursor: 'pointer', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13, border: p ? 'none' : '1px solid #d7dee6', background: p ? NAVY : '#fff', color: p ? '#fff' : '#4d5965' });

function PayScreen() {
  return (
    <div style={{ padding: '4px 16px 16px' }}>
      <div style={{ borderRadius: 16, padding: 18, color: '#fff', background: 'linear-gradient(135deg, #153b6a 0%, #1d4a82 100%)', boxShadow: '0 12px 30px rgba(15,44,80,.25)' }}>
        <Eyebrow color="rgba(255,255,255,.75)">Net pay · May 2026</Eyebrow>
        <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 30, marginTop: 10 }}>{fmtCFA(PAYSLIPS[0].net)}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <Badge tone="orange" style={{ background: 'rgba(255,255,255,.16)', color: '#fff' }}>Available now</Badge>
          <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: '#b9c4d4' }}>Paid to ···· 4821 · May 28</span>
        </div>
      </div>
      <SectionTitle>Payslips</SectionTitle>
      <Card pad={4} style={{ padding: '2px 14px' }}>
        {PAYSLIPS.map((p, i) => (
          <div key={p.month} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: i < PAYSLIPS.length - 1 ? '1px solid #eef1f5' : 'none' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: p.cur ? '#fdeede' : '#eef1f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="wallet" size={18} color={p.cur ? '#c4660f' : '#6c7884'} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 14, color: '#141a21' }}>{p.month}</div>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: p.cur ? '#c4660f' : '#9da6ae', marginTop: 1 }}>{p.status}</div>
            </div>
            <span style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 14, color: '#141a21' }}>{fmtCFA(p.net)}</span>
            <Icon name="download" size={18} color="#bcc6d1" />
          </div>
        ))}
      </Card>
    </div>
  );
}

function LeaveScreen() {
  const tones = { Pending: 'orange', Approved: 'green', Rejected: 'gray' };
  return (
    <div style={{ padding: '4px 16px 16px' }}>
      <div style={{ display: 'flex', gap: 11, marginBottom: 20 }}>
        {[['Annual leave', LEAVE.annual, NAVY], ['Sick leave', LEAVE.sick, '#2e7d52']].map(([lbl, d, col]) => (
          <Card key={lbl} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Ring value={(1 - d.used / d.total) * 100} label={d.total - d.used} color={col} size={48} />
            <div>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 12.5, color: '#141a21' }}>{lbl}</div>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11.5, color: '#9da6ae', marginTop: 2 }}>days left of {d.total}</div>
            </div>
          </Card>
        ))}
      </div>
      <button style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: ORANGE, color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 14.5, cursor: 'pointer', marginBottom: 20 }}>
        <Icon name="plus" size={18} color="#fff" /> Request leave
      </button>
      <SectionTitle>Recent requests</SectionTitle>
      {LEAVE.requests.map((r, i) => (
        <Card key={i} style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 14, color: '#141a21' }}>{r.type}</div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: '#6c7884', marginTop: 2 }}>{r.dates} · {r.days} day{r.days > 1 ? 's' : ''}</div>
          </div>
          <Badge tone={tones[r.status]}>{r.status}</Badge>
        </Card>
      ))}
    </div>
  );
}

function BookingScreen() {
  return (
    <div style={{ padding: '4px 16px 16px' }}>
      <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 13, color: '#6c7884', marginBottom: 14 }}>Thursday, May 29 · availability now</div>
      {ROOMS.map((r, i) => (
        <Card key={i} style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: r.open ? '#e5f3ec' : '#eef1f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="door" size={21} color={r.open ? '#1f6e46' : '#9da6ae'} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 600, fontSize: 15, color: '#141a21' }}>{r.name}</div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: r.open ? '#1f6e46' : '#9da6ae', marginTop: 2 }}>{r.status} · cap {r.cap}</div>
          </div>
          <button disabled={!r.open} style={{ padding: '9px 16px', borderRadius: 999, border: 'none', cursor: r.open ? 'pointer' : 'default', background: r.open ? NAVY : '#eef1f5', color: r.open ? '#fff' : '#bcc6d1', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 12.5 }}>{r.open ? 'Book' : 'Busy'}</button>
        </Card>
      ))}
    </div>
  );
}

function DocumentsScreen() {
  return (
    <div style={{ padding: '4px 16px 16px' }}>
      <Card pad={4} style={{ padding: '2px 14px' }}>
        {DOCS.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 0', borderBottom: i < DOCS.length - 1 ? '1px solid #eef1f5' : 'none', cursor: 'pointer' }}>
            <div style={{ width: 38, height: 44, borderRadius: 7, background: d.type === 'PDF' ? '#fbeae8' : '#eaf0f8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 10, color: d.type === 'PDF' ? '#a83024' : NAVY }}>{d.type}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13.5, color: '#141a21', lineHeight: 1.3 }}>{d.name}</div>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11.5, color: '#9da6ae', marginTop: 2 }}>{d.type} · {d.size}</div>
            </div>
            <Icon name="download" size={19} color="#bcc6d1" />
          </div>
        ))}
      </Card>
    </div>
  );
}

function ProfileScreen() {
  const rows = [
    ['Faculty ID', TEACHER.id], ['Email', TEACHER.email], ['Department', TEACHER.dept],
    ['Office', TEACHER.office], ['Office hours', TEACHER.officeHours],
  ];
  return (
    <div style={{ padding: '4px 16px 16px' }}>
      <div style={{ textAlign: 'center', padding: '8px 0 22px' }}>
        <div style={{ display: 'inline-block' }}><Avatar initials={TEACHER.initials} size={84} color={NAVY} ring /></div>
        <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 22, color: '#141a21', marginTop: 14 }}>{TEACHER.name}</div>
        <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 13, color: '#6c7884', marginTop: 3 }}>{TEACHER.title}</div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}><TriDash w={26} /></div>
      </div>
      <Card pad={4} style={{ padding: '2px 16px' }}>
        {rows.map(([l, v], i) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '13px 0', borderBottom: i < rows.length - 1 ? '1px solid #eef1f5' : 'none' }}>
            <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 13, color: '#9da6ae' }}>{l}</span>
            <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13, color: '#141a21', textAlign: 'right' }}>{v}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

Object.assign(window, { MoreScreen, DiningScreen, PayScreen, LeaveScreen, BookingScreen, DocumentsScreen, ProfileScreen });
