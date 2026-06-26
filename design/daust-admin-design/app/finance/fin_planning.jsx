// ============================================================
// DAUST Admin — Finance › Budget extras + Planning
// Budget versions · Encumbrances · Forecast · Scenarios
// (Allocations + variance live in fin_budget_aid.jsx as Budget())
// ============================================================
(function () {
  const { useState } = React;

  // ---- Budget versions ----
  function BudgetVersions({ goFin }) {
    const V = window.BUDGET_VERSIONS;
    const tone = { Active: 'success', Superseded: 'neutral', Draft: 'warning' };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <window.Panel title="Budget versions & revisions" action={<window.Button variant="primary" size="sm" icon="copy">New revision</window.Button>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {V.map((v, i) => (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 6px', borderBottom: i < V.length - 1 ? '1px solid var(--divider)' : 'none' }}>
                <span style={{ width: 38, height: 38, borderRadius: '50%', background: v.status === 'Active' ? 'var(--accent)' : 'var(--bg-subtle)', color: v.status === 'Active' ? '#fff' : 'var(--fg-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontFamily: 'var(--font-display)', flexShrink: 0 }}>{v.id.toUpperCase()}</span>
                <div style={{ flex: 1 }}><div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--fg)' }}>{v.name}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{v.date} · {v.author}</div></div>
                <div style={{ textAlign: 'right' }}><div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--fg)' }}><window.FCFA value={v.total} short /></div></div>
                <div style={{ width: 110, display: 'flex', justifyContent: 'flex-end' }}><window.Badge tone={tone[v.status]} size="sm">{v.status}</window.Badge></div>
                <window.Button variant="ghost" size="sm" icon="eye">View</window.Button>
              </div>
            ))}
          </div>
        </window.Panel>
        <window.Panel title="Revision history — what changed">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[['Q3 revision', '+160M FCFA', 'Added Petroleum research cost-share; raised facilities for generator overhaul', 'up'], ['Mid-year revision', '+180M FCFA', 'Enrollment up 6% → tuition revenue revised; financial aid pool increased', 'up'], ['Original approved', '5.24B FCFA', 'Board-approved FY26 operating budget', 'flat']].map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{ marginTop: 2, width: 30, height: 30, borderRadius: '50%', background: 'var(--bg-tint)', color: r[3] === 'up' ? 'var(--success-500)' : 'var(--fg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><window.Icon name={r[3] === 'up' ? 'trending-up' : 'flag'} size={15} /></span>
                <div style={{ flex: 1 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>{r[0]}</span><b style={{ color: r[3] === 'up' ? 'var(--success-500)' : 'var(--fg)' }}>{r[1]}</b></div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginTop: 2 }}>{r[2]}</div></div>
              </div>
            ))}
          </div>
        </window.Panel>
      </div>
    );
  }

  // ---- Encumbrances ----
  function Encumbrances({ goFin }) {
    const E = window.ENCUMBRANCES;
    const total = E.reduce((a, e) => a + e.amount, 0);
    const committed = E.filter(e => e.status === 'Committed').reduce((a, e) => a + e.amount, 0);
    const tone = { Committed: 'info', Pending: 'warning', Released: 'neutral' };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="Total encumbered" value={<window.FCFA value={total} short />} sub={E.length + ' commitments'} tone="accent" icon="bookmark" />
          <window.Metric label="Committed (PO-backed)" value={<window.FCFA value={committed} short />} sub="firm obligations" icon="lock" />
          <window.Metric label="Pending" value={<window.FCFA value={total - committed} short />} sub="awaiting PO" tone="down" icon="clock" />
        </div>
        <window.Panel title="Open encumbrances" action={<window.Button variant="outline" size="sm" icon="info">How encumbrances work</window.Button>}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Reference</th><th>Description</th><th>Budget category</th><th>Source</th><th style={{ textAlign: 'right' }}>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {E.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{e.id}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{e.desc}</td>
                    <td><window.Badge tone="neutral" dot={false} size="sm">{e.category}</window.Badge></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-subtle)' }}>{e.po}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={e.amount} /></td>
                    <td><window.Badge tone={tone[e.status]} size="sm">{e.status}</window.Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', padding: '11px 14px', fontSize: 12.5, color: 'var(--fg-muted)' }}>
            <window.Icon name="info" size={15} style={{ color: 'var(--accent)' }} />Encumbrances reserve budget against open POs/contracts so funds can't be double-spent. Available budget = allocated − actual − encumbered.
          </div>
        </window.Panel>
      </div>
    );
  }

  // ---- Forecast ----
  function Forecast({ goFin }) {
    const F = window.FORECAST;
    const surplus = F.revenue.map((r, i) => r - F.expense[i]);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="FY29 revenue (proj.)" value={<window.FCFA value={F.revenue[5]} short />} sub="+37% vs FY26" tone="up" icon="trending-up" />
          <window.Metric label="FY29 surplus (proj.)" value={<window.FCFA value={surplus[5]} short />} sub="operating" tone="up" icon="circle-dollar-sign" />
          <window.Metric label="Enrollment FY29" value={F.enrollment[5].toLocaleString()} sub="+35% vs FY26" tone="up" icon="users" />
          <window.Metric label="Avg. revenue / student" value={window.fmtFCFA(Math.round(F.revenue[5] / F.enrollment[5]), { short: true }) + ' FCFA'} sub="FY29 projected" icon="user" />
        </div>
        <window.Panel title="6-year financial projection" action={<window.Segmented size="sm" options={['Rev/Exp', 'Surplus', 'Enrollment']} value="Rev/Exp" onChange={() => {}} />}>
          <div style={{ display: 'flex', gap: 22, marginBottom: 10 }}>
            <Leg color="var(--accent)" label="Revenue" />
            <Leg color="var(--daust-steel)" label="Expense" dashed />
          </div>
          <window.AreaChart labels={window.FORECAST_YEARS} series={[{ name: 'Revenue', data: F.revenue }, { name: 'Expense', data: F.expense, dashed: true }]} colors={['var(--accent)', 'var(--daust-steel)']} format={v => window.fmtFCFA(v, { short: true })} height={250} />
          <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 8 }}>Dashed line = projected (FY27 onward). Assumes base-case scenario.</div>
        </window.Panel>
        <window.Panel title="Projection detail">
          <div style={{ overflowX: 'auto' }}>
            <table className="dt" style={{ margin: '-4px 0' }}>
              <thead><tr><th>Year</th><th style={{ textAlign: 'right' }}>Revenue</th><th style={{ textAlign: 'right' }}>Expense</th><th style={{ textAlign: 'right' }}>Surplus</th><th style={{ textAlign: 'right' }}>Margin</th><th style={{ textAlign: 'right' }}>Enrollment</th></tr></thead>
              <tbody>
                {window.FORECAST_YEARS.map((y, i) => (
                  <tr key={y}>
                    <td style={{ fontWeight: 700, color: 'var(--fg)' }}>{y}{i >= 3 && <span style={{ color: 'var(--fg-faint)', fontWeight: 400, fontSize: 11 }}> proj.</span>}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{window.fmtFCFA(F.revenue[i], { short: true })}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{window.fmtFCFA(F.expense[i], { short: true })}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success-500)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{window.fmtFCFA(surplus[i], { short: true })}</td>
                    <td style={{ textAlign: 'right', color: 'var(--fg-subtle)' }}>{Math.round(surplus[i] / F.revenue[i] * 100)}%</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--fg)' }}>{F.enrollment[i].toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Panel>
      </div>
    );
  }
  function Leg({ color, label, dashed }) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--fg-subtle)' }}><span style={{ width: 18, height: 0, borderTop: `2.5px ${dashed ? 'dashed' : 'solid'} ${color}` }} />{label}</span>;
  }

  // ---- Scenarios ----
  function Scenarios({ goFin }) {
    const [active, setActive] = useState('base');
    const S = window.SCENARIOS;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 16 }}>
          {S.map(s => {
            const on = s.id === active;
            return (
              <window.Card key={s.id} onClick={() => setActive(s.id)} padding={20}
                style={{ cursor: 'pointer', border: on ? `2px solid ${s.color}` : '1px solid var(--border)', position: 'relative' }}>
                {on && <span style={{ position: 'absolute', top: 14, right: 14, color: s.color }}><window.Icon name="check-circle-2" size={18} /></span>}
                <span style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: `color-mix(in srgb, ${s.color} 14%, var(--surface))`, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><window.Icon name="git-branch" size={18} /></span>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>{s.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginTop: 2 }}>Enroll +{s.enrollGrowth}%/yr · Tuition +{s.tuitionGrowth}%/yr</div>
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--divider)' }}>
                  <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>FY29 surplus</div>
                  <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-display)', color: s.fy29Surplus < 0 ? 'var(--error-500)' : 'var(--fg)' }}><window.FCFA value={s.fy29Surplus} short /></div>
                </div>
              </window.Card>
            );
          })}
        </div>
        <window.Panel title="Scenario comparison — FY29 outlook">
          <window.BarChart data={S.map(s => s.fy29Surplus)} labels={S.map(s => s.name.split(' ')[0])} color="var(--accent)" format={v => window.fmtFCFA(v, { short: true })} height={210} />
          <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 8 }}>Stress scenario (FX depreciation + financial-aid shock) turns the operating surplus negative — flagged for board review.</div>
        </window.Panel>
      </div>
    );
  }

  Object.assign(window, { BudgetVersions, Encumbrances, Forecast, Scenarios });
})();
