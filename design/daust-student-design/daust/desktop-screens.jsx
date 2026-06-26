/* MyDAUST Desktop — shared utils, i18n, and core screens
   (Dashboard, Schedule grid, Grades). Reuses ui.jsx + data.jsx. */

// ── utils ─────────────────────────────────────────────────────
function fmtCFA(n) {
  return new Intl.NumberFormat('fr-FR').format(Math.abs(n)).replace(/\u202f/g, ' ') + ' CFA';
}
function toMin(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
function fmtRange(s, e) { return `${s} – ${e}`; }
function nowParts() {
  const d = new Date();
  let day = d.getDay() - 1;
  if (day < 0 || day > 4) day = 0;
  return { day, mins: d.getHours() * 60 + d.getMinutes(), hour: d.getHours() };
}

// ── i18n ──────────────────────────────────────────────────────
const DSTR = {
  en: {
    dashboard: 'Dashboard', schedule: 'Schedule', grades: 'Grades', id: 'Student ID',
    billing: 'Billing', announcements: 'Announcements', events: 'Life @ DAUST',
    documents: 'Documents', library: 'Library', settings: 'Settings',
    courses: 'My Courses', assignments: 'Assignments', inbox: 'Inbox', communication: 'Communication',
    academics: 'Academics', campus: 'Campus', account: 'Account',
    goodmorning: 'Good morning', goodafternoon: 'Good afternoon', goodevening: 'Good evening',
    today: 'Today', viewall: 'View all', balance: 'Balance due', paynow: 'Pay now',
    termgpa: 'Term GPA', cumulative: 'Cumulative GPA', credits: 'Credits this term',
    progress: 'Progress to degree', nextclass: 'Next class', search: 'Search courses, documents…',
    weekof: 'Week of', present: 'Present this code at any campus reader',
  },
  fr: {
    dashboard: 'Tableau de bord', schedule: 'Emploi du temps', grades: 'Notes', id: 'Carte étudiant',
    billing: 'Facturation', announcements: 'Annonces', events: 'Vie @ DAUST',
    documents: 'Documents', library: 'Bibliothèque', settings: 'Paramètres',
    courses: 'Mes cours', assignments: 'Devoirs', inbox: 'Messagerie', communication: 'Communication',
    academics: 'Scolarité', campus: 'Campus', account: 'Compte',
    goodmorning: 'Bonjour', goodafternoon: 'Bon après-midi', goodevening: 'Bonsoir',
    today: "Aujourd'hui", viewall: 'Tout voir', balance: 'Solde dû', paynow: 'Payer',
    termgpa: 'Moyenne du semestre', cumulative: 'Moyenne cumulée', credits: 'Crédits ce semestre',
    progress: 'Progression', nextclass: 'Prochain cours', search: 'Rechercher cours, documents…',
    weekof: 'Semaine du', present: 'Présentez ce code à un lecteur du campus',
  },
};

// ── desktop card ──────────────────────────────────────────────
function DCard({ children, style, navy = false, pad = 22, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: navy ? 'var(--daust-navy)' : 'var(--surface)',
      borderRadius: 16, padding: pad,
      border: navy ? 'none' : '1px solid var(--border)',
      boxShadow: navy ? 'var(--shadow-navy)' : 'var(--shadow-sm)',
      color: navy ? '#fff' : 'var(--fg1)', cursor: onClick ? 'pointer' : 'default',
      ...style,
    }}>{children}</div>
  );
}
function PageHead({ title, sub }) {
  return (
    <div style={{ marginBottom: 22 }}>
      {sub && <Eyebrow style={{ marginBottom: 6 }}>{sub}</Eyebrow>}
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 30, letterSpacing: '.01em', color: 'var(--fg1)', margin: 0 }}>{title}</h1>
    </div>
  );
}

// ══ DASHBOARD ═════════════════════════════════════════════════
function DDashboard({ go, lang }) {
  const s = DSTR[lang];
  const { day, mins, hour } = nowParts();
  const greet = hour < 12 ? s.goodmorning : hour < 17 ? s.goodafternoon : s.goodevening;
  const todays = SCHEDULE.filter(c => c.day === day).sort((a, b) => toMin(a.start) - toMin(b.start));
  const nextC = todays.find(c => toMin(c.end) > mins) || todays[0];
  const attendance = Math.round(COURSES.reduce((a, c) => a + c.attendance, 0) / COURSES.length);

  const stats = [
    { label: s.termgpa, value: STUDENT.gpa.toFixed(2), foot: `/ 4.00 · ${s.cumulative} ${STUDENT.cumulativeGpa}`, icon: 'cap', tone: 'navy' },
    { label: s.credits, value: STUDENT.credits, foot: `${STUDENT.creditsEarned} earned of ${STUDENT.creditsRequired}`, icon: 'book', tone: 'navy' },
    { label: s.balance, value: fmtCFA(BILLING.balance), foot: `Due ${BILLING.dueDate}`, icon: 'wallet', tone: 'orange' },
    { label: 'Attendance', value: attendance + '%', foot: 'Across all courses', icon: 'check', tone: 'navy' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--fg3)' }}>{greet},</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 32, color: 'var(--fg1)', margin: '2px 0 0' }}>{STUDENT.firstName} {STUDENT.lastName}</h1>
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--fg2)', textAlign: 'right' }}>
          <div style={{ fontWeight: 600, color: 'var(--fg1)' }}>{STUDENT.program}</div>
          <div>{STUDENT.year} · {STUDENT.term}</div>
        </div>
      </div>

      {/* stat strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        {stats.map((st, i) => (
          <DCard key={i} pad={18} style={st.tone === 'orange' ? { borderLeft: '3px solid var(--daust-orange)' } : {}}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--fg3)' }}>{st.label}</span>
              <div style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: st.tone === 'orange' ? 'rgba(237,132,37,.12)' : 'rgba(21,59,106,.07)' }}>
                <Icon name={st.icon} size={18} color={st.tone === 'orange' ? 'var(--daust-orange-600)' : 'var(--daust-navy)'} />
              </div>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26, color: 'var(--fg1)', lineHeight: 1 }}>{st.value}</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg3)', marginTop: 6 }}>{st.foot}</div>
          </DCard>
        ))}
      </div>

      {/* two-column */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <DCard pad={0}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, margin: 0, color: 'var(--fg1)' }}>{s.today}</h2>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg3)' }}>{DAY_FULL[day]}</span>
              </div>
              <button onClick={() => go('schedule')} style={linkBtn}>{s.viewall} →</button>
            </div>
            {todays.map((c, i) => {
              const course = COURSES.find(x => x.code === c.code);
              const done = toMin(c.end) <= mins, live = toMin(c.start) <= mins && mins < toMin(c.end);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 22px', borderTop: '1px solid var(--border)', opacity: done ? 0.5 : 1 }}>
                  <div style={{ width: 64, flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--fg1)' }}>{c.start}</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg3)' }}>{c.end}</div>
                  </div>
                  <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 999, background: courseColor(course?.color) }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15.5, color: 'var(--fg1)' }}>{c.title}</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg3)', marginTop: 2 }}>{c.code} · {c.room} · {course?.instructor}</div>
                  </div>
                  {live && <Badge tone="orange">● LIVE</Badge>}
                  <Badge tone="steel">{c.type}</Badge>
                </div>
              );
            })}
            {todays.length === 0 && <div style={{ padding: '24px 22px', fontFamily: 'var(--font-body)', color: 'var(--fg3)' }}>No classes today.</div>}
          </DCard>

          {/* announcements */}
          <DCard pad={0}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 12px' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, margin: 0, color: 'var(--fg1)' }}>{s.announcements}</h2>
              <button onClick={() => go('announcements')} style={linkBtn}>{s.viewall} →</button>
            </div>
            {ANNOUNCEMENTS.slice(0, 3).map((a, i) => (
              <div key={i} onClick={() => go('announcements')} style={{ display: 'flex', gap: 14, padding: '14px 22px', borderTop: '1px solid var(--border)', cursor: 'pointer' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: a.accent === 'orange' ? 'rgba(237,132,37,.12)' : a.accent === 'steel' ? 'rgba(157,166,174,.18)' : 'rgba(21,59,106,.07)' }}>
                  <Icon name="megaphone" size={19} color={a.accent === 'orange' ? 'var(--daust-orange-600)' : a.accent === 'steel' ? 'var(--fg2)' : 'var(--daust-navy)'} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Eyebrow style={{ fontSize: 10, color: a.accent === 'orange' ? 'var(--daust-orange-600)' : 'var(--daust-navy)' }}>{a.tag}</Eyebrow>
                    {a.pinned && <Badge tone="orange" style={{ fontSize: 10 }}>Pinned</Badge>}
                    <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg3)' }}>{a.time}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--fg1)', marginTop: 3 }}>{a.title}</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg2)', marginTop: 3, lineHeight: 1.5 }}>{a.body}</div>
                </div>
              </div>
            ))}
          </DCard>
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ID mini */}
          <DCard navy pad={20} style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', right: -20, top: -30, width: 120, height: 120, borderRadius: 999, background: 'radial-gradient(circle, rgba(237,132,37,.22), transparent 70%)' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <Eyebrow style={{ color: 'var(--daust-orange)' }}>{s.id}</Eyebrow>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, marginTop: 6 }}>{STUDENT.name}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg-on-navy-muted)', marginTop: 3 }}>{STUDENT.id}</div>
              </div>
              <div style={{ background: '#fff', padding: 8, borderRadius: 10 }}>
                <QRCode size={92} value={STUDENT.id + '|' + STUDENT.name} fg="#0f2c50" />
              </div>
            </div>
            <button onClick={() => go('id')} style={{ marginTop: 16, width: '100%', border: '1px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.1)', color: '#fff', borderRadius: 999, padding: '10px', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icon name="scan" size={16} color="#fff" /> Open full ID
            </button>
          </DCard>

          {/* balance */}
          <DCard pad={20} style={{ borderLeft: '3px solid var(--daust-orange)' }}>
            <Eyebrow style={{ color: 'var(--fg3)' }}>{s.balance}</Eyebrow>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, color: 'var(--fg1)', marginTop: 6 }}>{fmtCFA(BILLING.balance)}</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--fg3)', marginTop: 2 }}>Due {BILLING.dueDate}</div>
            <Button variant="primary" full style={{ marginTop: 14 }} onClick={() => go('billing')}>{s.paynow}</Button>
          </DCard>

          {/* progress */}
          <DCard pad={20}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--fg2)' }}>{s.progress}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--daust-navy)' }}>{Math.round(STUDENT.creditsEarned / STUDENT.creditsRequired * 100)}%</span>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: 'var(--gray-200)', overflow: 'hidden' }}>
              <div style={{ width: `${STUDENT.creditsEarned / STUDENT.creditsRequired * 100}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, var(--daust-navy), var(--daust-orange))' }} />
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg3)', marginTop: 8 }}>{STUDENT.creditsEarned} / {STUDENT.creditsRequired} credits toward {STUDENT.cohort}</div>
          </DCard>
        </div>
      </div>
    </div>
  );
}

const linkBtn = { border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--daust-orange-600)' };

// ══ SCHEDULE (weekly grid) ════════════════════════════════════
function DSchedule({ lang }) {
  const s = DSTR[lang];
  const { day: today } = nowParts();
  const START = 8 * 60, END = 18 * 60, PXH = 66; // 08:00–18:00
  const totalH = (END - START) / 60 * PXH;
  const hours = [];
  for (let h = 8; h <= 18; h++) hours.push(h);

  return (
    <div>
      <PageHead title={s.schedule} sub={STUDENT.term} />
      <DCard pad={0} style={{ overflow: 'hidden' }}>
        {/* day header */}
        <div style={{ display: 'grid', gridTemplateColumns: '64px repeat(5, 1fr)', borderBottom: '1px solid var(--border)' }}>
          <div />
          {DAY_FULL.map((d, i) => (
            <div key={i} style={{ padding: '14px 8px', textAlign: 'center', borderLeft: '1px solid var(--border)',
              background: i === today ? 'rgba(237,132,37,.06)' : 'transparent' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: i === today ? 'var(--daust-orange-600)' : 'var(--fg1)' }}>{DAY_NAMES[i]}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--fg3)' }}>{d}</div>
            </div>
          ))}
        </div>
        {/* grid body */}
        <div style={{ display: 'grid', gridTemplateColumns: '64px repeat(5, 1fr)', position: 'relative' }}>
          {/* time axis */}
          <div style={{ position: 'relative', height: totalH }}>
            {hours.map((h, i) => (
              <div key={h} style={{ position: 'absolute', top: i * PXH - 7, right: 8, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg3)' }}>{String(h).padStart(2, '0')}:00</div>
            ))}
          </div>
          {/* day columns */}
          {[0, 1, 2, 3, 4].map(di => {
            const classes = SCHEDULE.filter(c => c.day === di);
            return (
              <div key={di} style={{ position: 'relative', height: totalH, borderLeft: '1px solid var(--border)',
                background: di === today ? 'rgba(237,132,37,.04)' : 'transparent' }}>
                {/* hour lines */}
                {hours.map((h, i) => <div key={h} style={{ position: 'absolute', top: i * PXH, left: 0, right: 0, borderTop: '1px solid var(--gray-100)' }} />)}
                {/* class blocks */}
                {classes.map((c, i) => {
                  const course = COURSES.find(x => x.code === c.code);
                  const col = courseColor(course?.color);
                  const top = (toMin(c.start) - START) / 60 * PXH;
                  const h = (toMin(c.end) - toMin(c.start)) / 60 * PXH;
                  return (
                    <div key={i} style={{ position: 'absolute', top: top + 2, height: h - 4, left: 5, right: 5,
                      background: '#fff', borderRadius: 9, borderLeft: `3px solid ${col}`, boxShadow: 'var(--shadow-sm)',
                      padding: '7px 9px', overflow: 'hidden' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, color: 'var(--fg3)' }}>{c.code}</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 12.5, color: 'var(--fg1)', lineHeight: 1.15, marginTop: 1 }}>{c.title}</div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--fg3)', marginTop: 3 }}>{c.start}–{c.end} · {c.room}</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </DCard>
    </div>
  );
}

// ══ GRADES (table + panel) ════════════════════════════════════
function DGrades({ lang }) {
  const s = DSTR[lang];
  const good = (g) => ['A', 'A-'].includes(g);
  return (
    <div>
      <PageHead title={s.grades} sub={STUDENT.term} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 16, alignItems: 'start' }}>
        {/* table */}
        <DCard pad={0} style={{ overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 70px 90px 70px', padding: '14px 22px', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
            {['Course', 'Instructor', 'Credits', 'Attendance', 'Grade'].map((h, i) => (
              <div key={i} style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--fg3)', textAlign: i >= 2 ? 'center' : 'left' }}>{h}</div>
            ))}
          </div>
          {COURSES.map((c, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 70px 90px 70px', padding: '15px 22px', borderTop: i ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div style={{ width: 3, height: 32, borderRadius: 999, background: courseColor(c.color) }} />
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14.5, color: 'var(--fg1)' }}>{c.title}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, color: 'var(--fg3)' }}>{c.code}</div>
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--fg2)' }}>{c.instructor}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--fg2)', textAlign: 'center' }}>{c.credits}</div>
              <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: c.attendance >= 90 ? 'var(--success)' : 'var(--daust-orange-600)' }}>{c.attendance}%</div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div style={{ minWidth: 42, textAlign: 'center', padding: '6px 10px', borderRadius: 10, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14.5,
                  background: c.grade === 'IP' ? 'var(--gray-100)' : good(c.grade) ? 'rgba(46,125,82,.12)' : 'rgba(21,59,106,.07)',
                  color: c.grade === 'IP' ? 'var(--fg3)' : good(c.grade) ? 'var(--success)' : 'var(--daust-navy)' }}>{c.grade}</div>
              </div>
            </div>
          ))}
        </DCard>

        {/* GPA panel */}
        <DCard navy pad={22} style={{ position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -24, bottom: -34, width: 130, height: 130, borderRadius: 999, background: 'radial-gradient(circle, rgba(237,132,37,.2), transparent 70%)' }} />
          <Eyebrow style={{ color: 'var(--daust-orange)' }}>{s.termgpa}</Eyebrow>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '18px 0' }}>
            <Ring value={STUDENT.gpa} max={4} size={120} stroke={10} color="var(--daust-orange)" track="rgba(255,255,255,.18)">
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 30, color: '#fff', lineHeight: 1 }}>{STUDENT.gpa}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--fg-on-navy-muted)' }}>/ 4.00</div>
            </Ring>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <PanelStat label={s.cumulative} value={STUDENT.cumulativeGpa} />
            <PanelStat label="Credits this term" value={STUDENT.credits} />
            <PanelStat label="Credits earned" value={`${STUDENT.creditsEarned} / ${STUDENT.creditsRequired}`} />
          </div>
        </DCard>
      </div>
    </div>
  );
}
function PanelStat({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,.12)' }}>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg-on-navy-muted)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: '#fff' }}>{value}</span>
    </div>
  );
}

Object.assign(window, { fmtCFA, toMin, fmtRange, nowParts, DSTR, DCard, PageHead, DDashboard, DSchedule, DGrades, linkBtn, PanelStat });
