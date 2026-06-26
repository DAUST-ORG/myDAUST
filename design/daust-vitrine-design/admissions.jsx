/* ===== Admissions page ===== */
function Process() {
  const tracks = [
    ['First-Year Undergraduate', 'user-plus', [
      'Submit the online application',
      'Submit official documents to the Office of Admissions (high-school diploma or equivalent)',
      'Submit transcripts from 11th & 12th grades (Première and Terminale)',
      'Pay the application fee of 30,000 FCFA',
    ]],
    ['Transfer Student', 'repeat', [
      'Submit the online application',
      'Submit official degree transcripts from your previous school to the Office of Admissions',
      'Pay the application fee of 30,000 FCFA',
    ]],
  ];
  return (
    <Section bg="#fff">
      <Heading eyebrow="Admission Procedures" title="How to apply"
        sub="All admission decisions are based on an assessment of the academic foundation needed for success in DAUST coursework. Two simple tracks — pick the one that fits you." />
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 26, marginTop: 50 }}>
        {tracks.map(([title, icon, steps], ti) => (
          <div key={title} className={'reveal d' + (ti + 1)} style={{ background: D.subtle, borderRadius: 18, padding: '36px 34px', border: `1px solid ${D.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
              <div style={{ width: 52, height: 52, borderRadius: 13, background: D.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <i data-lucide={icon} style={{ width: 24, height: 24, color: '#fff' }}></i>
              </div>
              <div style={{ fontFamily: D.display, fontWeight: 700, fontSize: 21, color: D.fg1 }}>{title}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {steps.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 16, paddingBottom: i < steps.length - 1 ? 20 : 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ width: 30, height: 30, borderRadius: 999, background: D.orange, color: '#fff', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: D.display, fontWeight: 800, fontSize: 14 }}>{i + 1}</span>
                    {i < steps.length - 1 && <span style={{ flex: 1, width: 2, background: D.border, marginTop: 4 }} />}
                  </div>
                  <span style={{ fontFamily: D.body, fontSize: 14.5, lineHeight: 1.55, color: D.fg2, paddingTop: 4 }}>{s}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="reveal" style={{ marginTop: 32, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <Button variant="primary" size="lg" onClick={() => window.__openApply && window.__openApply()}>
          Start your application <i data-lucide="arrow-right" style={{ width: 16, height: 16 }}></i>
        </Button>
        <span style={{ fontFamily: D.body, fontSize: 14, color: D.fg3 }}>
          Questions? <a href="mailto:admissions@daust.org" style={{ color: D.navy, fontWeight: 600 }}>admissions@daust.org</a> · +221 78 128 44 58
        </span>
      </div>
    </Section>
  );
}

function Cost() {
  const items = [
    ['Tuition', '2,975,000', 'FCFA / year', '1,487,500 per semester · monthly installments available', true, 'graduation-cap'],
    ['Housing', '300,000 – 400,000', 'FCFA / semester', 'Optional · paid at the start of each semester', false, 'home'],
    ['Cafeteria', '202,500 – 315,000', 'FCFA / semester', 'Optional · half pension 202,500 · full pension 315,000', false, 'utensils'],
    ['Application Fee', '30,000', 'FCFA', 'One-time, paid with your application', false, 'file-text'],
    ['Insurance', '10,000', 'FCFA', 'Annual student insurance', false, 'shield-check'],
  ];
  return (
    <Section bg={D.subtle}>
      <Heading eyebrow="Cost of Attendance" title="An elite education, at a fraction of the cost"
        sub="DAUST offers the best of two worlds: a top American-style engineering education in Senegal, at a fraction of the cost of studying in the USA, UK or Canada." />
      <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22, marginTop: 50 }}>
        {items.map(([label, amount, unit, note, primary, icon], i) => (
          <div key={label} className={'reveal d' + ((i % 3) + 1)} style={{
            gridColumn: primary ? 'span 1' : 'span 1',
            background: primary ? D.navy : '#fff', borderRadius: 16, padding: '30px 28px',
            border: primary ? 'none' : `1px solid ${D.border}`, position: 'relative', overflow: 'hidden' }}>
            {primary && <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: '15px 15px' }} />}
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <div style={{ width: 42, height: 42, borderRadius: 11, background: primary ? 'rgba(255,255,255,.12)' : D.subtle,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i data-lucide={icon} style={{ width: 20, height: 20, color: primary ? '#fff' : D.navy }}></i>
                </div>
                <span style={{ fontFamily: D.body, fontWeight: 700, fontSize: 13, letterSpacing: '.04em', textTransform: 'uppercase', color: primary ? '#fff' : D.fg2 }}>{label}</span>
              </div>
              <div style={{ fontFamily: D.display, fontWeight: 800, fontSize: 30, color: primary ? '#fff' : D.navy, lineHeight: 1 }}>{amount}</div>
              <div style={{ fontFamily: D.body, fontWeight: 600, fontSize: 12.5, color: D.orange, marginTop: 6, letterSpacing: '.03em' }}>{unit}</div>
              <p style={{ fontFamily: D.body, fontSize: 13, lineHeight: 1.55, color: primary ? D.onNavyMuted : D.fg3, margin: '14px 0 0' }}>{note}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Scholarships() {
  const tiers = [
    ['20%', 'BAC 15 and above', 'Top of the class — the highest automatic merit discount.'],
    ['15%', 'BAC 13.5 – 14.9', 'Strong academic performance rewarded on enrollment.'],
    ['10%', 'BAC 12 – 13.4', 'A solid foundation earns a meaningful tuition reduction.'],
  ];
  return (
    <section style={{ background: D.navy, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
      <div style={{ position: 'relative', maxWidth: MAXW, margin: '0 auto', padding: '80px 32px' }}>
        <div className="reveal" style={{ textAlign: 'center', maxWidth: 680, margin: '0 auto' }}>
          <Eyebrow on="navy">Scholarships & Financial Aid</Eyebrow>
          <h2 style={{ fontFamily: D.display, fontWeight: 700, fontSize: 'clamp(28px,3.2vw,42px)', color: '#fff', margin: '14px 0 0', lineHeight: 1.1 }}>
            Merit scholarships, awarded on your BAC
          </h2>
          <p style={{ fontFamily: D.body, fontSize: 16, lineHeight: 1.7, color: D.onNavyMuted, margin: '18px auto 0' }}>
            Your Baccalauréat results automatically unlock a tuition discount — talent should never be limited by means.
          </p>
        </div>
        <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22, marginTop: 48 }}>
          {tiers.map(([pct, band, note], i) => (
            <div key={pct} className={'reveal d' + (i + 1)} style={{ background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 18, padding: '34px 30px', textAlign: 'center' }}>
              <div style={{ fontFamily: D.display, fontWeight: 800, fontSize: 56, color: D.orange, lineHeight: 1 }}>{pct}</div>
              <div style={{ fontFamily: D.body, fontWeight: 700, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: '#fff', marginTop: 8 }}>discount</div>
              <div style={{ fontFamily: D.display, fontWeight: 700, fontSize: 19, color: '#fff', margin: '18px 0 8px' }}>{band}</div>
              <p style={{ fontFamily: D.body, fontSize: 13.5, lineHeight: 1.55, color: D.onNavyMuted, margin: 0 }}>{note}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const qs = [
    ['Is DAUST recognized by the Government?', 'Yes. DAUST is a nationally and internationally recognized university, with the habilitation from ANAQ-Sup (L\u2019Autorité Nationale d\u2019Assurance Qualité de l\u2019enseignement Supérieur).'],
    ['Do I need to speak English to be admitted?', 'No. You don\u2019t need to speak English to be admitted to DAUST. After admission, DAUST offers a one-semester Intensive English Program (IEP) for non-English speakers.'],
    ['Can I transfer to an American university after two years?', 'Yes. You can transfer to any university in North America or elsewhere after two years at DAUST. We have also signed a partnership with the University of Nebraska (UNL) for a joint 2 + 2 Bachelor degree in Mechanical Engineering.'],
    ['Will I get a job after my degree?', 'DAUST is a highly reputable institution with a strong track record and a wide network of industry connections. To this day, 100% of DAUST graduates are fully employed.'],
  ];
  const [open, setOpen] = React.useState(0);
  return (
    <Section bg="#fff" max={860}>
      <Heading eyebrow="Questions" title="Frequently asked" align="center" />
      <div style={{ marginTop: 44, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {qs.map(([q, a], i) => {
          const isOpen = open === i;
          return (
            <div key={q} className="reveal" style={{ border: `1px solid ${D.border}`, borderRadius: 14, overflow: 'hidden', background: isOpen ? D.subtle : '#fff' }}>
              <button onClick={() => setOpen(isOpen ? -1 : i)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
                cursor: 'pointer', padding: '22px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                <span style={{ fontFamily: D.display, fontWeight: 700, fontSize: 17, color: D.fg1 }}>{q}</span>
                <i data-lucide={isOpen ? 'minus' : 'plus'} style={{ width: 20, height: 20, color: D.orange, flexShrink: 0 }}></i>
              </button>
              {isOpen && <p style={{ fontFamily: D.body, fontSize: 15, lineHeight: 1.7, color: D.fg2, margin: 0, padding: '0 24px 24px' }}>{a}</p>}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function AdmissionsApp() {
  const { apply, setApply } = usePage();
  React.useEffect(() => { window.__openApply = () => setApply(true); }, []);
  return (
    <div>
      <Header active="Admissions" onApply={() => setApply(true)} />
      <PageHero eyebrow="Admissions · September 2026" title="Join us at DAUST"
        sub="Want an elite American engineering education while staying close to home? Admissions for the September 2026 intake are open now."
        slotId="adm-hero" />
      <Process />
      <Cost />
      <Scholarships />
      <FAQ />
      <CTABand onApply={() => setApply(true)} />
      <Footer />
      <ApplyModal open={apply} onClose={() => setApply(false)} />
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<AdmissionsApp />);
