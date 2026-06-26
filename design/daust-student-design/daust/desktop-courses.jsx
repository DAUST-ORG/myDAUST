/* MyDAUST Desktop — Courses hub, Canvas-style Course detail, Assignments hub */

const CT = {
  en: { home: 'Home', assignments: 'Assignments', grades: 'Grades', materials: 'Materials',
    upcoming: 'Upcoming', submitted: 'Submitted', graded: 'Graded', all: 'All',
    due: 'Due', points: 'pts', current: 'Current grade', overview: 'Course overview',
    openCourse: 'Open course', nodue: 'Nothing due', message: 'Message instructor',
    weight: 'weight', submit: 'Submit', viewall: 'View all', recent: 'Recent announcements',
    progress: 'Course progress', noitems: 'Nothing here yet.' },
  fr: { home: 'Accueil', assignments: 'Devoirs', grades: 'Notes', materials: 'Ressources',
    upcoming: 'À venir', submitted: 'Rendus', graded: 'Notés', all: 'Tous',
    due: 'Échéance', points: 'pts', current: 'Note actuelle', overview: 'Aperçu du cours',
    openCourse: 'Ouvrir', nodue: 'Rien à rendre', message: 'Contacter l’enseignant',
    weight: 'pondération', submit: 'Soumettre', viewall: 'Tout voir', recent: 'Annonces récentes',
    progress: 'Progression du cours', noitems: 'Rien pour le moment.' },
};

function typeIcon(t) {
  return ({ reading: 'book', video: 'video', assignment: 'clipboard', quiz: 'pencil', lab: 'flask', slides: 'file', exam: 'pencil', project: 'lightbulb', report: 'file' })[t.toLowerCase()] || 'file';
}
function statusBadge(s) {
  if (s === 'graded') return <Badge tone="success">Graded</Badge>;
  if (s === 'submitted') return <Badge tone="steel">Submitted</Badge>;
  return null;
}
function dueChip(a) {
  if (a.status === 'graded') return <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--success)' }}>{a.score}/{a.points}</span>;
  if (a.status === 'submitted') return <Badge tone="steel">Awaiting grade</Badge>;
  const urgent = a.days <= 2;
  return <Badge tone={urgent ? 'orange' : 'navy'}>{urgent ? '● ' : ''}{a.due}</Badge>;
}

// ══ COURSES HUB ═══════════════════════════════════════════════
function DCourses({ go, lang }) {
  const s = DSTR[lang];
  return (
    <div>
      <PageHead title={s.courses} sub={STUDENT.term} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {COURSES.map((c, i) => {
          const ex = COURSE_EXTRA[c.code] || {};
          const col = courseColor(c.color);
          const due = ASSIGNMENTS.filter(a => a.course === c.code && a.status === 'upcoming').sort((x, y) => x.days - y.days);
          return (
            <div key={i} onClick={() => go('course', c.code)} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--shadow-sm)', cursor: 'pointer', overflow: 'hidden', transition: 'box-shadow .16s, transform .16s' }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.transform = 'none'; }}>
              <div style={{ height: 8, background: col }} />
              <div style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--fg3)' }}>{c.code}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--fg1)', marginTop: 2, lineHeight: 1.2 }}>{c.title}</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--fg3)', marginTop: 4 }}>{c.instructor} · {c.credits} cr</div>
                  </div>
                  <div style={{ minWidth: 42, textAlign: 'center', padding: '6px 10px', borderRadius: 10, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14,
                    background: c.grade === 'IP' ? 'var(--gray-100)' : 'rgba(46,125,82,.12)', color: c.grade === 'IP' ? 'var(--fg3)' : 'var(--success)' }}>{c.grade}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 6px' }}>
                  <div style={{ flex: 1, height: 7, borderRadius: 999, background: 'var(--gray-200)', overflow: 'hidden' }}>
                    <div style={{ width: `${ex.progress || 0}%`, height: '100%', borderRadius: 999, background: col }} />
                  </div>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, fontWeight: 600, color: 'var(--fg3)' }}>{ex.progress || 0}%</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, fontFamily: 'var(--font-body)', fontSize: 12.5, color: due.length ? 'var(--daust-orange-600)' : 'var(--fg3)' }}>
                  <Icon name={due.length ? 'clipboard' : 'check'} size={15} color="currentColor" />
                  {due.length ? `${due.length} due — next: ${due[0].due}` : 'Nothing due'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══ COURSE DETAIL (tabbed) ════════════════════════════════════
function DCourseDetail({ code, go, lang }) {
  const t = CT[lang];
  const c = COURSES.find(x => x.code === code) || COURSES[0];
  const ex = COURSE_EXTRA[code] || {};
  const col = courseColor(c.color);
  const [tab, setTab] = React.useState('home');
  const tabs = [['home', t.home], ['assignments', t.assignments], ['grades', t.grades], ['materials', t.materials]];
  const mySched = SCHEDULE.filter(x => x.code === code);

  return (
    <div>
      <button onClick={() => go('courses')} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--fg3)', marginBottom: 14 }}>
        <Icon name="chevL" size={16} color="var(--fg3)" /> {DSTR[lang].courses}
      </button>
      {/* course header */}
      <div style={{ background: 'linear-gradient(120deg, var(--daust-navy) 0%, var(--daust-navy-deep) 100%)', borderRadius: 16, padding: 24, color: '#fff', position: 'relative', overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, background: col }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, letterSpacing: '.06em', color: 'var(--fg-on-navy-muted)' }}>{c.code} · {STUDENT.term}</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26, margin: '4px 0 0' }}>{c.title}</h1>
            <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg-on-navy-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="user" size={15} color="var(--fg-on-navy-muted)" />{c.instructor}</span>
              {mySched[0] && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="pin" size={15} color="var(--fg-on-navy-muted)" />{mySched[0].room}</span>}
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="book" size={15} color="var(--fg-on-navy-muted)" />{c.credits} credits</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--fg-on-navy-muted)' }}>{t.current}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, color: 'var(--daust-orange)' }}>{c.grade}</div>
          </div>
        </div>
      </div>
      {/* tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '10px 16px', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
            color: tab === id ? 'var(--daust-navy)' : 'var(--fg3)', borderBottom: tab === id ? '2.5px solid var(--daust-orange)' : '2.5px solid transparent', marginBottom: -1 }}>{label}</button>
        ))}
      </div>

      {tab === 'home' && <CourseHome c={c} ex={ex} t={t} go={go} setTab={setTab} />}
      {tab === 'assignments' && <CourseAssignments code={code} t={t} />}
      {tab === 'grades' && <CourseGrades c={c} ex={ex} t={t} />}
      {tab === 'materials' && <CourseMaterials ex={ex} t={t} />}
    </div>
  );
}

function CourseHome({ c, ex, t, go, setTab }) {
  const upcoming = ASSIGNMENTS.filter(a => a.course === c.code && a.status === 'upcoming').sort((x, y) => x.days - y.days);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <DCard pad={22}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--fg1)', marginBottom: 8 }}>{t.overview}</div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--fg2)', lineHeight: 1.65 }}>{ex.desc}</div>
        </DCard>
        <DCard pad={0}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--fg1)' }}>{t.recent}</div>
          </div>
          {(ex.announce || []).map((a, i) => (
            <div key={i} style={{ padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14.5, color: 'var(--fg1)' }}>{a.title}</div>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg3)' }}>{a.time}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg2)', marginTop: 5, lineHeight: 1.55 }}>{a.body}</div>
            </div>
          ))}
        </DCard>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <DCard pad={20}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--fg2)' }}>{t.progress}</span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--daust-navy)' }}>{ex.progress}%</span>
          </div>
          <div style={{ height: 9, borderRadius: 999, background: 'var(--gray-200)', overflow: 'hidden' }}>
            <div style={{ width: `${ex.progress}%`, height: '100%', borderRadius: 999, background: courseColor(c.color) }} />
          </div>
        </DCard>
        <DCard pad={0}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14.5, color: 'var(--fg1)' }}>{t.upcoming}</span>
            <button onClick={() => setTab('assignments')} style={linkBtn}>{t.viewall} →</button>
          </div>
          {upcoming.length === 0 && <div style={{ padding: '0 18px 16px', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg3)' }}>{t.nodue}</div>}
          {upcoming.slice(0, 4).map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
              <Icon name={typeIcon(a.type)} size={17} color="var(--daust-navy)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, color: 'var(--fg1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
              </div>
              <Badge tone={a.days <= 2 ? 'orange' : 'steel'}>{a.due.split(',')[0]}</Badge>
            </div>
          ))}
        </DCard>
        <Button variant="outline" full onClick={() => go('inbox')}><Icon name="mail" size={17} color="currentColor" /> {t.message}</Button>
      </div>
    </div>
  );
}

function CourseAssignments({ code, t }) {
  const list = ASSIGNMENTS.filter(a => a.course === code);
  const groups = [['upcoming', t.upcoming], ['submitted', t.submitted], ['graded', t.graded]];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 880 }}>
      {groups.map(([st, label]) => {
        const items = list.filter(a => a.status === st).sort((x, y) => Math.abs(x.days) - Math.abs(y.days));
        if (!items.length) return null;
        return (
          <div key={st}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--fg3)', marginBottom: 10 }}>{label} · {items.length}</div>
            <DCard pad={0}>
              {items.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 20px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(21,59,106,.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name={typeIcon(a.type)} size={19} color="var(--daust-navy)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14.5, color: 'var(--fg1)' }}>{a.title}</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--fg3)', marginTop: 2 }}>{a.type} · {a.points} {t.points} · {t.due} {a.due}</div>
                  </div>
                  {dueChip(a)}
                  {a.status === 'upcoming' && <Button size="sm" variant="navy">{t.submit}</Button>}
                </div>
              ))}
            </DCard>
          </div>
        );
      })}
    </div>
  );
}

function CourseGrades({ c, ex, t }) {
  const cats = ex.gradeCats || [];
  // weighted current grade from graded items only
  let earned = 0, wsum = 0;
  cats.forEach(cat => {
    const done = cat.items.filter(it => it.score != null);
    if (done.length) {
      const pct = done.reduce((a, it) => a + it.score, 0) / done.reduce((a, it) => a + it.max, 0);
      earned += pct * cat.weight; wsum += cat.weight;
    }
  });
  const current = wsum ? Math.round(earned / wsum * 100) : null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 260px', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {cats.map((cat, i) => {
          const done = cat.items.filter(it => it.score != null);
          const pct = done.length ? Math.round(done.reduce((a, it) => a + it.score, 0) / done.reduce((a, it) => a + it.max, 0) * 100) : null;
          return (
            <DCard key={i} pad={0}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--fg1)', whiteSpace: 'nowrap' }}>{cat.name} <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12, color: 'var(--fg3)' }}>· {cat.weight}%</span></div>
                {pct != null && <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--daust-navy)' }}>{pct}%</span>}
              </div>
              {cat.items.map((it, j) => (
                <div key={j} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 20px', borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: it.score == null ? 'var(--fg3)' : 'var(--fg1)' }}>{it.title}</span>
                  {it.score == null
                    ? <Badge tone="steel">—</Badge>
                    : <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13.5, color: 'var(--fg1)' }}>{it.score}<span style={{ color: 'var(--fg3)', fontWeight: 500 }}> / {it.max}</span></span>}
                </div>
              ))}
            </DCard>
          );
        })}
      </div>
      <DCard navy pad={22} style={{ position: 'relative', overflow: 'hidden', textAlign: 'center' }}>
        <div style={{ position: 'absolute', right: -24, bottom: -34, width: 120, height: 120, borderRadius: 999, background: 'radial-gradient(circle, rgba(237,132,37,.2), transparent 70%)' }} />
        <Eyebrow style={{ color: 'var(--daust-orange)' }}>{t.current}</Eyebrow>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 52, color: '#fff', margin: '8px 0 0', lineHeight: 1 }}>{c.grade}</div>
        {current != null && <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--fg-on-navy-muted)', marginTop: 6 }}>{current}% earned so far</div>}
        <div style={{ borderTop: '1px solid rgba(255,255,255,.14)', margin: '18px 0 0', paddingTop: 16, fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--fg-on-navy-muted)', lineHeight: 1.6 }}>
          Based on graded work only. Pending items are not yet included.
        </div>
      </DCard>
    </div>
  );
}

function CourseMaterials({ ex, t }) {
  const mods = ex.modules || [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 880 }}>
      {mods.map((m, i) => (
        <DCard key={i} pad={0} style={{ opacity: m.locked ? 0.7 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 20px', borderBottom: '1px solid var(--border)' }}>
            <Icon name={m.locked ? 'lock' : 'folder'} size={18} color="var(--daust-navy)" />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--fg1)' }}>{m.title}</span>
            {m.locked && <Badge tone="steel" style={{ marginLeft: 'auto' }}>Locked</Badge>}
          </div>
          {m.items.map((it, j) => (
            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 20px', borderTop: j ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={typeIcon(it.type)} size={17} color={it.status === 'locked' ? 'var(--gray-400)' : 'var(--daust-navy)'} />
              </div>
              <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 14, color: it.status === 'locked' ? 'var(--fg3)' : 'var(--fg1)' }}>{it.title}</span>
              {it.status === 'done' && <Icon name="check" size={18} color="var(--success)" />}
              {it.status === 'todo' && <Badge tone="orange">To do</Badge>}
              {it.status === 'locked' && <Icon name="lock" size={15} color="var(--gray-400)" />}
            </div>
          ))}
        </DCard>
      ))}
    </div>
  );
}

// ══ ASSIGNMENTS HUB (all courses) ═════════════════════════════
function DAssignments({ go, lang }) {
  const s = DSTR[lang], t = CT[lang];
  const [filter, setFilter] = React.useState('upcoming');
  const filters = [['upcoming', t.upcoming], ['submitted', t.submitted], ['graded', t.graded], ['all', t.all]];
  const list = ASSIGNMENTS.filter(a => filter === 'all' || a.status === filter).sort((x, y) => x.days - y.days);
  const upN = ASSIGNMENTS.filter(a => a.status === 'upcoming').length;
  return (
    <div>
      <PageHead title={s.assignments} sub={`${upN} ${t.upcoming.toLowerCase()}`} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {filters.map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} style={{ border: 'none', cursor: 'pointer', borderRadius: 999, padding: '9px 18px', fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 600,
            background: filter === id ? 'var(--daust-navy)' : '#fff', color: filter === id ? '#fff' : 'var(--fg2)', border: filter === id ? 'none' : '1px solid var(--border)' }}>{label}</button>
        ))}
      </div>
      <DCard pad={0} style={{ maxWidth: 960 }}>
        {list.map((a, i) => {
          const c = COURSES.find(x => x.code === a.course);
          return (
            <div key={i} onClick={() => go('course', a.course)} style={{ display: 'flex', alignItems: 'center', gap: 15, padding: '15px 22px', borderTop: i ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}>
              <div style={{ width: 4, height: 38, borderRadius: 999, background: courseColor(c?.color), flexShrink: 0 }} />
              <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(21,59,106,.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={typeIcon(a.type)} size={19} color="var(--daust-navy)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14.5, color: 'var(--fg1)' }}>{a.title}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--fg3)', marginTop: 2 }}>{a.course} · {c?.title} · {a.points} {t.points}</div>
              </div>
              {dueChip(a)}
            </div>
          );
        })}
        {list.length === 0 && <div style={{ padding: 28, textAlign: 'center', fontFamily: 'var(--font-body)', color: 'var(--fg3)' }}>{t.noitems}</div>}
      </DCard>
    </div>
  );
}

Object.assign(window, { DCourses, DCourseDetail, DAssignments, CT, typeIcon });
