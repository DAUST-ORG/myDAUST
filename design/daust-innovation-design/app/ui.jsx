/* DAUST Innovation Tracker — shared UI primitives.
   Exposes components on window for cross-file Babel scope. */

const T = {
  navy: '#153b6a', navyDeep: '#0f2c50', navy700: '#1d4a82',
  orange: '#ed8425', orange600: '#d6731a', steel: '#9da6ae',
  white: '#fff', bg: '#fff', subtle: '#f5f7f9',
  border: '#d7dee6', borderStrong: '#bcc6d1',
  fg1: '#141a21', fg2: '#4d5965', fg3: '#6c7884',
  g50: '#f5f7f9', g100: '#e9edf2', g200: '#d7dee6', g300: '#bcc6d1', g400: '#9da6ae',
  success: '#2e7d52', warning: '#ed8425', danger: '#c0392b', info: '#1d4a82',
  display: "'Saira', system-ui, sans-serif",
  body: "'Montserrat', system-ui, sans-serif",
  shadowSm: '0 1px 2px rgba(15,44,80,.08)',
  shadowMd: '0 4px 14px rgba(15,44,80,.10)',
  shadowLg: '0 14px 40px rgba(15,44,80,.16)',
};

// Re-run lucide after DOM updates (no-op kept for compatibility)
function useLucide(dep) {}

// kebab-case -> PascalCase for lucide's named icon exports
function _pascal(name) { return name.split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(''); }
// Icon renders an SVG imperatively into a span React never reconciles into,
// so lucide never mutates React-owned DOM (which would crash on re-render).
function Icon({ name, size = 18, color, strokeWidth = 2, style }) {
  const ref = React.useRef(null);
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el || !window.lucide) return;
    const node = window.lucide[_pascal(name)] || (window.lucide.icons && window.lucide.icons[_pascal(name)]);
    el.innerHTML = '';
    if (!node) return;
    try {
      const svg = window.lucide.createElement(node);
      svg.setAttribute('width', size); svg.setAttribute('height', size);
      svg.setAttribute('stroke-width', strokeWidth);
      if (color) svg.setAttribute('stroke', color);
      svg.style.display = 'block';
      el.appendChild(svg);
    } catch (e) { /* ignore unknown icon */ }
  }, [name, size, color, strokeWidth]);
  return <span ref={ref} className={name === 'loader' ? 'spin-icon' : undefined}
    style={{ display: 'inline-flex', width: size, height: size, color, flexShrink: 0, ...style }} />;
}

// ---------- Eyebrow ----------
function Eyebrow({ children, color = T.orange, style }) {
  return <div style={{ fontFamily: T.body, fontWeight: 700, fontSize: 12, letterSpacing: '.14em',
    textTransform: 'uppercase', color, ...style }}>{children}</div>;
}

// ---------- Tri-dash motif ----------
function TriDash({ w = 26, h = 4, gap = 6, style }) {
  const bar = (c) => <span style={{ display: 'block', width: w, height: h, borderRadius: 999, background: c }} />;
  return <div style={{ display: 'flex', gap, ...style }}>{bar(T.navy)}{bar(T.orange)}{bar(T.steel)}</div>;
}

// ---------- Card ----------
function Card({ children, style, pad = 20, onClick, hoverable }) {
  const [h, setH] = React.useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, padding: pad,
        boxShadow: hoverable && h ? T.shadowMd : T.shadowSm,
        transition: 'box-shadow .16s ease, transform .16s ease',
        transform: hoverable && h ? 'translateY(-2px)' : 'none',
        cursor: onClick ? 'pointer' : 'default', ...style }}>
      {children}
    </div>
  );
}

// ---------- Button ----------
function Button({ children, variant = 'primary', size = 'md', onClick, style, disabled, icon }) {
  const [h, setH] = React.useState(false);
  const sizes = { sm: '7px 14px', md: '10px 20px', lg: '13px 28px' };
  const fs = { sm: 13, md: 14, lg: 15 };
  const base = { fontFamily: T.body, fontWeight: 600, fontSize: fs[size], letterSpacing: '.02em',
    border: 'none', borderRadius: 999, padding: sizes[size], cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all .15s ease', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: 7, opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap' };
  const vs = {
    primary: { background: h ? T.orange600 : T.orange, color: '#fff' },
    navy: { background: h ? T.navy700 : T.navy, color: '#fff' },
    outline: { background: h ? T.navy : 'transparent', color: h ? '#fff' : T.navy, boxShadow: `inset 0 0 0 1.5px ${T.navy}` },
    subtle: { background: h ? T.g100 : T.g50, color: T.fg1, boxShadow: `inset 0 0 0 1px ${T.border}` },
    ghost: { background: h ? T.g50 : 'transparent', color: T.fg2 },
    danger: { background: h ? '#a8342a' : 'transparent', color: h ? '#fff' : T.danger, boxShadow: `inset 0 0 0 1.5px ${T.danger}` },
    success: { background: h ? '#256b45' : T.success, color: '#fff' },
  };
  return (
    <button disabled={disabled} onClick={onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ ...base, ...vs[variant], ...style }}>
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 16} />}{children}
    </button>
  );
}

// ---------- Status / health config ----------
const HEALTH = {
  'on-track': { label: 'On track', fg: '#1f5c3d', bg: '#e7f2ec', dot: T.success },
  'at-risk':  { label: 'At risk',  fg: '#9a4f15', bg: '#fdf0e1', dot: T.orange },
  'behind':   { label: 'Behind',   fg: '#8f2a20', bg: '#fbe9e7', dot: T.danger },
};
function HealthBadge({ value, size = 'md' }) {
  const c = HEALTH[value] || HEALTH['on-track'];
  const pad = size === 'sm' ? '3px 9px 3px 8px' : '5px 12px 5px 10px';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: pad,
      borderRadius: 999, background: c.bg, color: c.fg, fontFamily: T.body, fontWeight: 600,
      fontSize: size === 'sm' ? 11.5 : 12.5, letterSpacing: '.02em' }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: c.dot }} />{c.label}
    </span>
  );
}

const TASK_STATUS = {
  approved:     { label: 'Approved',    fg: '#1f5c3d', bg: '#e7f2ec', icon: 'check-check' },
  done:         { label: 'Done',        fg: '#1f5c3d', bg: '#e7f2ec', icon: 'check' },
  submitted:    { label: 'In review',   fg: '#264a7a', bg: '#e7eefa', icon: 'clock' },
  'in-progress':{ label: 'In progress', fg: '#9a4f15', bg: '#fdf0e1', icon: 'loader' },
  overdue:      { label: 'Overdue',     fg: '#8f2a20', bg: '#fbe9e7', icon: 'alert-triangle' },
  pending:      { label: 'Not started', fg: '#4d5965', bg: '#eef1f5', icon: 'circle' },
  rejected:     { label: 'Changes requested', fg: '#8f2a20', bg: '#fbe9e7', icon: 'rotate-ccw' },
};
function StatusPill({ status, size = 'md' }) {
  const c = TASK_STATUS[status] || TASK_STATUS.pending;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: size === 'sm' ? '3px 9px' : '4px 11px', borderRadius: 999, background: c.bg, color: c.fg,
      fontFamily: T.body, fontWeight: 600, fontSize: size === 'sm' ? 11 : 12, whiteSpace: 'nowrap' }}>
      <Icon name={c.icon} size={size === 'sm' ? 12 : 13} />{c.label}
    </span>
  );
}

// generic capsule tag
function Tag({ children, tone = 'neutral', style }) {
  const tones = {
    neutral: { bg: T.g100, fg: T.fg2 }, navy: { bg: T.navy, fg: '#fff' },
    orange: { bg: T.orange, fg: '#fff' }, outline: { bg: 'transparent', fg: T.navy, bd: T.border },
  };
  const c = tones[tone];
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 11px',
    borderRadius: 999, background: c.bg, color: c.fg, boxShadow: c.bd ? `inset 0 0 0 1px ${c.bd}` : 'none',
    fontFamily: T.body, fontWeight: 600, fontSize: 12, letterSpacing: '.02em', ...style }}>{children}</span>;
}

// ---------- Avatars ----------
function initials(name) { return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase(); }
function avatarColor(name) {
  const palette = [T.navy, T.navy700, '#2e6a8f', '#3a5a8c', '#1f5c3d', '#7a4f93', '#9a4f15', '#345b70'];
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
function Avatar({ name, size = 34, ring }) {
  return (
    <div title={name} style={{ width: size, height: size, borderRadius: 999, flexShrink: 0,
      background: avatarColor(name), color: '#fff', display: 'inline-flex', alignItems: 'center',
      justifyContent: 'center', fontFamily: T.body, fontWeight: 600, fontSize: size * 0.38,
      boxShadow: ring ? `0 0 0 2px #fff, 0 0 0 3px ${T.border}` : 'none' }}>
      {initials(name)}
    </div>
  );
}
function AvatarStack({ names, size = 30, max = 4 }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {shown.map((n, i) => (
        <div key={i} style={{ marginLeft: i ? -size * 0.32 : 0, boxShadow: '0 0 0 2px #fff', borderRadius: 999 }}>
          <Avatar name={n} size={size} />
        </div>
      ))}
      {extra > 0 && (
        <div style={{ marginLeft: -size * 0.32, width: size, height: size, borderRadius: 999, background: T.g100,
          color: T.fg2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: T.body, fontWeight: 600, fontSize: size * 0.34, boxShadow: '0 0 0 2px #fff' }}>+{extra}</div>
      )}
    </div>
  );
}

// ---------- Progress visualizers (driven by the Tweak) ----------
function ProgressBar({ pct, h = 8, showLabel, color = T.navy }) {
  return (
    <div style={{ width: '100%' }}>
      <div style={{ width: '100%', height: h, borderRadius: 999, background: T.g100, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999,
          background: color, transition: 'width .4s cubic-bezier(.2,.7,.3,1)' }} />
      </div>
      {showLabel && <div style={{ marginTop: 5, fontFamily: T.body, fontSize: 12, color: T.fg3 }}>{pct}% complete</div>}
    </div>
  );
}
function ProgressRing({ pct, size = 56, stroke = 6, color = T.navy }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={T.g100} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokelinecap="round" strokeDasharray={c} strokeDashoffset={off}
          style={{ transition: 'stroke-dashoffset .5s cubic-bezier(.2,.7,.3,1)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: T.display, fontWeight: 700, fontSize: size * 0.28, color: T.fg1 }}>{pct}<span style={{ fontSize: size * 0.16 }}>%</span></div>
    </div>
  );
}
// Segmented = the 7 phases as capsule segments
function ProgressSegments({ project, h = 9, gap = 4, withLabels }) {
  const { PHASES, phaseIndex } = window.DAUST_DATA;
  const cur = phaseIndex(project.current);
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', gap }}>
        {PHASES.map((ph, i) => {
          const done = i < cur, current = i === cur;
          return <div key={ph.id} title={ph.name} style={{ flex: 1, height: h, borderRadius: 999,
            background: done ? T.navy : current ? T.orange : T.g100,
            transition: 'background .3s ease' }} />;
        })}
      </div>
      {withLabels && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6,
          fontFamily: T.body, fontSize: 10.5, color: T.fg3, letterSpacing: '.02em' }}>
          <span>{PHASES[0].name}</span><span style={{ color: T.orange, fontWeight: 600 }}>{PHASES[cur].name}</span><span>{PHASES[6].name}</span>
        </div>
      )}
    </div>
  );
}
// Unified progress component switched by tweak `progressStyle`
function Progress({ project, style = 'bar', size = 'md' }) {
  const color = project.health === 'behind' ? T.danger : project.health === 'at-risk' ? T.orange : T.navy;
  if (style === 'ring') return <ProgressRing pct={project.pct} size={size === 'sm' ? 44 : 56} color={color} />;
  if (style === 'segments') return <ProgressSegments project={project} h={size === 'sm' ? 7 : 9} />;
  if (style === 'steps') {
    const { PHASES, phaseIndex } = window.DAUST_DATA;
    return <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: size === 'sm' ? 15 : 17, color: T.fg1 }}>
      {phaseIndex(project.current) + 1}<span style={{ color: T.fg3, fontWeight: 500 }}> / {PHASES.length} phases</span></div>;
  }
  return <ProgressBar pct={project.pct} h={size === 'sm' ? 7 : 9} color={color} />;
}

window.DAUST_UI = {
  T, useLucide, Icon, Eyebrow, TriDash, Card, Button, HealthBadge, HEALTH,
  StatusPill, TASK_STATUS, Tag, Avatar, AvatarStack, initials, avatarColor,
  ProgressBar, ProgressRing, ProgressSegments, Progress,
};
Object.assign(window, window.DAUST_UI);
