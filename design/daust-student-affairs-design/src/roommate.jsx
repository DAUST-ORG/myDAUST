// ============================================================
// DAUST Student Affairs — Roommate Matching + Intl Support
// ============================================================

function ScoreRing({ score, size = 64 }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - score / 100);
  const color = score >= 90 ? C.teal700 : score >= 80 ? C.teal500 : C.warning;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.s100} strokeWidth={5} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.16,1,0.3,1)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: size * 0.30, fontWeight: 700, color: C.s900, letterSpacing: '-0.02em' }}>{score}</span>
        <span style={{ fontSize: 9, color: C.s400, fontWeight: 600, marginTop: -2 }}>FIT</span>
      </div>
    </div>
  );
}

function Chip({ children, tone = 'neutral' }) {
  const map = { good: { bg: C.teal50, fg: C.teal700 }, diff: { bg: 'rgba(245,158,11,0.12)', fg: C.warningFg }, neutral: { bg: C.s100, fg: C.s700 } }[tone];
  return <span style={{ background: map.bg, color: map.fg, fontSize: 11.5, fontWeight: 500, padding: '4px 10px', borderRadius: 999 }}>{children}</span>;
}

function Roommate() {
  const [confirmed, setConfirmed] = useState(null);
  const s = MATCH_SUBJECT;
  return (
    <div>
      <PageHeader
        eyebrow="Residential Life"
        title="Roommate Matching"
        desc="Compatibility scoring across sleep schedule, tidiness, social energy, study habits, and shared interests. The optimizer pairs new residents with the strongest lifestyle overlap."
        actions={<Button variant="soft" icon="sliders-horizontal">Matching weights</Button>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.6fr', gap: 20 }}>
        {/* subject card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <Avatar name={s.name} size={52} ring />
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.s900, display: 'flex', alignItems: 'center', gap: 7 }}>{s.name}{s.intl && <Icon name="globe" size={14} color={C.infoFg} />}</div>
                <div style={{ fontSize: 12, color: C.s500, fontFamily: 'IBM Plex Mono, monospace' }}>{s.sid} · {s.year} · {s.origin}</div>
              </div>
            </div>
            <Eyebrow style={{ marginBottom: 12 }}>Stated preferences</Eyebrow>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {Object.entries(s.prefs).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12.5, color: C.s500, textTransform: 'capitalize' }}>{k === 'tidy' ? 'Tidiness' : k === 'smoke' ? 'Smoking' : k}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: C.s900 }}>{v}</span>
                </div>
              ))}
            </div>
          </Card>

          <AIPanel title="AI Matching" busy={false}>
            <div style={{ fontSize: 13, color: C.s700, lineHeight: 1.55 }}>
              Scored against <strong style={{ color: C.s900 }}>38 women in Gorée Hall</strong> with an open bed. Best match shares 3 of 5 core preferences.
            </div>
          </AIPanel>
        </div>

        {/* ranked matches */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Ranked candidates</h3>
            <span style={{ fontSize: 12, color: C.s400 }}>3 of 38 shown</span>
          </div>
          {MATCHES.map((m, i) => (
            <Card key={m.sid} hover>
              <div style={{ display: 'flex', gap: 18 }}>
                <ScoreRing score={m.score} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
                    {i === 0 && <Badge tone="accent" dot={false}>Recommended</Badge>}
                    <span style={{ fontSize: 15, fontWeight: 700, color: C.s900 }}>{m.name}</span>
                    <span style={{ fontSize: 12, color: C.s500 }}>{m.hall} · {m.room}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: C.s500, marginBottom: 11 }}>{m.note}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {m.shared.map(x => <Chip key={x} tone="good">✓ {x}</Chip>)}
                    {m.diff.map(x => <Chip key={x} tone="diff">Δ {x}</Chip>)}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
                  <Button variant={confirmed === i ? 'secondary' : 'primary'} size="sm" icon={confirmed === i ? 'check' : 'user-plus'}
                    onClick={() => setConfirmed(i)}>{confirmed === i ? 'Paired' : 'Pair'}</Button>
                  <Button variant="ghost" size="sm">Details</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- International Student Support ----------
function Intl() {
  const visaTone = { 'Valid': 'success', 'Pending': 'warning', 'Action needed': 'error' };
  return (
    <div>
      <PageHeader
        eyebrow="Residential Life"
        title="International Student Support"
        desc="Arrival readiness, visa status, and onboarding tasks for incoming international students. Flagged items feed the housing triage queue automatically."
        actions={<Button variant="primary" icon="user-plus">Add arrival</Button>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 22 }}>
        <StatTile label="Incoming this term" value="24" sub="6 arriving this week" tone="info" />
        <StatTile label="Visa action needed" value="2" sub="permit deadlines" tone="error" />
        <StatTile label="Awaiting housing letter" value="3" sub="blocks residency" tone="warning" />
        <StatTile label="Buddy matched" value="71%" sub="17 of 24" tone="accent" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {INTL.map(p => {
          const total = p.tasks.length;
          return (
            <Card key={p.name} hover>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Avatar name={p.name} size={44} />
                <div style={{ width: 200 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.s900 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: C.s500 }}>{p.origin} · {p.kind}</div>
                </div>
                <div style={{ width: 150 }}>
                  <div style={{ fontSize: 11, color: C.s400, marginBottom: 3 }}>Visa</div>
                  <Badge tone={visaTone[p.visa]} dot={false}>{p.visa}</Badge>
                </div>
                <div style={{ width: 110 }}>
                  <div style={{ fontSize: 11, color: C.s400, marginBottom: 3 }}>Arrival</div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.s900 }}>{p.arrival}</span>
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: C.s400 }}>Onboarding</span>
                    <span style={{ fontSize: 11, color: C.s500, fontWeight: 600 }}>{p.done}/{total}</span>
                  </div>
                  <Meter value={p.done} max={total} color={p.done === total ? C.successFg : C.teal700} height={6} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                    {p.tasks.map((t, i) => (
                      <span key={t} style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 999, fontWeight: 500,
                        background: i < p.done ? C.teal50 : C.s100, color: i < p.done ? C.teal700 : C.s500,
                        textDecoration: i < p.done ? 'none' : 'none' }}>
                        {i < p.done ? '✓ ' : ''}{t}
                      </span>
                    ))}
                  </div>
                </div>
                <Button variant="soft" size="sm" iconRight="arrow-right">Open</Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { Roommate, Intl, ScoreRing });
