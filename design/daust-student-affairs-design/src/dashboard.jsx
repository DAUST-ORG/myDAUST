// ============================================================
// DAUST Student Affairs — Dashboard (command center)
// ============================================================

function KpiCard({ k, onClick }) {
  const toneFg = { accent: C.teal700, warning: C.warningFg, error: C.errorFg, info: C.infoFg }[k.tone] || C.s900;
  const trendUp = k.trend === 'up';
  const trendColor = k.tone === 'error' ? (trendUp ? C.errorFg : C.successFg)
    : k.tone === 'warning' ? (trendUp ? C.warningFg : C.successFg)
    : (trendUp ? C.successFg : C.s500);
  return (
    <Card hover onClick={onClick} padding={18}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12.5, color: C.s500, fontWeight: 500 }}>{k.label}</div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: trendColor }}>
          <Icon name={trendUp ? 'trending-up' : 'trending-down'} size={13} />{k.delta}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 10 }}>
        <span style={{ fontFamily: C.display, fontSize: 34, fontWeight: 700, letterSpacing: '0.01em', color: toneFg }}>{k.value}</span>
        {k.unit && <span style={{ fontSize: 16, color: C.s400, fontWeight: 600 }}>{k.unit}</span>}
      </div>
      <div style={{ fontSize: 11.5, color: C.s500, marginTop: 6 }}>{k.sub}</div>
    </Card>
  );
}

function Dashboard({ setView }) {
  const totalBeds = HALLS.reduce((a, h) => a + h.beds, 0);
  const filled = HALLS.reduce((a, h) => a + h.filled, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Spring 2026 · Command center"
        title="Good afternoon, Dr. Faye"
        desc="Everything across residential life, student conduct, and engagement — in one view. 3 items need your attention today."
        actions={<>
          <Button variant="soft" icon="download" size="md">Export brief</Button>
          <Button variant="primary" icon="zap" size="md" onClick={() => setView('housing')}>Run AI triage</Button>
        </>}
      />

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        {KPIS.map(k => <KpiCard key={k.id} k={k} onClick={() => setView(k.id === 'occupancy' || k.id === 'pending' ? 'housing' : k.id === 'cases' ? 'conduct' : 'budget')} />)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20 }}>
        {/* LEFT column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Residence occupancy */}
          <Card padding={0}>
            <div style={{ padding: '18px 20px', borderBottom: `1px solid ${C.s100}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Residence occupancy</h3>
                <div style={{ fontSize: 12, color: C.s500, marginTop: 3 }}>{filled.toLocaleString()} of {totalBeds.toLocaleString()} beds across 5 halls</div>
              </div>
              <Button variant="ghost" size="sm" iconRight="arrow-right" onClick={() => setView('housing')}>Manage</Button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {HALLS.map(h => {
                const pct = Math.round((h.filled / h.beds) * 100);
                return (
                  <div key={h.id}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: h.color }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.s900 }}>{h.name}</span>
                        <span style={{ fontSize: 11, color: C.s400 }}>{h.kind}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {h.flags > 0 && <Badge tone="warning" dot={false}>{`${h.flags} flag${h.flags > 1 ? 's' : ''}`}</Badge>}
                        <span style={{ fontSize: 12, color: C.s500, fontFamily: 'IBM Plex Mono, monospace', minWidth: 76, textAlign: 'right' }}>{h.filled}/{h.beds} · {pct}%</span>
                      </div>
                    </div>
                    <Meter value={h.filled} max={h.beds} color={pct >= 97 ? C.warningFg : h.color} />
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Engagement: upcoming events strip */}
          <Card padding={0}>
            <div style={{ padding: '18px 20px', borderBottom: `1px solid ${C.s100}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Upcoming programs</h3>
              <Button variant="ghost" size="sm" iconRight="arrow-right" onClick={() => setView('events')}>All events</Button>
            </div>
            <div>
              {EVENTS.filter(e => e.status !== 'past').slice(0, 4).map((e, i, arr) => (
                <div key={e.name} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < arr.length - 1 ? `1px solid ${C.s100}` : 'none' }}>
                  <div style={{ width: 46, textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, color: C.teal700, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{e.date.split(' ')[0]}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.s900, letterSpacing: '-0.02em' }}>{e.date.replace(/[^0-9–]/g, '').split('–')[0]}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: C.s900 }}>{e.name}</div>
                    <div style={{ fontSize: 12, color: C.s500, marginTop: 2 }}>{e.venue} · {e.org}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Badge tone={e.status === 'upcoming' ? 'accent' : 'info'} dot={false}>{e.tag}</Badge>
                    <div style={{ fontSize: 11, color: C.s400, marginTop: 5 }}>{e.attendees} expected</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* RIGHT column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* AI triage panel */}
          <AIPanel title="AI Housing Triage" action="Open triage queue" onAction={() => setView('housing')}>
            <div style={{ fontSize: 13.5, color: C.s700, lineHeight: 1.55 }}>
              <strong style={{ color: C.s900 }}>3 placements need action before arrivals week.</strong> Two international first-years are unassigned with deadlines inside 72 hours.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
              {FLAGS.filter(f => f.sev === 'high').map(f => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 9, padding: '9px 11px', border: `1px solid ${C.teal100}` }}>
                  <Icon name="alert-triangle" size={15} color={C.errorFg} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: C.s900 }}>{f.student}</div>
                    <div style={{ fontSize: 11, color: C.s500 }}>{f.kind}</div>
                  </div>
                </div>
              ))}
            </div>
          </AIPanel>

          {/* Conduct snapshot */}
          <Card padding={0}>
            <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.s100}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Conduct queue</h3>
              <Button variant="ghost" size="sm" iconRight="arrow-right" onClick={() => setView('conduct')}>Open</Button>
            </div>
            <div>
              {CASES.filter(c => c.stage !== 'Resolved').slice(0, 4).map((c, i, arr) => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: i < arr.length - 1 ? `1px solid ${C.s100}` : 'none' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.sev === 'high' ? C.error : c.sev === 'med' ? C.warning : C.s300, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: C.s900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.type}</div>
                    <div style={{ fontSize: 11, color: C.s400, fontFamily: 'IBM Plex Mono, monospace' }}>{c.id}</div>
                  </div>
                  <Badge tone={c.stage === 'Hearing' ? 'error' : c.stage === 'Investigation' ? 'warning' : 'neutral'} dot={false}>{c.stage}</Badge>
                </div>
              ))}
            </div>
          </Card>

          {/* Budget snapshot */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Co-curricular budget</h3>
              <span style={{ fontSize: 11, color: C.s400 }}>millions CFA</span>
            </div>
            {(() => {
              const alloc = BUDGET.reduce((a, b) => a + b.allocated, 0);
              const spent = BUDGET.reduce((a, b) => a + b.spent, 0);
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontFamily: C.display, fontSize: 27, fontWeight: 700, letterSpacing: '0.01em', color: C.s900 }}>FCFA {spent.toFixed(1)}M</span>
                    <span style={{ fontSize: 13, color: C.s500 }}>of FCFA {alloc.toFixed(1)}M allocated</span>
                  </div>
                  <Meter value={spent} max={alloc} color={C.teal700} height={10} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: 14 }}>
                    {BUDGET.map(b => (
                      <div key={b.line} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: b.color }} />
                        <span style={{ fontSize: 11.5, color: C.s500 }}>{b.line}</span>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </Card>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard });
