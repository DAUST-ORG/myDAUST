// ============================================================
// DAUST Admin — Finance › Budget & Financial Aid
// ============================================================
(function () {

  // ---------- BUDGET ----------
  function Budget({ goFin }) {
    const B = window.BUDGET;
    const allocated = B.reduce((a, b) => a + b.allocated, 0);
    const spent = B.reduce((a, b) => a + b.spent, 0);
    const pct = Math.round(spent / allocated * 100);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.7fr)', gap: 20, alignItems: 'start' }}>
          <Panel title="FY 2025–26 budget">
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <Donut size={150} thickness={20} centerLabel={pct + '%'} centerSub="utilised" segments={[{ value: spent, color: 'var(--accent)' }, { value: allocated - spent, color: 'var(--slate-200)' }]} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div><div style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>Allocated</div><div style={{ fontSize: 18, fontWeight: 800 }}><FCFA value={allocated} short /></div></div>
                <div><div style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>Spent</div><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)' }}><FCFA value={spent} short /></div></div>
                <div><div style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>Remaining</div><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--success-500)' }}><FCFA value={allocated - spent} short /></div></div>
              </div>
            </div>
          </Panel>
          <Panel title="By category" action={<Button variant="outline" size="sm" icon="sliders-horizontal">Adjust allocations</Button>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {B.map(b => {
                const p = Math.round(b.spent / b.allocated * 100);
                const over = p > 92;
                return (
                  <div key={b.category}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, color: 'var(--fg)' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: b.color }} />{b.category}</span>
                      <span style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}><b style={{ color: 'var(--fg)' }}><FCFA value={b.spent} short /></b> / <FCFA value={b.allocated} short /> · <span style={{ color: over ? 'var(--error-500)' : 'var(--success-500)', fontWeight: 600 }}>{p}%</span></span>
                    </div>
                    <Progress value={b.spent} max={b.allocated} tone={over ? 'error' : 'teal'} height={9} />
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>

        <Panel title="Variance — budget vs. actual">
          <table className="dt" style={{ margin: '-4px 0' }}>
            <thead><tr><th>Category</th><th>Allocated</th><th>Spent</th><th>Remaining</th><th>Utilisation</th><th>Variance</th></tr></thead>
            <tbody>
              {B.map(b => {
                const rem = b.allocated - b.spent;
                const p = Math.round(b.spent / b.allocated * 100);
                return (
                  <tr key={b.category}>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: b.color }} />{b.category}</span></td>
                    <td><FCFA value={b.allocated} /></td>
                    <td><FCFA value={b.spent} /></td>
                    <td style={{ color: rem < b.allocated * 0.08 ? 'var(--error-500)' : 'var(--fg)', fontWeight: 600 }}><FCFA value={rem} /></td>
                    <td style={{ width: 130 }}><Progress value={b.spent} max={b.allocated} tone={p > 92 ? 'error' : 'teal'} height={6} /></td>
                    <td><Badge tone={p > 92 ? 'error' : p > 80 ? 'warning' : 'success'} dot={false} size="sm">{p > 92 ? 'At risk' : p > 80 ? 'Watch' : 'On budget'}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>
    );
  }

  // ---------- FINANCIAL AID ----------
  function FinancialAid({ goFin }) {
    const SCH = window.SCHOLARSHIPS;
    const totalAid = SCH.reduce((a, s) => a + s.total, 0);
    const recipients = SCH.reduce((a, s) => a + s.recipients, 0);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px,1fr))', gap: 16 }}>
          <window.Stat label="Total aid awarded" value={<FCFA value={totalAid} short />} delta="this year" deltaTone="flat" icon="gift" />
          <window.Stat label="Students supported" value={recipients} delta={Math.round(recipients / window.TOTAL_STUDENTS * 100) + '% of body'} deltaTone="up" icon="users" />
          <window.Stat label="Programs" value={SCH.length} delta="active funds" deltaTone="flat" icon="award" />
          <window.Stat label="Avg. award" value={fmtFCFA(totalAid / recipients, { short: true }) + ' FCFA'} delta="per student" deltaTone="flat" icon="banknote" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
          <Panel title="Scholarship & waiver programs" action={<Button variant="primary" size="sm" icon="plus">New fund</Button>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {SCH.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
                  <span style={{ width: 42, height: 42, borderRadius: 'var(--radius-md)', background: `color-mix(in srgb, ${s.color} 14%, var(--surface))`, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="award" size={20} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--fg)' }}>{s.name}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}><Badge tone="neutral" dot={false} size="sm">{s.type}</Badge> &nbsp;{s.coverage} · {s.recipients} recipients</div>
                  </div>
                  <div style={{ textAlign: 'right' }}><div style={{ fontSize: 15, fontWeight: 800, color: 'var(--fg)' }}><FCFA value={s.total} short /></div><div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{fmtFCFA(s.perAward, { short: true })} / award</div></div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Disbursement schedule">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {window.AID_DISBURSEMENTS.map(d => {
                const p = Math.round(d.disbursed / d.budgeted * 100);
                return (
                  <div key={d.term}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg)' }}>{d.term}</span>
                      <FinStatus status={d.status} />
                    </div>
                    <Progress value={d.disbursed} max={d.budgeted} tone={d.status === 'Closed' ? 'success' : 'teal'} height={8} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11.5, color: 'var(--fg-subtle)' }}>
                      <span><FCFA value={d.disbursed} short /> disbursed</span><span>of <FCFA value={d.budgeted} short /></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  Object.assign(window, { Budget, FinancialAid });
})();
