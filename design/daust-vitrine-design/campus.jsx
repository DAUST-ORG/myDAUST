/* ===== Campus Life page ===== */
function LifeIntro() {
  return (
    <Section bg="#fff">
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
        <div className="reveal">
          <Eyebrow>Life @ DAUST</Eyebrow>
          <h2 style={{ fontFamily: D.display, fontWeight: 700, fontSize: 'clamp(28px,3.2vw,42px)', color: D.fg1, margin: '14px 0 0', lineHeight: 1.1 }}>
            A home away from home.
          </h2>
          <TriDash w={32} h={4} style={{ margin: '20px 0 24px' }} />
          <p style={{ fontFamily: D.body, fontSize: 16.5, lineHeight: 1.7, color: D.fg2, margin: '0 0 18px' }}>
            DAUST offers a powerfully positive environment — a residential campus in the natural resort town of
            Somone where students live, learn and build lifelong friendships.
          </p>
          <p style={{ fontFamily: D.body, fontSize: 16.5, lineHeight: 1.7, color: D.fg2, margin: 0 }}>
            Between the labs and lecture halls, life here is full: student organizations, sports, cultural events
            and a tight-knit community drawn from across Africa.
          </p>
        </div>
        <div className="reveal d2"><PhotoSlot id="campus-intro" label="Drop a campus life photo" h={440} radius={18} /></div>
      </div>
    </Section>
  );
}

function Gallery() {
  // [id, label, colSpan, rowSpan] — editorial mosaic
  const tiles = [
    ['campus-g1', 'Campus & grounds', 2, 2],
    ['campus-g2', 'Student housing', 1, 1],
    ['campus-g3', 'Labs', 1, 1],
    ['campus-g4', 'Events & talks', 1, 2],
    ['campus-g5', 'Sports', 1, 1],
    ['campus-g6', 'Clubs', 2, 1],
  ];
  return (
    <Section bg={D.subtle}>
      <Heading eyebrow="On Campus" title="A glimpse of Somone" align="center"
        sub="Drag your own photos onto any tile to bring the campus to life." />
      <div className="campus-mosaic" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridAutoRows: '180px', gap: 16, marginTop: 50 }}>
        {tiles.map(([id, label, c, r], i) => (
          <div key={id} className={'reveal d' + ((i % 4) + 1)} style={{ gridColumn: 'span ' + c, gridRow: 'span ' + r, position: 'relative', borderRadius: 16, overflow: 'hidden' }}>
            <image-slot id={id} placeholder={label} shape="rect" fit="cover" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 0 }}></image-slot>
          </div>
        ))}
      </div>
    </Section>
  );
}

function StudentLife() {
  const items = [
    ['users', 'Student Organizations', 'Robotics, coding, entrepreneurship and cultural clubs led entirely by students.'],
    ['trophy', 'Sports & Wellness', 'Football, basketball and fitness facilities — plus the beaches of Somone nearby.'],
    ['calendar-days', 'Events & Traditions', 'DAUST Impact, the Career Fair and flagship celebrations of African talent.'],
    ['home', 'Residential Campus', 'On-campus housing and dining create a close, supportive community.'],
  ];
  return (
    <Section bg="#fff">
      <Heading eyebrow="Get Involved" title="More than a degree" />
      <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginTop: 48 }}>
        {items.map(([icon, t, b], i) => (
          <div key={t} className={'reveal d' + (i + 1)} style={{ borderTop: `3px solid ${D.orange}`, background: D.subtle, borderRadius: '4px 4px 16px 16px', padding: '28px 26px' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: D.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
              <i data-lucide={icon} style={{ width: 23, height: 23, color: '#fff' }}></i>
            </div>
            <div style={{ fontFamily: D.display, fontWeight: 700, fontSize: 17.5, color: D.fg1, marginBottom: 8 }}>{t}</div>
            <p style={{ fontFamily: D.body, fontSize: 14, lineHeight: 1.6, color: D.fg2, margin: 0 }}>{b}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ImpactStats() {
  const stats = [[1000, 'Guests & Attendees', '+'], [100, 'Student Projects', '+'], [15, 'Student Clubs', '+'], [12, 'Nationalities', '+']];
  return (
    <section style={{ background: D.navy, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
      <div style={{ position: 'relative', maxWidth: MAXW, margin: '0 auto', padding: '74px 32px' }}>
        <div className="reveal"><Eyebrow on="navy">DAUST Impact · Career Fair 2026</Eyebrow></div>
        <div className="grid-4 reveal d1" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 28, marginTop: 28 }}>
          {stats.map(([v, l, s]) => <Stat key={l} value={v} label={l} suffix={s} on="navy" />)}
        </div>
      </div>
    </section>
  );
}

function CampusApp() {
  const { apply, setApply } = usePage();
  return (
    <div>
      <Header active="Campus" onApply={() => setApply(true)} />
      <PageHero eyebrow="Life @ DAUST" title="Campus life in Somone"
        sub="Shaping futures and creating opportunities — on a residential campus in one of Senegal's most beautiful natural settings."
        slotId="campus-hero" />
      <LifeIntro />
      <Gallery />
      <StudentLife />
      <ImpactStats />
      <CTABand onApply={() => setApply(true)} />
      <Footer />
      <ApplyModal open={apply} onClose={() => setApply(false)} />
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<CampusApp />);
