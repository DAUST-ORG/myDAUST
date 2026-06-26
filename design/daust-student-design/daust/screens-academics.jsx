/* MyDAUST — Schedule, Grades, Student ID screens */

// Big light title header for tab screens
function TabHeader({ title, sub, right }) {
  return (
    <div style={{ padding: '56px 20px 8px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <div>
        {sub && <Eyebrow style={{ marginBottom: 4 }}>{sub}</Eyebrow>}
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 30, letterSpacing: '.01em', color: 'var(--fg1)', lineHeight: 1 }}>{title}</div>
      </div>
      {right}
    </div>
  );
}

// ── Schedule ──────────────────────────────────────────────────
function ScheduleScreen() {
  const t = useT();
  const s = STR[t.lang || 'en'];
  const { day: todayIdx, mins } = nowParts();
  const [sel, setSel] = React.useState(todayIdx);
  const list = SCHEDULE.filter(c => c.day === sel).sort((a, b) => toMin(a.start) - toMin(b.start));

  return (
    <div>
      <TabHeader title={s.timetable} sub={STUDENT.term} />
      {/* day selector */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 20px 6px', position: 'sticky', top: 0, zIndex: 5,
        background: 'linear-gradient(var(--bg-subtle) 70%, transparent)' }}>
        {DAY_NAMES.map((d, i) => {
          const on = i === sel;
          const isToday = i === todayIdx;
          const count = SCHEDULE.filter(c => c.day === i).length;
          return (
            <button key={i} onClick={() => setSel(i)} style={{
              flex: 1, border: 'none', cursor: 'pointer', borderRadius: 14, padding: '9px 0',
              background: on ? 'var(--daust-navy)' : '#fff', color: on ? '#fff' : 'var(--fg2)',
              boxShadow: on ? 'var(--shadow-md)' : 'var(--shadow-sm)', border: on ? 'none' : '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transition: 'all .15s ease',
            }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, letterSpacing: '.02em' }}>{d}</span>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: on ? (isToday ? 'var(--daust-orange)' : 'rgba(255,255,255,.5)') : (count ? 'var(--daust-steel)' : 'transparent') }} />
            </button>
          );
        })}
      </div>

      <div style={{ padding: '12px 20px 0' }}>
        {list.length === 0 && (
          <Card style={{ textAlign: 'center', padding: 32 }}>
            <Icon name="calendar" size={30} color="var(--gray-300)" style={{ margin: '0 auto 10px' }} />
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--fg3)' }}>No classes — free day.</div>
          </Card>
        )}
        {list.map((c, i) => {
          const course = COURSES.find(x => x.code === c.code);
          const col = courseColor(course?.color);
          const live = sel === todayIdx && toMin(c.start) <= mins && mins < toMin(c.end);
          const done = sel === todayIdx && toMin(c.end) <= mins;
          return (
            <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12, opacity: done ? 0.55 : 1 }}>
              <div style={{ width: 50, flexShrink: 0, textAlign: 'right', paddingTop: 4 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14.5, color: 'var(--fg1)' }}>{c.start}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--fg3)' }}>{c.end}</div>
              </div>
              <div style={{ flex: 1 }}>
                <Card pad={14} style={{ borderLeft: `3px solid ${col}`, position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Badge tone={course?.color === 'orange' ? 'orange' : course?.color === 'steel' ? 'steel' : 'navy'}>{c.code}</Badge>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--fg3)' }}>{c.type}</span>
                    {live && <Badge tone="orange" style={{ marginLeft: 'auto' }}>● LIVE</Badge>}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15.5, color: 'var(--fg1)', lineHeight: 1.2 }}>{c.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 7 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg2)' }}>
                      <Icon name="pin" size={14} color="var(--fg3)" />{c.room}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg2)' }}>
                      <Icon name="user" size={14} color="var(--fg3)" />{course?.instructor}
                    </span>
                  </div>
                </Card>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Grades ────────────────────────────────────────────────────
function GradesScreen() {
  const t = useT();
  const s = STR[t.lang || 'en'];
  const [open, setOpen] = React.useState(null);
  const gradedCredits = COURSES.filter(c => c.gradePts != null).reduce((a, c) => a + c.credits, 0);

  return (
    <div>
      <TabHeader title={s.grades} sub={STUDENT.term} />

      {/* GPA hero */}
      <div style={{ padding: '8px 20px 0' }}>
        <Card navy style={{ display: 'flex', alignItems: 'center', gap: 18, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -30, bottom: -40, width: 150, height: 150, borderRadius: 999, background: 'radial-gradient(circle, rgba(237,132,37,.2), transparent 70%)' }} />
          <Ring value={STUDENT.gpa} max={4} size={86} stroke={8} color="var(--daust-orange)" track="rgba(255,255,255,.18)">
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: '#fff', lineHeight: 1 }}>{STUDENT.gpa}</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--fg-on-navy-muted)' }}>/ 4.0</div>
          </Ring>
          <div style={{ flex: 1 }}>
            <Eyebrow style={{ color: 'var(--daust-orange)' }}>{s.termgpa}</Eyebrow>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19, color: '#fff', marginTop: 2 }}>Spring 2026</div>
            <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
              <Stat label="Cumulative" value={STUDENT.cumulativeGpa} onNavy />
              <Stat label="Credits" value={`${STUDENT.credits}`} onNavy />
              <Stat label="Earned" value={`${STUDENT.creditsEarned}`} onNavy />
            </div>
          </div>
        </Card>
      </div>

      {/* progress to degree */}
      <div style={{ padding: '14px 20px 0' }}>
        <Card pad={14}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, color: 'var(--fg2)' }}>Progress to degree</span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--daust-navy)' }}>{STUDENT.creditsEarned} / {STUDENT.creditsRequired} cr</span>
          </div>
          <div style={{ height: 9, borderRadius: 999, background: 'var(--gray-200)', overflow: 'hidden' }}>
            <div style={{ width: `${STUDENT.creditsEarned / STUDENT.creditsRequired * 100}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, var(--daust-navy), var(--daust-orange))' }} />
          </div>
        </Card>
      </div>

      {/* course list */}
      <div style={{ padding: '18px 20px 0' }}>
        <SectionLabel title="Courses" sub={`${COURSES.length} enrolled`} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {COURSES.map((c, i) => {
            const isOpen = open === i;
            return (
              <Card key={i} pad={0} style={{ overflow: 'hidden' }}>
                <div onClick={() => setOpen(isOpen ? null : i)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, cursor: 'pointer' }}>
                  <div style={{ width: 4, alignSelf: 'stretch', minHeight: 38, borderRadius: 999, background: courseColor(c.color) }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12.5, color: 'var(--fg3)' }}>{c.code}</span>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--fg3)' }}>· {c.credits} cr</span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14.5, color: 'var(--fg1)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</div>
                  </div>
                  <GradePill grade={c.grade} />
                  <Icon name="chevD" size={16} color="var(--gray-400)" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }} />
                </div>
                {isOpen && (
                  <div style={{ padding: '0 14px 14px 30px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <DetailRow icon="user" label="Instructor" value={c.instructor} />
                    <DetailRow icon="check" label="Attendance" value={`${c.attendance}%`} />
                    <DetailRow icon="star" label="Grade points" value={c.gradePts != null ? c.gradePts.toFixed(1) : 'In progress'} />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--fg3)', textAlign: 'center', marginTop: 12 }}>
          {gradedCredits} of {STUDENT.credits} credits graded · IP = in progress
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, onNavy }) {
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: onNavy ? '#fff' : 'var(--fg1)' }}>{value}</div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 10.5, color: onNavy ? 'var(--fg-on-navy-muted)' : 'var(--fg3)', letterSpacing: '.02em' }}>{label}</div>
    </div>
  );
}
function GradePill({ grade }) {
  const ip = grade === 'IP';
  const good = ['A', 'A-'].includes(grade);
  return (
    <div style={{
      minWidth: 40, textAlign: 'center', padding: '7px 10px', borderRadius: 11,
      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
      background: ip ? 'var(--gray-100)' : good ? 'rgba(46,125,82,.12)' : 'rgba(21,59,106,.07)',
      color: ip ? 'var(--fg3)' : good ? 'var(--success)' : 'var(--daust-navy)',
    }}>{grade}</div>
  );
}
function DetailRow({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <Icon name={icon} size={15} color="var(--fg3)" />
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--fg3)', flex: 1 }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, color: 'var(--fg1)' }}>{value}</span>
    </div>
  );
}

// ── Student ID / QR ───────────────────────────────────────────
function IDScreen() {
  const t = useT();
  const s = STR[t.lang || 'en'];
  const [flip, setFlip] = React.useState(false);
  const style = t.idStyle || 'navy';

  const cardBg = {
    navy: 'linear-gradient(155deg, var(--daust-navy-700) 0%, var(--daust-navy) 50%, var(--daust-navy-deep) 100%)',
    gradient: 'linear-gradient(150deg, #1d4a82 0%, #153b6a 45%, #ed8425 165%)',
    light: '#ffffff',
  }[style];
  const onLight = style === 'light';
  const fg = onLight ? 'var(--fg1)' : '#fff';
  const muted = onLight ? 'var(--fg3)' : 'var(--fg-on-navy-muted)';

  const uses = [
    { icon: 'shield', label: 'Campus access' },
    { icon: 'check', label: 'Attendance' },
    { icon: 'book', label: 'Library' },
    { icon: 'utensils', label: 'Dining' },
  ];

  return (
    <div>
      <TabHeader title={s.studentid} sub="DAUST" />
      <div style={{ padding: '8px 20px 0' }}>
        {/* The card */}
        <div onClick={() => setFlip(f => !f)} style={{
          borderRadius: 22, padding: 20, background: cardBg, color: fg, cursor: 'pointer',
          boxShadow: onLight ? 'var(--shadow-lg)' : 'var(--shadow-navy)', position: 'relative', overflow: 'hidden',
          border: onLight ? '1px solid var(--border)' : 'none', minHeight: 224,
        }}>
          {/* watermark dashes */}
          <div style={{ position: 'absolute', right: 18, top: 18, opacity: onLight ? 1 : .9 }}>
            <TriDash w={20} h={3.5} gap={4} />
          </div>
          {!flip ? (
            <React.Fragment>
              <Eyebrow style={{ color: onLight ? 'var(--daust-orange-600)' : 'var(--daust-orange)' }}>Dakar American University</Eyebrow>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, letterSpacing: '.04em', marginTop: 2, color: fg }}>DAUST</div>
              <div style={{ display: 'flex', gap: 16, marginTop: 18, alignItems: 'center' }}>
                <Avatar initials={STUDENT.initials} size={66} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19, color: fg, lineHeight: 1.1 }}>{STUDENT.name}</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: muted, marginTop: 3 }}>{STUDENT.program}</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: muted }}>{STUDENT.year} · {STUDENT.cohort}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 18 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: muted }}>Student ID</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 14, color: fg, letterSpacing: '.02em' }}>{STUDENT.id}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: muted }}>Valid thru</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, fontSize: 14, color: fg }}>{STUDENT.validThru}</div>
                </div>
              </div>
            </React.Fragment>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 184 }}>
              <div style={{ background: '#fff', padding: 12, borderRadius: 14, boxShadow: 'var(--shadow-md)' }}>
                <QRCode size={156} value={STUDENT.id + '|' + STUDENT.name} fg="#0f2c50" />
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: fg, marginTop: 12, letterSpacing: '.06em' }}>{STUDENT.id}</div>
            </div>
          )}
        </div>
        <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--fg3)', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
          <Icon name="refresh" size={13} color="var(--fg3)" /> Tap card to {flip ? 'show details' : 'reveal QR code'}
        </div>
      </div>

      {/* big scan CTA */}
      <div style={{ padding: '14px 20px 0' }}>
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 18, padding: 18, boxShadow: 'var(--shadow-sm)', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', padding: 10, borderRadius: 16, background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
            <QRCode size={140} value={STUDENT.id} fg="#0f2c50" />
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg2)', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
            <Icon name="scan" size={17} color="var(--daust-navy)" /> Present this code at readers across campus
          </div>
        </div>
      </div>

      {/* uses */}
      <div style={{ padding: '16px 20px 0' }}>
        <SectionLabel title="Works for" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
          {uses.map((u, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(21,59,106,.07)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={u.icon} size={19} color="var(--daust-navy)" />
              </div>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--fg1)' }}>{u.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { TabHeader, ScheduleScreen, GradesScreen, IDScreen, Stat, GradePill, DetailRow });
