/* MyDAUST — Home / dashboard screen */

function nowParts() {
  const d = new Date();
  let day = d.getDay() - 1;        // 0=Mon
  if (day < 0 || day > 4) day = 0; // weekend → show Monday
  const mins = d.getHours() * 60 + d.getMinutes();
  return { day, mins, hour: d.getHours() };
}
function toMin(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
function fmtRange(s, e) { return `${s} – ${e}`; }

function greeting(hour, s) {
  if (hour < 12) return s.goodmorning;
  if (hour < 17) return s.goodafternoon;
  return s.goodevening;
}

function HomeScreen() {
  const nav = useNav();
  const t = useT();
  const s = STR[t.lang || 'en'];
  const { day, mins, hour } = nowParts();
  const todays = SCHEDULE.filter(c => c.day === day).sort((a, b) => toMin(a.start) - toMin(b.start));
  const upcoming = todays.find(c => toMin(c.end) > mins);
  const nextC = upcoming || SCHEDULE.filter(c => c.day === (day + 1) % 5).sort((a, b) => toMin(a.start) - toMin(b.start))[0];
  const isToday = !!upcoming;
  const delta = nextC ? toMin(nextC.start) - mins : 0;
  const countdown = isToday && delta > 0 && delta < 120 ? `in ${delta} min` : (isToday ? 'in progress' : 'tomorrow');

  const QA = [
    { icon: 'qr', label: s.scanid, go: () => nav.setTab('id'), tone: 'orange' },
    { icon: 'calendar', label: s.timetable, go: () => nav.setTab('schedule'), tone: 'navy' },
    { icon: 'cap', label: s.viewgrades, go: () => nav.setTab('grades'), tone: 'navy' },
    { icon: 'wallet', label: s.pay, go: () => nav.go('billing'), tone: 'navy' },
  ];

  return (
    <div>
      {/* Navy hero */}
      <div style={{
        background: 'linear-gradient(160deg, var(--daust-navy-700) 0%, var(--daust-navy) 45%, var(--daust-navy-deep) 100%)',
        borderRadius: '0 0 30px 30px', padding: '56px 20px 26px', color: '#fff',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', right: -40, top: -30, width: 200, height: 200, borderRadius: 999,
          background: 'radial-gradient(circle, rgba(237,132,37,.22), transparent 70%)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar initials={STUDENT.initials} size={46} ring />
            <div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--fg-on-navy-muted)' }}>{greeting(hour, s)},</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, letterSpacing: '.01em' }}>{STUDENT.firstName}</div>
            </div>
          </div>
          <button onClick={() => nav.go('announcements')} style={{
            position: 'relative', width: 42, height: 42, borderRadius: 999, cursor: 'pointer',
            background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="bell" size={21} color="#fff" />
            <span style={{ position: 'absolute', top: 9, right: 10, width: 8, height: 8, borderRadius: 999, background: 'var(--daust-orange)', border: '1.5px solid var(--daust-navy)' }} />
          </button>
        </div>

        {/* next class */}
        {nextC && (
          <div onClick={() => nav.setTab('schedule')} style={{
            marginTop: 20, background: 'rgba(255,255,255,.10)', border: '1px solid rgba(255,255,255,.14)',
            borderRadius: 16, padding: 14, display: 'flex', alignItems: 'center', gap: 13, cursor: 'pointer',
            backdropFilter: 'blur(8px)',
          }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: 'var(--daust-orange)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="clock" size={23} color="#fff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--fg-on-navy-muted)' }}>{s.nextclass}</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 10.5, fontWeight: 700, color: 'var(--daust-orange)', background: 'rgba(237,132,37,.16)', padding: '2px 7px', borderRadius: 999 }}>{countdown}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15.5, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nextC.title}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg-on-navy-muted)', marginTop: 1 }}>{fmtRange(nextC.start, nextC.end)} · {nextC.room}</div>
            </div>
            <Icon name="chevR" size={18} color="rgba(255,255,255,.5)" />
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div style={{ padding: '18px 20px 4px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {QA.map((q, i) => (
            <button key={i} onClick={q.go} style={{
              border: '1px solid var(--border)', background: '#fff', borderRadius: 16, cursor: 'pointer',
              padding: '13px 6px 11px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
              boxShadow: 'var(--shadow-sm)',
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: q.tone === 'orange' ? 'rgba(237,132,37,.12)' : 'rgba(21,59,106,.07)',
              }}>
                <Icon name={q.icon} size={22} color={q.tone === 'orange' ? 'var(--daust-orange-600)' : 'var(--daust-navy)'} />
              </div>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, color: 'var(--fg2)', textAlign: 'center', lineHeight: 1.2 }}>{q.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Today's schedule */}
      <div style={{ padding: '14px 20px 0' }}>
        <SectionLabel title={s.today} sub={DAY_FULL[day]} action={s.viewall} onAction={() => nav.setTab('schedule')} />
        <Card pad={0} style={{ overflow: 'hidden' }}>
          {todays.length === 0 && (
            <div style={{ padding: 22, textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--fg3)' }}>No classes scheduled.</div>
          )}
          {todays.map((c, i) => {
            const done = toMin(c.end) <= mins && isToday;
            const live = toMin(c.start) <= mins && mins < toMin(c.end) && isToday;
            return (
              <div key={i} style={{
                display: 'flex', gap: 12, padding: '13px 16px', alignItems: 'center',
                borderTop: i ? '1px solid var(--border)' : 'none', opacity: done ? 0.5 : 1,
              }}>
                <div style={{ width: 52, flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--fg1)' }}>{c.start}</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--fg3)' }}>{c.end}</div>
                </div>
                <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 999, background: courseColor(COURSES.find(x => x.code === c.code)?.color) }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14.5, color: 'var(--fg1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg3)', marginTop: 1 }}>{c.code} · {c.room}</div>
                </div>
                {live && <Badge tone="orange">LIVE</Badge>}
              </div>
            );
          })}
        </Card>
      </div>

      {/* Balance */}
      <div style={{ padding: '16px 20px 0' }}>
        <Card onClick={() => nav.go('billing')} style={{ display: 'flex', alignItems: 'center', gap: 14,
          borderLeft: '3px solid var(--daust-orange)' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(237,132,37,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="wallet" size={23} color="var(--daust-orange-600)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--fg3)' }}>{s.balance}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 21, color: 'var(--fg1)' }}>{fmtCFA(BILLING.balance)}</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--fg3)' }}>Due {BILLING.dueDate}</div>
          </div>
          <Button size="sm" onClick={(e) => { e.stopPropagation(); nav.go('billing'); }}>{s.paynow}</Button>
        </Card>
      </div>

      {/* Announcements preview */}
      <div style={{ padding: '18px 20px 0' }}>
        <SectionLabel title={s.announcements} action={s.viewall} onAction={() => nav.go('announcements')} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ANNOUNCEMENTS.slice(0, 2).map((a, i) => (
            <Card key={i} onClick={() => nav.go('announcement', { item: a })} pad={14} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: a.accent === 'orange' ? 'rgba(237,132,37,.12)' : a.accent === 'steel' ? 'rgba(157,166,174,.18)' : 'rgba(21,59,106,.07)' }}>
                <Icon name="megaphone" size={19} color={a.accent === 'orange' ? 'var(--daust-orange-600)' : a.accent === 'steel' ? 'var(--fg2)' : 'var(--daust-navy)'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Eyebrow style={{ fontSize: 10, color: a.accent === 'orange' ? 'var(--daust-orange-600)' : 'var(--daust-navy)' }}>{a.tag}</Eyebrow>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--fg1)', marginTop: 3, lineHeight: 1.25 }}>{a.title}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--fg3)', marginTop: 4 }}>{a.time}</div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── shared bits used across screens ───────────────────────────
function SectionLabel({ title, sub, action, onAction }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16.5, color: 'var(--fg1)', letterSpacing: '.01em' }}>{title}</span>
        {sub && <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--fg3)' }}>{sub}</span>}
      </div>
      {action && <button onClick={onAction} style={{ border: 'none', background: 'none', cursor: 'pointer',
        fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, color: 'var(--daust-orange-600)' }}>{action} →</button>}
    </div>
  );
}

function fmtCFA(n) {
  return new Intl.NumberFormat('fr-FR').format(Math.abs(n)).replace(/\u202f/g, ' ') + ' CFA';
}

Object.assign(window, { HomeScreen, SectionLabel, fmtCFA, nowParts, toMin, fmtRange });
