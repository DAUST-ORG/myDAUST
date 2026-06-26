/* ===== Startups / Technology Ventures page ===== */
function VenturesIntro() {
  return (
    <Section bg="#fff">
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
        <div className="reveal">
          <Eyebrow>The Program</Eyebrow>
          <h2 style={{ fontFamily: D.display, fontWeight: 700, fontSize: 'clamp(28px,3.2vw,42px)', color: D.fg1, margin: '14px 0 0', lineHeight: 1.1 }}>
            From the classroom to the market.
          </h2>
          <TriDash w={32} h={4} style={{ margin: '20px 0 24px' }} />
          <p style={{ fontFamily: D.body, fontSize: 16.5, lineHeight: 1.7, color: D.fg2, margin: '0 0 18px' }}>
            The DAUST Technology Ventures program empowers students to develop entrepreneurial skills, create new
            technologies, and bring innovative ideas to market.
          </p>
          <p style={{ fontFamily: D.body, fontSize: 16.5, lineHeight: 1.7, color: D.fg2, margin: 0 }}>
            It's where engineering projects become companies — driven by purpose and rooted in local impact.
          </p>
        </div>
        <div className="reveal d2"><PhotoSlot id="startups-intro" label="Drop a startup / demo-day photo" h={440} radius={18} /></div>
      </div>
    </Section>
  );
}

function Pipeline() {
  const phases = [
    ['Ideate', 'Spot a real problem worth solving and shape it into a venture concept.', 'lightbulb'],
    ['Prototype', 'Build an MVP in our studios with engineering and design support.', 'hammer'],
    ['Validate', 'Test with real users, refine the model, and prepare to scale.', 'flask-conical'],
    ['Launch', 'Pitch for seed support and take your company to market.', 'rocket'],
  ];
  return (
    <Section bg={D.subtle}>
      <Heading eyebrow="How It Works" title="The venture pipeline" align="center"
        sub="A structured path from a class project to a funded, market-ready company." />
      <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginTop: 50 }}>
        {phases.map(([t, b, icon], i) => (
          <div key={t} className={'reveal d' + (i + 1)} style={{ position: 'relative', background: '#fff', borderRadius: 16, padding: '30px 26px', border: `1px solid ${D.border}` }}>
            <div style={{ position: 'absolute', top: 22, right: 24, fontFamily: D.display, fontWeight: 800, fontSize: 34, color: D.border, lineHeight: 1 }}>0{i + 1}</div>
            <div style={{ width: 50, height: 50, borderRadius: 13, background: D.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <i data-lucide={icon} style={{ width: 23, height: 23, color: '#fff' }}></i>
            </div>
            <div style={{ fontFamily: D.display, fontWeight: 700, fontSize: 18, color: D.fg1, marginBottom: 8 }}>{t}</div>
            <p style={{ fontFamily: D.body, fontSize: 13.5, lineHeight: 1.6, color: D.fg2, margin: 0 }}>{b}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Support() {
  const items = [
    ['users', 'Mentorship network', 'Guidance from founders, faculty and industry partners at every stage.'],
    ['box', 'Prototyping studios', 'Access to labs, equipment and engineering support to build real products.'],
    ['presentation', 'Pitch & demo days', 'Showcase ventures to investors, partners and the DAUST community.'],
    ['coins', 'Seed support', 'Pathways to early funding to turn validated ideas into companies.'],
  ];
  return (
    <Section bg="#fff">
      <Heading eyebrow="What You Get" title="Everything you need to build" />
      <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginTop: 48 }}>
        {items.map(([icon, t, b], i) => (
          <div key={t} className={'reveal d' + (i + 1)} style={{ borderTop: `3px solid ${D.orange}`, background: D.subtle, borderRadius: '4px 4px 16px 16px', padding: '28px 26px' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: D.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
              <i data-lucide={icon} style={{ width: 23, height: 23, color: '#fff' }}></i>
            </div>
            <div style={{ fontFamily: D.display, fontWeight: 700, fontSize: 17, color: D.fg1, marginBottom: 8 }}>{t}</div>
            <p style={{ fontFamily: D.body, fontSize: 14, lineHeight: 1.6, color: D.fg2, margin: 0 }}>{b}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Showcase() {
  const cats = ['Robotics', 'HealthTech', 'Agriculture', 'Space Technology', 'AI Tools', 'Clean Energy'];
  return (
    <section style={{ background: D.navy, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
      <div style={{ position: 'relative', maxWidth: MAXW, margin: '0 auto', padding: '84px 32px' }}>
        <div className="reveal" style={{ maxWidth: 680 }}>
          <Eyebrow on="navy">Student Ventures</Eyebrow>
          <h2 style={{ fontFamily: D.display, fontWeight: 700, fontSize: 'clamp(28px,3.2vw,40px)', color: '#fff', margin: '14px 0 0', lineHeight: 1.1 }}>
            Ideas across every field that matters
          </h2>
          <p style={{ fontFamily: D.body, fontSize: 16.5, lineHeight: 1.7, color: D.onNavyMuted, margin: '20px 0 0' }}>
            From low-cost medical devices to AI-powered tools and sustainable farming solutions, DAUST ventures
            reflect the creativity and determination of our students.
          </p>
        </div>
        <div className="reveal d2" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 34 }}>
          {cats.map(c => (
            <span key={c} style={{ fontFamily: D.body, fontWeight: 600, fontSize: 14.5, color: '#fff',
              background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.16)', borderRadius: 999, padding: '11px 22px' }}>{c}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function VStats() {
  const stats = [[100, 'Student Projects', '+'], [1000, 'Impact Attendees', '+'], [6, 'Venture Sectors', ''], [4, 'Year Startup Track', '']];
  return (
    <Section bg="#fff">
      <Heading eyebrow="DAUST Impact" title="A track record of building" align="center" />
      <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 28, marginTop: 46 }}>
        {stats.map(([v, l, s]) => (
          <div key={l} style={{ textAlign: 'center' }} className="reveal"><Stat value={v} label={l} suffix={s} on="light" /></div>
        ))}
      </div>
    </Section>
  );
}

function StartupsApp() {
  const { apply, setApply } = usePage();
  return (
    <div>
      <Header active="Startups" onApply={() => setApply(true)} />
      <PageHero eyebrow="Technology Ventures" title="Build the company, not just the project"
        sub="DAUST's startup program turns student engineering into ventures with real impact — entrepreneurship, prototyping and go-to-market for founders."
        slotId="startups-hero" />
      <VenturesIntro />
      <Pipeline />
      <Support />
      <Showcase />
      <VStats />
      <CTABand onApply={() => setApply(true)} />
      <Footer />
      <ApplyModal open={apply} onClose={() => setApply(false)} />
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<StartupsApp />);
