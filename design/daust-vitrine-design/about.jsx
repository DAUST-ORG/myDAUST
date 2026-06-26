/* ===== About page ===== */
function Mission() {
  return (
    <Section bg="#fff">
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
        <div className="reveal">
          <Eyebrow>Our Mission</Eyebrow>
          <h2 style={{ fontFamily: D.display, fontWeight: 700, fontSize: 'clamp(26px,3vw,40px)', color: D.fg1, margin: '14px 0 0', lineHeight: 1.12 }}>
            To educate Africa's future world-class engineers, scientists and innovators.
          </h2>
          <TriDash w={32} h={4} style={{ margin: '22px 0 24px' }} />
          <p style={{ fontFamily: D.body, fontSize: 16.5, lineHeight: 1.7, color: D.fg2, margin: '0 0 18px' }}>
            DAUST is a five-year engineering university founded in 2017 by Prof. Sidy Ndao, located in the natural
            resort town of Somone in Senegal's Thiès region.
          </p>
          <p style={{ fontFamily: D.body, fontSize: 16.5, lineHeight: 1.7, color: D.fg2, margin: 0 }}>
            We follow an American-style education model that emphasizes research, innovation, critical thinking and
            hands-on discovery — preparing graduates to lead, build and serve.
          </p>
        </div>
        <div className="reveal d2"><PhotoSlot id="about-mission" label="Drop a campus / founder photo" h={460} radius={18} /></div>
      </div>
    </Section>
  );
}

function Values() {
  const vals = [
    ['compass', 'Purpose-driven', 'Innovation rooted in local impact — technology that serves Africa first.'],
    ['microscope', 'Rigor & research', 'A culture of inquiry, critical thinking and world-class faculty.'],
    ['globe', 'Inclusive & pan-African', 'Ensuring inclusive participation of Africa in emerging technology.'],
    ['wrench', 'Hands-on', 'Learning by building, in labs and on projects from day one.'],
  ];
  return (
    <Section bg={D.subtle}>
      <Heading eyebrow="What We Stand For" title="Our values" align="center" />
      <div className="grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginTop: 48 }}>
        {vals.map(([icon, t, b], i) => (
          <div key={t} className={'reveal d' + (i + 1)} style={{ textAlign: 'center', background: '#fff', borderRadius: 16, padding: '34px 26px', border: `1px solid ${D.border}` }}>
            <div style={{ width: 58, height: 58, borderRadius: 999, background: D.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
              <i data-lucide={icon} style={{ width: 26, height: 26, color: '#fff' }}></i>
            </div>
            <div style={{ fontFamily: D.display, fontWeight: 700, fontSize: 18, color: D.fg1, marginBottom: 9 }}>{t}</div>
            <p style={{ fontFamily: D.body, fontSize: 14, lineHeight: 1.6, color: D.fg2, margin: 0 }}>{b}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Story() {
  const events = [
    ['2017', 'DAUST is founded', 'Prof. Sidy Ndao establishes Senegal\u2019s American-style engineering university in Somone.'],
    ['2019', 'First labs open', 'Teaching and research labs equipped with state-of-the-art technology welcome students.'],
    ['2022', 'Technology Ventures launches', 'A dedicated startup program helps students turn projects into companies.'],
    ['2025', 'DAUST Impact', 'A flagship celebration of African innovation draws 1000+ guests and attendees.'],
    ['2026', 'Admissions open', 'A growing pan-African community prepares for the September 2026 intake.'],
  ];
  return (
    <Section bg="#fff" max={860}>
      <Heading eyebrow="Our Story" title="Built in a decade" align="center" />
      <div style={{ marginTop: 50, position: 'relative' }}>
        <div style={{ position: 'absolute', left: 27, top: 8, bottom: 8, width: 2, background: D.border }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 30 }}>
          {events.map(([y, t, b], i) => (
            <div key={y} className={'reveal d' + ((i % 4) + 1)} style={{ display: 'flex', gap: 24, position: 'relative' }}>
              <div style={{ width: 56, height: 56, borderRadius: 999, background: D.navy, color: '#fff', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: D.display, fontWeight: 800, fontSize: 16,
                border: `3px solid #fff`, boxShadow: '0 4px 14px rgba(15,44,80,.2)', zIndex: 1 }}>{y}</div>
              <div style={{ paddingTop: 6 }}>
                <div style={{ fontFamily: D.display, fontWeight: 700, fontSize: 20, color: D.fg1, marginBottom: 6 }}>{t}</div>
                <p style={{ fontFamily: D.body, fontSize: 15, lineHeight: 1.65, color: D.fg2, margin: 0 }}>{b}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function Founder() {
  return (
    <section style={{ background: D.navy, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
      <div style={{ position: 'relative', maxWidth: MAXW, margin: '0 auto', padding: '84px 32px' }}>
        <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '0.7fr 1.3fr', gap: 56, alignItems: 'center' }}>
          <div className="reveal"><PhotoSlot id="about-founder" label="Drop a portrait" h={380} radius={18} /></div>
          <div className="reveal d2">
            <i data-lucide="quote" style={{ width: 40, height: 40, color: D.orange }}></i>
            <p style={{ fontFamily: D.display, fontWeight: 600, fontSize: 'clamp(22px,2.6vw,32px)', color: '#fff', lineHeight: 1.3, margin: '18px 0 26px' }}>
              We are building a powerfully positive environment where Africa's brightest minds become the engineers
              and innovators the continent needs.
            </p>
            <div style={{ fontFamily: D.display, fontWeight: 700, fontSize: 18, color: '#fff' }}>Prof. Sidy Ndao</div>
            <div style={{ fontFamily: D.body, fontSize: 14, color: D.onNavyMuted, marginTop: 4 }}>Founder & President, DAUST</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Contact() {
  const info = [
    ['map-pin', 'Visit', 'Somone, Thiès Region, Senegal'],
    ['phone', 'Call', '+221 33 820 20 50'],
    ['mail', 'Email', 'info@daust.org'],
  ];
  return (
    <Section bg={D.subtle}>
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center' }}>
        <div className="reveal">
          <Eyebrow>Get in Touch</Eyebrow>
          <h2 style={{ fontFamily: D.display, fontWeight: 700, fontSize: 'clamp(26px,3vw,38px)', color: D.fg1, margin: '14px 0 0', lineHeight: 1.12 }}>
            Come and see DAUST.
          </h2>
          <TriDash w={32} h={4} style={{ margin: '20px 0 28px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {info.map(([icon, l, v]) => (
              <div key={l} style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: '#fff', border: `1px solid ${D.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i data-lucide={icon} style={{ width: 22, height: 22, color: D.navy }}></i>
                </div>
                <div>
                  <div style={{ fontFamily: D.body, fontWeight: 700, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: D.orange }}>{l}</div>
                  <div style={{ fontFamily: D.display, fontWeight: 700, fontSize: 18, color: D.fg1, marginTop: 3 }}>{v}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="reveal d2" style={{ position: 'relative' }}>
          <PhotoSlot id="about-map" label="Drop a map / campus aerial" h={360} radius={18} />
        </div>
      </div>
    </Section>
  );
}

function AboutApp() {
  const { apply, setApply } = usePage();
  return (
    <div>
      <Header active="About" onApply={() => setApply(true)} />
      <PageHero eyebrow="About DAUST" title="Innovation, rooted in purpose"
        sub="Dakar American University of Science & Technology — a young, ambitious engineering university with a pan-African mission."
        slotId="about-hero" />
      <Mission />
      <Values />
      <Story />
      <Founder />
      <Contact />
      <CTABand onApply={() => setApply(true)} />
      <Footer />
      <ApplyModal open={apply} onClose={() => setApply(false)} />
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<AboutApp />);
