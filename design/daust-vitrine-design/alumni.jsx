/* ===== Alumni page ===== */
function AlumniIntro() {
  return (
    <Section bg="#fff">
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
        <div className="reveal">
          <Eyebrow>The DAUST Network</Eyebrow>
          <h2 style={{ fontFamily: D.display, fontWeight: 700, fontSize: 'clamp(28px,3.2vw,42px)', color: D.fg1, margin: '14px 0 0', lineHeight: 1.1 }}>
            Engineers shaping Africa's future.
          </h2>
          <TriDash w={32} h={4} style={{ margin: '20px 0 24px' }} />
          <p style={{ fontFamily: D.body, fontSize: 16.5, lineHeight: 1.7, color: D.fg2, margin: '0 0 18px' }}>
            DAUST graduates carry the university's mission into industry, research and entrepreneurship across the
            continent and beyond — driven by purpose, rooted in local impact.
          </p>
          <p style={{ fontFamily: D.body, fontSize: 16.5, lineHeight: 1.7, color: D.fg2, margin: 0 }}>
            Wherever they go, they stay part of a close, growing community of builders.
          </p>
        </div>
        <div className="reveal d2"><PhotoSlot id="alumni-intro" label="Drop a graduation / alumni photo" h={440} radius={18} /></div>
      </div>
    </Section>
  );
}

function AlumniStats() {
  const stats = [[100, 'Student Projects', '+'], [12, 'Nationalities', '+'], [6, 'Industries', ''], [2017, 'Founding Class', '']];
  return (
    <section style={{ background: D.navy, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
      <div style={{ position: 'relative', maxWidth: MAXW, margin: '0 auto', padding: '74px 32px' }}>
        <div className="reveal"><Eyebrow on="navy">Our Graduates</Eyebrow></div>
        <div className="grid-4 reveal d1" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 28, marginTop: 28 }}>
          {stats.map(([v, l, s]) => <Stat key={l} value={v} label={l} suffix={s} on="navy" />)}
        </div>
      </div>
    </section>
  );
}

function Paths() {
  const paths = [
    ['briefcase', 'Industry', 'Software, electronics, energy and telecom companies across Africa and globally.'],
    ['rocket', 'Founders', 'Alumni turn Technology Ventures projects into companies that hire and build locally.'],
    ['graduation-cap', 'Graduate study', 'Top master\u2019s and PhD programs, advancing research in their fields.'],
    ['landmark', 'Public impact', 'Engineering roles in government, NGOs and institutions driving development.'],
  ];
  return (
    <Section bg="#fff">
      <Heading eyebrow="Where They Go" title="Many paths, one foundation" align="center" />
      <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginTop: 48 }}>
        {paths.map(([icon, t, b], i) => (
          <div key={t} className={'reveal d' + (i + 1)} style={{ background: D.subtle, borderRadius: 16, padding: '32px 28px', border: `1px solid ${D.border}` }}>
            <div style={{ width: 54, height: 54, borderRadius: 14, background: D.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
              <i data-lucide={icon} style={{ width: 25, height: 25, color: '#fff' }}></i>
            </div>
            <div style={{ fontFamily: D.display, fontWeight: 700, fontSize: 18, color: D.fg1, marginBottom: 9 }}>{t}</div>
            <p style={{ fontFamily: D.body, fontSize: 14, lineHeight: 1.6, color: D.fg2, margin: 0 }}>{b}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Stories() {
  const stories = [
    ['Computer Engineering', 'A capstone project on AI for local languages became a startup serving thousands of users.', 'alumni-s1'],
    ['Electrical Engineering', 'From a renewable-energy lab at DAUST to engineering clean-power systems across the region.', 'alumni-s2'],
    ['Technology Ventures', 'A HealthTech venture born at DAUST Impact now builds low-cost medical devices.', 'alumni-s3'],
  ];
  return (
    <Section bg={D.subtle}>
      <Heading eyebrow="Alumni Stories" title="From Somone to the world" />
      <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 26, marginTop: 46 }}>
        {stories.map(([tag, quote, id], i) => (
          <div key={id} className={'reveal d' + (i + 1)} style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: `1px solid ${D.border}` }}>
            <image-slot id={id} placeholder="Alumni portrait" shape="rect" fit="cover" style={{ position: 'relative', width: '100%', height: '210px', borderRadius: 0, display: 'block' }}></image-slot>
            <div style={{ padding: '22px 24px 26px' }}>
              <span style={{ fontFamily: D.body, fontWeight: 700, fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase',
                color: '#fff', background: D.orange, padding: '4px 11px', borderRadius: 999 }}>{tag}</span>
              <p style={{ fontFamily: D.display, fontWeight: 600, fontSize: 17.5, lineHeight: 1.4, color: D.fg1, margin: '16px 0 0' }}>"{quote}"</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function StayConnected() {
  const opts = [
    ['user-check', 'Join the alumni network', 'Reconnect with classmates and faculty and mentor the next generation.'],
    ['calendar-days', 'Come back to campus', 'Career fairs, DAUST Impact and reunions keep the community close.'],
    ['heart-handshake', 'Give back', 'Support scholarships, labs and ventures that shaped your journey.'],
  ];
  return (
    <Section bg="#fff">
      <Heading eyebrow="Stay Involved" title="Once DAUST, always DAUST" align="center" />
      <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 26, marginTop: 46 }}>
        {opts.map(([icon, t, b], i) => (
          <div key={t} className={'reveal d' + (i + 1)} style={{ textAlign: 'center', padding: '10px 16px' }}>
            <div style={{ width: 60, height: 60, borderRadius: 999, background: D.subtle, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
              <i data-lucide={icon} style={{ width: 27, height: 27, color: D.navy }}></i>
            </div>
            <div style={{ fontFamily: D.display, fontWeight: 700, fontSize: 18, color: D.fg1, marginBottom: 9 }}>{t}</div>
            <p style={{ fontFamily: D.body, fontSize: 14.5, lineHeight: 1.6, color: D.fg2, margin: '0 auto', maxWidth: 280 }}>{b}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function AlumniApp() {
  const { apply, setApply } = usePage();
  return (
    <div>
      <Header active="Alumni" onApply={() => setApply(true)} />
      <PageHero eyebrow="Alumni" title="The DAUST community, for life"
        sub="Our graduates are engineers, founders and researchers building Africa's future — and they remain part of the DAUST family long after they leave Somone."
        slotId="alumni-hero" />
      <AlumniIntro />
      <AlumniStats />
      <Paths />
      <Stories />
      <StayConnected />
      <CTABand onApply={() => setApply(true)} />
      <Footer />
      <ApplyModal open={apply} onClose={() => setApply(false)} />
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<AlumniApp />);
