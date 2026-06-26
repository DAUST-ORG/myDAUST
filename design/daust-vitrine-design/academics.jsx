/* ===== Education page ===== */
function Programs() {
  const progs = [
    ['Computer Science', 'College of Engineering', 'Computer science majors learn about computer systems, programming, and the theory and design of software.', ['Artificial Intelligence', 'Data Science', 'Software Development', 'Web Technology', 'Games & graphics'], 'cpu'],
    ['Mechanical Engineering', 'College of Engineering', 'The design of automotive and aerospace systems, bioengineering devices, and energy-related technologies.', ['Aerospace', 'Energy', 'Robotics', 'Material Engineering', 'Advanced Manufacturing'], 'cog'],
    ['Electrical Engineering', 'College of Engineering', 'Mathematical and physical principles applied to electrical, electronic and computer-based devices and systems.', ['Microelectronics', 'Robotics', 'Communication', 'Power & Transmission'], 'zap'],
  ];
  return (
    <Section bg="#fff">
      <Heading eyebrow="Degree Programs" title="A 5-year engineering degree"
        sub="The DAUST undergraduate curriculum spans the full five years of a student's time in the program, plus an extensive set of co-curricular activities. Taught in English." />
      <div className="grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 26, marginTop: 50 }}>
        {progs.map(([t, meta, body, items, icon], i) => (
          <div key={t} className={'reveal d' + (i + 1)} style={{ background: D.subtle, borderRadius: 18,
            padding: '34px 30px', border: `1px solid ${D.border}`, transition: 'transform .2s, box-shadow .2s' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 16px 42px rgba(15,44,80,.14)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: D.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
              <i data-lucide={icon} style={{ width: 26, height: 26, color: '#fff' }}></i>
            </div>
            <div style={{ fontFamily: D.display, fontWeight: 700, fontSize: 22, color: D.fg1, lineHeight: 1.1 }}>{t}</div>
            <div style={{ fontFamily: D.body, fontWeight: 600, fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', color: D.orange, marginTop: 6, marginBottom: 14 }}>{meta}</div>
            <p style={{ fontFamily: D.body, fontSize: 14.5, lineHeight: 1.65, color: D.fg2, margin: '0 0 18px' }}>{body}</p>
            <div style={{ borderTop: `1px solid ${D.border}`, paddingTop: 16 }}>
              <div style={{ fontFamily: D.body, fontWeight: 700, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: D.fg3, marginBottom: 12 }}>Graduates work in</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {items.map(it => (
                  <span key={it} style={{ fontFamily: D.body, fontSize: 12.5, color: D.navy, background: '#fff',
                    border: `1px solid ${D.border}`, borderRadius: 999, padding: '5px 12px' }}>{it}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* University of Nebraska 2+2 + IEP */
function Partnerships() {
  return (
    <Section bg={D.subtle}>
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 26 }}>
        <div className="reveal" style={{ background: D.navy, borderRadius: 18, padding: '40px 38px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
          <div style={{ position: 'relative' }}>
            <span style={{ fontFamily: D.body, fontWeight: 700, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase',
              color: '#fff', background: D.orange, padding: '5px 12px', borderRadius: 999 }}>2 + 2 Joint Degree</span>
            <h3 style={{ fontFamily: D.display, fontWeight: 700, fontSize: 25, color: '#fff', margin: '18px 0 0', lineHeight: 1.15 }}>
              Joint Bachelor with the University of Nebraska
            </h3>
            <p style={{ fontFamily: D.body, fontSize: 15, lineHeight: 1.7, color: D.onNavyMuted, margin: '16px 0 22px' }}>
              DAUST's 2-year PREPA program delivers intensive preparatory courses in sciences and the foundations of
              engineering. After completion, students elect to finish their degree at DAUST or enroll at a top university
              abroad — including a joint 2 + 2 Bachelor in Mechanical Engineering with UNL.
            </p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[['2 yrs', 'PREPA at DAUST'], ['2 yrs', 'UNL or abroad'], ['1', 'Joint degree']].map(([n, l]) => (
                <div key={l}>
                  <div style={{ fontFamily: D.display, fontWeight: 800, fontSize: 26, color: D.orange, lineHeight: 1 }}>{n}</div>
                  <div style={{ fontFamily: D.body, fontSize: 12.5, color: D.onNavyMuted, marginTop: 4 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="reveal d1" style={{ background: '#fff', borderRadius: 18, padding: '40px 38px', border: `1px solid ${D.border}` }}>
          <span style={{ fontFamily: D.body, fontWeight: 700, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase',
            color: D.navy, background: D.subtle, border: `1px solid ${D.border}`, padding: '5px 12px', borderRadius: 999 }}>One Semester</span>
          <h3 style={{ fontFamily: D.display, fontWeight: 700, fontSize: 25, color: D.fg1, margin: '18px 0 0', lineHeight: 1.15 }}>
            Intensive English Program
          </h3>
          <p style={{ fontFamily: D.body, fontSize: 15, lineHeight: 1.7, color: D.fg2, margin: '16px 0 22px' }}>
            You don't need to speak English to be admitted. After admission, DAUST offers a one-semester Intensive
            English Program (IEP) that brings non-English speakers to the academic proficiency our coursework requires —
            then you begin your engineering degree.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {['Open to all admitted non-English speakers', 'Academic reading, writing & technical vocabulary', 'Seamless transition into year one'].map(it => (
              <div key={it} style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
                <i data-lucide="check-circle-2" style={{ width: 19, height: 19, color: D.orange, flexShrink: 0 }}></i>
                <span style={{ fontFamily: D.body, fontSize: 14.5, color: D.fg2 }}>{it}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

function Journey() {
  const years = [
    ['Years 1–2', 'PREPA', 'Intensive preparatory courses in sciences and the foundations of engineering.'],
    ['Year 3', 'Core engineering', 'Discipline fundamentals in your major, plus your first research and teaching labs.'],
    ['Year 4', 'Specialization', 'Advanced coursework, applied projects and the Technology Ventures track.'],
    ['Year 5', 'Capstone', 'A year-long capstone engineering project — your bridge to industry or graduate study.'],
    ['Beyond', 'Employed', '100% of DAUST graduates are fully employed, or continue to top universities abroad.'],
  ];
  return (
    <Section bg="#fff">
      <Heading eyebrow="The 5-Year Degree" title="Your engineering journey" align="center" />
      <div style={{ marginTop: 54, position: 'relative' }}>
        <div className="acad-line" style={{ position: 'absolute', top: 27, left: '10%', right: '10%', height: 3, background: D.border }} />
        <div className="grid-5" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 18, position: 'relative' }}>
          {years.map(([y, t, b], i) => (
            <div key={y} className={'reveal d' + (i + 1)} style={{ textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: 999, background: D.navy, color: '#fff', margin: '0 auto 18px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: D.display, fontWeight: 800, fontSize: 22,
                border: `4px solid ${D.subtle}`, boxShadow: '0 4px 14px rgba(15,44,80,.18)' }}>{i + 1}</div>
              <div style={{ fontFamily: D.body, fontWeight: 700, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: D.orange, marginBottom: 6 }}>{y}</div>
              <div style={{ fontFamily: D.display, fontWeight: 700, fontSize: 17, color: D.fg1, marginBottom: 8 }}>{t}</div>
              <p style={{ fontFamily: D.body, fontSize: 13, lineHeight: 1.55, color: D.fg2, margin: 0 }}>{b}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function Approach() {
  return (
    <Section bg={D.subtle}>
      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 60, alignItems: 'center' }}>
        <div className="reveal" style={{ position: 'relative' }}>
          <PhotoSlot id="acad-lab" label="Drop a lab / classroom photo" h={460} radius={18} />
          <div style={{ position: 'absolute', right: -20, top: 30, background: '#fff', borderRadius: 14, padding: '16px 22px',
            boxShadow: '0 16px 40px rgba(15,44,80,.18)', border: `1px solid ${D.border}` }}>
            <div style={{ fontFamily: D.display, fontWeight: 800, fontSize: 30, color: D.navy, lineHeight: 1 }}>100<span style={{ color: D.orange }}>+</span></div>
            <div style={{ fontFamily: D.body, fontSize: 12, color: D.fg3, marginTop: 4 }}>student projects</div>
          </div>
        </div>
        <div className="reveal d2">
          <Eyebrow>How we teach</Eyebrow>
          <h2 style={{ fontFamily: D.display, fontWeight: 700, fontSize: 'clamp(26px,3vw,38px)', color: D.fg1, margin: '14px 0 0', lineHeight: 1.12 }}>
            Learning by building, not just listening.
          </h2>
          <TriDash w={32} h={4} style={{ margin: '20px 0 24px' }} />
          {[
            ['flask-conical', 'Research & teaching labs', 'World-class labs with state-of-the-art equipment, open to students from year one.'],
            ['users', 'Small cohorts, close mentorship', 'World-renowned faculty work directly with students in a culture of research.'],
            ['lightbulb', 'Project-based curriculum', 'Every year culminates in hands-on projects that solve real, local problems.'],
          ].map(([icon, t, b]) => (
            <div key={t} style={{ display: 'flex', gap: 16, marginBottom: 22 }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: '#fff', border: `1px solid ${D.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i data-lucide={icon} style={{ width: 22, height: 22, color: D.navy }}></i>
              </div>
              <div>
                <div style={{ fontFamily: D.display, fontWeight: 700, fontSize: 17, color: D.fg1, marginBottom: 4 }}>{t}</div>
                <p style={{ fontFamily: D.body, fontSize: 14.5, lineHeight: 1.6, color: D.fg2, margin: 0 }}>{b}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function AcademicsApp() {
  const { apply, setApply } = usePage();
  return (
    <div>
      <Header active="Education" onApply={() => setApply(true)} />
      <PageHero eyebrow="Education" title="Academics at DAUST"
        sub="A competency-based, American-style engineering education that equips graduates to adapt and lead in a fast-evolving technological landscape."
        slotId="acad-hero" />
      <Programs />
      <Partnerships />
      <Journey />
      <Approach />
      <CTABand onApply={() => setApply(true)} />
      <Footer />
      <ApplyModal open={apply} onClose={() => setApply(false)} />
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<AcademicsApp />);
