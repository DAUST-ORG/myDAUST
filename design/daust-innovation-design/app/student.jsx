/* DAUST Innovation Tracker — Student portal screens */

const { T } = window.DAUST_UI;

function StatTile({ icon, label, value, tone = 'navy', sub }) {
  const tones = { navy: T.navy, orange: T.orange, success: T.success, danger: T.danger };
  return (
    <Card pad={16} style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
      <div style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, background: tones[tone] + '14',
        color: tones[tone], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={20} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: 22, color: T.fg1, lineHeight: 1 }}>{value}</div>
        <div style={{ fontFamily: T.body, fontSize: 12, color: T.fg3, marginTop: 3 }}>{label}</div>
      </div>
      {sub}
    </Card>
  );
}

// ---------- Student dashboard ----------
function StudentDashboard({ project, tweaks, onNav, onOpenTask }) {
  const { PHASES, phaseIndex, fmtShort, fmtDate, TODAY, feedbackFor } = window.DAUST_DATA;
  const curPhase = PHASES[phaseIndex(project.current)];
  const upcoming = project.tasks
    .filter((t) => t.status !== 'done' && t.status !== 'approved')
    .sort((a, b) => new Date(a.due) - new Date(b.due)).slice(0, 4);
  const curTasks = project.tasks.filter((t) => t.phase === project.current);
  const feedback = feedbackFor(project)[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Hero */}
      <div style={{ background: `linear-gradient(120deg, ${T.navy} 0%, ${T.navy700} 78%, ${T.navyDeep} 130%)`,
        borderRadius: 16, padding: 26, color: '#fff', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,.06) 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Tag tone="orange" style={{ fontSize: 11 }}>{project.code}</Tag>
              <span style={{ fontFamily: T.body, fontSize: 12, color: '#b9c4d4', letterSpacing: '.04em' }}>{project.type} · {project.track}</span>
            </div>
            <h2 style={{ fontFamily: T.display, fontWeight: 700, fontSize: 28, margin: 0, lineHeight: 1.1, letterSpacing: '.01em', maxWidth: 560 }}>{project.title}</h2>
            <p style={{ fontFamily: T.body, fontSize: 14, color: '#cdd6e3', margin: '10px 0 0', maxWidth: 520, lineHeight: 1.5 }}>{project.pitch}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 18 }}>
              <AvatarStack names={project.members} size={32} />
              <div style={{ width: 1, height: 26, background: 'rgba(255,255,255,.18)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: T.body, fontSize: 13, color: '#cdd6e3' }}>
                <Icon name="user-check" size={15} color={T.orange} />{project.advisor}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12, minWidth: 200 }}>
            <HealthBadge value={project.health} />
            <div style={{ background: 'rgba(255,255,255,.08)', borderRadius: 14, padding: '16px 18px', minWidth: 190 }}>
              <div style={{ fontFamily: T.body, fontSize: 11, color: '#b9c4d4', letterSpacing: '.1em', textTransform: 'uppercase' }}>Current phase</div>
              <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: 20, marginTop: 3 }}>{curPhase.name}</div>
              <div style={{ fontFamily: T.body, fontSize: 12, color: '#cdd6e3', marginTop: 1 }}>Target {fmtShort(curPhase.due)}</div>
              <div style={{ marginTop: 12 }}>
                {tweaks.progressStyle === 'ring'
                  ? <div style={{ filter: 'invert(1) hue-rotate(180deg)' }}><Progress project={project} style="ring" /></div>
                  : <div style={{ '--p': 1 }}>
                      <ProgressBar pct={project.pct} h={8} color={T.orange} />
                      <div style={{ fontFamily: T.body, fontSize: 12, color: '#cdd6e3', marginTop: 6 }}>{project.pct}% of all milestones</div>
                    </div>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <StatTile icon="check-circle" label="Tasks complete" value={`${project.done}/${project.total}`} tone="success" />
        <StatTile icon="git-commit-horizontal" label="Phase" value={`${phaseIndex(project.current) + 1} / 7`} tone="navy" />
        <StatTile icon="alert-triangle" label="Overdue items" value={project.overdue} tone={project.overdue ? 'danger' : 'navy'} />
        <StatTile icon="clock" label="In review" value={project.submitted} tone="orange" />
      </div>

      {/* DAUST Impact countdown */}
      <ImpactCountdown />

      {/* Roadmap */}
      <Card pad={24}>
        <SectionTitle eyebrow="Year at a glance" title="Project Roadmap"
          right={<Button variant="ghost" size="sm" icon="arrow-right" onClick={() => onNav('roadmap')}>Full roadmap</Button>} />
        <div style={{ padding: '14px 8px 4px' }}>
          <RoadmapStepper project={project} />
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* Current phase tasks */}
        <Card pad={22}>
          <SectionTitle eyebrow={`${curPhase.name} phase`} title="What's next"
            right={<Button variant="ghost" size="sm" icon="arrow-right" onClick={() => onNav('tasks')}>All tasks</Button>} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {curTasks.length ? curTasks.map((t) => (
              <TaskRow key={t.id} task={t} onAction={onOpenTask} actionLabel={t.type === 'global' ? 'Submit' : 'Open'} />
            )) : <div style={{ fontFamily: T.body, fontSize: 13, color: T.fg3, padding: 12 }}>No open tasks in this phase.</div>}
          </div>
        </Card>

        {/* Right column: deadlines + feedback */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card pad={20}>
            <SectionTitle title="Upcoming deadlines" style={{ marginBottom: 12 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {upcoming.map((t, i) => {
                const days = window.DAUST_DATA.daysBetween(TODAY, t.due);
                const over = days < 0;
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                    borderTop: i ? `1px solid ${T.g100}` : 'none' }}>
                    <div style={{ width: 46, textAlign: 'center', flexShrink: 0 }}>
                      <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: 18, color: over ? T.danger : T.navy, lineHeight: 1 }}>{new Date(t.due).getDate()}</div>
                      <div style={{ fontFamily: T.body, fontSize: 10, color: T.fg3, textTransform: 'uppercase', letterSpacing: '.06em' }}>{new Date(t.due).toLocaleDateString('en-US', { month: 'short' })}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: T.body, fontWeight: 600, fontSize: 13, color: T.fg1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                      <div style={{ fontFamily: T.body, fontSize: 11.5, color: over ? T.danger : T.fg3, fontWeight: over ? 600 : 400 }}>
                        {over ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `in ${days} days`}</div>
                    </div>
                    {t.type === 'global' && <Tag tone="outline" style={{ fontSize: 10, padding: '2px 7px' }}>Required</Tag>}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card pad={20} style={{ background: T.g50, border: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Icon name="message-square-quote" size={16} color={T.orange} />
              <Eyebrow>Latest feedback</Eyebrow>
            </div>
            <div style={{ display: 'flex', gap: 11 }}>
              <Avatar name={feedback.who} size={34} />
              <div>
                <div style={{ fontFamily: T.body, fontWeight: 600, fontSize: 13, color: T.fg1 }}>{feedback.who} <span style={{ color: T.fg3, fontWeight: 400 }}>· {feedback.when}</span></div>
                <p style={{ fontFamily: T.body, fontSize: 13, color: T.fg2, lineHeight: 1.5, margin: '5px 0 0' }}>{feedback.text}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------- Student roadmap (phase-by-phase) ----------
function StudentRoadmap({ project, onOpenTask }) {
  const { PHASES, phaseIndex, fmtDate, TODAY } = window.DAUST_DATA;
  const cur = phaseIndex(project.current);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card pad={26}>
        <SectionTitle eyebrow="Academic year 2025–2026" title="Full Project Roadmap" />
        <div style={{ padding: '18px 8px 6px' }}><RoadmapStepper project={project} /></div>
      </Card>
      {PHASES.map((ph, i) => {
        const done = i < cur, current = i === cur;
        const phTasks = project.tasks.filter((t) => t.phase === ph.id);
        const phDone = phTasks.filter((t) => t.status === 'done' || t.status === 'approved').length;
        return (
          <Card key={ph.id} pad={0} style={{ overflow: 'hidden', opacity: i > cur ? 0.86 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 22px',
              background: current ? '#fff7ef' : done ? '#f4f8f5' : T.g50, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ width: 34, height: 34, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? T.navy : current ? T.orange : '#fff', color: '#fff',
                border: current || done ? 'none' : `2px solid ${T.g300}` }}>
                {done ? <Icon name="check" size={16} color="#fff" /> : <span style={{ fontFamily: T.display, fontWeight: 700, fontSize: 15, color: current ? '#fff' : T.fg3 }}>{i + 1}</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: T.display, fontWeight: 700, fontSize: 17, color: T.fg1 }}>{ph.name}</span>
                  {current && <Tag tone="orange" style={{ fontSize: 10.5 }}>Current</Tag>}
                  {done && <Tag tone="navy" style={{ fontSize: 10.5 }}>Complete</Tag>}
                </div>
                <div style={{ fontFamily: T.body, fontSize: 12.5, color: T.fg3, marginTop: 2 }}>{ph.short} · Target {fmtDate(ph.due)}</div>
              </div>
              <div style={{ fontFamily: T.body, fontSize: 13, color: T.fg2, fontWeight: 600 }}>{phDone}/{phTasks.length} done</div>
            </div>
            <div style={{ padding: '14px 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {phTasks.map((t) => <TaskRow key={t.id} task={t} onAction={onOpenTask} actionLabel={t.type === 'global' ? 'Submit' : 'Open'} />)}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ---------- Student tasks list ----------
function StudentTasks({ project, onOpenTask }) {
  const { PHASES } = window.DAUST_DATA;
  const [filter, setFilter] = React.useState('all');
  const filters = [['all', 'All tasks'], ['global', 'Required'], ['project', 'Project'], ['overdue', 'Overdue'], ['submitted', 'In review']];
  let tasks = project.tasks;
  if (filter === 'global' || filter === 'project') tasks = tasks.filter((t) => t.type === filter);
  else if (filter === 'overdue') tasks = tasks.filter((t) => t.status === 'overdue');
  else if (filter === 'submitted') tasks = tasks.filter((t) => t.status === 'submitted');
  tasks = [...tasks].sort((a, b) => new Date(a.due) - new Date(b.due));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card pad={20}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {filters.map(([id, label]) => {
            const active = filter === id;
            const count = id === 'all' ? project.tasks.length
              : id === 'global' || id === 'project' ? project.tasks.filter((t) => t.type === id).length
              : project.tasks.filter((t) => t.status === id).length;
            return (
              <button key={id} onClick={() => setFilter(id)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 999, cursor: 'pointer',
                  border: 'none', fontFamily: T.body, fontWeight: 600, fontSize: 13,
                  background: active ? T.navy : T.g50, color: active ? '#fff' : T.fg2,
                  boxShadow: active ? 'none' : `inset 0 0 0 1px ${T.border}` }}>
                {label}<span style={{ fontSize: 11, opacity: .8 }}>{count}</span>
              </button>
            );
          })}
        </div>
      </Card>
      <Card pad={20}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {tasks.map((t) => <TaskRow key={t.id + t.phase} task={t} onAction={onOpenTask} actionLabel={t.type === 'global' ? 'Submit' : 'Open'} />)}
        </div>
      </Card>
    </div>
  );
}

// ---------- Student team ----------
function StudentTeam({ project }) {
  const roles = ['Team Lead', 'Hardware', 'Software', 'Research', 'Design'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card pad={24}>
        <SectionTitle eyebrow={`${project.type} project`} title="My Team" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {project.members.map((m, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: 14, borderRadius: 12, border: `1px solid ${T.border}` }}>
              <Avatar name={m} size={46} />
              <div>
                <div style={{ fontFamily: T.body, fontWeight: 600, fontSize: 14, color: T.fg1 }}>{m}</div>
                <div style={{ fontFamily: T.body, fontSize: 12, color: T.fg3 }}>{i === 0 ? 'Team Lead' : roles[i % roles.length]}</div>
              </div>
              {i === 0 && <div style={{ marginLeft: 'auto' }}><Tag tone="orange" style={{ fontSize: 10 }}>Lead</Tag></div>}
            </div>
          ))}
        </div>
      </Card>
      <Card pad={24}>
        <SectionTitle title="Project details" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          {[['Program', project.program], ['Track', project.track], ['Advisor', project.advisor],
            ['Project code', project.code], ['Type', project.type + ' project'], ['Repository', project.repo]].map(([k, v]) => (
            <div key={k}>
              <div style={{ fontFamily: T.body, fontSize: 11, color: T.fg3, letterSpacing: '.08em', textTransform: 'uppercase' }}>{k}</div>
              <div style={{ fontFamily: T.body, fontWeight: 600, fontSize: 14, color: T.fg1, marginTop: 3 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${T.g100}` }}>
          <div style={{ fontFamily: T.body, fontSize: 11, color: T.fg3, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>Abstract</div>
          <p style={{ fontFamily: T.body, fontSize: 14, color: T.fg2, lineHeight: 1.6, margin: 0, maxWidth: 720 }}>{project.abstract}</p>
        </div>
      </Card>
    </div>
  );
}

Object.assign(window, { StudentDashboard, StudentRoadmap, StudentTasks, StudentTeam, StatTile });
