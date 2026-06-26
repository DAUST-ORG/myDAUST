/* MyDAUST — shared UI primitives. Inline stroke icons (Lucide-style),
   tri-dash motif, QR generator, cards, buttons. All on window. */

// ── Icon set: clean stroke icons, currentColor, 24px grid ─────
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 9.5h18"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M20 14v.01M14 20h3M20 17v4"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M4 12h16"/>',
  cap: '<path d="M22 9 12 5 2 9l10 4 10-4z"/><path d="M6 10.6V16c0 1.1 2.7 2.4 6 2.4s6-1.3 6-2.4v-5.4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  bell: '<path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5z"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/>',
  file: '<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 2.5V8h5.5"/><path d="M8.5 13h7M8.5 16.5h5"/>',
  pin: '<path d="M20 10.5c0 5.5-8 11-8 11s-8-5.5-8-11a8 8 0 0 1 16 0z"/><circle cx="12" cy="10.5" r="2.8"/>',
  book: '<path d="M12 6.5v14"/><path d="M3 5.2C5 4.3 9 4.3 12 6c3-1.7 7-1.7 9-.8v13.6c-2-.9-6-.9-9 .8-3-1.7-7-1.7-9-.8z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.3 1.9"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowUR: '<path d="M7 17 17 7M8 7h9v9"/>',
  chevR: '<path d="M9 6l6 6-6 6"/>',
  chevL: '<path d="M15 6l-6 6 6 6"/>',
  chevD: '<path d="M6 9.5l6 6 6-6"/>',
  check: '<path d="M20 6.5 9 17.5l-5-5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20.5c0-3.9 3.6-6 8-6s8 2.1 8 6"/>',
  receipt: '<path d="M4.5 2.5v19l2.2-1.1 2.1 1.1 2.2-1.1 2.1 1.1 2.2-1.1 2.2 1.1v-19l-2.2 1.1L15.2 2.5 13 3.6 10.9 2.5 8.7 3.6z"/><path d="M8 8h8M8 11.5h8M8 15h5"/>',
  wallet: '<path d="M3 7.5a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1V8"/><rect x="3" y="7.5" width="18" height="12" rx="2.5"/><path d="M16.5 13.5h.01"/>',
  trophy: '<path d="M8 4h8v4.5a4 4 0 0 1-8 0z"/><path d="M8 5.5H5.5a2 2 0 0 0 0 4H7M16 5.5h2.5a2 2 0 0 1 0 4H17M12 12.5v3.5M9 20h6M9.5 20l.5-4M14.5 20l-.5-4"/>',
  users: '<circle cx="9" cy="8" r="3.4"/><path d="M3 20c0-3.4 2.9-5.3 6-5.3s6 1.9 6 5.3"/><path d="M16 5.2a3.4 3.4 0 0 1 0 6.4M21 20c0-2.6-1.5-4.4-3.6-5"/>',
  briefcase: '<rect x="2.5" y="7" width="19" height="13" rx="2.5"/><path d="M8 7V5.5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2V7"/><path d="M2.5 12.5h19"/>',
  flask: '<path d="M9 3h6M14 3v6.3l5 8.4a1.4 1.4 0 0 1-1.2 2.1H6.2A1.4 1.4 0 0 1 5 17.7L10 9.3V3"/><path d="M7.5 14h9"/>',
  shield: '<path d="M12 2.5l8 2.8v6.2c0 5-4 7.8-8 9.5-4-1.7-8-4.5-8-9.5V5.3z"/><path d="M9 12l2 2 4-4"/>',
  download: '<path d="M12 3.5v12M7.5 11l4.5 4.5 4.5-4.5"/><path d="M5 20.5h14"/>',
  mail: '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="M3 6.5l9 6.2 9-6.2"/>',
  phone: '<path d="M6.5 3.5h-2A1.5 1.5 0 0 0 3 5.2C3 13.4 10.6 21 18.8 21a1.5 1.5 0 0 0 1.7-1.5v-2a1 1 0 0 0-.8-1l-3.3-.7a1 1 0 0 0-1 .4l-.9 1.2a13 13 0 0 1-5.6-5.6l1.2-.9a1 1 0 0 0 .4-1l-.7-3.3a1 1 0 0 0-1-.8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  sparkles: '<path d="M12 3.5l1.6 4.4L18 9.5l-4.4 1.6L12 15.5l-1.6-4.4L6 9.5l4.4-1.6z"/><path d="M19 14.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  building: '<rect x="4" y="2.5" width="16" height="19" rx="1.5"/><path d="M8 6.5h2M14 6.5h2M8 10h2M14 10h2M8 13.5h2M14 13.5h2M10 21.5v-4h4v4"/>',
  star: '<path d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.4l5.9-.8z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3"/>',
  logout: '<path d="M16 17l5-5-5-5M21 12H9"/><path d="M12 4.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h6"/>',
  badge: '<path d="M12 2.5l2.3 1.7 2.9-.1.9 2.7 2.3 1.7-.9 2.7.9 2.7-2.3 1.7-.9 2.7-2.9-.1L12 21.5l-2.3-1.6-2.9.1-.9-2.7L3.6 15.6l.9-2.7-.9-2.7 2.3-1.7.9-2.7 2.9.1z"/><path d="M9 12l2 2 4-4"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8 16a5.5 5.5 0 0 1 8 0"/><circle cx="12" cy="19.5" r="1"/>',
  utensils: '<path d="M4 3v6.5a2 2 0 0 0 4 0V3M6 9.5V21M16.5 3c-1.4 0-2.5 2.2-2.5 5s1.1 4.5 2.5 4.5V21"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14 4.5L20 16M20 20v-4h-4"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l9 5V5L6 10H4a1 1 0 0 0-1 1z"/><path d="M18 8a4 4 0 0 1 0 8"/>',
  bookmark: '<path d="M6 4.5a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 18 4.5V21l-6-4-6 4z"/>',
  map: '<path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4z"/><path d="M9 4v13M15 6.5v13"/>',
  lightbulb: '<path d="M9 18h6M10 21.5h4M12 2.5a6.5 6.5 0 0 0-4 11.6c.6.5 1 1.2 1 2V17h6v-.9c0-.8.4-1.5 1-2A6.5 6.5 0 0 0 12 2.5z"/>',
  send: '<path d="M21 3 10.5 13.5M21 3l-6.5 18-4-8-8-4z"/>',
  clipboard: '<rect x="8" y="3.5" width="8" height="4" rx="1.4"/><path d="M9 5.5H6.5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-12a2 2 0 0 0-2-2H15M8.5 12h7M8.5 16h5"/>',
  folder: '<path d="M3 7.5a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  video: '<rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="M15.5 10l6-3.5v11l-6-3.5z"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l6 3.5-6 3.5z" fill="currentColor"/>',
  pencil: '<path d="M16.5 3.5l4 4L8 20l-4.5 1 1-4.5z"/><path d="M14 6l4 4"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16h.01"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  inbox: '<path d="M4 13l2.5-8h11L20 13M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6M4 13h5l1.5 2.5h3L18 13h2"/>',
};

function Icon({ name, size = 22, color = 'currentColor', strokeWidth = 1.9, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block', flexShrink: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: ICONS[name] || '' }} />
  );
}

// ── Tri-dash motif (navy / orange / steel) ────────────────────
function TriDash({ w = 26, h = 4, gap = 6, style }) {
  const C = ['var(--daust-navy)', 'var(--daust-orange)', 'var(--daust-steel)'];
  return (
    <div style={{ display: 'flex', gap, ...style }}>
      {C.map((c, i) => <span key={i} style={{ display: 'block', width: w, height: h, borderRadius: 999, background: c }} />)}
    </div>
  );
}

// ── Eyebrow ───────────────────────────────────────────────────
function Eyebrow({ children, color = 'var(--daust-orange)', style }) {
  return (
    <div style={{
      fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 11.5,
      letterSpacing: '.14em', textTransform: 'uppercase', color, ...style,
    }}>{children}</div>
  );
}

// ── Card surface ──────────────────────────────────────────────
function Card({ children, style, onClick, pad = 16, navy = false }) {
  return (
    <div onClick={onClick} style={{
      background: navy ? 'var(--daust-navy)' : 'var(--surface)',
      borderRadius: 18, padding: pad,
      boxShadow: navy ? 'var(--shadow-navy)' : 'var(--shadow-sm)',
      border: navy ? 'none' : '1px solid var(--border)',
      color: navy ? 'var(--fg-on-navy)' : 'var(--fg1)',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'transform .16s ease, box-shadow .16s ease',
      ...style,
    }}>{children}</div>
  );
}

// ── Pill button ───────────────────────────────────────────────
function Button({ children, variant = 'primary', size = 'md', onClick, full, style }) {
  const [h, setH] = React.useState(false);
  const sizes = { sm: '8px 16px', md: '12px 22px', lg: '15px 28px' };
  const base = {
    fontFamily: 'var(--font-body)', fontWeight: 600,
    fontSize: size === 'sm' ? 13 : 14.5, letterSpacing: '.02em',
    border: 'none', borderRadius: 999, padding: sizes[size], cursor: 'pointer',
    transition: 'all .16s ease', display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', gap: 8, width: full ? '100%' : undefined,
  };
  const V = {
    primary: { background: h ? 'var(--daust-orange-600)' : 'var(--daust-orange)', color: '#fff' },
    navy: { background: h ? 'var(--daust-navy-700)' : 'var(--daust-navy)', color: '#fff' },
    outline: { background: h ? 'var(--daust-navy)' : 'transparent', color: h ? '#fff' : 'var(--daust-navy)', boxShadow: 'inset 0 0 0 1.5px var(--daust-navy)' },
    light: { background: h ? '#fff' : 'rgba(255,255,255,.14)', color: h ? 'var(--daust-navy)' : '#fff', boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.5)' },
    soft: { background: h ? 'var(--gray-100)' : 'var(--bg-subtle)', color: 'var(--daust-navy)' },
  };
  return (
    <button style={{ ...base, ...V[variant], ...style }}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onClick={onClick}>
      {children}
    </button>
  );
}

// ── Badge / chip ──────────────────────────────────────────────
function Badge({ children, tone = 'navy', style }) {
  const tones = {
    navy: { bg: 'rgba(21,59,106,.08)', fg: 'var(--daust-navy)' },
    orange: { bg: 'rgba(237,132,37,.12)', fg: 'var(--daust-orange-600)' },
    steel: { bg: 'rgba(157,166,174,.18)', fg: 'var(--fg2)' },
    success: { bg: 'rgba(46,125,82,.12)', fg: 'var(--success)' },
    onNavy: { bg: 'rgba(255,255,255,.16)', fg: '#fff' },
  };
  const t = tones[tone] || tones.navy;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: t.bg, color: t.fg, fontFamily: 'var(--font-body)',
      fontWeight: 600, fontSize: 11, letterSpacing: '.04em',
      padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap', ...style,
    }}>{children}</span>
  );
}

// ── Avatar ────────────────────────────────────────────────────
function Avatar({ initials, size = 44, ring = false }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 999, flexShrink: 0,
      background: 'linear-gradient(150deg, var(--daust-navy-700), var(--daust-navy-deep))',
      color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 600,
      fontSize: size * 0.36, letterSpacing: '.02em',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: ring ? '0 0 0 3px rgba(255,255,255,.9), 0 0 0 4.5px var(--daust-orange)' : 'none',
    }}>{initials}</div>
  );
}

// ── Faux QR code (deterministic; placeholder for a real QR) ───
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0);
}
function QRCode({ size = 200, value = 'DAUST', fg = '#0f2c50', bg = '#fff', pad = 0 }) {
  const N = 29;
  const cells = [];
  let s = hashSeed(value);
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const inFinder = (r, c) => (
    (r < 8 && c < 8) || (r < 8 && c >= N - 8) || (r >= N - 8 && c < 8)
  );
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (inFinder(r, c)) continue;
      if (rnd() > 0.52) cells.push(<rect key={r + '-' + c} x={c} y={r} width="1" height="1" fill={fg} />);
    }
  }
  // finder pattern (7x7) drawn at a corner origin
  const finder = (ox, oy) => (
    <g key={ox + '_' + oy}>
      <rect x={ox} y={oy} width="7" height="7" fill={fg} />
      <rect x={ox + 1} y={oy + 1} width="5" height="5" fill={bg} />
      <rect x={ox + 2} y={oy + 2} width="3" height="3" fill={fg} />
    </g>
  );
  return (
    <svg width={size} height={size} viewBox={`-${pad} -${pad} ${N + pad * 2} ${N + pad * 2}`}
      shapeRendering="crispEdges" style={{ display: 'block', borderRadius: 6 }}>
      <rect x={-pad} y={-pad} width={N + pad * 2} height={N + pad * 2} fill={bg} />
      {cells}
      {finder(0, 0)}
      {finder(N - 7, 0)}
      {finder(0, N - 7)}
    </svg>
  );
}

// ── Progress ring ─────────────────────────────────────────────
function Ring({ value = 0, max = 4, size = 64, stroke = 6, color = 'var(--daust-orange)', track = 'var(--gray-200)', children }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.2,.7,.3,1)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center' }}>{children}</div>
    </div>
  );
}

// Course accent color helper
function courseColor(c) {
  return c === 'orange' ? 'var(--daust-orange)' : c === 'steel' ? 'var(--daust-steel)' : 'var(--daust-navy)';
}

Object.assign(window, {
  Icon, ICONS, TriDash, Eyebrow, Card, Button, Badge, Avatar, QRCode, Ring, courseColor,
});
