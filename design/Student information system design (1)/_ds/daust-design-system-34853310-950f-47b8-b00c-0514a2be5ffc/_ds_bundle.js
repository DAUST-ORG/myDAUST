/* @ds-bundle: {"format":4,"namespace":"DAUSTDesignSystem_348533","components":[{"name":"Eyebrow","sourcePath":"components/brand/Eyebrow.jsx"},{"name":"TriDash","sourcePath":"components/brand/TriDash.jsx"},{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"BarChart","sourcePath":"components/data/BarChart.jsx"},{"name":"Donut","sourcePath":"components/data/Donut.jsx"},{"name":"EmptyState","sourcePath":"components/data/EmptyState.jsx"},{"name":"Progress","sourcePath":"components/data/Progress.jsx"},{"name":"Sparkline","sourcePath":"components/data/Sparkline.jsx"},{"name":"Stat","sourcePath":"components/data/Stat.jsx"},{"name":"Tabs","sourcePath":"components/data/Tabs.jsx"},{"name":"Field","sourcePath":"components/forms/Field.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"SearchInput","sourcePath":"components/forms/SearchInput.jsx"},{"name":"Segmented","sourcePath":"components/forms/Segmented.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Toggle","sourcePath":"components/forms/Toggle.jsx"},{"name":"PageHeader","sourcePath":"components/layout/PageHeader.jsx"},{"name":"SectionTitle","sourcePath":"components/layout/SectionTitle.jsx"},{"name":"CTABand","sourcePath":"components/marketing/CTABand.jsx"},{"name":"Footer","sourcePath":"components/marketing/Footer.jsx"},{"name":"Header","sourcePath":"components/marketing/Header.jsx"},{"name":"Heading","sourcePath":"components/marketing/Heading.jsx"},{"name":"PageHero","sourcePath":"components/marketing/PageHero.jsx"},{"name":"StatCounter","sourcePath":"components/marketing/StatCounter.jsx"},{"name":"Drawer","sourcePath":"components/overlays/Drawer.jsx"},{"name":"Modal","sourcePath":"components/overlays/Modal.jsx"}],"sourceHashes":{"components/brand/Eyebrow.jsx":"c1dfb343faaf","components/brand/TriDash.jsx":"86045b3cbbe5","components/core/Avatar.jsx":"af2de568ee2c","components/core/Badge.jsx":"bee08a5bf045","components/core/Button.jsx":"cf8da8c789bf","components/core/Card.jsx":"c2c4e010d406","components/core/IconButton.jsx":"cbe7d3e47bd2","components/data/BarChart.jsx":"e893d8303428","components/data/Donut.jsx":"097214b6651b","components/data/EmptyState.jsx":"843a75ec3f38","components/data/Progress.jsx":"fa8f307fff4a","components/data/Sparkline.jsx":"d6b3bb1c2cb0","components/data/Stat.jsx":"6af57cb6c62d","components/data/Tabs.jsx":"68c044f6801a","components/forms/Field.jsx":"b066d1cf0966","components/forms/Input.jsx":"6d3c653d61fb","components/forms/SearchInput.jsx":"c5a5e6365398","components/forms/Segmented.jsx":"9bdb9f9b0651","components/forms/Select.jsx":"60e5a0333a08","components/forms/Toggle.jsx":"a95c51ee85ae","components/layout/PageHeader.jsx":"baa41480c6be","components/layout/SectionTitle.jsx":"d3ba72f8d7e1","components/marketing/CTABand.jsx":"42eb80cc598f","components/marketing/Footer.jsx":"3ed78949dfd4","components/marketing/Header.jsx":"713b7dcfc8d3","components/marketing/Heading.jsx":"c0da9c01abe2","components/marketing/PageHero.jsx":"8b7ec4a58fb6","components/marketing/StatCounter.jsx":"0bde689e85a5","components/overlays/Drawer.jsx":"bb7c5fa0666a","components/overlays/Modal.jsx":"17c1da4f2d95"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.DAUSTDesignSystem_348533 = window.DAUSTDesignSystem_348533 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/brand/Eyebrow.jsx
try { (() => {
function Eyebrow({
  children,
  on = 'light',
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 13,
      letterSpacing: '.16em',
      textTransform: 'uppercase',
      color: on === 'navy' ? 'var(--daust-orange)' : 'var(--daust-orange)',
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Eyebrow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/Eyebrow.jsx", error: String((e && e.message) || e) }); }

// components/brand/TriDash.jsx
try { (() => {
function TriDash({
  w = 36,
  h = 5,
  gap = 9,
  style,
  light = false
}) {
  const bar = c => /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      width: w,
      height: h,
      borderRadius: 999,
      background: c
    }
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap,
      ...style
    }
  }, bar(light ? '#fff' : 'var(--daust-navy)'), bar('var(--daust-orange)'), bar('var(--daust-steel)'));
}
Object.assign(__ds_scope, { TriDash });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/TriDash.jsx", error: String((e && e.message) || e) }); }

// components/core/Avatar.jsx
try { (() => {
function Avatar({
  name,
  size = 36,
  src
}) {
  const initials = (name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const colors = ['#153b6a', '#ed8425', '#1d4a82', '#2e7d52', '#5b89c0', '#6c7884', '#c0392b', '#9da6ae'];
  const bg = colors[(name || 'x').charCodeAt(0) % colors.length];
  if (src) return /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name,
    style: {
      width: size,
      height: size,
      borderRadius: '50%',
      objectFit: 'cover',
      flexShrink: 0
    }
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: size,
      height: size,
      borderRadius: '50%',
      background: bg,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * .38,
      fontWeight: 600,
      fontFamily: 'var(--font-body)',
      flexShrink: 0,
      letterSpacing: '-.02em'
    }
  }, initials);
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function Badge({
  tone = 'neutral',
  children,
  dot = true,
  size = 'md'
}) {
  const map = {
    navy: {
      bg: 'var(--accent-bg)',
      fg: 'var(--accent)'
    },
    success: {
      bg: 'rgba(46,125,82,.12)',
      fg: '#1f6b42'
    },
    warning: {
      bg: 'rgba(237,132,37,.14)',
      fg: '#a85f16'
    },
    error: {
      bg: 'rgba(192,57,43,.12)',
      fg: '#a3291b'
    },
    info: {
      bg: 'rgba(29,74,130,.12)',
      fg: '#1d4a82'
    },
    neutral: {
      bg: 'var(--bg-subtle)',
      fg: 'var(--fg3)'
    }
  }[tone];
  const s = size === 'sm' ? {
    padding: '2px 8px',
    fontSize: 10.5
  } : {
    padding: '3px 10px',
    fontSize: 11.5
  };
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      background: map.bg,
      color: map.fg,
      ...s,
      borderRadius: 999,
      fontWeight: 600,
      fontFamily: 'var(--font-body)',
      whiteSpace: 'nowrap',
      lineHeight: 1.4
    }
  }, dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: 'currentColor',
      flexShrink: 0
    }
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
const {
  useState
} = React;
function Button({
  variant = 'primary',
  size = 'md',
  children,
  icon,
  iconRight,
  onClick,
  href,
  style,
  disabled,
  title
}) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const sizes = {
    sm: {
      padding: '6px 14px',
      fontSize: 12.5
    },
    md: {
      padding: '10px 20px',
      fontSize: 14
    },
    lg: {
      padding: '14px 30px',
      fontSize: 15
    }
  }[size];
  const palettes = {
    primary: {
      background: 'var(--cta)',
      color: '#fff',
      border: '1px solid transparent',
      hoverBg: 'var(--cta-hover)'
    },
    navy: {
      background: 'var(--daust-navy)',
      color: '#fff',
      border: '1px solid transparent',
      hoverBg: 'var(--daust-navy-700)'
    },
    secondary: {
      background: 'var(--accent-bg)',
      color: 'var(--accent)',
      border: '1px solid transparent',
      hoverBg: 'var(--bg-tint)'
    },
    outline: {
      background: 'transparent',
      color: 'var(--daust-navy)',
      border: '1.5px solid var(--daust-navy)',
      hoverBg: 'var(--daust-navy)',
      hoverColor: '#fff'
    },
    outlineLight: {
      background: 'transparent',
      color: '#fff',
      border: '1.5px solid rgba(255,255,255,.55)',
      hoverBg: '#fff',
      hoverColor: 'var(--daust-navy)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--daust-navy)',
      border: '1px solid transparent',
      hoverBg: 'var(--bg-subtle)'
    },
    danger: {
      background: 'var(--surface)',
      color: 'var(--error-500)',
      border: '1px solid var(--border-strong)',
      hoverBg: 'rgba(192,57,43,.08)'
    }
  };
  const p = palettes[variant] || palettes.primary;
  const Tag = href ? 'a' : 'button';
  return /*#__PURE__*/React.createElement(Tag, {
    href: href,
    title: title,
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setPress(false);
    },
    onMouseDown: () => setPress(true),
    onMouseUp: () => setPress(false),
    onClick: disabled ? undefined : onClick,
    style: {
      ...sizes,
      fontFamily: 'var(--font-body)',
      fontWeight: 600,
      letterSpacing: '.02em',
      borderRadius: 'var(--radius-pill)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      whiteSpace: 'nowrap',
      textDecoration: 'none',
      opacity: disabled ? .5 : 1,
      background: hover && !disabled ? p.hoverBg : p.background,
      color: hover && !disabled && p.hoverColor ? p.hoverColor : p.color,
      border: p.border,
      transform: press && !disabled ? 'scale(.98)' : hover && !disabled ? 'translateY(-1px)' : 'none',
      transition: 'all var(--dur-fast) var(--ease-standard)',
      ...style
    }
  }, icon, children, iconRight);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
const {
  useState
} = React;
function Card({
  children,
  style,
  padding = 20,
  hover = false,
  onClick
}) {
  const [h, setH] = useState(false);
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding,
      boxShadow: hover && h ? 'var(--shadow-lg)' : 'var(--shadow-xs)',
      cursor: onClick ? 'pointer' : 'default',
      transform: hover && h ? 'translateY(-2px)' : 'none',
      transition: 'transform var(--dur-base) var(--ease-standard), box-shadow var(--dur-base) var(--ease-standard)',
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
const {
  useState
} = React;
function IconButton({
  children,
  onClick,
  title,
  size = 38,
  badge,
  active
}) {
  const [hover, setHover] = useState(false);
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    title: title,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      position: 'relative',
      width: size,
      height: size,
      borderRadius: '50%',
      border: 'none',
      background: hover || active ? 'var(--bg-subtle)' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--fg3)',
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background var(--dur-base) var(--ease-standard)'
    }
  }, children, badge ? /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 6,
      right: 6,
      minWidth: 16,
      height: 16,
      padding: '0 4px',
      borderRadius: 999,
      background: 'var(--error-500)',
      color: '#fff',
      fontSize: 10,
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '2px solid var(--surface)'
    }
  }, badge) : null);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/data/BarChart.jsx
try { (() => {
const {
  useState,
  useRef,
  useEffect
} = React;
function BarChart({
  data,
  labels,
  height = 200,
  color = 'var(--accent)',
  format = v => v
}) {
  const ref = useRef(null);
  const [w, setW] = useState(640);
  const [hi, setHi] = useState(null);
  useEffect(() => {
    const ro = new ResizeObserver(es => setW(es[0].contentRect.width));
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const padL = 48,
    padB = 26,
    padT = 10,
    padR = 8;
  const max = Math.max(...data) * 1.1;
  const iw = w - padL - padR,
    ih = height - padB - padT,
    n = data.length;
  const bw = iw / n * .56;
  const x = i => padL + (i + .5) * (iw / n);
  const y = v => padT + ih - v / (max || 1) * ih;
  const gy = [0, .5, 1].map(t => t * max);
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    style: {
      width: '100%',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: w,
    height: height
  }, gy.map((g, i) => /*#__PURE__*/React.createElement("g", {
    key: i
  }, /*#__PURE__*/React.createElement("line", {
    x1: padL,
    x2: w - padR,
    y1: y(g),
    y2: y(g),
    stroke: "var(--divider)"
  }), /*#__PURE__*/React.createElement("text", {
    x: padL - 8,
    y: y(g) + 4,
    textAnchor: "end",
    fontSize: 10.5,
    fill: "var(--fg-faint)",
    fontFamily: "var(--font-body)"
  }, format(Math.round(g))))), data.map((d, i) => /*#__PURE__*/React.createElement("g", {
    key: i,
    onMouseEnter: () => setHi(i),
    onMouseLeave: () => setHi(null)
  }, /*#__PURE__*/React.createElement("rect", {
    x: x(i) - bw / 2,
    y: y(d),
    width: bw,
    height: padT + ih - y(d),
    rx: 4,
    fill: color,
    opacity: hi == null || hi === i ? 1 : .4
  }), /*#__PURE__*/React.createElement("text", {
    x: x(i),
    y: height - 6,
    textAnchor: "middle",
    fontSize: 10.5,
    fill: "var(--fg-faint)",
    fontFamily: "var(--font-body)"
  }, labels[i])))));
}
Object.assign(__ds_scope, { BarChart });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/BarChart.jsx", error: String((e && e.message) || e) }); }

// components/data/Donut.jsx
try { (() => {
function Donut({
  segments,
  size = 160,
  thickness = 22,
  centerLabel,
  centerSub
}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2,
    c = 2 * Math.PI * r;
  let offset = 0;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      position: 'relative',
      width: size,
      height: size
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    style: {
      transform: 'rotate(-90deg)'
    }
  }, segments.map((s, i) => {
    const len = s.value / total * c;
    const el = /*#__PURE__*/React.createElement("circle", {
      key: i,
      cx: size / 2,
      cy: size / 2,
      r: r,
      fill: "none",
      stroke: s.color,
      strokeWidth: thickness,
      strokeDasharray: `${len} ${c - len}`,
      strokeDashoffset: -offset,
      strokeLinecap: "butt"
    });
    offset += len;
    return el;
  })), (centerLabel || centerSub) && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 22,
      fontWeight: 800,
      letterSpacing: '-.02em',
      color: 'var(--fg1)',
      fontFamily: 'var(--font-display)'
    }
  }, centerLabel), centerSub && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: 'var(--fg3)'
    }
  }, centerSub)));
}
Object.assign(__ds_scope, { Donut });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Donut.jsx", error: String((e && e.message) || e) }); }

// components/data/EmptyState.jsx
try { (() => {
function EmptyState({
  icon = 'inbox',
  title,
  sub,
  action
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '56px 24px',
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 56,
      height: 56,
      borderRadius: '50%',
      background: 'var(--bg-subtle)',
      color: 'var(--fg-faint)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("i", {
    "data-lucide": icon,
    style: {
      width: 26,
      height: 26
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      color: 'var(--fg1)',
      fontFamily: 'var(--font-display)'
    }
  }, title), sub && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      color: 'var(--fg3)',
      maxWidth: '40ch'
    }
  }, sub), action);
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/data/Progress.jsx
try { (() => {
function Progress({
  value,
  max = 100,
  tone = 'navy',
  height = 8,
  showLabel = false
}) {
  const pct = Math.min(100, Math.round(value / max * 100));
  const color = {
    navy: 'var(--accent)',
    success: 'var(--success-500)',
    warning: 'var(--warning-500)',
    error: 'var(--error-500)',
    info: 'var(--info-500)'
  }[tone];
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height,
      background: 'var(--bg-subtle)',
      borderRadius: 999,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: pct + '%',
      height: '100%',
      background: color,
      borderRadius: 999,
      transition: 'width var(--dur-slow) var(--ease-out)'
    }
  })), showLabel && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--fg3)',
      minWidth: 34,
      textAlign: 'right'
    }
  }, pct, "%"));
}
Object.assign(__ds_scope, { Progress });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Progress.jsx", error: String((e && e.message) || e) }); }

// components/data/Sparkline.jsx
try { (() => {
function Sparkline({
  data,
  width = 80,
  height = 28,
  color = 'var(--accent)'
}) {
  const min = Math.min(...data),
    max = Math.max(...data),
    rng = max - min || 1;
  const pts = data.map((d, i) => [i / (data.length - 1) * width, height - (d - min) / rng * (height - 4) - 2]);
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return /*#__PURE__*/React.createElement("svg", {
    width: width,
    height: height,
    style: {
      overflow: 'visible'
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: path,
    fill: "none",
    stroke: color,
    strokeWidth: 1.75,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: pts[pts.length - 1][0],
    cy: pts[pts.length - 1][1],
    r: 2.5,
    fill: color
  }));
}
Object.assign(__ds_scope, { Sparkline });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Sparkline.jsx", error: String((e && e.message) || e) }); }

// components/data/Stat.jsx
try { (() => {
function Stat({
  label,
  value,
  delta,
  deltaTone,
  suffix
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      color: 'var(--fg3)',
      fontWeight: 600,
      fontFamily: 'var(--font-body)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 28,
      fontWeight: 800,
      fontFamily: 'var(--font-display)',
      letterSpacing: '.01em',
      color: 'var(--fg1)'
    }
  }, value, suffix && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--daust-orange)'
    }
  }, suffix)), delta != null && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 12,
      fontWeight: 600,
      color: deltaTone === 'down' ? 'var(--error-500)' : deltaTone === 'flat' ? 'var(--fg3)' : 'var(--success-500)'
    }
  }, deltaTone === 'down' ? '↓' : deltaTone === 'flat' ? '·' : '↑', " ", delta));
}
Object.assign(__ds_scope, { Stat });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Stat.jsx", error: String((e && e.message) || e) }); }

// components/data/Tabs.jsx
try { (() => {
function Tabs({
  tabs,
  active,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 4,
      borderBottom: '1px solid var(--border)'
    }
  }, tabs.map(t => {
    const v = t.value ?? t,
      l = t.label ?? t,
      on = v === active;
    return /*#__PURE__*/React.createElement("button", {
      key: v,
      onClick: () => onChange && onChange(v),
      style: {
        padding: '10px 14px',
        border: 'none',
        background: 'transparent',
        color: on ? 'var(--accent)' : 'var(--fg3)',
        fontWeight: on ? 700 : 500,
        fontSize: 14,
        fontFamily: 'var(--font-body)',
        cursor: 'pointer',
        borderBottom: on ? '2px solid var(--accent)' : '2px solid transparent',
        marginBottom: -1,
        transition: 'color var(--dur-base) var(--ease-standard)'
      }
    }, l);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/forms/Field.jsx
try { (() => {
function Field({
  label,
  children,
  hint,
  style
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 7,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      fontWeight: 600,
      fontFamily: 'var(--font-body)',
      color: 'var(--fg2)'
    }
  }, label), children, hint && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11.5,
      color: 'var(--fg-faint)',
      fontFamily: 'var(--font-body)'
    }
  }, hint));
}
Object.assign(__ds_scope, { Field });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Field.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Input(props) {
  const {
    style,
    ...rest
  } = props;
  return /*#__PURE__*/React.createElement("input", _extends({}, rest, {
    style: {
      padding: '10px 14px',
      borderRadius: 'var(--radius-md)',
      border: '1.5px solid var(--border)',
      background: 'var(--surface)',
      color: 'var(--fg1)',
      fontSize: 14,
      fontFamily: 'var(--font-body)',
      outline: 'none',
      transition: 'border-color var(--dur-base) var(--ease-standard)',
      width: '100%',
      boxSizing: 'border-box',
      ...style
    },
    onFocus: e => e.target.style.borderColor = 'var(--daust-navy)',
    onBlur: e => e.target.style.borderColor = 'var(--border)'
  }));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/SearchInput.jsx
try { (() => {
function SearchInput({
  placeholder = 'Search…',
  value,
  onChange,
  style,
  width
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 13,
      top: '50%',
      transform: 'translateY(-50%)',
      color: 'var(--fg-faint)',
      display: 'inline-flex'
    }
  }, /*#__PURE__*/React.createElement("i", {
    "data-lucide": "search",
    style: {
      width: 16,
      height: 16
    }
  })), /*#__PURE__*/React.createElement("input", {
    value: value,
    onChange: e => onChange && onChange(e.target.value),
    placeholder: placeholder,
    style: {
      width: '100%',
      boxSizing: 'border-box',
      padding: '10px 14px 10px 38px',
      borderRadius: 'var(--radius-md)',
      border: '1.5px solid var(--border)',
      background: 'var(--surface)',
      color: 'var(--fg1)',
      fontSize: 13.5,
      fontFamily: 'var(--font-body)',
      outline: 'none'
    }
  }));
}
Object.assign(__ds_scope, { SearchInput });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SearchInput.jsx", error: String((e && e.message) || e) }); }

// components/forms/Segmented.jsx
try { (() => {
function Segmented({
  options,
  value,
  onChange,
  size = 'md'
}) {
  const pad = size === 'sm' ? '5px 12px' : '7px 15px';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      background: 'var(--bg-subtle)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      padding: 3,
      gap: 2
    }
  }, options.map(o => {
    const v = o.value ?? o,
      l = o.label ?? o,
      active = v === value;
    return /*#__PURE__*/React.createElement("button", {
      key: v,
      onClick: () => onChange && onChange(v),
      style: {
        padding: pad,
        border: 'none',
        borderRadius: 'calc(var(--radius-md) - 2px)',
        background: active ? 'var(--surface)' : 'transparent',
        color: active ? 'var(--fg1)' : 'var(--fg3)',
        fontWeight: active ? 600 : 500,
        fontSize: size === 'sm' ? 12.5 : 13.5,
        fontFamily: 'var(--font-body)',
        cursor: 'pointer',
        boxShadow: active ? 'var(--shadow-xs)' : 'none',
        transition: 'all var(--dur-base) var(--ease-standard)',
        whiteSpace: 'nowrap'
      }
    }, l);
  }));
}
Object.assign(__ds_scope, { Segmented });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Segmented.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function Select({
  options = [],
  value,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("select", {
    value: value,
    onChange: e => onChange && onChange(e.target.value),
    style: {
      padding: '10px 14px',
      borderRadius: 'var(--radius-md)',
      border: '1.5px solid var(--border)',
      background: 'var(--surface)',
      color: 'var(--fg1)',
      fontSize: 14,
      fontFamily: 'var(--font-body)',
      outline: 'none',
      cursor: 'pointer',
      ...style
    }
  }, options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o.value ?? o,
    value: o.value ?? o
  }, o.label ?? o)));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Toggle.jsx
try { (() => {
function Toggle({
  checked,
  onChange
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: () => onChange && onChange(!checked),
    style: {
      width: 42,
      height: 24,
      borderRadius: 999,
      border: 'none',
      cursor: 'pointer',
      background: checked ? 'var(--accent)' : 'var(--gray-300)',
      position: 'relative',
      transition: 'background var(--dur-base) var(--ease-standard)',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 3,
      left: checked ? 21 : 3,
      width: 18,
      height: 18,
      borderRadius: '50%',
      background: '#fff',
      boxShadow: 'var(--shadow-sm)',
      transition: 'left var(--dur-base) var(--ease-standard)'
    }
  }));
}
Object.assign(__ds_scope, { Toggle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Toggle.jsx", error: String((e && e.message) || e) }); }

// components/layout/PageHeader.jsx
try { (() => {
function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 24,
      flexWrap: 'wrap',
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("div", null, eyebrow && /*#__PURE__*/React.createElement("div", {
    className: "daust-eyebrow",
    style: {
      marginBottom: 8
    }
  }, eyebrow), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 28,
      letterSpacing: '-.02em'
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("p", {
    style: {
      marginTop: 6,
      color: 'var(--fg3)',
      maxWidth: '64ch',
      fontFamily: 'var(--font-body)'
    }
  }, subtitle)), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'center'
    }
  }, actions));
}
Object.assign(__ds_scope, { PageHeader });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/PageHeader.jsx", error: String((e && e.message) || e) }); }

// components/layout/SectionTitle.jsx
try { (() => {
function SectionTitle({
  children,
  action
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 16,
      fontWeight: 700
    }
  }, children), action);
}
Object.assign(__ds_scope, { SectionTitle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/layout/SectionTitle.jsx", error: String((e && e.message) || e) }); }

// components/marketing/CTABand.jsx
try { (() => {
function CTABand({
  onApply,
  title = 'Your engineering journey starts in Somone.',
  eyebrow = 'Admissions Open · September 2026'
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: 'var(--daust-navy)',
      position: 'relative',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      backgroundImage: 'radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)',
      backgroundSize: '18px 18px'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      right: -80,
      top: -80,
      width: 360,
      height: 360,
      borderRadius: 999,
      background: 'radial-gradient(circle, rgba(237,132,37,.30), transparent 70%)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      maxWidth: 1180,
      margin: '0 auto',
      padding: '80px 32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 36,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 13,
      letterSpacing: '.16em',
      textTransform: 'uppercase',
      color: 'var(--daust-orange)'
    }
  }, eyebrow), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 46,
      color: '#fff',
      margin: '14px 0 0',
      lineHeight: 1.05,
      letterSpacing: '.01em',
      maxWidth: 620
    }
  }, title)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onApply,
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 600,
      fontSize: 15,
      border: 'none',
      borderRadius: 999,
      padding: '16px 38px',
      background: 'var(--daust-orange)',
      color: '#fff',
      cursor: 'pointer'
    }
  }, "Apply Now \u2192"), /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 600,
      fontSize: 15,
      borderRadius: 999,
      padding: '16px 38px',
      background: 'transparent',
      color: '#fff',
      boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.55)',
      textDecoration: 'none'
    }
  }, "Visit Admissions"))));
}
Object.assign(__ds_scope, { CTABand });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/CTABand.jsx", error: String((e && e.message) || e) }); }

// components/marketing/Footer.jsx
try { (() => {
function Footer({
  logoSrc = 'assets/logos/daust-wordmark-white.png'
}) {
  const cols = [['Study', ['Admissions', 'Education', 'Intensive English', 'Tuition & Aid']], ['Discover', ['Research', 'Startups', 'Campus Life', 'DAUST Impact']], ['About', ['Our Mission', 'Faculty', 'Alumni', 'Contact']]];
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: 'var(--daust-navy-deep)',
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1180,
      margin: '0 auto',
      padding: '72px 32px 40px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.5fr 1fr 1fr 1fr',
      gap: 40
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("img", {
    src: logoSrc,
    alt: "DAUST",
    style: {
      height: 34
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 13.5,
      lineHeight: 1.65,
      color: 'var(--fg-on-navy-muted)',
      maxWidth: 290,
      margin: '20px 0 18px'
    }
  }, "Dakar American University of Science & Technology \u2014 educating Africa's future world-class engineers, scientists and innovators. Somone, Thi\xE8s, Senegal.")), cols.map(([h, items]) => /*#__PURE__*/React.createElement("div", {
    key: h
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 12,
      letterSpacing: '.14em',
      textTransform: 'uppercase',
      color: 'var(--daust-orange)',
      marginBottom: 16
    }
  }, h), items.map(it => /*#__PURE__*/React.createElement("a", {
    key: it,
    href: "#",
    style: {
      display: 'block',
      fontFamily: 'var(--font-body)',
      fontSize: 14,
      color: 'var(--fg-on-navy-muted)',
      textDecoration: 'none',
      padding: '7px 0'
    }
  }, it))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 9,
      margin: '28px 0 24px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 42,
      height: 4,
      borderRadius: 999,
      background: '#fff'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 42,
      height: 4,
      borderRadius: 999,
      background: 'var(--daust-orange)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 42,
      height: 4,
      borderRadius: 999,
      background: 'var(--daust-steel)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 12,
      fontFamily: 'var(--font-body)',
      fontSize: 13,
      color: 'var(--fg-on-navy-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", null, "\xA9 DAUST 2026. All Rights Reserved."), /*#__PURE__*/React.createElement("span", null, "info@daust.org \xB7 +221 77 488 25 15"))));
}
Object.assign(__ds_scope, { Footer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/Footer.jsx", error: String((e && e.message) || e) }); }

// components/marketing/Header.jsx
try { (() => {
const {
  useState,
  useEffect
} = React;
function Header({
  active,
  onApply,
  logoSrc = 'assets/logos/daust-wordmark-white.png',
  links
}) {
  const nav = links || [['Home', '#'], ['Admissions', '#'], ['Education', '#'], ['Research', '#'], ['Startups', '#'], ['Campus', '#'], ['Alumni', '#'], ['About', '#']];
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 12);
    f();
    window.addEventListener('scroll', f, {
      passive: true
    });
    return () => window.removeEventListener('scroll', f);
  }, []);
  return /*#__PURE__*/React.createElement("header", {
    style: {
      background: 'var(--daust-navy)',
      position: 'sticky',
      top: 0,
      zIndex: 60,
      boxShadow: scrolled ? '0 6px 22px rgba(15,44,80,.30)' : '0 1px 0 rgba(255,255,255,.06)',
      transition: 'box-shadow .25s'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 1180,
      margin: '0 auto',
      padding: '0 32px',
      height: 74,
      display: 'flex',
      alignItems: 'center',
      gap: 26
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      display: 'flex',
      alignItems: 'center',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: logoSrc,
    alt: "DAUST",
    style: {
      height: 30,
      width: 'auto'
    }
  })), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      gap: 2,
      marginLeft: 'auto'
    }
  }, nav.map(([l, href]) => /*#__PURE__*/React.createElement("a", {
    key: l,
    href: href,
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 600,
      fontSize: 13.5,
      letterSpacing: '.02em',
      color: active === l ? '#fff' : 'var(--fg-on-navy-muted)',
      textDecoration: 'none',
      padding: '8px 11px',
      borderRadius: 999,
      background: active === l ? 'rgba(255,255,255,.10)' : 'transparent'
    }
  }, l))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      marginLeft: 'auto'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onApply,
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 600,
      fontSize: 14,
      letterSpacing: '.02em',
      border: 'none',
      borderRadius: 999,
      padding: '10px 22px',
      background: 'var(--daust-orange)',
      color: '#fff',
      cursor: 'pointer'
    }
  }, "Apply Now"))));
}
Object.assign(__ds_scope, { Header });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/Header.jsx", error: String((e && e.message) || e) }); }

// components/marketing/Heading.jsx
try { (() => {
function Heading({
  eyebrow,
  title,
  sub,
  align = 'left',
  on = 'light'
}) {
  const tc = on === 'navy' ? '#fff' : 'var(--fg1)';
  const sc = on === 'navy' ? 'var(--fg-on-navy-muted)' : 'var(--fg2)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: align,
      maxWidth: align === 'center' ? 720 : 'none',
      margin: align === 'center' ? '0 auto' : 0
    }
  }, eyebrow && /*#__PURE__*/React.createElement(EyebrowInline, null, eyebrow), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 'clamp(28px,3.2vw,40px)',
      color: tc,
      margin: '14px 0 0',
      letterSpacing: '.01em',
      lineHeight: 1.1
    }
  }, title), /*#__PURE__*/React.createElement(TriDashInline, {
    light: on === 'navy',
    style: {
      margin: align === 'center' ? '18px auto 0' : '18px 0 0'
    }
  }), sub && /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 16.5,
      lineHeight: 1.7,
      color: sc,
      margin: align === 'center' ? '20px auto 0' : '20px 0 0',
      maxWidth: 640
    }
  }, sub));
}
function EyebrowInline({
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 13,
      letterSpacing: '.16em',
      textTransform: 'uppercase',
      color: 'var(--daust-orange)'
    }
  }, children);
}
function TriDashInline({
  light,
  style
}) {
  const bar = c => /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      width: 32,
      height: 4,
      borderRadius: 999,
      background: c
    }
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 9,
      ...style
    }
  }, bar(light ? '#fff' : 'var(--daust-navy)'), bar('var(--daust-orange)'), bar('var(--daust-steel)'));
}
Object.assign(__ds_scope, { Heading });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/Heading.jsx", error: String((e && e.message) || e) }); }

// components/marketing/PageHero.jsx
try { (() => {
function PageHero({
  eyebrow,
  title,
  sub
}) {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      position: 'relative',
      background: 'var(--daust-navy-deep)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(90deg, rgba(15,44,80,.95) 0%, rgba(15,44,80,.82) 55%, rgba(15,44,80,.55) 100%)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      backgroundImage: 'radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)',
      backgroundSize: '20px 20px'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      maxWidth: 1180,
      margin: '0 auto',
      padding: '92px 32px 84px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontWeight: 700,
      fontSize: 13,
      letterSpacing: '.16em',
      textTransform: 'uppercase',
      color: 'var(--daust-orange)'
    }
  }, eyebrow), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 'clamp(34px,5vw,62px)',
      lineHeight: 1.02,
      letterSpacing: '.01em',
      color: '#fff',
      margin: '16px 0 0',
      maxWidth: 860
    }
  }, title), sub && /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 'clamp(15px,1.5vw,18px)',
      lineHeight: 1.65,
      color: 'var(--fg-on-navy-muted)',
      maxWidth: 600,
      margin: '22px 0 0'
    }
  }, sub), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 9,
      marginTop: 40
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 44,
      height: 5,
      borderRadius: 999,
      background: '#fff'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 44,
      height: 5,
      borderRadius: 999,
      background: 'var(--daust-orange)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 44,
      height: 5,
      borderRadius: 999,
      background: 'var(--daust-steel)'
    }
  }))));
}
Object.assign(__ds_scope, { PageHero });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/PageHero.jsx", error: String((e && e.message) || e) }); }

// components/marketing/StatCounter.jsx
try { (() => {
const {
  useRef,
  useState,
  useEffect
} = React;
function StatCounter({
  value,
  label,
  suffix = '',
  on = 'navy'
}) {
  const ref = React.useRef(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      const dur = 1400,
        t0 = performance.now();
      const tick = t => {
        const p = Math.min(1, (t - t0) / dur),
          e = 1 - Math.pow(1 - p, 3);
        setN(Math.round(value * e));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(en => en.forEach(x => {
      if (x.isIntersecting) run();
    }), {
      threshold: .4
    });
    io.observe(el);
    const fb = setTimeout(() => setN(value), 1800);
    return () => {
      io.disconnect();
      clearTimeout(fb);
    };
  }, [value]);
  const big = on === 'navy' ? '#fff' : 'var(--daust-navy)';
  const lab = on === 'navy' ? 'var(--fg-on-navy-muted)' : 'var(--fg2)';
  return /*#__PURE__*/React.createElement("div", {
    ref: ref
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 58,
      lineHeight: 1,
      color: big,
      letterSpacing: '.01em'
    }
  }, n.toLocaleString(), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--daust-orange)'
    }
  }, suffix)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-body)',
      fontSize: 14,
      color: lab,
      marginTop: 10,
      letterSpacing: '.02em'
    }
  }, label));
}
Object.assign(__ds_scope, { StatCounter });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/marketing/StatCounter.jsx", error: String((e && e.message) || e) }); }

// components/overlays/Drawer.jsx
try { (() => {
function Drawer({
  open,
  onClose,
  title,
  children,
  width = 480,
  footer
}) {
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 200,
      background: 'rgba(15,44,80,.32)',
      backdropFilter: 'blur(3px)',
      display: 'flex',
      justifyContent: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width,
      maxWidth: '94vw',
      height: '100%',
      background: 'var(--surface)',
      boxShadow: 'var(--shadow-xl)',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '18px 22px',
      borderBottom: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 17,
      fontWeight: 700
    }
  }, title), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      width: 34,
      height: 34,
      borderRadius: 999,
      border: 'none',
      background: 'var(--bg-subtle)',
      color: 'var(--fg2)',
      cursor: 'pointer'
    }
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: 22
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 22px',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      gap: 10,
      justifyContent: 'flex-end'
    }
  }, footer)));
}
Object.assign(__ds_scope, { Drawer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlays/Drawer.jsx", error: String((e && e.message) || e) }); }

// components/overlays/Modal.jsx
try { (() => {
function Modal({
  open,
  onClose,
  title,
  children,
  width = 460,
  footer
}) {
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 200,
      background: 'rgba(15,44,80,.45)',
      backdropFilter: 'blur(3px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width,
      maxWidth: '94vw',
      maxHeight: '90vh',
      overflowY: 'auto',
      background: 'var(--surface)',
      borderRadius: 'var(--radius-xl)',
      boxShadow: 'var(--shadow-xl)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '18px 22px',
      borderBottom: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 17,
      fontWeight: 700
    }
  }, title), /*#__PURE__*/React.createElement(IconButtonClose, {
    onClick: onClose
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 22
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 22px',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      gap: 10,
      justifyContent: 'flex-end'
    }
  }, footer)));
}
function IconButtonClose({
  onClick
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      width: 34,
      height: 34,
      borderRadius: 999,
      border: 'none',
      background: 'var(--bg-subtle)',
      color: 'var(--fg2)',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 16
    }
  }, "\u2715");
}
Object.assign(__ds_scope, { Modal });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlays/Modal.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Eyebrow = __ds_scope.Eyebrow;

__ds_ns.TriDash = __ds_scope.TriDash;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.BarChart = __ds_scope.BarChart;

__ds_ns.Donut = __ds_scope.Donut;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Progress = __ds_scope.Progress;

__ds_ns.Sparkline = __ds_scope.Sparkline;

__ds_ns.Stat = __ds_scope.Stat;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.SearchInput = __ds_scope.SearchInput;

__ds_ns.Segmented = __ds_scope.Segmented;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Toggle = __ds_scope.Toggle;

__ds_ns.PageHeader = __ds_scope.PageHeader;

__ds_ns.SectionTitle = __ds_scope.SectionTitle;

__ds_ns.CTABand = __ds_scope.CTABand;

__ds_ns.Footer = __ds_scope.Footer;

__ds_ns.Header = __ds_scope.Header;

__ds_ns.Heading = __ds_scope.Heading;

__ds_ns.PageHero = __ds_scope.PageHero;

__ds_ns.StatCounter = __ds_scope.StatCounter;

__ds_ns.Drawer = __ds_scope.Drawer;

__ds_ns.Modal = __ds_scope.Modal;

})();
