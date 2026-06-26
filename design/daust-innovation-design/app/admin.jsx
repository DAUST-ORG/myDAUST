/* DAUST Innovation Tracker — Admin console: overview, projects list, review queue, global tasks */

const { T } = window.DAUST_UI;

// ---------- Distribution bar (simple horizontal stacked) ----------
function DistBar({ data, total }) {
  return (
    <div>
      <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', background: T.g100 }}>
        {data.map((d, i) => <div key={i} style={{ width: `${(d.value / total) * 100}%`, background: d.color }} title={`${d.label}: ${d.value}`} />)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', marginTop: 12 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color }} />
            <span style={{ fontFamily: T.body, fontSize: 12.5, color: T.fg2 }}>{d.label}</span>
            <span style={{ fontFamily: T.display, fontWeight: 700, fontSize: 13, color: T.fg1 }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BigStat({ value, label, accent, icon, onClick }) {
  return (
    <Card pad={20} hoverable={!!onClick} onClick={onClick} style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: T.display, fontWeight: 800, fontSize: 34, color: T.fg1, lineHeight: 1 }}>{value}</div>
          <div style={{ fontFamily: T.body, fontSize: 13, color: T.fg3, marginTop: 6 }}>{label}</div>
        </div>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: (accent || T.navy) + '14', color: accent || T.navy,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={19} /></div>
      </div>
    </Card>
  );
}

// ---------- Admin overview ----------
function AdminOverview({ projects, onNav, onOpenProject }) {
  const { PHASES, phaseIndex, GLOBAL_TASKS, fmtShort, TODAY, PROGRAMS } = window.DAUST_DATA;
  const onTrack = projects.filter((p) => p.health === 'on-track').length;
  const atRisk = projects.filter((p) => p.health === 'at-risk').length;
  const behind = projects.filter((p) => p.health === 'behind').length;
  const pendingReview = projects.reduce((s, p) => s + p.submitted, 0);
  const avgPct = Math.round(projects.reduce((s, p) => s + p.pct, 0) / projects.length);

  const byPhase = PHASES.map((ph, i) => ({ label: ph.name, value: projects.filter((p) => p.current === ph.id).length,
    color: [T.navy, T.navy700, '#2e6a8f', T.orange, '#d6731a', T.steel, '#6c7884'][i] }));
  const byProgram = PROGRAMS.map((pr, i) => ({ label: pr.replace(' Engineering', ' Eng'), value: projects.filter((p) => p.program === pr).length,
    color: [T.navy, T.orange, T.steel][i] }));

  const reviewQueue = projects.filter((p) => p.submitted > 0)
    .sort((a, b) => b.submitted - a.submitted).slice(0, 5);
  const flagged = projects.filter((p) => p.health === 'behind').slice(0, 5);
  const nextDeadline = GLOBAL_TASKS.find((g) => new Date(g.due) >= TODAY);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* DAUST Impact countdown */}
      <ImpactCountdown />

      {/* stat row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
        <BigStat value={projects.length} label="Active projects" icon="folder-kanban" onClick={() => onNav('projects')} />
        <BigStat value={onTrack} label="On track" accent={T.success} icon="trending-up" />
        <BigStat value={atRisk + behind} label="Need attention" accent={T.orange} icon="alert-triangle" />
        <BigStat value={pendingReview} label="Awaiting review" accent={T.info} icon="inbox" onClick={() => onNav('review')} />
        <BigStat value={avgPct + '%'} label="Avg. completion" accent={T.navy} icon="gauge" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card pad={22}>
          <SectionTitle eyebrow="Cohort health" title="Projects by phase" />
          <DistBar data={byPhase} total={projects.length} />
          <div style={{ marginTop: 22 }}>
            <SectionTitle title="By program" style={{ marginBottom: 12 }} />
            <DistBar data={byProgram} total={projects.length} />
          </div>
        </Card>

        <Card pad={22}>
          <SectionTitle eyebrow="Needs action" title="Behind schedule"
            right={<HealthBadge value="behind" size="sm" />} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {flagged.map((p, i) => (
              <div key={p.id} onClick={() => onOpenProject(p)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0',
                borderTop: i ? `1px solid ${T.g100}` : 'none', cursor: 'pointer' }}>
                <div style={{ width: 8, height: 8, borderRadius: 999, background: T.danger, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: T.body, fontWeight: 600, fontSize: 13.5, color: T.fg1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</div>
                  <div style={{ fontFamily: T.body, fontSize: 11.5, color: T.fg3 }}>{p.code} · {p.lead} · {p.overdue} overdue</div>
                </div>
                <div style={{ width: 90 }}><Progress project={p} style="bar" size="sm" /></div>
                <Icon name="chevron-right" size={16} color={T.fg3} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20 }}>
        <Card pad={22}>
          <SectionTitle eyebrow="Review queue" title="Latest submissions"
            right={<Button variant="ghost" size="sm" icon="arrow-right" onClick={() => onNav('review')}>Open queue</Button>} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {reviewQueue.map((p, i) => (
              <div key={p.id} onClick={() => onOpenProject(p)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 0',
                borderTop: i ? `1px solid ${T.g100}` : 'none', cursor: 'pointer' }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: '#e7eefa', color: T.info, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="file-clock" size={17} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: T.body, fontWeight: 600, fontSize: 13.5, color: T.fg1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</div>
                  <div style={{ fontFamily: T.body, fontSize: 11.5, color: T.fg3 }}>{p.code} · {window.DAUST_DATA.PHASES[phaseIndex(p.current)].name} phase</div>
                </div>
                <Tag tone="navy" style={{ fontSize: 11, background: T.info }}>{p.submitted} to review</Tag>
              </div>
            ))}
          </div>
        </Card>

        <Card pad={22} style={{ background: `linear-gradient(135deg, ${T.navy}, ${T.navy700})`, border: 'none', color: '#fff' }}>
          <Eyebrow color="#f0b27a" style={{ marginBottom: 6 }}>Next global deadline</Eyebrow>
          {nextDeadline && (
            <>
              <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: 22, lineHeight: 1.15 }}>{nextDeadline.title}</div>
              <div style={{ fontFamily: T.body, fontSize: 13, color: '#cdd6e3', marginTop: 8 }}>{nextDeadline.desc}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
                <div style={{ background: 'rgba(255,255,255,.1)', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontFamily: T.display, fontWeight: 800, fontSize: 24, color: T.orange }}>{window.DAUST_DATA.daysBetween(TODAY, nextDeadline.due)}</div>
                  <div style={{ fontFamily: T.body, fontSize: 11, color: '#cdd6e3' }}>days left</div>
                </div>
                <div>
                  <div style={{ fontFamily: T.body, fontSize: 13, color: '#fff', fontWeight: 600 }}>{fmtShort(nextDeadline.due)}</div>
                  <div style={{ fontFamily: T.body, fontSize: 12, color: '#cdd6e3' }}>Applies to all {projects.length} projects</div>
                </div>
              </div>
              <div style={{ marginTop: 18 }}>
                <Button variant="primary" size="sm" icon="calendar-clock" onClick={() => onNav('global')}>Manage global tasks</Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---------- Projects list (filterable table) ----------
function AdminProjects({ projects, onOpenProject }) {
  const { PHASES, phaseIndex, PROGRAMS, TRACKS, fmtShort } = window.DAUST_DATA;
  const [q, setQ] = React.useState('');
  const [prog, setProg] = React.useState('all');
  const [health, setHealth] = React.useState('all');
  const [type, setType] = React.useState('all');
  const [sort, setSort] = React.useState('health');
  const [page, setPage] = React.useState(0);
  const perPage = 12;

  let rows = projects.filter((p) => {
    if (q && !(p.title.toLowerCase().includes(q.toLowerCase()) || p.code.toLowerCase().includes(q.toLowerCase()) || p.lead.toLowerCase().includes(q.toLowerCase()))) return false;
    if (prog !== 'all' && p.program !== prog) return false;
    if (health !== 'all' && p.health !== health) return false;
    if (type !== 'all' && p.type !== type) return false;
    return true;
  });
  const healthRank = { behind: 0, 'at-risk': 1, 'on-track': 2 };
  rows = [...rows].sort((a, b) => {
    if (sort === 'health') return healthRank[a.health] - healthRank[b.health] || b.overdue - a.overdue;
    if (sort === 'progress') return b.pct - a.pct;
    if (sort === 'title') return a.title.localeCompare(b.title);
    return 0;
  });
  const totalPages = Math.ceil(rows.length / perPage);
  const pageRows = rows.slice(page * perPage, page * perPage + perPage);
  React.useEffect(() => { setPage(0); }, [q, prog, health, type, sort]);

  const Select = ({ value, onChange, options, icon }) => (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      {icon && <Icon name={icon} size={14} color={T.fg3} style={{ position: 'absolute', left: 11, pointerEvents: 'none' }} />}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ appearance: 'none', fontFamily: T.body, fontSize: 13, fontWeight: 500, color: T.fg1,
          padding: icon ? '9px 30px 9px 32px' : '9px 30px 9px 13px', borderRadius: 999, border: `1px solid ${T.border}`,
          background: '#fff', cursor: 'pointer' }}>
        {options.map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
      </select>
      <Icon name="chevron-down" size={14} color={T.fg3} style={{ position: 'absolute', right: 11, pointerEvents: 'none' }} />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card pad={16}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Icon name="search" size={16} color={T.fg3} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects, codes, leads…"
              style={{ width: '100%', boxSizing: 'border-box', fontFamily: T.body, fontSize: 13.5, color: T.fg1,
                padding: '10px 14px 10px 38px', borderRadius: 999, border: `1px solid ${T.border}`, outline: 'none' }} />
          </div>
          <Select value={prog} onChange={setProg} icon="graduation-cap" options={[['all', 'All programs'], ...PROGRAMS.map((p) => [p, p])]} />
          <Select value={health} onChange={setHealth} icon="activity" options={[['all', 'All health'], ['on-track', 'On track'], ['at-risk', 'At risk'], ['behind', 'Behind']]} />
          <Select value={type} onChange={setType} icon="users" options={[['all', 'All types'], ['Group', 'Group'], ['Solo', 'Solo']]} />
          <Select value={sort} onChange={setSort} icon="arrow-down-up" options={[['health', 'Sort: Health'], ['progress', 'Sort: Progress'], ['title', 'Sort: Title']]} />
        </div>
      </Card>

      <Card pad={0} style={{ overflow: 'hidden' }}>
        {/* header */}
        <div style={{ display: 'grid', gridTemplateColumns: '2.6fr 1.3fr 1fr 1.4fr 1fr', gap: 14, padding: '12px 22px',
          background: T.g50, borderBottom: `1px solid ${T.border}`, fontFamily: T.body, fontSize: 11, fontWeight: 700,
          color: T.fg3, letterSpacing: '.06em', textTransform: 'uppercase' }}>
          <div>Project</div><div>Team</div><div>Phase</div><div>Progress</div><div style={{ textAlign: 'right' }}>Health</div>
        </div>
        {pageRows.map((p, i) => (
          <div key={p.id} onClick={() => onOpenProject(p)}
            style={{ display: 'grid', gridTemplateColumns: '2.6fr 1.3fr 1fr 1.4fr 1fr', gap: 14, padding: '14px 22px',
              alignItems: 'center', borderBottom: i < pageRows.length - 1 ? `1px solid ${T.g100}` : 'none', cursor: 'pointer',
              transition: 'background .12s' }}
            onMouseEnter={(e) => e.currentTarget.style.background = T.g50}
            onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: T.body, fontWeight: 600, fontSize: 14, color: T.fg1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</span>
              </div>
              <div style={{ fontFamily: T.body, fontSize: 11.5, color: T.fg3, marginTop: 2 }}>{p.code} · {p.track} · {p.type}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AvatarStack names={p.members} size={26} max={3} />
            </div>
            <div style={{ fontFamily: T.body, fontSize: 12.5, color: T.fg2, fontWeight: 500 }}>{PHASES[phaseIndex(p.current)].name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1 }}><Progress project={p} style="bar" size="sm" /></div>
              <span style={{ fontFamily: T.body, fontSize: 12, fontWeight: 600, color: T.fg2, width: 30 }}>{p.pct}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}><HealthBadge value={p.health} size="sm" /></div>
          </div>
        ))}
        {/* pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 22px', borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontFamily: T.body, fontSize: 12.5, color: T.fg3 }}>
            Showing {page * perPage + 1}–{Math.min(rows.length, (page + 1) * perPage)} of {rows.length} projects
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button variant="subtle" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</Button>
            <Button variant="subtle" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>Next</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

Object.assign(window, { AdminOverview, AdminProjects, DistBar, BigStat });
