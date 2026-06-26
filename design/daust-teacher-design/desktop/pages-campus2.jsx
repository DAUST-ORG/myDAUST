// ── Desktop pages: Dining · Pay · Leave · Booking · Documents · Profile ──
function HeroCard({ children, grad, shadow }) {
  return <div style={{ borderRadius: 16, padding: 24, color: '#fff', background: grad, boxShadow: shadow }}>{children}</div>;
}

function DiningPage() {
  return (
    <div style={{ padding: 28, maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 20, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <HeroCard grad="linear-gradient(135deg, #ed8425 0%, #d6731a 100%)" shadow="0 12px 30px rgba(237,132,37,.28)">
          <Eyebrow color="rgba(255,255,255,.85)">{DINING.plan}</Eyebrow>
          <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 34, marginTop: 14 }}>{fmtCFA(DINING.balance)}</div>
          <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 13, color: 'rgba(255,255,255,.88)', marginTop: 3 }}>Card balance · {DINING.meals} meals remaining</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button style={{ flex: 1, background: '#fff', color: '#c4660f', border: 'none', borderRadius: 10, padding: '11px 0', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Top up card</button>
            <button style={{ flex: 1, background: 'rgba(255,255,255,.18)', color: '#fff', border: '1px solid rgba(255,255,255,.4)', borderRadius: 10, padding: '11px 0', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>History</button>
          </div>
        </HeroCard>
        <Panel title="Refectory hours">
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, fontFamily: 'Montserrat, sans-serif', fontSize: 14, color: '#36414d' }}>
            <Icon name="clock" size={19} color={STEEL} /> Open daily · {DINING.hours}
          </div>
        </Panel>
      </div>
      <Panel title="Today's menu · Faculty Refectory" pad={'8px 20px 20px'}>
        {DINING.today.map((mm, i) => (
          <div key={i} style={{ display: 'flex', gap: 16, padding: '16px 0', borderBottom: i < DINING.today.length - 1 ? '1px solid #eef1f5' : 'none' }}>
            <div style={{ width: 90, flexShrink: 0 }}>
              <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 15, color: mm.feat ? '#c4660f' : '#141a21' }}>{mm.meal}</div>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11, color: '#9da6ae', marginTop: 2 }}>{mm.time}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 14, color: '#36414d', lineHeight: 1.5 }}>{mm.item}</div>
              {mm.feat && <div style={{ marginTop: 8 }}><Badge tone="orange">Today's special</Badge></div>}
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function PayPage() {
  return (
    <div style={{ padding: 28, maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 20, alignItems: 'start' }}>
      <HeroCard grad="linear-gradient(135deg, #153b6a 0%, #1d4a82 100%)" shadow="0 12px 30px rgba(15,44,80,.25)">
        <Eyebrow color="rgba(255,255,255,.75)">Net pay · May 2026</Eyebrow>
        <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 34, marginTop: 12 }}>{fmtCFA(PAYSLIPS[0].net)}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge tone="orange" style={{ background: 'rgba(255,255,255,.16)', color: '#fff' }}>Available now</Badge>
          <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12.5, color: '#b9c4d4' }}>Paid to ···· 4821 · May 28</span>
        </div>
        <button style={{ marginTop: 20, width: '100%', background: '#fff', color: NAVY, border: 'none', borderRadius: 10, padding: '12px 0', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Icon name="download" size={17} color={NAVY} /> Download May payslip</button>
      </HeroCard>
      <Panel title="Payslip history" pad={'6px 20px 12px'}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><Th>Period</Th><Th>Status</Th><Th style={{ textAlign: 'right' }}>Net pay</Th><Th></Th></tr></thead>
          <tbody>
            {PAYSLIPS.map((p, i) => (
              <tr key={p.month}>
                <Td><span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, color: '#141a21' }}>{p.month}</span></Td>
                <Td><Badge tone={p.cur ? 'orange' : 'green'}>{p.status}</Badge></Td>
                <Td style={{ textAlign: 'right', fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 14, color: '#141a21' }}>{fmtCFA(p.net)}</Td>
                <Td style={{ textAlign: 'right', width: 40 }}><button style={{ border: 'none', background: 'none', cursor: 'pointer' }}><Icon name="download" size={18} color="#bcc6d1" /></button></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function LeavePage() {
  const tones = { Pending: 'orange', Approved: 'green', Rejected: 'gray' };
  return (
    <div style={{ padding: 28, maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'stretch' }}>
        {[['Annual leave', LEAVE.annual, NAVY], ['Sick leave', LEAVE.sick, '#2e7d52']].map(([lbl, d, col]) => (
          <div key={lbl} style={{ flex: 1, background: '#fff', border: '1px solid #e9edf2', borderRadius: 16, padding: 20, display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 1px 2px rgba(15,44,80,.05)' }}>
            <Ring value={(1 - d.used / d.total) * 100} label={d.total - d.used} color={col} size={58} stroke={5} />
            <div><div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 600, fontSize: 16, color: '#141a21' }}>{lbl}</div><div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12.5, color: '#9da6ae', marginTop: 2 }}>{d.total - d.used} days left · {d.used} used of {d.total}</div></div>
          </div>
        ))}
        <button style={{ width: 180, background: ORANGE, color: '#fff', border: 'none', borderRadius: 16, fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 8px 20px rgba(237,132,37,.26)' }}><Icon name="plus" size={22} color="#fff" /> Request leave</button>
      </div>
      <Panel title="Request history" pad={'6px 20px 12px'}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><Th>Type</Th><Th>Dates</Th><Th style={{ textAlign: 'center' }}>Days</Th><Th style={{ textAlign: 'right' }}>Status</Th></tr></thead>
          <tbody>
            {LEAVE.requests.map((r, i) => (
              <tr key={i}>
                <Td><span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, color: '#141a21' }}>{r.type}</span></Td>
                <Td style={{ color: '#6c7884' }}>{r.dates}</Td>
                <Td style={{ textAlign: 'center' }}>{r.days}</Td>
                <Td style={{ textAlign: 'right' }}><Badge tone={tones[r.status]}>{r.status}</Badge></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function BookingPage() {
  return (
    <div style={{ padding: 28, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 13.5, color: '#6c7884', marginBottom: 16 }}>Thursday, May 29 · room & lab availability</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {ROOMS.map((r, i) => (
          <Panel key={i} pad={18}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: r.open ? '#e5f3ec' : '#eef1f5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="door" size={23} color={r.open ? '#1f6e46' : '#9da6ae'} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 600, fontSize: 16, color: '#141a21' }}>{r.name}</div>
                <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12.5, color: r.open ? '#1f6e46' : '#9da6ae', marginTop: 2 }}>{r.status} · capacity {r.cap}</div>
              </div>
            </div>
            <button disabled={!r.open} style={{ width: '100%', marginTop: 15, padding: '11px 0', borderRadius: 10, border: 'none', cursor: r.open ? 'pointer' : 'default', background: r.open ? NAVY : '#eef1f5', color: r.open ? '#fff' : '#bcc6d1', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13 }}>{r.open ? 'Reserve room' : 'Unavailable'}</button>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function DocumentsPage() {
  return (
    <div style={{ padding: 28, maxWidth: 900, margin: '0 auto' }}>
      <Panel pad={'6px 20px 12px'}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><Th>Document</Th><Th>Type</Th><Th>Size</Th><Th></Th></tr></thead>
          <tbody>
            {DOCS.map((d, i) => (
              <tr key={i}>
                <Td><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 34, height: 40, borderRadius: 6, background: d.type === 'PDF' ? '#fbeae8' : '#eaf0f8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><span style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 9, color: d.type === 'PDF' ? '#a83024' : NAVY }}>{d.type}</span></div>
                  <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, color: '#141a21' }}>{d.name}</span>
                </div></Td>
                <Td style={{ color: '#9da6ae' }}>{d.type}</Td>
                <Td style={{ color: '#9da6ae' }}>{d.size}</Td>
                <Td style={{ textAlign: 'right' }}><button style={ghostBtn()}>Download</button></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function ProfilePage() {
  const rows = [['Faculty ID', TEACHER.id], ['Email', TEACHER.email], ['Department', TEACHER.dept], ['Office', TEACHER.office], ['Office hours', TEACHER.officeHours]];
  return (
    <div style={{ padding: 28, maxWidth: 760, margin: '0 auto' }}>
      <Panel pad={28}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Avatar initials={TEACHER.initials} size={82} color={NAVY} ring />
          <div>
            <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 24, color: '#141a21' }}>{TEACHER.name}</div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 14, color: '#6c7884', marginTop: 3 }}>{TEACHER.title} · {TEACHER.dept}</div>
            <div style={{ marginTop: 12 }}><TriDash w={28} /></div>
          </div>
        </div>
        <div style={{ marginTop: 24, borderTop: '1px solid #eef1f5' }}>
          {rows.map(([l, v], i) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '15px 0', borderBottom: i < rows.length - 1 ? '1px solid #eef1f5' : 'none' }}>
              <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 13.5, color: '#9da6ae' }}>{l}</span>
              <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13.5, color: '#141a21' }}>{v}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

Object.assign(window, { DiningPage, PayPage, LeavePage, BookingPage, DocumentsPage, ProfilePage });
