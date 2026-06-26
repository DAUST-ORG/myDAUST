// ============================================================
// DAUST Student Affairs — shell: shared atoms + app chrome
// ============================================================
const { useState, useEffect, useRef, useMemo } = React;

// ---------- tokens (DAUST design system) ----------
// Navy is the dominant brand color; orange is the sparing energizing accent;
// steel is the quiet third note. Legacy teal*/slate keys are aliased to the
// DAUST navy ramp so the whole console re-skins consistently.
const NAVY = '#153b6a', NAVY_DEEP = '#0f2c50', NAVY_700 = '#1d4a82', NAVY_400 = '#3a6ea5';
const ORANGE = '#ed8425', ORANGE_600 = '#d6731a', STEEL = '#9da6ae';
const C = {
  // brand
  navy: NAVY, navyDeep: NAVY_DEEP, navy700: NAVY_700, navy400: NAVY_400,
  orange: ORANGE, orange600: ORANGE_600, steel: STEEL,
  display: "'Saira', system-ui, sans-serif", body: "'Montserrat', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  // brand-as-primary aliases (former teal scale -> navy ramp)
  teal900: NAVY_DEEP, teal700: NAVY, teal600: NAVY_700, teal500: NAVY_400,
  teal400: NAVY_400, teal300: '#7ba0c9', teal100: '#cdd8e6', teal50: '#eef2f7',
  // neutral ramp (cool, navy-tinted) — former slate keys
  s900:'#141a21', s800:'#232c36', s700:'#36414d', s500:'#6c7884', s400:'#9da6ae',
  s300:'#bcc6d1', s200:'#d7dee6', s100:'#e9edf2', s50:'#f5f7f9',
  // status
  success:'#2e7d52', successFg:'#2e7d52', warning:ORANGE, warningFg:'#b5610f',
  error:'#c0392b', errorFg:'#a5281b', info:NAVY_700, infoFg:NAVY_700,
  grad:'linear-gradient(135deg,#153b6a 0%,#1d4a82 100%)',
  gradOrange:'linear-gradient(135deg,#ed8425 0%,#f4a04f 100%)',
};

function Icon({ name, size = 18, color = 'currentColor', strokeWidth = 1.5, style }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && window.lucide) {
      ref.current.innerHTML = '';
      const el = document.createElement('i');
      el.setAttribute('data-lucide', name);
      ref.current.appendChild(el);
      window.lucide.createIcons({ attrs: { width: size, height: size, 'stroke-width': strokeWidth } });
    }
  }, [name, size, strokeWidth]);
  return <span ref={ref} style={{ display: 'inline-flex', color, ...style }} />;
}

function Button({ variant = 'primary', size = 'md', children, icon, iconRight, onClick, style, disabled }) {
  const [hover, setHover] = useState(false);
  const palette = {
    primary:   { background: hover ? C.orange600 : C.orange, color: '#fff', border: 'none' },
    navy:      { background: hover ? C.navy700 : C.navy, color: '#fff', border: 'none' },
    secondary: { background: hover ? C.teal100 : C.teal50, color: C.navy, border: `1px solid ${C.teal100}` },
    outline:   { background: hover ? C.navy : 'transparent', color: hover ? '#fff' : C.navy, border: `1.5px solid ${C.navy}` },
    ghost:     { background: hover ? C.s100 : 'transparent', color: C.s700, border: 'none' },
    soft:      { background: hover ? C.s100 : C.s50, color: C.s700, border: `1px solid ${C.s200}` },
  }[variant];
  const sizes = {
    sm: { padding: '6px 12px', fontSize: 12 },
    md: { padding: '9px 16px', fontSize: 13 },
    lg: { padding: '12px 22px', fontSize: 14 },
  }[size];
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        ...palette, ...sizes, ...style,
        borderRadius: 999, fontWeight: 600, fontFamily: C.body, letterSpacing: '0.02em',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        transition: 'all 200ms cubic-bezier(0.4,0,0.2,1)', whiteSpace: 'nowrap',
      }}>
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 14 : 16} />}
    </button>
  );
}

function Card({ children, style, padding = 20, hover: hoverable, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: '#fff', border: `1px solid ${C.s200}`, borderRadius: 12, padding,
        boxShadow: hoverable && hover ? '0 8px 24px rgba(15,23,42,0.08)' : '0 1px 2px rgba(15,23,42,0.04)',
        transform: hoverable && hover ? 'translateY(-2px)' : 'none',
        transition: 'all 200ms cubic-bezier(0.4,0,0.2,1)', cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}>{children}</div>
  );
}

function Badge({ tone = 'neutral', children, dot = true }) {
  const map = {
    accent:  { bg: C.teal50, fg: C.teal700 },
    success: { bg: 'rgba(16,185,129,0.10)', fg: C.successFg },
    warning: { bg: 'rgba(245,158,11,0.14)', fg: C.warningFg },
    error:   { bg: 'rgba(239,68,68,0.10)', fg: C.errorFg },
    info:    { bg: 'rgba(59,130,246,0.10)', fg: C.infoFg },
    neutral: { bg: C.s100, fg: C.s700 },
  }[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, background: map.bg, color: map.fg,
      padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />}
      {children}
    </span>
  );
}

function Avatar({ name, size = 36, ring }) {
  const initials = name.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const colors = ['#153b6a', '#1d4a82', '#3a6ea5', '#ed8425', '#6c7884', '#2e7d52', '#0f2c50'];
  const bg = colors[(name.charCodeAt(0) + name.length) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 600, flexShrink: 0, letterSpacing: '-0.02em',
      boxShadow: ring ? `0 0 0 3px #fff, 0 0 0 4px ${C.s200}` : 'none',
    }}>{initials}</div>
  );
}

function SearchInput({ placeholder = 'Search…', value, onChange, style }) {
  return (
    <div style={{ position: 'relative', ...style }}>
      <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.s400, display: 'inline-flex' }}>
        <Icon name="search" size={16} />
      </span>
      <input value={value} onChange={e => onChange && onChange(e.target.value)} placeholder={placeholder}
        style={{
          width: '100%', padding: '9px 12px 9px 36px', borderRadius: 8, border: `1px solid ${C.s200}`,
          fontSize: 13, fontFamily: 'inherit', color: C.s900, background: '#fff', outline: 'none',
        }} />
    </div>
  );
}

// Eyebrow / section label (DAUST eyebrows are orange, all-caps, wide tracking)
function Eyebrow({ children, style }) {
  return <div style={{ fontFamily: C.body, fontSize: 12.5, fontWeight: 600, color: C.orange, letterSpacing: '0.14em', textTransform: 'uppercase', ...style }}>{children}</div>;
}

// Signature tri-dash (navy / orange / steel)
function TriDash({ w = 22, h = 4, gap = 5, style }) {
  const bar = c => <span style={{ display: 'block', width: w, height: h, borderRadius: 999, background: c }} />;
  return <div style={{ display: 'flex', gap, ...style }}>{bar(C.navy)}{bar(C.orange)}{bar(C.steel)}</div>;
}

// Progress / meter bar
function Meter({ value, max = 100, color = C.teal700, height = 8, track = C.s100 }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ width: '100%', height, background: track, borderRadius: 999, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999, transition: 'width 600ms cubic-bezier(0.16,1,0.3,1)' }} />
    </div>
  );
}

// The signature DAUST AI panel — navy-tinted with an orange accent mark
function AIPanel({ title = 'AI Optimizer', children, action, onAction, busy, style }) {
  return (
    <div style={{
      background: 'linear-gradient(150deg, #eef2f7 0%, #ffffff 60%)', border: `1px solid ${C.s200}`,
      borderRadius: 16, padding: 20, position: 'relative', overflow: 'hidden', ...style,
    }}>
      <div style={{ position: 'absolute', right: -30, top: -30, width: 140, height: 140, borderRadius: '50%', background: 'radial-gradient(circle, rgba(237,132,37,0.12), transparent 70%)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, position: 'relative' }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, background: C.gradOrange, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(237,132,37,0.3)' }}>
          <Icon name="sparkles" size={16} color="#fff" />
        </div>
        <div style={{ fontFamily: C.body, fontSize: 11.5, fontWeight: 700, color: C.navy, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{title}</div>
        {busy && <span style={{ marginLeft: 'auto', fontSize: 11, color: C.orange, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.orange, animation: 'daustPulse 1.2s ease-in-out infinite' }} />Computing…
        </span>}
      </div>
      <div style={{ position: 'relative' }}>{children}</div>
      {action && <Button variant="primary" size="sm" icon="wand-2" onClick={onAction} style={{ marginTop: 14 }}>{action}</Button>}
    </div>
  );
}

// Stat tile used in module headers
function StatTile({ label, value, unit, sub, tone = 'neutral' }) {
  const fg = { accent: C.navy, warning: C.warningFg, error: C.errorFg, info: C.infoFg, success: C.successFg, neutral: C.s900 }[tone];
  return (
    <div style={{ padding: '14px 16px', background: C.s50, borderRadius: 12, border: `1px solid ${C.s100}` }}>
      <div style={{ fontSize: 11, color: C.s500, fontWeight: 500 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
        <span style={{ fontFamily: C.display, fontSize: 26, fontWeight: 700, letterSpacing: '0.01em', color: fg }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: C.s400 }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.s500, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// Page header used by every module
function PageHeader({ eyebrow, title, desc, actions }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 24, flexWrap: 'wrap' }}>
      <div>
        {eyebrow && <Eyebrow style={{ marginBottom: 9 }}>{eyebrow}</Eyebrow>}
        <h1 style={{ fontFamily: C.display, fontSize: 32, fontWeight: 700, letterSpacing: '0.005em', color: C.navy, margin: 0 }}>{title}</h1>
        {desc && <p style={{ fontSize: 14, color: C.s500, margin: '10px 0 0', maxWidth: 640, lineHeight: 1.55 }}>{desc}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 10 }}>{actions}</div>}
    </div>
  );
}

// ---------- Sidebar nav ----------
const NAV = [
  { group: 'Overview', items: [
    { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
  ]},
  { group: 'Residential Life', items: [
    { id: 'housing', label: 'Housing & Residence', icon: 'building-2' },
    { id: 'roommate', label: 'Roommate Matching', icon: 'users' },
    { id: 'intl', label: 'International Support', icon: 'globe', count: 24 },
  ]},
  { group: 'Student Conduct', items: [
    { id: 'conduct', label: 'Conduct & Disputes', icon: 'gavel', count: 14, countTone: 'orange' },
  ]},
  { group: 'Engagement', items: [
    { id: 'clubs', label: 'Clubs & Orgs', icon: 'flag' },
    { id: 'events', label: 'Events & Programs', icon: 'calendar-days' },
    { id: 'budget', label: 'Co-curricular Budget', icon: 'wallet' },
    { id: 'abroad', label: 'Study Abroad & Internships', icon: 'plane' },
  ]},
];

function Sidebar({ view, setView }) {
  return (
    <aside style={{
      width: 268, flexShrink: 0, background: 'linear-gradient(180deg, #153b6a 0%, #0f2c50 100%)',
      height: '100vh', position: 'sticky', top: 0, display: 'flex', flexDirection: 'column',
      overflowY: 'auto',
    }}>
      {/* brand lockup */}
      <div style={{ padding: '24px 22px 18px' }}>
        <div style={{ fontFamily: C.display, fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: '0.02em', lineHeight: 1 }}>DAUST</div>
        <TriDash w={18} h={3.5} style={{ marginTop: 9, marginBottom: 9, marginLeft: 1 }} />
        <div style={{ fontSize: 10.5, color: '#8595ad', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Student Affairs</div>
      </div>

      <nav style={{ padding: '6px 14px', flex: 1 }}>
        {NAV.map(g => (
          <div key={g.group} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#5e6f8c', letterSpacing: '0.16em', textTransform: 'uppercase', padding: '0 10px 10px' }}>{g.group}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {g.items.map(it => {
                const active = view === it.id;
                return (
                  <button key={it.id} onClick={() => setView(it.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                      padding: '10px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: active ? 'rgba(255,255,255,0.10)' : 'transparent',
                      color: active ? '#fff' : '#aeb9ca', fontFamily: C.body,
                      fontSize: 13.5, fontWeight: active ? 700 : 500,
                      boxShadow: active ? `inset 3px 0 0 ${C.orange}` : 'none',
                      transition: 'all 160ms cubic-bezier(0.2,0.7,0.3,1)',
                    }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#fff'; } }}
                    onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#aeb9ca'; } }}>
                    <Icon name={it.icon} size={18} color={active ? '#fff' : '#8595ad'} />
                    <span style={{ flex: 1 }}>{it.label}</span>
                    {it.count != null && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999,
                        background: it.countTone === 'orange' ? C.orange : 'rgba(255,255,255,0.12)',
                        color: '#fff',
                      }}>{it.count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* user */}
      <div style={{ padding: '14px 16px', margin: '0 10px 12px', borderTop: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', gap: 11 }}>
        <Avatar name="Awa Faye" size={38} />
        <div style={{ lineHeight: 1.25, flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Dr. Awa Faye</div>
          <div style={{ fontSize: 11, color: '#8595ad', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Dean of Student Affairs</div>
        </div>
        <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#8595ad', display: 'inline-flex', padding: 4 }}
          onMouseEnter={e => e.currentTarget.style.color = '#fff'} onMouseLeave={e => e.currentTarget.style.color = '#8595ad'}>
          <Icon name="log-out" size={17} />
        </button>
      </div>
    </aside>
  );
}

function Topbar({ title }) {
  return (
    <div style={{
      height: 64, borderBottom: `1px solid ${C.s200}`, background: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(16px)', position: 'sticky', top: 0, zIndex: 20,
      display: 'flex', alignItems: 'center', gap: 16, padding: '0 32px',
    }}>
      <SearchInput placeholder="Search students, rooms, cases, events…" style={{ width: 360 }} />
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: C.s500, fontFamily: 'IBM Plex Mono, monospace' }}>Spring 2026 · Term 2</span>
        <button style={{ width: 38, height: 38, borderRadius: 999, border: `1px solid ${C.s200}`, background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: C.s500, position: 'relative' }}>
          <Icon name="bell" size={17} />
          <span style={{ position: 'absolute', top: 8, right: 9, width: 7, height: 7, borderRadius: '50%', background: C.error, border: '1.5px solid #fff' }} />
        </button>
      </div>
    </div>
  );
}

Object.assign(window, {
  C, Icon, Button, Card, Badge, Avatar, SearchInput, Eyebrow, Meter,
  AIPanel, StatTile, PageHeader, Sidebar, Topbar, NAV,
});
