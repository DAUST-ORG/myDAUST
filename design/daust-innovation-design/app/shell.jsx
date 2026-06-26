/* DAUST Innovation Tracker — app shell: logo, sidebar, top bar, roadmap stepper, task row */

const { T } = window.DAUST_UI;

// ---------- DAUST Impact: the flagship annual event everything builds toward ----------
const IMPACT = {
  date: new Date('2026-07-18T09:00:00'),
  title: 'DAUST Impact 2026',
  tagline: 'Annual Innovation Expo & Demo Day',
  place: 'DAUST Campus · Somone',
};
function useCountdown(target) {
  const calc = () => {
    const diff = Math.max(0, target - new Date());
    return {
      d: Math.floor(diff / 86400000),
      h: Math.floor((diff % 86400000) / 3600000),
      m: Math.floor((diff % 3600000) / 60000),
      s: Math.floor((diff % 60000) / 1000),
      done: diff === 0, totalDays: Math.ceil(diff / 86400000),
    };
  };
  const [t, setT] = React.useState(calc);
  React.useEffect(() => { const id = setInterval(() => setT(calc()), 1000); return () => clearInterval(id); }, []);
  return t;
}

// ---------- Impact countdown band (used on both dashboards) ----------
function ImpactCountdown() {
  const c = useCountdown(IMPACT.date);
  const pad = (n) => String(n).padStart(2, '0');
  const blocks = [[String(c.d), 'Days', true], [pad(c.h), 'Hours'], [pad(c.m), 'Minutes'], [pad(c.s), 'Seconds']];
  const longDate = IMPACT.date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div style={{ background: `linear-gradient(110deg, ${T.navyDeep} 0%, ${T.navy} 55%, ${T.navy700} 120%)`,
      borderRadius: 16, padding: '22px 26px', color: '#fff', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,.06) 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
      <div style={{ position: 'absolute', top: -70, right: -40, width: 240, height: 240, borderRadius: 999,
        background: 'radial-gradient(circle, rgba(237,132,37,.32), transparent 68%)' }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 28, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 240 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
            <TriDash w={20} h={4} gap={5} />
            <span style={{ fontFamily: T.body, fontWeight: 700, fontSize: 11.5, letterSpacing: '.16em', textTransform: 'uppercase', color: T.orange }}>{c.done ? 'Happening now' : 'Counting down to'}</span>
          </div>
          <h2 style={{ fontFamily: T.display, fontWeight: 800, fontSize: 26, margin: 0, letterSpacing: '.01em', lineHeight: 1.05 }}>{IMPACT.title}</h2>
          <div style={{ fontFamily: T.body, fontSize: 13, color: '#cdd6e3', marginTop: 7, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="sparkles" size={14} color={T.orange} />{IMPACT.tagline}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="map-pin" size={14} color="#8FA0B8" />{IMPACT.place}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="calendar" size={14} color="#8FA0B8" />{longDate}</span>
          </div>
        </div>
        {c.done ? (
          <div style={{ fontFamily: T.display, fontWeight: 800, fontSize: 30, color: T.orange }}>The big day is here 🎉</div>
        ) : (
          <div style={{ display: 'flex', gap: 12 }}>
            {blocks.map(([v, l, accent]) => (
              <div key={l} style={{ textAlign: 'center' }}>
                <div style={{ minWidth: 66, padding: '12px 8px', borderRadius: 13, background: 'rgba(255,255,255,.09)',
                  border: '1px solid rgba(255,255,255,.13)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)' }}>
                  <div style={{ fontFamily: T.display, fontWeight: 800, fontSize: 36, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                    color: accent ? T.orange : '#fff' }}>{v}</div>
                </div>
                <div style={{ fontFamily: T.body, fontWeight: 600, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: '#9fb0c6', marginTop: 8 }}>{l}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Logo lockup ----------
function Logo({ on = 'navy', height = 30 }) {
  // on='navy' -> use white logo (for navy sidebar); on='light' -> navy logo
  const src = on === 'navy' ? 'assets/logo-daust-white.png' : 'assets/logo-daust-navy.png';
  return <img src={src} alt="DAUST" style={{ height, width: 'auto', display: 'block' }} />;
}

// ---------- Sidebar ----------
function Sidebar({ role, view, onNav }) {
  const studentNav = [
    { id: 'dashboard', label: 'My Project', icon: 'layout-dashboard' },
    { id: 'roadmap', label: 'Roadmap', icon: 'git-branch' },
    { id: 'tasks', label: 'Tasks & Deadlines', icon: 'list-checks' },
    { id: 'team', label: 'My Team', icon: 'users' },
  ];
  const adminNav = [
    { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
    { id: 'projects', label: 'All Projects', icon: 'folder-kanban' },
    { id: 'review', label: 'Review Queue', icon: 'inbox' },
    { id: 'global', label: 'Global Tasks', icon: 'calendar-clock' },
  ];
  const nav = role === 'student' ? studentNav : adminNav;
  const { d: impactDays } = useCountdown(IMPACT.date);
  return (
    <aside style={{ width: 248, flexShrink: 0, background: T.navy, color: '#fff',
      display: 'flex', flexDirection: 'column', height: '100vh', position: 'sticky', top: 0 }}>
      <div style={{ padding: '22px 22px 18px' }}>
        <Logo on="navy" height={26} />
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <TriDash w={18} h={3} gap={5} />
          <span style={{ fontFamily: T.body, fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: '#b9c4d4' }}>Innovation Tracker</span>
        </div>
      </div>
      <div style={{ height: 1, background: 'rgba(255,255,255,.1)', margin: '0 16px' }} />
      <nav style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
        {nav.map((n) => {
          const active = view === n.id;
          return (
            <button key={n.id} onClick={() => onNav(n.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 10,
                border: 'none', cursor: 'pointer', position: 'relative', textAlign: 'left',
                background: active ? 'rgba(255,255,255,.10)' : 'transparent',
                color: active ? '#fff' : '#b9c4d4', fontFamily: T.body, fontWeight: active ? 600 : 500, fontSize: 14,
                transition: 'background .15s, color .15s' }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,.05)'; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}>
              {active && <span style={{ position: 'absolute', left: 0, top: 9, bottom: 9, width: 3, borderRadius: 999, background: T.orange }} />}
              <Icon name={n.icon} size={18} color={active ? T.orange : '#8FA0B8'} />{n.label}
            </button>
          );
        })}
      </nav>
      <div style={{ padding: 16 }}>
        <div style={{ background: 'rgba(255,255,255,.06)', borderRadius: 12, padding: 14 }}>
          <div style={{ fontFamily: T.body, fontSize: 11, color: '#b9c4d4', letterSpacing: '.04em' }}>ACADEMIC YEAR</div>
          <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: 17, marginTop: 2 }}>2025 – 2026</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.1)' }}>
            <Icon name="zap" size={14} color={T.orange} />
            <span style={{ fontFamily: T.body, fontSize: 12, color: '#cdd6e3' }}>DAUST Impact in</span>
            <span style={{ fontFamily: T.display, fontWeight: 700, fontSize: 14, color: T.orange, marginLeft: 'auto' }}>{impactDays}d</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ---------- Top bar with role switch ----------
function TopBar({ role, onRole, title, subtitle, right }) {
  const { ME } = window.DAUST_DATA;
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '16px 32px',
      background: '#fff', borderBottom: `1px solid ${T.border}`, position: 'sticky', top: 0, zIndex: 20 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {subtitle && <div style={{ fontFamily: T.body, fontSize: 12, color: T.fg3, letterSpacing: '.04em', marginBottom: 2 }}>{subtitle}</div>}
        <h1 style={{ fontFamily: T.display, fontWeight: 700, fontSize: 22, color: T.fg1, margin: 0, letterSpacing: '.01em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
      </div>
      {right}
      {/* role switch */}
      <div style={{ display: 'flex', background: T.g50, borderRadius: 999, padding: 4, border: `1px solid ${T.border}` }}>
        {[['student', 'Student', 'graduation-cap'], ['admin', 'Admin', 'shield-check']].map(([id, label, icon]) => {
          const active = role === id;
          return (
            <button key={id} onClick={() => onRole(id)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 16px', borderRadius: 999, border: 'none',
                cursor: 'pointer', fontFamily: T.body, fontWeight: 600, fontSize: 13,
                background: active ? T.navy : 'transparent', color: active ? '#fff' : T.fg2,
                boxShadow: active ? '0 1px 3px rgba(15,44,80,.25)' : 'none', transition: 'all .15s' }}>
              <Icon name={icon} size={15} color={active ? T.orange : T.fg3} />{label}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 6 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: T.body, fontWeight: 600, fontSize: 13, color: T.fg1 }}>{role === 'student' ? ME : 'Review Office'}</div>
          <div style={{ fontFamily: T.body, fontSize: 11, color: T.fg3 }}>{role === 'student' ? 'Computer Engineering' : 'Innovation Program'}</div>
        </div>
        <Avatar name={role === 'student' ? ME : 'Review Office'} size={38} />
      </div>
    </header>
  );
}

// ---------- Big horizontal roadmap stepper ----------
function RoadmapStepper({ project, compact }) {
  const { PHASES, phaseIndex, fmtShort, TODAY } = window.DAUST_DATA;
  const cur = phaseIndex(project.current);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>
      {PHASES.map((ph, i) => {
        const done = i < cur, current = i === cur;
        const overdueDue = new Date(ph.due) < TODAY && !done && current && project.health !== 'on-track';
        const dotBg = done ? T.navy : current ? '#fff' : '#fff';
        const dotBorder = done ? T.navy : current ? T.orange : T.g300;
        return (
          <div key={ph.id} style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* connector */}
            {i < PHASES.length - 1 && (
              <div style={{ position: 'absolute', top: 13, left: '50%', right: `-50%`, height: 3,
                background: i < cur ? T.navy : T.g200, zIndex: 0 }} />
            )}
            <div style={{ width: 28, height: 28, borderRadius: 999, background: dotBg,
              border: `3px solid ${dotBorder}`, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: current ? `0 0 0 5px ${T.orange}22` : 'none' }}>
              {done ? <Icon name="check" size={14} color="#fff" />
                : current ? <span style={{ width: 9, height: 9, borderRadius: 999, background: T.orange }} />
                : <span style={{ width: 8, height: 8, borderRadius: 999, background: T.g300 }} />}
            </div>
            <div style={{ marginTop: 9, textAlign: 'center', padding: '0 4px' }}>
              <div style={{ fontFamily: T.body, fontWeight: current ? 700 : 600, fontSize: 12.5,
                color: done ? T.navy : current ? T.fg1 : T.fg3 }}>{ph.name}</div>
              {!compact && <div style={{ fontFamily: T.body, fontSize: 10.5, color: overdueDue ? T.danger : T.fg3, marginTop: 2 }}>
                {fmtShort(ph.due)}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Task row (used in lists) ----------
function TaskRow({ task, onAction, actionLabel, showProject }) {
  const { fmtShort, TODAY } = window.DAUST_DATA;
  const overdue = task.status === 'overdue';
  const done = task.status === 'done' || task.status === 'approved';
  const kindIcon = { Document: 'file-text', Video: 'video', Demo: 'monitor-play', Review: 'clipboard-check',
    Poster: 'image', Event: 'calendar', Handover: 'package', Task: 'circle-dot' }[task.kind] || 'circle-dot';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderRadius: 10,
      background: '#fff', border: `1px solid ${T.border}`, transition: 'border .15s' }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: done ? '#e7f2ec' : overdue ? '#fbe9e7' : T.g50, color: done ? T.success : overdue ? T.danger : T.navy }}>
        <Icon name={done ? 'check' : kindIcon} size={17} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: T.body, fontWeight: 600, fontSize: 14, color: T.fg1 }}>{task.title}</span>
          {task.type === 'global' && <Tag tone="outline" style={{ fontSize: 10.5, padding: '2px 8px' }}>Required</Tag>}
        </div>
        <div style={{ fontFamily: T.body, fontSize: 12, color: T.fg3, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="calendar" size={12} /><span style={{ color: overdue ? T.danger : T.fg3, fontWeight: overdue ? 600 : 400 }}>Due {fmtShort(task.due)}</span>
          <span>·</span><span>{task.kind}</span>
        </div>
      </div>
      <StatusPill status={task.status} size="sm" />
      {onAction && <Button variant="subtle" size="sm" onClick={() => onAction(task)}>{actionLabel || 'Open'}</Button>}
    </div>
  );
}

// section header with eyebrow
function SectionTitle({ eyebrow, title, right, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 14, ...style }}>
      <div>
        {eyebrow && <Eyebrow style={{ marginBottom: 5 }}>{eyebrow}</Eyebrow>}
        <h2 style={{ fontFamily: T.display, fontWeight: 700, fontSize: 19, color: T.fg1, margin: 0 }}>{title}</h2>
      </div>
      {right}
    </div>
  );
}

Object.assign(window, { Logo, Sidebar, TopBar, RoadmapStepper, TaskRow, SectionTitle, ImpactCountdown, IMPACT, useCountdown });
