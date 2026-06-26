/* ============================================================
   DAUST website — shared primitives, header, footer, modal.
   Exposed on window for cross-file (Babel) use.
   ============================================================ */
const D = {
  navy: '#153b6a', navyDeep: '#0f2c50', navy700: '#1d4a82',
  orange: '#ed8425', orange600: '#d6731a', steel: '#9da6ae',
  white: '#ffffff', subtle: '#f5f7f9',
  border: '#d7dee6', fg1: '#141a21', fg2: '#4d5965', fg3: '#6c7884',
  onNavyMuted: '#b9c4d4',
  display: "'Saira', system-ui, sans-serif",
  body: "'Montserrat', system-ui, sans-serif",
};
const MAXW = 1180;

/* ---------- Scroll reveal hook ---------- */
function useReveal() {
  React.useEffect(() => {
    let io;
    const els = Array.from(document.querySelectorAll('.reveal:not(.in)'));
    if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
    io = new IntersectionObserver((entries) => {
      entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0, rootMargin: '0px 0px -60px 0px' });
    els.forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > -10) {
        el.classList.add('instant', 'in'); // in view at load → show instantly (no timeline dependency)
      } else {
        io.observe(el); // below fold → animate in on scroll
      }
    });
    return () => io && io.disconnect();
  }, []);
}

/* ---------- Eyebrow ---------- */
function Eyebrow({ children, on = 'light', style }) {
  return (
    <div style={{ fontFamily: D.body, fontWeight: 700, fontSize: 13, letterSpacing: '.16em',
      textTransform: 'uppercase', color: D.orange, ...style }}>{children}</div>
  );
}

/* ---------- Tri-dash motif ---------- */
function TriDash({ w = 36, h = 5, gap = 9, style, light = false }) {
  const bar = (c) => <span style={{ display: 'block', width: w, height: h, borderRadius: 999, background: c }} />;
  return (
    <div style={{ display: 'flex', gap, ...style }}>
      {bar(light ? '#fff' : D.navy)}{bar(D.orange)}{bar(D.steel)}
    </div>
  );
}

/* ---------- Section shell ---------- */
function Section({ children, bg = '#fff', pad = '96px 32px', max = MAXW, style, id }) {
  return (
    <section id={id} style={{ background: bg, padding: pad, ...style }}>
      <div style={{ maxWidth: max, margin: '0 auto' }}>{children}</div>
    </section>
  );
}

/* ---------- Button ---------- */
function Button({ children, variant = 'primary', size = 'md', onClick, href, style }) {
  const sizes = { sm: '10px 20px', md: '13px 28px', lg: '16px 38px' };
  const [h, setH] = React.useState(false);
  const base = {
    fontFamily: D.body, fontWeight: 600, fontSize: size === 'lg' ? 15 : size === 'sm' ? 13 : 14,
    letterSpacing: '.03em', border: 'none', borderRadius: 999, padding: sizes[size],
    cursor: 'pointer', transition: 'all .16s cubic-bezier(.2,.7,.3,1)', textDecoration: 'none',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, whiteSpace: 'nowrap', ...style,
  };
  const variants = {
    primary: { background: D.orange, color: '#fff' },
    navy: { background: D.navy, color: '#fff' },
    outline: { background: 'transparent', color: D.navy, boxShadow: `inset 0 0 0 1.5px ${D.navy}` },
    outlineLight: { background: 'transparent', color: '#fff', boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.55)' },
    ghost: { background: 'transparent', color: D.navy },
  };
  const hover = {
    primary: { background: D.orange600, transform: 'translateY(-1px)' },
    navy: { background: D.navy700, transform: 'translateY(-1px)' },
    outline: { background: D.navy, color: '#fff' },
    outlineLight: { background: '#fff', color: D.navy },
    ghost: { background: D.subtle },
  };
  const Tag = href ? 'a' : 'button';
  return (
    <Tag href={href} style={{ ...base, ...variants[variant], ...(h ? hover[variant] : {}) }}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onClick={onClick}>
      {children}
    </Tag>
  );
}

/* ---------- Photo slot (user-fillable) ---------- */
function PhotoSlot({ id, label = 'Drop a photo', h = 300, radius = 14, shape = 'rounded', style }) {
  return (
    <image-slot id={id} placeholder={label} shape={shape} radius={String(radius)}
      style={{ width: '100%', height: typeof h === 'number' ? h + 'px' : h, borderRadius: radius + 'px', ...style }}>
    </image-slot>
  );
}

/* ---------- Animated stat counter ---------- */
function Stat({ value, label, suffix = '', on = 'navy' }) {
  const ref = React.useRef(null);
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    let done = false;
    const run = () => {
      if (done) return; done = true;
      const dur = 1400, t0 = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        setN(Math.round(value * e));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((en) => { en.forEach(x => { if (x.isIntersecting) run(); }); }, { threshold: 0.4 });
    io.observe(el);
    // Fallback: ensure final value even if rAF/timeline is throttled
    const fb = setTimeout(() => setN(value), 1800);
    return () => { io.disconnect(); clearTimeout(fb); };
  }, [value]);
  const big = on === 'navy' ? '#fff' : D.navy;
  const lab = on === 'navy' ? D.onNavyMuted : D.fg2;
  return (
    <div ref={ref}>
      <div style={{ fontFamily: D.display, fontWeight: 800, fontSize: 58, lineHeight: 1, color: big, letterSpacing: '.01em' }}>
        {n.toLocaleString()}<span style={{ color: D.orange }}>{suffix}</span>
      </div>
      <div style={{ fontFamily: D.body, fontSize: 14, color: lab, marginTop: 10, letterSpacing: '.02em' }}>{label}</div>
    </div>
  );
}

/* ---------- Header ---------- */
function Header({ active, onApply }) {
  const links = [
    ['Home', 'index.html'], ['Admissions', 'admissions.html'], ['Education', 'academics.html'],
    ['Research', 'research.html'], ['Startups', 'startups.html'], ['Campus', 'campus.html'],
    ['Alumni', 'alumni.html'], ['About', 'about.html'],
  ];
  const [scrolled, setScrolled] = React.useState(false);
  const [menu, setMenu] = React.useState(false);
  React.useEffect(() => {
    const f = () => setScrolled(window.scrollY > 12);
    f(); window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);
  return (
    <header style={{ background: D.navy, position: 'sticky', top: 0, zIndex: 60,
      boxShadow: scrolled ? '0 6px 22px rgba(15,44,80,.30)' : '0 1px 0 rgba(255,255,255,.06)',
      transition: 'box-shadow .25s' }}>
      <div style={{ maxWidth: MAXW, margin: '0 auto', padding: '0 32px', height: 74,
        display: 'flex', alignItems: 'center', gap: 26 }}>
        <a href="index.html" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <img src="assets/daust-wordmark-white.png" alt="DAUST" style={{ height: 30, width: 'auto', flexShrink: 0 }} />
        </a>
        <nav className="hdr-nav" style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
          {links.map(([l, href]) => {
            const on = active === l;
            return (
              <a key={l} href={href} style={{
                fontFamily: D.body, fontWeight: 600, fontSize: 13.5, letterSpacing: '.02em',
                color: on ? '#fff' : D.onNavyMuted, textDecoration: 'none', padding: '8px 11px',
                borderRadius: 999, transition: '.15s', position: 'relative',
                background: on ? 'rgba(255,255,255,.10)' : 'transparent',
              }}
                onMouseEnter={e => { if (!on) e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { if (!on) e.currentTarget.style.color = D.onNavyMuted; }}>
                {l}
              </a>
            );
          })}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 'auto' }} className="hdr-right">
          <a href="tel:+221774882515" className="hdr-phone" style={{ display: 'flex', alignItems: 'center', gap: 7,
            whiteSpace: 'nowrap', color: D.onNavyMuted, fontFamily: D.body, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
            <i data-lucide="phone" style={{ width: 15, height: 15 }}></i>+221 77 488 25 15
          </a>
          <Button variant="primary" size="sm" onClick={onApply}>Apply Now</Button>
          <button className="hdr-burger" onClick={() => setMenu(m => !m)} style={{ display: 'none',
            background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }}>
            <i data-lucide={menu ? 'x' : 'menu'} style={{ width: 24, height: 24 }}></i>
          </button>
        </div>
      </div>
      {menu && (
        <div style={{ background: D.navyDeep, padding: '8px 20px 18px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
          {links.map(([l, href]) => (
            <a key={l} href={href} style={{ display: 'block', fontFamily: D.body, fontWeight: 600, fontSize: 15,
              color: active === l ? '#fff' : D.onNavyMuted, textDecoration: 'none', padding: '12px 6px' }}>{l}</a>
          ))}
        </div>
      )}
    </header>
  );
}

/* ---------- CTA band ---------- */
function CTABand({ onApply }) {
  return (
    <section style={{ background: D.navy, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
      <div style={{ position: 'absolute', right: -80, top: -80, width: 360, height: 360, borderRadius: 999,
        background: 'radial-gradient(circle, rgba(237,132,37,.30), transparent 70%)' }} />
      <div style={{ position: 'relative', maxWidth: MAXW, margin: '0 auto', padding: '80px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 36, flexWrap: 'wrap' }}>
        <div className="reveal">
          <Eyebrow>Admissions Open · September 2026</Eyebrow>
          <h2 style={{ fontFamily: D.display, fontWeight: 800, fontSize: 46, color: '#fff', margin: '14px 0 0',
            lineHeight: 1.05, letterSpacing: '.01em', maxWidth: 620 }}>
            Your engineering journey starts in Somone.
          </h2>
        </div>
        <div className="reveal d1" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <Button variant="primary" size="lg" onClick={onApply}>Apply Now <i data-lucide="arrow-right" style={{ width: 17, height: 17 }}></i></Button>
          <Button variant="outlineLight" size="lg" href="admissions.html">Visit Admissions</Button>
        </div>
      </div>
    </section>
  );
}

/* ---------- Footer ---------- */
function Footer() {
  const cols = [
    ['Study', [['Admissions', 'admissions.html'], ['Education', 'academics.html'], ['Intensive English', 'academics.html'], ['Tuition & Aid', 'admissions.html']]],
    ['Discover', [['Research', 'research.html'], ['Startups', 'startups.html'], ['Campus Life', 'campus.html'], ['DAUST Impact', 'campus.html']]],
    ['About', [['Our Mission', 'about.html'], ['Faculty', 'about.html'], ['Alumni', 'alumni.html'], ['Contact', 'about.html']]],
  ];
  const socials = ['twitter', 'facebook', 'linkedin', 'youtube', 'instagram'];
  return (
    <footer style={{ background: D.navyDeep, color: '#fff' }}>
      <div style={{ maxWidth: MAXW, margin: '0 auto', padding: '72px 32px 40px' }}>
        <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: 40 }}>
          <div>
            <img src="assets/daust-wordmark-white.png" alt="DAUST" style={{ height: 34 }} />
            <p style={{ fontFamily: D.body, fontSize: 13.5, lineHeight: 1.65, color: D.onNavyMuted, maxWidth: 290, margin: '20px 0 18px' }}>
              Dakar American University of Science &amp; Technology — educating Africa's future world-class engineers, scientists and innovators. Somone, Thiès, Senegal.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              {socials.map(s => (
                <a key={s} href="#" style={{ width: 36, height: 36, borderRadius: 999, background: 'rgba(255,255,255,.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '.16s' }}
                  onMouseEnter={e => e.currentTarget.style.background = D.orange}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,.08)'}>
                  <i data-lucide={s} style={{ width: 16, height: 16, color: '#fff' }}></i>
                </a>
              ))}
            </div>
          </div>
          {cols.map(([h, items]) => (
            <div key={h}>
              <div style={{ fontFamily: D.body, fontWeight: 700, fontSize: 12, letterSpacing: '.14em',
                textTransform: 'uppercase', color: D.orange, marginBottom: 16 }}>{h}</div>
              {items.map(([it, href]) => (
                <a key={it} href={href} style={{ display: 'block', fontFamily: D.body, fontSize: 14, color: D.onNavyMuted,
                  textDecoration: 'none', padding: '7px 0', transition: '.14s' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                  onMouseLeave={e => e.currentTarget.style.color = D.onNavyMuted}>{it}</a>
              ))}
            </div>
          ))}
        </div>
        <div className="reveal" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 40 }}>
          {[['shield-check', 'Accredited by ANAQ-Sup'], ['link', '2 + 2 Partner · University of Nebraska'], ['briefcase', '100% Graduate Employment']].map(([icon, label]) => (
            <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: D.body, fontWeight: 600,
              fontSize: 12.5, color: '#fff', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.13)',
              borderRadius: 999, padding: '9px 16px' }}>
              <i data-lucide={icon} style={{ width: 15, height: 15, color: D.orange }}></i>{label}
            </span>
          ))}
        </div>
        <TriDash w={42} h={4} light style={{ margin: '28px 0 24px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
          fontFamily: D.body, fontSize: 13, color: D.onNavyMuted }}>
          <span>© DAUST 2026. All Rights Reserved.</span>
          <span>info@daust.org · +221 77 488 25 15 · +221 78 128 44 58</span>
        </div>
      </div>
    </footer>
  );
}

/* ---------- Apply Modal ---------- */
function ApplyModal({ open, onClose }) {
  const [step, setStep] = React.useState(0);
  const [data, setData] = React.useState({ program: 'Computer Science' });
  React.useEffect(() => { if (open) { setStep(0); } }, [open]);
  if (!open) return null;
  const programs = ['Computer Science', 'Mechanical Engineering', 'Electrical Engineering', 'Intensive English Program'];
  const field = (label, key, type = 'text', ph = '') => (
    <label style={{ display: 'block', marginBottom: 16 }}>
      <span style={{ fontFamily: D.body, fontWeight: 600, fontSize: 13, color: D.fg2, display: 'block', marginBottom: 7 }}>{label}</span>
      <input type={type} placeholder={ph} value={data[key] || ''} onChange={e => setData(d => ({ ...d, [key]: e.target.value }))}
        style={{ width: '100%', fontFamily: D.body, fontSize: 14, padding: '12px 14px', borderRadius: 10,
          border: `1.5px solid ${D.border}`, outline: 'none', color: D.fg1 }}
        onFocus={e => e.target.style.borderColor = D.navy} onBlur={e => e.target.style.borderColor = D.border} />
    </label>
  );
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,44,80,.55)',
      backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 22, width: 'min(540px, 100%)',
        maxHeight: '92vh', overflow: 'auto', boxShadow: '0 30px 80px rgba(15,44,80,.4)' }}>
        <div style={{ background: D.navy, padding: '26px 30px', position: 'relative' }}>
          <Eyebrow on="navy">Admissions · September 2026</Eyebrow>
          <h3 style={{ fontFamily: D.display, fontWeight: 700, fontSize: 26, color: '#fff', margin: '8px 0 0' }}>
            {step === 2 ? 'Application received' : 'Start your application'}
          </h3>
          <button onClick={onClose} style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,.12)',
            border: 'none', borderRadius: 999, width: 34, height: 34, cursor: 'pointer', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i data-lucide="x" style={{ width: 18, height: 18 }}></i>
          </button>
          <div style={{ display: 'flex', gap: 6, marginTop: 18 }}>
            {[0, 1, 2].map(i => <span key={i} style={{ height: 4, flex: 1, borderRadius: 999,
              background: i <= step ? D.orange : 'rgba(255,255,255,.2)', transition: '.3s' }} />)}
          </div>
        </div>
        <div style={{ padding: '28px 30px 30px' }}>
          {step === 0 && (
            <div>
              <div style={{ fontFamily: D.body, fontWeight: 600, fontSize: 13, color: D.fg2, marginBottom: 10 }}>Choose a program</div>
              <div style={{ display: 'grid', gap: 10, marginBottom: 22 }}>
                {programs.map(p => (
                  <button key={p} onClick={() => setData(d => ({ ...d, program: p }))} style={{ textAlign: 'left',
                    fontFamily: D.body, fontSize: 14.5, fontWeight: 600, padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                    border: `1.5px solid ${data.program === p ? D.navy : D.border}`, background: data.program === p ? D.subtle : '#fff',
                    color: D.fg1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    {p}{data.program === p && <i data-lucide="check" style={{ width: 18, height: 18, color: D.orange }}></i>}
                  </button>
                ))}
              </div>
              <Button variant="navy" size="lg" style={{ width: '100%' }} onClick={() => setStep(1)}>
                Continue <i data-lucide="arrow-right" style={{ width: 16, height: 16 }}></i>
              </Button>
            </div>
          )}
          {step === 1 && (
            <div>
              {field('Full name', 'name', 'text', 'Aminata Diop')}
              {field('Email', 'email', 'email', 'you@example.com')}
              {field('Country', 'country', 'text', 'Senegal')}
              <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                <Button variant="ghost" size="lg" onClick={() => setStep(0)}>Back</Button>
                <Button variant="primary" size="lg" style={{ flex: 1 }} onClick={() => setStep(2)}>
                  Submit application
                </Button>
              </div>
            </div>
          )}
          {step === 2 && (
            <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
              <div style={{ width: 64, height: 64, borderRadius: 999, background: D.subtle, margin: '0 auto 18px',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i data-lucide="check" style={{ width: 30, height: 30, color: D.orange }}></i>
              </div>
              <p style={{ fontFamily: D.body, fontSize: 15, lineHeight: 1.6, color: D.fg2, margin: '0 0 22px' }}>
                Thank you{data.name ? ', ' + data.name.split(' ')[0] : ''}. Our admissions team will reach out about your
                <strong style={{ color: D.fg1 }}> {data.program}</strong> application within 3 business days.
              </p>
              <Button variant="navy" size="lg" style={{ width: '100%' }} onClick={onClose}>Done</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Page wrapper: header + apply state + reveal + lucide ---------- */
function usePage() {
  const [apply, setApply] = React.useState(false);
  useReveal();
  React.useEffect(() => { if (window.lucide) window.lucide.createIcons(); });
  return { apply, setApply };
}

/* ---------- Inner page hero banner ---------- */
function PageHero({ eyebrow, title, sub, slotId }) {
  return (
    <section style={{ position: 'relative', background: D.navyDeep, overflow: 'hidden' }}>
      {slotId && (
        <image-slot id={slotId} placeholder="Drop a banner photo" shape="rect" fit="cover"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 0 }}></image-slot>
      )}
      <div style={{ position: 'absolute', inset: 0, background:
        'linear-gradient(90deg, rgba(15,44,80,.95) 0%, rgba(15,44,80,.82) 55%, rgba(15,44,80,.55) 100%)' }} />
      <div style={{ position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
      <div style={{ position: 'relative', maxWidth: MAXW, margin: '0 auto', padding: '92px 32px 84px' }}>
        <div className="reveal"><Eyebrow on="navy">{eyebrow}</Eyebrow></div>
        <h1 className="reveal d1" style={{ fontFamily: D.display, fontWeight: 800, fontSize: 'clamp(34px,5vw,62px)',
          lineHeight: 1.02, letterSpacing: '.01em', color: '#fff', margin: '16px 0 0', maxWidth: 860 }}>{title}</h1>
        {sub && <p className="reveal d2" style={{ fontFamily: D.body, fontSize: 'clamp(15px,1.5vw,18px)', lineHeight: 1.65,
          color: D.onNavyMuted, maxWidth: 600, margin: '22px 0 0' }}>{sub}</p>}
        <TriDash w={44} h={5} light style={{ marginTop: 40 }} />
      </div>
    </section>
  );
}

/* ---------- Section heading block ---------- */
function Heading({ eyebrow, title, sub, align = 'left', on = 'light' }) {
  const tc = on === 'navy' ? '#fff' : D.fg1;
  const sc = on === 'navy' ? D.onNavyMuted : D.fg2;
  return (
    <div className="reveal" style={{ textAlign: align, maxWidth: align === 'center' ? 720 : 'none',
      margin: align === 'center' ? '0 auto' : 0 }}>
      {eyebrow && <Eyebrow on={on}>{eyebrow}</Eyebrow>}
      <h2 style={{ fontFamily: D.display, fontWeight: 700, fontSize: 'clamp(28px,3.2vw,40px)', color: tc,
        margin: '14px 0 0', letterSpacing: '.01em', lineHeight: 1.1 }}>{title}</h2>
      <TriDash w={32} h={4} light={on === 'navy'} style={{ margin: align === 'center' ? '18px auto 0' : '18px 0 0' }} />
      {sub && <p style={{ fontFamily: D.body, fontSize: 16.5, lineHeight: 1.7, color: sc,
        margin: align === 'center' ? '20px auto 0' : '20px 0 0', maxWidth: 640 }}>{sub}</p>}
    </div>
  );
}

Object.assign(window, { D, MAXW, useReveal, usePage, Eyebrow, TriDash, Section, Button, PhotoSlot, Stat, Header, CTABand, Footer, ApplyModal, PageHero, Heading });
