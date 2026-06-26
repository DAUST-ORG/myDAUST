// ============================================================
// DAUST Admin — shared component atoms + SVG charts
// All exported to window at the bottom for cross-file use.
// ============================================================
const { useState, useEffect, useRef, useMemo } = React;

// ---- Icon (Lucide wrapper) ----
function Icon({ name, size = 18, strokeWidth = 1.75, style, className }) {
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
  return <span ref={ref} className={className} style={{ display: 'inline-flex', lineHeight: 0, ...style }} />;
}

// ---- Button ----
function Button({ variant = 'primary', size = 'md', children, icon, iconRight, onClick, style, title, disabled }) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const palettes = {
    primary:   { background: 'var(--cta)', color: '#fff', border: '1px solid transparent', hover: 'var(--cta-hover)' },
    secondary: { background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid transparent', hover: 'var(--bg-tint)' },
    outline:   { background: 'var(--surface)', color: 'var(--fg-muted)', border: '1px solid var(--border-strong)', hover: 'var(--bg-subtle)' },
    ghost:     { background: 'transparent', color: 'var(--fg-subtle)', border: '1px solid transparent', hover: 'var(--bg-subtle)' },
    danger:    { background: 'var(--surface)', color: 'var(--error-500)', border: '1px solid var(--border-strong)', hover: 'rgba(239,68,68,0.08)' },
  };
  const p = palettes[variant];
  const sizes = { sm: { padding: '6px 12px', fontSize: 12.5 }, md: { padding: '9px 16px', fontSize: 13.5 }, lg: { padding: '12px 22px', fontSize: 15 } }[size];
  return (
    <button onClick={disabled ? undefined : onClick} title={title}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)} onMouseUp={() => setPress(false)}
      style={{
        ...sizes, background: hover && !disabled ? p.hover : p.background, color: p.color, border: p.border,
        borderRadius: 'var(--radius-pill)', fontWeight: 600, fontFamily: 'var(--font-sans)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap',
        transform: press && !disabled ? 'scale(0.98)' : 'none',
        transition: 'all var(--dur-fast) var(--ease-standard)', ...style,
      }}>
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 14 : 16} />}
    </button>
  );
}

// ---- IconButton ----
function IconButton({ name, onClick, title, size = 18, badge, active }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} title={title} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ position: 'relative', width: 38, height: 38, borderRadius: '50%', border: 'none',
        background: hover || active ? 'var(--bg-subtle)' : 'transparent', color: active ? 'var(--accent)' : 'var(--fg-subtle)',
        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background var(--dur-base) var(--ease-standard)' }}>
      <Icon name={name} size={size} />
      {badge ? <span style={{ position: 'absolute', top: 6, right: 6, minWidth: 16, height: 16, padding: '0 4px',
        borderRadius: 999, background: 'var(--error-500)', color: '#fff', fontSize: 10, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--surface)' }}>{badge}</span> : null}
    </button>
  );
}

// ---- Card ----
function Card({ children, style, padding = 20, hover = false, onClick }) {
  const [h, setH] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      className={hover ? 'lift' : ''}
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        padding, boxShadow: hover && h ? 'var(--shadow-lg)' : 'var(--shadow-xs)', cursor: onClick ? 'pointer' : 'default', ...style }}>
      {children}
    </div>
  );
}

// ---- Badge / Pill ----
function Badge({ tone = 'neutral', children, dot = true, size = 'md' }) {
  const map = {
    teal:    { bg: 'var(--accent-bg)', fg: 'var(--accent)' },
    success: { bg: 'rgba(16,185,129,0.12)', fg: '#059669' },
    warning: { bg: 'rgba(245,158,11,0.14)', fg: '#B45309' },
    error:   { bg: 'rgba(239,68,68,0.12)', fg: '#B91C1C' },
    info:    { bg: 'rgba(59,130,246,0.12)', fg: '#1D4ED8' },
    neutral: { bg: 'var(--bg-subtle)', fg: 'var(--fg-subtle)' },
  }[tone];
  const s = size === 'sm' ? { padding: '2px 8px', fontSize: 10.5 } : { padding: '3px 10px', fontSize: 11.5 };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: map.bg, color: map.fg,
      ...s, borderRadius: 999, fontWeight: 600, whiteSpace: 'nowrap', lineHeight: 1.4 }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />}
      {children}
    </span>
  );
}

// ---- Avatar ----
function Avatar({ name, size = 36, src }) {
  const initials = (name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const colors = ['#153B6A', '#ED8425', '#1D4A82', '#2E7D52', '#5B89C0', '#6C7884', '#C0392B', '#9DA6AE'];
  const bg = colors[(name || 'x').charCodeAt(0) % colors.length];
  if (src) return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 600,
      flexShrink: 0, letterSpacing: '-0.02em' }}>{initials}</div>
  );
}

// ---- SearchInput ----
function SearchInput({ placeholder = 'Search…', value, onChange, style, width }) {
  return (
    <div style={{ position: 'relative', width, ...style }}>
      <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-faint)', display: 'inline-flex' }}>
        <Icon name="search" size={16} />
      </span>
      <input value={value} onChange={e => onChange && onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
          background: 'var(--surface)', color: 'var(--fg)', fontSize: 13.5, fontFamily: 'var(--font-sans)', outline: 'none' }} />
    </div>
  );
}

// ---- Field (label + control) ----
function Field({ label, children, hint, style }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-muted)' }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>{hint}</span>}
    </label>
  );
}
function Input(props) {
  return <input {...props} style={{ padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
    background: 'var(--surface)', color: 'var(--fg)', fontSize: 13.5, fontFamily: 'var(--font-sans)', outline: 'none', ...props.style }} />;
}
function Select({ options = [], value, onChange, style }) {
  return (
    <select value={value} onChange={e => onChange && onChange(e.target.value)}
      style={{ padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--surface)',
        color: 'var(--fg)', fontSize: 13.5, fontFamily: 'var(--font-sans)', outline: 'none', cursor: 'pointer', ...style }}>
      {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
    </select>
  );
}

// ---- SegmentedControl ----
function Segmented({ options, value, onChange, size = 'md' }) {
  const pad = size === 'sm' ? '5px 11px' : '7px 14px';
  return (
    <div style={{ display: 'inline-flex', background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 3, gap: 2 }}>
      {options.map(o => {
        const v = o.value ?? o, l = o.label ?? o;
        const active = v === value;
        return <button key={v} onClick={() => onChange(v)} style={{ padding: pad, border: 'none', borderRadius: 'calc(var(--radius-md) - 2px)',
          background: active ? 'var(--surface)' : 'transparent', color: active ? 'var(--fg)' : 'var(--fg-subtle)',
          fontWeight: active ? 600 : 500, fontSize: size === 'sm' ? 12.5 : 13.5, fontFamily: 'var(--font-sans)', cursor: 'pointer',
          boxShadow: active ? 'var(--shadow-xs)' : 'none', transition: 'all var(--dur-base) var(--ease-standard)', whiteSpace: 'nowrap' }}>{l}</button>;
      })}
    </div>
  );
}

// ---- Toggle ----
function Toggle({ checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)} style={{ width: 42, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer',
      background: checked ? 'var(--accent)' : 'var(--slate-300)', position: 'relative', transition: 'background var(--dur-base) var(--ease-standard)', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 3, left: checked ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff',
        boxShadow: 'var(--shadow-sm)', transition: 'left var(--dur-base) var(--ease-standard)' }} />
    </button>
  );
}

// ---- ProgressBar ----
function Progress({ value, max = 100, tone = 'teal', height = 8, showLabel = false }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const color = { teal: 'var(--accent)', success: 'var(--success-500)', warning: 'var(--warning-500)', error: 'var(--error-500)', info: 'var(--info-500)' }[tone];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height, background: 'var(--bg-subtle)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', background: color, borderRadius: 999, transition: 'width var(--dur-slow) var(--ease-out)' }} />
      </div>
      {showLabel && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-subtle)', minWidth: 34, textAlign: 'right' }}>{pct}%</span>}
    </div>
  );
}

// ---- PageHeader ----
function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 24 }}>
      <div>
        {eyebrow && <div className="label" style={{ marginBottom: 8 }}>{eyebrow}</div>}
        <h1 style={{ fontSize: 28, letterSpacing: '-0.02em' }}>{title}</h1>
        {subtitle && <p style={{ marginTop: 6, color: 'var(--fg-subtle)', maxWidth: '64ch' }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{actions}</div>}
    </div>
  );
}

// ---- SectionTitle ----
function SectionTitle({ children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700 }}>{children}</h3>
      {action}
    </div>
  );
}

// ---- KPI stat ----
function Stat({ label, value, delta, deltaTone, icon, spark }) {
  return (
    <Card padding={18} style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12.5, color: 'var(--fg-subtle)', fontWeight: 600 }}>{label}</span>
        {icon && <span style={{ width: 30, height: 30, borderRadius: 'var(--radius-md)', background: 'var(--bg-tint)', color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={16} /></span>}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-display)', letterSpacing: '0.01em', color: 'var(--fg)' }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {delta != null && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600,
            color: deltaTone === 'down' ? 'var(--error-500)' : deltaTone === 'flat' ? 'var(--fg-subtle)' : 'var(--success-500)' }}>
            <Icon name={deltaTone === 'down' ? 'trending-down' : deltaTone === 'flat' ? 'minus' : 'trending-up'} size={14} />{delta}
          </span>
        )}
        {spark && <Sparkline data={spark} width={70} height={24} />}
      </div>
    </Card>
  );
}

// ============================================================
// CHARTS — hand-built SVG
// ============================================================

function Sparkline({ data, width = 80, height = 28, color = 'var(--accent)' }) {
  const min = Math.min(...data), max = Math.max(...data);
  const rng = max - min || 1;
  const pts = data.map((d, i) => [(i / (data.length - 1)) * width, height - ((d - min) / rng) * (height - 4) - 2]);
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <path d={path} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.5} fill={color} />
    </svg>
  );
}

// Area / line chart with optional second series
function AreaChart({ series, labels, height = 220, colors = ['var(--accent)', 'var(--slate-400)'], format = (v) => v }) {
  const ref = useRef(null);
  const [w, setW] = useState(640);
  const [hi, setHi] = useState(null);
  useEffect(() => {
    const ro = new ResizeObserver(es => setW(es[0].contentRect.width));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const padL = 52, padB = 26, padT = 12, padR = 8;
  const all = series.flatMap(s => s.data);
  const max = Math.max(...all) * 1.1, min = 0;
  const iw = w - padL - padR, ih = height - padB - padT;
  const n = labels.length;
  const x = i => padL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = v => padT + ih - ((v - min) / (max - min || 1)) * ih;
  const gy = [0, 0.25, 0.5, 0.75, 1].map(t => min + t * (max - min));
  return (
    <div ref={ref} style={{ width: '100%', position: 'relative' }}>
      <svg width={w} height={height}>
        {gy.map((g, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={y(g)} y2={y(g)} stroke="var(--divider)" strokeWidth={1} />
            <text x={padL - 8} y={y(g) + 4} textAnchor="end" fontSize={10.5} fill="var(--fg-faint)" fontFamily="var(--font-sans)">{format(Math.round(g))}</text>
          </g>
        ))}
        {series.map((s, si) => {
          const c = colors[si];
          const pts = s.data.map((d, i) => [x(i), y(d)]);
          const line = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
          const area = line + ` L${x(n - 1)} ${y(0)} L${x(0)} ${y(0)} Z`;
          return (
            <g key={si}>
              {si === 0 && <path d={area} fill={c} opacity={0.08} />}
              <path d={line} fill="none" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray={s.dashed ? '5 5' : 'none'} />
            </g>
          );
        })}
        {labels.map((l, i) => (
          <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fontSize={10.5} fill="var(--fg-faint)" fontFamily="var(--font-sans)">{l}</text>
        ))}
        {labels.map((l, i) => (
          <rect key={'h' + i} x={x(i) - iw / n / 2} y={padT} width={iw / n} height={ih} fill="transparent"
            onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} />
        ))}
        {hi != null && series.map((s, si) => (
          <circle key={si} cx={x(hi)} cy={y(s.data[hi])} r={4} fill="var(--surface)" stroke={colors[si]} strokeWidth={2.5} />
        ))}
        {hi != null && <line x1={x(hi)} x2={x(hi)} y1={padT} y2={padT + ih} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="3 3" />}
      </svg>
      {hi != null && (
        <div style={{ position: 'absolute', left: Math.min(x(hi) + 10, w - 150), top: 8, background: 'var(--fg)', color: 'var(--bg)',
          padding: '8px 11px', borderRadius: 'var(--radius-md)', fontSize: 12, pointerEvents: 'none', boxShadow: 'var(--shadow-lg)', minWidth: 110 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{labels[hi]}</div>
          {series.map((s, si) => (
            <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.95 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: colors[si] }} />{s.name}: <b>{format(s.data[hi])}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Bar chart (vertical)
function BarChart({ data, labels, height = 200, color = 'var(--accent)', format = v => v }) {
  const ref = useRef(null);
  const [w, setW] = useState(640);
  const [hi, setHi] = useState(null);
  useEffect(() => {
    const ro = new ResizeObserver(es => setW(es[0].contentRect.width));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const padL = 48, padB = 26, padT = 10, padR = 8;
  const max = Math.max(...data) * 1.1;
  const iw = w - padL - padR, ih = height - padB - padT;
  const n = data.length;
  const bw = (iw / n) * 0.56;
  const x = i => padL + (i + 0.5) * (iw / n);
  const y = v => padT + ih - (v / (max || 1)) * ih;
  const gy = [0, 0.5, 1].map(t => t * max);
  return (
    <div ref={ref} style={{ width: '100%', position: 'relative' }}>
      <svg width={w} height={height}>
        {gy.map((g, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR} y1={y(g)} y2={y(g)} stroke="var(--divider)" />
            <text x={padL - 8} y={y(g) + 4} textAnchor="end" fontSize={10.5} fill="var(--fg-faint)" fontFamily="var(--font-sans)">{format(Math.round(g))}</text>
          </g>
        ))}
        {data.map((d, i) => (
          <g key={i} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}>
            <rect x={x(i) - bw / 2} y={y(d)} width={bw} height={padT + ih - y(d)} rx={4} fill={color} opacity={hi == null || hi === i ? 1 : 0.4}
              style={{ transition: 'opacity var(--dur-base)' }} />
            <text x={x(i)} y={height - 6} textAnchor="middle" fontSize={10.5} fill="var(--fg-faint)" fontFamily="var(--font-sans)">{labels[i]}</text>
          </g>
        ))}
      </svg>
      {hi != null && (
        <div style={{ position: 'absolute', left: Math.min(x(hi) + 4, w - 110), top: y(data[hi]) - 34, background: 'var(--fg)', color: 'var(--bg)',
          padding: '5px 9px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontWeight: 700, pointerEvents: 'none', boxShadow: 'var(--shadow-md)' }}>
          {format(data[hi])}
        </div>
      )}
    </div>
  );
}

// Donut chart
function Donut({ segments, size = 160, thickness = 22, centerLabel, centerSub }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ display: 'inline-flex', position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} strokeLinecap="butt" />;
          offset += len;
          return el;
        })}
      </svg>
      {(centerLabel || centerSub) && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--fg)' }}>{centerLabel}</div>
          {centerSub && <div style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>{centerSub}</div>}
        </div>
      )}
    </div>
  );
}

// ---- Drawer (right slide-over) ----
function Drawer({ open, onClose, title, children, width = 480, footer }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,0.32)',
      backdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'flex-end', animation: 'daust-fade-in 200ms var(--ease-out)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width, maxWidth: '94vw', height: '100%', background: 'var(--surface)',
        boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column', animation: 'daust-fade-in 240ms var(--ease-out)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 17, fontWeight: 700 }}>{title}</h3>
          <IconButton name="x" onClick={onClose} title="Close" />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 22 }}>{children}</div>
        {footer && <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  );
}

// ---- Modal (centered) ----
function Modal({ open, onClose, title, children, width = 460, footer }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,0.32)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'daust-fade-in 180ms var(--ease-out)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width, maxWidth: '94vw', maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface)',
        borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-xl)', animation: 'daust-fade-in 220ms var(--ease-out)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 17, fontWeight: 700 }}>{title}</h3>
          <IconButton name="x" onClick={onClose} title="Close" />
        </div>
        <div style={{ padding: 22 }}>{children}</div>
        {footer && <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  );
}

// ---- Tabs ----
function Tabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 22 }}>
      {tabs.map(t => {
        const v = t.value ?? t, l = t.label ?? t;
        const on = v === active;
        return (
          <button key={v} onClick={() => onChange(v)} style={{ padding: '10px 14px', border: 'none', background: 'transparent',
            color: on ? 'var(--accent)' : 'var(--fg-subtle)', fontWeight: on ? 700 : 500, fontSize: 14, fontFamily: 'var(--font-sans)',
            cursor: 'pointer', borderBottom: on ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -1,
            transition: 'color var(--dur-base) var(--ease-standard)' }}>{l}</button>
        );
      })}
    </div>
  );
}

// ---- EmptyState ----
function EmptyState({ icon = 'inbox', title, sub, action }) {
  return (
    <div style={{ padding: '56px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--bg-subtle)', color: 'var(--fg-faint)',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={26} /></span>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>{title}</div>
      {sub && <div style={{ fontSize: 13.5, color: 'var(--fg-subtle)', maxWidth: '40ch' }}>{sub}</div>}
      {action}
    </div>
  );
}

// ---- helpers ----
const fmtFCFA = (n, opts = {}) => {
  const { short = false } = opts;
  if (short) {
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + 'k';
    return '' + n;
  }
  return new Intl.NumberFormat('fr-FR').format(Math.round(n));
};
const FCFA = ({ value, short }) => <span>{fmtFCFA(value, { short })}<span style={{ fontSize: '0.7em', fontWeight: 600, color: 'var(--fg-subtle)', marginLeft: 3 }}>FCFA</span></span>;

Object.assign(window, {
  Icon, Button, IconButton, Card, Badge, Avatar, SearchInput, Field, Input, Select, Segmented, Toggle,
  Progress, PageHeader, SectionTitle, Stat, Sparkline, AreaChart, BarChart, Donut, Drawer, Modal, Tabs, EmptyState,
  fmtFCFA, FCFA,
});
