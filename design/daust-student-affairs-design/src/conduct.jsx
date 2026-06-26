// ============================================================
// DAUST Student Affairs — Conduct & Disputes
// ============================================================

function Conduct() {
  const [sel, setSel] = useState(CASES[0]);
  const sevTone = { high: 'error', med: 'warning', low: 'neutral' };
  const stages = ['Intake', 'Investigation', 'Mediation', 'Hearing', 'Resolved'];
  const stageColor = { Intake: C.s400, Investigation: C.warning, Mediation: C.info, Hearing: C.error, Resolved: C.successFg };

  return (
    <div>
      <PageHeader
        eyebrow="Student Conduct"
        title="Conduct & Disputes"
        desc="Disciplinary cases, interpersonal conflicts, and policy breaches — tracked from intake to resolution. The optimizer suggests routing and surfaces precedent from resolved cases."
        actions={<>
          <Button variant="soft" icon="filter">Filter</Button>
          <Button variant="primary" icon="plus">Open case</Button>
        </>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 22 }}>
        <StatTile label="Open cases" value="14" sub="3 awaiting hearing" tone="error" />
        <StatTile label="Avg. resolution" value="9.4" unit="days" sub="−1.8 vs last term" tone="accent" />
        <StatTile label="Within SLA" value="86%" sub="2 at risk" tone="warning" />
        <StatTile label="Resolved this term" value="41" sub="92% upheld" tone="success" />
      </div>

      {/* pipeline counts */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {stages.map(st => {
          const n = CASES.filter(c => c.stage === st).length;
          return (
            <div key={st} style={{ flex: 1, minWidth: 130, background: '#fff', border: `1px solid ${C.s200}`, borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: stageColor[st] }} />
                <span style={{ fontSize: 12, color: C.s500, fontWeight: 500 }}>{st}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.s900, marginTop: 6, letterSpacing: '-0.02em' }}>{n}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
        {/* case list */}
        <Card padding={0}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.s200}`, fontSize: 13, fontWeight: 600, color: C.s700 }}>Active caseload</div>
          {CASES.map((c, i) => {
            const active = sel.id === c.id;
            return (
              <div key={c.id} onClick={() => setSel(c)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', cursor: 'pointer',
                  background: active ? C.teal50 : 'transparent', borderLeft: `3px solid ${active ? C.teal700 : 'transparent'}`,
                  borderBottom: i < CASES.length - 1 ? `1px solid ${C.s100}` : 'none', transition: 'all 140ms' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.sev === 'high' ? C.error : c.sev === 'med' ? C.warning : C.s300, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: C.s900 }}>{c.type}</div>
                  <div style={{ fontSize: 11.5, color: C.s500, marginTop: 2 }}>{c.student} · <span style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{c.id}</span></div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Badge tone={c.stage === 'Resolved' ? 'success' : c.stage === 'Hearing' ? 'error' : c.stage === 'Investigation' ? 'warning' : 'neutral'} dot={false}>{c.stage}</Badge>
                  <div style={{ fontSize: 10.5, color: c.sla.includes('left') || c.sla === 'New' ? C.warningFg : C.s400, marginTop: 5 }}>{c.sla}</div>
                </div>
              </div>
            );
          })}
        </Card>

        {/* case detail + AI */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 11, color: C.s400, fontFamily: 'IBM Plex Mono, monospace' }}>{sel.id}</div>
                <h3 style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>{sel.type}</h3>
              </div>
              <Badge tone={sevTone[sel.sev]} dot={false}>{sel.sev === 'high' ? 'High severity' : sel.sev === 'med' ? 'Medium' : 'Low'}</Badge>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, margin: '18px 0' }}>
              {[['Subject', sel.student], ['Officer', sel.officer], ['Opened', sel.opened], ['Stage', sel.stage]].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 11, color: C.s400 }}>{k}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.s900, marginTop: 3 }}>{v}</div>
                </div>
              ))}
            </div>
            {/* progress through stages */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 6 }}>
              {stages.map((st, i) => {
                const idx = stages.indexOf(sel.stage);
                const done = i <= idx;
                return (
                  <React.Fragment key={st}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 14, height: 14, borderRadius: '50%', background: done ? C.teal700 : C.s200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {done && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />}
                      </span>
                      <span style={{ fontSize: 9, color: done ? C.teal700 : C.s400, fontWeight: 600, whiteSpace: 'nowrap' }}>{st}</span>
                    </div>
                    {i < stages.length - 1 && <div style={{ flex: 1, height: 2, background: i < idx ? C.teal700 : C.s200, marginBottom: 16 }} />}
                  </React.Fragment>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <Button variant="primary" size="sm" icon="arrow-right" style={{ flex: 1 }}>Advance stage</Button>
              <Button variant="soft" size="sm" icon="message-square">Add note</Button>
            </div>
          </Card>

          <AIPanel title="AI Case Assist" action="Apply suggested routing" onAction={() => {}}>
            <div style={{ fontSize: 13, color: C.s700, lineHeight: 1.55, marginBottom: 12 }}>
              {sel.officer === 'Unassigned'
                ? <>Recommend routing to <strong style={{ color: C.s900 }}>A. Ndour</strong> — current mediation load is lowest and matches case type.</>
                : <>Routed to <strong style={{ color: C.s900 }}>{sel.officer}</strong>. SLA {sel.sla.toLowerCase()}.</>}
            </div>
            <div style={{ background: '#fff', border: `1px solid ${C.teal100}`, borderRadius: 9, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.teal700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Precedent · 3 similar resolved</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {['CD-2025-118 · written warning + workshop', 'CD-2025-204 · mediation, no sanction', 'CD-2026-019 · probation 1 term'].map(p => (
                  <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.s700 }}>
                    <Icon name="file-text" size={13} color={C.s400} />{p}
                  </div>
                ))}
              </div>
            </div>
          </AIPanel>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Conduct });
