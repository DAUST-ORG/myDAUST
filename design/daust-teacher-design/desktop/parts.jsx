// ── Desktop shell parts: Sidebar, Topbar, Panel, StatCard ─────
const NAV = [
  { group: 'Teaching', items: [
    { id: 'dashboard', icon: 'home', label: 'Dashboard' },
    { id: 'classes', icon: 'book', label: 'My Classes' },
    { id: 'schedule', icon: 'calendar', label: 'Schedule' },
    { id: 'assignments', icon: 'clipboard', label: 'Assignments' },
    { id: 'gradebook', icon: 'chart', label: 'Gradebook' },
    { id: 'attendance', icon: 'check', label: 'Attendance' },
    { id: 'insights', icon: 'trend', label: 'Insights' },
    { id: 'advising', icon: 'users', label: 'Advising' },
    { id: 'messages', icon: 'message', label: 'Messages', badge: 2 },
  ]},
  { group: 'Campus', items: [
    { id: 'dining', icon: 'utensils', label: 'Dining' },
    { id: 'pay', icon: 'wallet', label: 'Pay & Payslips' },
    { id: 'leave', icon: 'plane', label: 'Leave & Absence' },
    { id: 'booking', icon: 'door', label: 'Room Booking' },
    { id: 'documents', icon: 'file', label: 'Documents' },
  ]},
];

function Sidebar({ active, go }) {
  return (
    <aside style={{ width: 252, flexShrink: 0, background: 'linear-gradient(180deg, #153b6a 0%, #0f2c50 100%)', color: '#fff', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '26px 22px 22px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <img src="assets/logo-daust-white.png" alt="DAUST" style={{ height: 30, width: 'auto' }} />
        <div style={{ width: 1, height: 26, background: 'rgba(255,255,255,.18)' }} />
        <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 10.5, fontWeight: 600, letterSpacing: '.1em', color: 'rgba(255,255,255,.7)', lineHeight: 1.3 }}>TEACHER<br/>PORTAL</div>
      </div>
      <nav style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
        {NAV.map(grp => (
          <div key={grp.group} style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 10.5, fontWeight: 600, letterSpacing: '.12em', color: 'rgba(255,255,255,.42)', padding: '0 10px 8px' }}>{grp.group.toUpperCase()}</div>
            {grp.items.map(it => {
              const on = active === it.id || (it.id === 'classes' && active === 'course');
              return (
                <button key={it.id} onClick={() => go(it.id)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px', marginBottom: 2,
                  border: 'none', borderRadius: 10, cursor: 'pointer', textAlign: 'left', position: 'relative',
                  background: on ? 'rgba(255,255,255,.12)' : 'transparent',
                  color: on ? '#fff' : 'rgba(255,255,255,.72)',
                  fontFamily: 'Montserrat, sans-serif', fontWeight: on ? 600 : 500, fontSize: 13.5,
                  transition: 'background .14s',
                }}
                  onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'rgba(255,255,255,.06)'; }}
                  onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent'; }}>
                  {on && <span style={{ position: 'absolute', left: -14, top: 8, bottom: 8, width: 3, borderRadius: 3, background: ORANGE }} />}
                  <Icon name={it.icon} size={19} color={on ? ORANGE : 'rgba(255,255,255,.7)'} stroke={on ? 2.3 : 2} />
                  <span style={{ flex: 1 }}>{it.label}</span>
                  {it.badge && <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: ORANGE, color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{it.badge}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <button onClick={() => go('profile')} style={{ margin: 14, marginTop: 0, display: 'flex', alignItems: 'center', gap: 11, padding: 11, borderRadius: 12, border: 'none', background: 'rgba(255,255,255,.07)', cursor: 'pointer', textAlign: 'left' }}>
        <Avatar initials={TEACHER.initials} size={38} color={ORANGE} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 12.5, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{TEACHER.name}</div>
          <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11, color: 'rgba(255,255,255,.55)' }}>{TEACHER.title}</div>
        </div>
        <Icon name="settings" size={16} color="rgba(255,255,255,.5)" />
      </button>
    </aside>
  );
}

function Topbar({ title, subtitle, cta, onCta, go }) {
  return (
    <header style={{ height: 74, flexShrink: 0, background: '#fff', borderBottom: '1px solid #e9edf2', display: 'flex', alignItems: 'center', gap: 20, padding: '0 32px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{ margin: 0, fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 23, color: '#141a21', letterSpacing: '.01em', lineHeight: 1.1 }}>{title}</h1>
        {subtitle && <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12.5, color: '#9da6ae', marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <a href="DAUST%20Teacher%20Portal.html" title="Open phone version" style={{ display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none', background: '#f5f7f9', border: '1px solid #e9edf2', borderRadius: 10, padding: '9px 13px', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 12.5, color: '#4d5965' }}>
          <Icon name="grid" size={15} color={STEEL} /> Phone
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#f5f7f9', border: '1px solid #e9edf2', borderRadius: 10, padding: '9px 13px', width: 230 }}>
          <Icon name="search" size={17} color="#9da6ae" />
          <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 13, color: '#9da6ae' }}>Search students, classes…</span>
        </div>
        <button onClick={() => go('notifications')} style={{ position: 'relative', width: 42, height: 42, borderRadius: 11, border: '1px solid #e9edf2', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Icon name="bell" size={19} color={NAVY} />
          <span style={{ position: 'absolute', top: 9, right: 9, width: 8, height: 8, borderRadius: '50%', background: ORANGE, border: '1.5px solid #fff' }} />
        </button>
        {cta && (
          <button onClick={onCta} style={{ display: 'flex', alignItems: 'center', gap: 8, background: ORANGE, color: '#fff', border: 'none', borderRadius: 11, padding: '11px 17px', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', boxShadow: '0 6px 16px rgba(237,132,37,.28)' }}>
            <Icon name={cta.icon} size={17} color="#fff" /> {cta.label}
          </button>
        )}
      </div>
    </header>
  );
}

// Content panel
function Panel({ title, action, onAction, children, style = {}, pad = 20 }) {
  return (
    <section style={{ background: '#fff', border: '1px solid #e9edf2', borderRadius: 16, boxShadow: '0 1px 2px rgba(15,44,80,.05)', ...style }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #eef1f5' }}>
          <h3 style={{ margin: 0, fontFamily: 'Saira, sans-serif', fontWeight: 600, fontSize: 16.5, color: '#141a21' }}>{title}</h3>
          {action && <button onClick={onAction} style={{ border: 'none', background: 'none', color: NAVY, fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>{action} <Icon name="chevR" size={14} color={NAVY} /></button>}
        </div>
      )}
      <div style={{ padding: pad }}>{children}</div>
    </section>
  );
}

function StatCard({ value, label, icon, color = NAVY, trend, onClick }) {
  return (
    <div onClick={onClick} style={{ flex: 1, background: '#fff', border: '1px solid #e9edf2', borderRadius: 16, padding: 20, boxShadow: '0 1px 2px rgba(15,44,80,.05)', cursor: onClick ? 'pointer' : 'default', transition: 'box-shadow .15s, transform .12s' }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.boxShadow = '0 10px 26px rgba(15,44,80,.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; } }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,44,80,.05)'; e.currentTarget.style.transform = 'none'; }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={21} color={color} />
        </div>
        {trend && <Badge tone="green">{trend}</Badge>}
      </div>
      <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 32, color: '#141a21', marginTop: 14, lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12.5, color: '#6c7884', marginTop: 5 }}>{label}</div>
    </div>
  );
}

Object.assign(window, { NAV, Sidebar, Topbar, Panel, StatCard });
