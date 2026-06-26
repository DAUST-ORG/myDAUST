/* ===== DAUST Home page ===== */
function Hero({ onApply }) {
  return (
    <section style={{ position: 'relative', background: D.navyDeep, overflow: 'hidden' }}>
      <image-slot id="home-hero" placeholder="Drop a campus / hero photo" shape="rect" fit="cover"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 0 }}></image-slot>
      <div style={{ position: 'absolute', inset: 0, background:
        'linear-gradient(90deg, rgba(15,44,80,.94) 0%, rgba(15,44,80,.78) 48%, rgba(15,44,80,.42) 100%)' }} />
      <div style={{ position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
      <div style={{ position: 'relative', maxWidth: MAXW, margin: '0 auto', padding: '128px 32px 120px' }}>
        <div className="reveal" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.10)',
          border: '1px solid rgba(255,255,255,.18)', borderRadius: 999, padding: '8px 16px', marginBottom: 26 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: D.orange }} />
          <span style={{ fontFamily: D.body, fontWeight: 600, fontSize: 13, letterSpacing: '.08em', color: '#fff' }}>
            ADMISSIONS OPEN · SEPTEMBER 2026
          </span>
        </div>
        <h1 className="reveal d1" style={{ fontFamily: D.display, fontWeight: 800, fontSize: 'clamp(40px, 6.2vw, 78px)',
          lineHeight: 1.0, letterSpacing: '.01em', color: '#fff', margin: 0, maxWidth: 880 }}>
          Educating Africa's future<br /><span style={{ color: D.orange }}>world-class engineers.</span>
        </h1>
        <p className="reveal d2" style={{ fontFamily: D.body, fontSize: 'clamp(16px, 1.6vw, 19px)', lineHeight: 1.65,
          color: D.onNavyMuted, maxWidth: 580, margin: '26px 0 38px' }}>
          A rigorous, American-style engineering education in the heart of Somone, Senegal — built on research,
          innovation, critical thinking and hands-on discovery.
        </p>
        <div className="reveal d3" style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant="primary" size="lg" onClick={onApply}>Apply Now <i data-lucide="arrow-right" style={{ width: 17, height: 17 }}></i></Button>
          <Button variant="outlineLight" size="lg" href="academics.html"><i data-lucide="compass" style={{ width: 16, height: 16 }}></i> Explore programs</Button>
        </div>
        <TriDash w={48} h={5} light style={{ marginTop: 60 }} />
      </div>
    </section>
  );
}

function QuickLinks() {
  const items = [
    ['graduation-cap', 'Undergraduate', '5-year engineering degree', 'academics.html'],
    ['file-text', 'How to Apply', 'Admissions for Sept 2026', 'admissions.html'],
    ['flask-conical', 'Research', 'Labs & emerging tech', 'research.html'],
    ['map-pin', 'Visit Campus', 'Somone, Thiès, Senegal', 'campus.html'],
  ];
  return (
    <div style={{ background: '#fff', position: 'relative', marginTop: -44, zIndex: 5 }}>
      <div style={{ maxWidth: MAXW, margin: '0 auto', padding: '0 32px' }}>
        <div className="grid-4 reveal" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0,
          background: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: '0 18px 50px rgba(15,44,80,.16)' }}>
          {items.map(([icon, title, sub, href], i) => (
            <a key={title} href={href} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '26px 26px',
              textDecoration: 'none', borderRight: i < 3 ? `1px solid ${D.border}` : 'none', transition: '.18s' }}
              onMouseEnter={e => e.currentTarget.style.background = D.subtle}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: D.navy, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i data-lucide={icon} style={{ width: 22, height: 22, color: '#fff' }}></i>
              </div>
              <div>
                <div style={{ fontFamily: D.display, fontWeight: 700, fontSize: 16, color: D.fg1 }}>{title}</div>
                <div style={{ fontFamily: D.body, fontSize: 12.5, color: D.fg3, marginTop: 3 }}>{sub}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function Intro() {
  return (
    <Section bg="#fff" pad="100px 32px 84px">
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
        <div className="reveal">
          <Eyebrow>Our Mission</Eyebrow>
          <h2 style={{ fontFamily: D.display, fontWeight: 700, fontSize: 'clamp(30px,3.4vw,44px)', color: D.fg1,
            margin: '16px 0 0', lineHeight: 1.1, letterSpacing: '.01em' }}>
            An American-style university, rooted in African impact.
          </h2>
          <TriDash w={32} h={4} style={{ margin: '22px 0 24px' }} />
          <p style={{ fontFamily: D.body, fontSize: 16.5, lineHeight: 1.7, color: D.fg2, margin: '0 0 18px' }}>
            Founded in 2017 by Prof. Sidy Ndao, DAUST follows an education model that emphasizes research,
            innovation, critical thinking and hands-on discovery — preparing graduates to lead a fast-evolving
            technological landscape.
          </p>
          <p style={{ fontFamily: D.body, fontSize: 16.5, lineHeight: 1.7, color: D.fg2, margin: '0 0 28px' }}>
            From Computer Science and Mechanical &amp; Electrical Engineering to our Technology Ventures program, every
            path is built around purpose and real-world problem solving.
          </p>
          <Button variant="outline" size="md" href="about.html">More about DAUST <i data-lucide="arrow-right" style={{ width: 16, height: 16 }}></i></Button>
        </div>
        <div className="reveal d2" style={{ position: 'relative' }}>
          <PhotoSlot id="home-intro" label="Drop a campus / lab photo" h={440} radius={18} />
          <div style={{ position: 'absolute', left: -22, bottom: -22, background: D.orange, borderRadius: 16,
            padding: '20px 26px', boxShadow: '0 18px 40px rgba(237,132,37,.35)' }}>
            <div style={{ fontFamily: D.display, fontWeight: 800, fontSize: 38, color: '#fff', lineHeight: 1 }}>2017</div>
            <div style={{ fontFamily: D.body, fontSize: 12.5, color: 'rgba(255,255,255,.9)', marginTop: 4, letterSpacing: '.03em' }}>Founded in Somone</div>
          </div>
        </div>
      </div>
    </Section>
  );
}

function Pillars() {
  const items = [
    ['target', 'Competency-based Education', 'Graduates gain the technical and problem-solving skills to adapt to a fast-evolving technological landscape.'],
    ['flask-conical', 'Teaching & Research Labs', 'World-renowned labs with cutting-edge technology and state-of-the-art facilities.'],
    ['lightbulb', 'Student Projects', 'Hands-on learning that fosters creativity, innovation, and real-world problem-solving.'],
    ['users', 'Faculty Excellence', 'World-class faculty deliver high-quality education and a culture of research.'],
    ['rocket', 'Technology Ventures', 'Empowering students to build entrepreneurial skills and bring new technologies to market.'],
    ['languages', 'Intensive English Program', 'Language training that brings non-native speakers to the proficiency DAUST requires.'],
  ];
  return (
    <Section bg={D.subtle}>
      <div className="reveal">
        <Eyebrow>Why DAUST</Eyebrow>
        <h2 style={{ fontFamily: D.display, fontWeight: 700, fontSize: 'clamp(28px,3.2vw,40px)', color: D.fg1,
          margin: '14px 0 0', letterSpacing: '.01em' }}>An education built for impact</h2>
        <TriDash w={32} h={4} style={{ margin: '18px 0 48px' }} />
      </div>
      <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 26 }}>
        {items.map(([icon, title, body], i) => (
          <div key={title} className={'reveal d' + ((i % 3) + 1)} style={{ background: '#fff', borderRadius: 16,
            padding: '30px 28px', border: `1px solid ${D.border}`, transition: 'transform .2s, box-shadow .2s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 14px 40px rgba(15,44,80,.14)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
            <div style={{ width: 54, height: 54, borderRadius: 14, background: D.navy,
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
              <i data-lucide={icon} style={{ width: 25, height: 25, color: '#fff' }}></i>
            </div>
            <div style={{ fontFamily: D.display, fontWeight: 700, fontSize: 19.5, color: D.fg1, marginBottom: 9 }}>{title}</div>
            <p style={{ fontFamily: D.body, fontSize: 14.5, lineHeight: 1.65, color: D.fg2, margin: 0 }}>{body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function StatBand() {
  const stats = [[100, 'Graduate Employment', '%'], [100, 'Student Projects', '+'], [1000, 'Impact Attendees', '+'], [2017, 'Founded in Somone', '']];
  return (
    <section style={{ background: D.navy, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
      <div style={{ position: 'relative', maxWidth: MAXW, margin: '0 auto', padding: '74px 32px' }}>
        <div className="reveal"><Eyebrow on="navy">DAUST Impact 2025</Eyebrow></div>
        <div className="grid-4 reveal d1" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 28, marginTop: 28 }}>
          {stats.map(([v, l, s]) => <Stat key={l} value={v} label={l} suffix={s} on="navy" />)}
        </div>
      </div>
    </section>
  );
}

function NewsGrid() {
  const all = [
    ['Projects', "Le Sénégal décroche la Lune", "Pourquoi 2026 marque un tournant historique pour l'innovation africaine.", true],
    ['Campus', 'DAUST Career Fair 2026', 'Shaping futures, creating opportunities — the Somone campus came alive.', false],
    ['Research', 'Inclusive participation in emerging tech', 'Ensuring Africa has a seat at the table in the technologies shaping tomorrow.', false],
  ];
  return (
    <Section bg="#fff">
      <div className="reveal" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 40 }}>
        <div>
          <Eyebrow>The latest from DAUST</Eyebrow>
          <h2 style={{ fontFamily: D.display, fontWeight: 700, fontSize: 'clamp(28px,3.2vw,40px)', color: D.fg1, margin: '14px 0 0' }}>News &amp; stories</h2>
        </div>
        <Button variant="outline" size="sm">View All News <i data-lucide="arrow-right" style={{ width: 15, height: 15 }}></i></Button>
      </div>
      <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 26 }}>
        {all.map((n, i) => (
          <article key={i} className={'reveal d' + (i + 1)} style={{ background: '#fff', borderRadius: 16, overflow: 'hidden',
            border: `1px solid ${D.border}`, cursor: 'pointer', transition: 'transform .2s, box-shadow .2s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 18px 46px rgba(15,44,80,.16)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
            <PhotoSlot id={'home-news-' + i} label="News image" h={170} radius={0} shape="rect" />
            <div style={{ padding: '18px 20px 22px' }}>
              <span style={{ fontFamily: D.body, fontWeight: 700, fontSize: 10.5, letterSpacing: '.10em',
                textTransform: 'uppercase', color: '#fff', background: D.orange, padding: '4px 11px', borderRadius: 999 }}>{n[0]}</span>
              <h3 style={{ fontFamily: D.display, fontWeight: 700, fontSize: 19, color: D.fg1, margin: '14px 0 0', lineHeight: 1.25 }}>{n[1]}</h3>
              <p style={{ fontFamily: D.body, fontSize: 14, lineHeight: 1.6, color: D.fg2, margin: '9px 0 14px' }}>{n[2]}</p>
              <span style={{ fontFamily: D.body, fontWeight: 600, fontSize: 13.5, color: D.navy, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                Read more <i data-lucide="arrow-right" style={{ width: 14, height: 14 }}></i>
              </span>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}

function HomeApp() {
  const { apply, setApply } = usePage();
  return (
    <div>
      <Header active="Home" onApply={() => setApply(true)} />
      <Hero onApply={() => setApply(true)} />
      <QuickLinks />
      <Intro />
      <Pillars />
      <StatBand />
      <NewsGrid />
      <CTABand onApply={() => setApply(true)} />
      <Footer />
      <ApplyModal open={apply} onClose={() => setApply(false)} />
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<HomeApp />);
