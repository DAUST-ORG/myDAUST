/* ===== Research & Innovation page ===== */
function Areas() {
  const areas = [
    ['cpu', 'Artificial Intelligence', 'Machine learning for African languages, agriculture, and health — building models that serve local needs.'],
    ['sun', 'Renewable Energy', 'Solar, storage and smart grids engineered for reliable power across the continent.'],
    ['bot', 'Robotics & Automation', 'Autonomous systems and embedded robotics, from competition platforms to industrial applications.'],
    ['radio', 'Connectivity & Networks', 'Communications, IoT and infrastructure that ensure inclusive participation in emerging technology.'],
    ['leaf', 'Sustainable Systems', 'Engineering for climate resilience, clean water and the environment.'],
    ['heart-pulse', 'Engineering for Health', 'Affordable medical devices and data systems for health challenges that matter here.'],
  ];
  return (
    <Section bg="#fff">
      <Heading eyebrow="Research Areas" title="Driven by purpose, rooted in local impact"
        sub="DAUST research ensures inclusive participation of Africa in the technologies shaping tomorrow." />
      <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 26, marginTop: 50 }}>
        {areas.map(([icon, t, b], i) => (
          <div key={t} className={'reveal d' + ((i % 3) + 1)} style={{ background: D.subtle, borderRadius: 16, padding: '32px 30px',
            border: `1px solid ${D.border}`, transition: 'transform .2s, box-shadow .2s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 14px 40px rgba(15,44,80,.14)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
            <div style={{ width: 54, height: 54, borderRadius: 14, background: D.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
              <i data-lucide={icon} style={{ width: 25, height: 25, color: '#fff' }}></i>
            </div>
            <div style={{ fontFamily: D.display, fontWeight: 700, fontSize: 19, color: D.fg1, marginBottom: 9 }}>{t}</div>
            <p style={{ fontFamily: D.body, fontSize: 14.5, lineHeight: 1.65, color: D.fg2, margin: 0 }}>{b}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ImpactStats() {
  const stats = [[100, 'Student Projects', '+'], [1000, 'Guests & Attendees', '+'], [6, 'Research Areas', ''], [25, 'Industry Partners', '+']];
  return (
    <section style={{ background: D.navy, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
      <div style={{ position: 'relative', maxWidth: MAXW, margin: '0 auto', padding: '74px 32px' }}>
        <div className="reveal"><Eyebrow on="navy">DAUST Impact 2025</Eyebrow></div>
        <div className="grid-4 reveal d1" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 28, marginTop: 28 }}>
          {stats.map(([v, l, s]) => <Stat key={l} value={v} label={l} suffix={s} on="navy" />)}
        </div>
      </div>
    </section>
  );
}

function Ventures() {
  return (
    <Section bg={D.subtle}>
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '0.95fr 1.05fr', gap: 60, alignItems: 'center' }}>
        <div className="reveal">
          <Eyebrow>Technology Ventures</Eyebrow>
          <h2 style={{ fontFamily: D.display, fontWeight: 700, fontSize: 'clamp(26px,3vw,38px)', color: D.fg1, margin: '14px 0 0', lineHeight: 1.12 }}>
            From the lab to the market.
          </h2>
          <TriDash w={32} h={4} style={{ margin: '20px 0 22px' }} />
          <p style={{ fontFamily: D.body, fontSize: 16, lineHeight: 1.7, color: D.fg2, margin: '0 0 22px' }}>
            Our Technology Ventures program empowers students to build entrepreneurial skills and bring new
            technologies to market — turning research and class projects into companies with real impact.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 28 }}>
            {['Venture design & prototyping studios', 'Mentorship from founders and industry', 'Pitch events, demo days and seed support'].map(it => (
              <div key={it} style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
                <i data-lucide="check-circle-2" style={{ width: 19, height: 19, color: D.orange, flexShrink: 0 }}></i>
                <span style={{ fontFamily: D.body, fontSize: 15, color: D.fg2 }}>{it}</span>
              </div>
            ))}
          </div>
          <Button variant="navy" size="lg" href="startups.html">Explore the program <i data-lucide="arrow-right" style={{ width: 16, height: 16 }}></i></Button>
        </div>
        <div className="reveal d2"><PhotoSlot id="research-ventures" label="Drop a project / demo-day photo" h={440} radius={18} /></div>
      </div>
    </Section>
  );
}

function Feature() {
  return (
    <section style={{ position: 'relative', background: D.navyDeep, overflow: 'hidden' }}>
      <image-slot id="research-feature" placeholder="Drop a feature photo" shape="rect" fit="cover"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 0 }}></image-slot>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(15,44,80,.93) 0%, rgba(15,44,80,.7) 60%, rgba(15,44,80,.4) 100%)' }} />
      <div style={{ position: 'relative', maxWidth: MAXW, margin: '0 auto', padding: '88px 32px' }}>
        <div className="reveal" style={{ maxWidth: 620 }}>
          <span style={{ fontFamily: D.body, fontWeight: 700, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase',
            color: '#fff', background: D.orange, padding: '5px 12px', borderRadius: 999 }}>Featured</span>
          <h2 style={{ fontFamily: D.display, fontWeight: 800, fontSize: 'clamp(28px,3.4vw,44px)', color: '#fff', margin: '20px 0 0', lineHeight: 1.08 }}>
            Le Sénégal décroche la Lune
          </h2>
          <p style={{ fontFamily: D.body, fontSize: 17, lineHeight: 1.7, color: D.onNavyMuted, margin: '20px 0 30px' }}>
            Why 2026 marks a historic turning point for African innovation — and the role DAUST students and
            researchers are playing in it.
          </p>
          <Button variant="outlineLight" size="lg">Read the story <i data-lucide="arrow-right" style={{ width: 16, height: 16 }}></i></Button>
        </div>
      </div>
    </section>
  );
}

function ResearchApp() {
  const { apply, setApply } = usePage();
  return (
    <div>
      <Header active="Research" onApply={() => setApply(true)} />
      <PageHero eyebrow="Research & Innovation" title="Ensuring Africa has a seat at the table"
        sub="Research at DAUST is driven by purpose and rooted in local impact — advancing the emerging technologies that will shape the continent's future."
        slotId="research-hero" />
      <Areas />
      <ImpactStats />
      <Ventures />
      <Feature />
      <CTABand onApply={() => setApply(true)} />
      <Footer />
      <ApplyModal open={apply} onClose={() => setApply(false)} />
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<ResearchApp />);
