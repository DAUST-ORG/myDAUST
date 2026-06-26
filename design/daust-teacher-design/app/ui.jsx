// ── Lucide-style inline stroke icons (24px grid) ──────────────
const ICON_PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  message: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h0a2 2 0 0 0 2-2V2M5 2v20M16 2c-1.7 0-3 2-3 5s1.3 5 3 5v10"/>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-3a2 2 0 0 1 0-4h4"/><path d="M3 5v14a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5a2.12 2.12 0 0 0-3-3L13 8 4.8 6.2a1 1 0 0 0-.9 1.7l4.6 3.1-2.1 2.1-1.6-.4a1 1 0 0 0-1 1.6l2 2 2 2a1 1 0 0 0 1.6-1l-.4-1.6 2.1-2.1 3.1 4.6a1 1 0 0 0 1.7-.9z"/>',
  door: '<path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M2 22h20M14 22h6V8a2 2 0 0 0-2-2h-4"/><circle cx="11" cy="12" r="1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chevR: '<path d="m9 6 6 6-6 6"/>',
  chevL: '<path d="m15 6-6 6 6 6"/>',
  chevDown: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  mapPin: '<path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
  arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  flask: '<path d="M9 3h6M10 3v6.5L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9.5V3"/><path d="M7 14h10"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M17.7 6.3l-2.4 2.4M8.7 15.3l-2.4 2.4"/>',
  trend: '<path d="M22 7 13.5 15.5l-4-4L2 19"/><path d="M16 7h6v6"/>',
};

function Icon({ name, size = 22, color = 'currentColor', stroke = 2, style = {} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, display: 'block', ...style }}
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] || '' }} />
  );
}

// ── Shared primitives ─────────────────────────────────────────
const NAVY = '#153b6a', ORANGE = '#ed8425', STEEL = '#9da6ae';

function Eyebrow({ children, color = ORANGE, style = {} }) {
  return <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color, ...style }}>{children}</div>;
}

function Card({ children, style = {}, onClick, pad = 16 }) {
  const [press, setPress] = React.useState(false);
  return (
    <div onClick={onClick}
      onPointerDown={() => onClick && setPress(true)}
      onPointerUp={() => setPress(false)}
      onPointerLeave={() => setPress(false)}
      style={{
        background: '#fff', borderRadius: 14, padding: pad,
        border: '1px solid #e9edf2',
        boxShadow: '0 1px 2px rgba(15,44,80,.05)',
        cursor: onClick ? 'pointer' : 'default',
        transform: press ? 'scale(0.985)' : 'scale(1)',
        transition: 'transform .12s cubic-bezier(.2,.7,.3,1), box-shadow .15s',
        ...style,
      }}>{children}</div>
  );
}

function Avatar({ initials, color = NAVY, size = 40, ring = false }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: color, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Saira, sans-serif', fontWeight: 600, fontSize: size * 0.36,
      letterSpacing: '0.02em',
      boxShadow: ring ? `0 0 0 3px #fff, 0 0 0 5px ${color}22` : 'none',
    }}>{initials}</div>
  );
}

function Badge({ children, tone = 'navy', style = {} }) {
  const map = {
    navy: ['#eaf0f8', '#153b6a'], orange: ['#fdeede', '#c4660f'],
    green: ['#e5f3ec', '#1f6e46'], gray: ['#eef1f5', '#4d5965'],
    red: ['#fbeae8', '#a8302444'.slice(0, 7)],
  };
  const [bg, fg] = map[tone] || map.navy;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: bg, color: fg, fontFamily: 'Montserrat, sans-serif',
      fontWeight: 600, fontSize: 11, letterSpacing: '0.02em',
      padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap', ...style,
    }}>{children}</span>
  );
}

// Tri-dash brand motif
function TriDash({ w = 22, gap = 4 }) {
  const seg = { height: 3, borderRadius: 2, width: w };
  return (
    <div style={{ display: 'flex', gap }}>
      <div style={{ ...seg, background: NAVY }} />
      <div style={{ ...seg, background: ORANGE }} />
      <div style={{ ...seg, background: STEEL }} />
    </div>
  );
}

// Section header inside a screen
function SectionTitle({ children, action, onAction }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '4px 2px 10px' }}>
      <h3 style={{ margin: 0, fontFamily: 'Saira, sans-serif', fontWeight: 600, fontSize: 18, color: '#141a21', letterSpacing: '0.01em' }}>{children}</h3>
      {action && <button onClick={onAction} style={{ border: 'none', background: 'none', color: NAVY, fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: 0 }}>{action}</button>}
    </div>
  );
}

// Circular progress ring
function Ring({ value, size = 44, stroke = 4, color = NAVY, label }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e9edf2" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} strokeLinecap="round" />
      </svg>
      {label && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: size * 0.26, color: '#141a21' }}>{label}</div>}
    </div>
  );
}

Object.assign(window, { Icon, Eyebrow, Card, Avatar, Badge, TriDash, SectionTitle, Ring, NAVY, ORANGE, STEEL });
