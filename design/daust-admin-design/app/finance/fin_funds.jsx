// ============================================================
// DAUST Admin — Finance › Funds (grants & endowment)
// ============================================================
(function () {
  const { useState } = React;

  // ---- Grants & restricted funds ----
  function Grants({ goFin }) {
    const [sel, setSel] = useState(null);
    const G = window.GRANTS;
    const totalAward = G.reduce((a, g) => a + g.award, 0);
    const totalSpent = G.reduce((a, g) => a + g.spent, 0);
    const active = G.filter(g => g.status === 'Active').length;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="Total awarded" value={<window.FCFA value={totalAward} short />} sub={G.length + ' grants'} tone="accent" icon="award" />
          <window.Metric label="Spent to date" value={<window.FCFA value={totalSpent} short />} sub={Math.round(totalSpent / totalAward * 100) + '% burn'} icon="activity" />
          <window.Metric label="Remaining" value={<window.FCFA value={totalAward - totalSpent} short />} sub="available" tone="up" icon="wallet" />
          <window.Metric label="Active awards" value={active} sub={(G.length - active) + ' closing'} icon="folder-open" />
        </div>

        <window.Panel title="Grant portfolio" action={<window.Button variant="primary" size="sm" icon="plus">Add award</window.Button>}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Grant</th><th>Sponsor</th><th>PI</th><th>Period</th><th style={{ textAlign: 'right' }}>Award</th><th style={{ width: 150 }}>Burn</th><th>Status</th></tr></thead>
              <tbody>
                {G.map(g => {
                  const pct = Math.round(g.spent / g.award * 100);
                  return (
                    <tr key={g.id} style={{ cursor: 'pointer' }} onClick={() => setSel(g)}>
                      <td style={{ maxWidth: 240 }}><div style={{ color: 'var(--fg)', fontWeight: 600 }}>{g.title}</div><div style={{ fontSize: 11.5, color: 'var(--fg-faint)', fontFamily: 'var(--font-mono)' }}>{g.id} · {g.school}</div></td>
                      <td>{g.sponsor}</td>
                      <td>{g.pi}</td>
                      <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{g.start} → {g.end}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={g.award} /></td>
                      <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><window.Progress value={g.spent} max={g.award} tone={pct > 90 ? 'warning' : 'teal'} height={6} /><span style={{ fontSize: 11.5, color: 'var(--fg-subtle)', minWidth: 30 }}>{pct}%</span></div></td>
                      <td><window.FinStatus status={g.status === 'Closing' ? 'In progress' : 'Active'} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </window.Panel>

        <window.Drawer open={!!sel} onClose={() => setSel(null)} title="Grant detail" width={500}
          footer={sel && <><window.Button variant="outline" icon="file-text">Sponsor report</window.Button><window.Button variant="primary" icon="receipt">Post expense</window.Button></>}>
          {sel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div><div className="label" style={{ marginBottom: 6 }}>{sel.sponsor}</div><div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-display)', lineHeight: 1.2 }}>{sel.title}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginTop: 4 }}>{sel.id} · PI: {sel.pi}</div></div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', padding: 14, textAlign: 'center' }}><div style={{ fontSize: 19, fontWeight: 800, fontFamily: 'var(--font-display)' }}><window.FCFA value={sel.award} short /></div><div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>Award</div></div>
                <div style={{ flex: 1, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', padding: 14, textAlign: 'center' }}><div style={{ fontSize: 19, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--accent)' }}><window.FCFA value={sel.spent} short /></div><div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>Spent</div></div>
                <div style={{ flex: 1, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', padding: 14, textAlign: 'center' }}><div style={{ fontSize: 19, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--success-500)' }}><window.FCFA value={sel.award - sel.spent} short /></div><div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>Remaining</div></div>
              </div>
              <div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginBottom: 7 }}>Budget utilisation</div><window.Progress value={sel.spent} max={sel.award} tone="teal" height={10} showLabel /></div>
              <window.KV label="Period" value={sel.start + ' → ' + sel.end} />
              <window.KV label="School / dept" value={sel.school} />
              <window.KV label="Indirect cost (overhead)" value={sel.overhead + '%'} />
              <window.KV label="Restricted fund" value="Yes — Ecobank (521300)" />
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg-muted)', marginTop: 4 }}>Spend by category</div>
              {[['Personnel & stipends', 0.52], ['Equipment', 0.24], ['Travel & dissemination', 0.13], ['Indirect / overhead', 0.11]].map((c, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--divider)' }}>
                  <span style={{ color: 'var(--fg-muted)' }}>{c[0]}</span><span style={{ fontFamily: 'var(--font-mono)' }}>{window.fmtFCFA(Math.round(sel.spent * c[1]))}</span>
                </div>
              ))}
            </div>
          )}
        </window.Drawer>
      </div>
    );
  }

  // ---- Endowment ----
  function Endowment({ goFin }) {
    const E = window.ENDOWMENT;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="Market value" value={<window.FCFA value={E.marketValue} short />} sub="as of May 2026" tone="accent" icon="landmark" />
          <window.Metric label="Corpus" value={<window.FCFA value={E.corpus} short />} sub="permanently restricted" icon="lock" />
          <window.Metric label="YTD return" value={'+' + E.ytdReturn + '%'} sub="net of fees" tone="up" icon="trending-up" />
          <window.Metric label="Payout (YTD)" value={<window.FCFA value={E.payoutYTD} short />} sub={E.spendingRate + '% spending rate'} icon="hand-coins" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
          <window.Panel title="Endowment value — 6-year history" action={<window.Segmented size="sm" options={['Value', 'Return']} value="Value" onChange={() => {}} />}>
            <window.AreaChart labels={['FY21', 'FY22', 'FY23', 'FY24', 'FY25', 'FY26']} series={[{ name: 'Market value', data: E.history }]} colors={['var(--accent)']} format={v => window.fmtFCFA(v, { short: true })} height={236} />
          </window.Panel>
          <window.Panel title="Asset allocation">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <window.Donut size={150} thickness={20} segments={E.allocation} centerLabel={E.ytdReturn + '%'} centerSub="YTD" />
              <window.LegendList items={E.allocation} />
            </div>
          </window.Panel>
        </div>

        <window.Panel title="Named funds within the endowment" action={<window.Button variant="primary" size="sm" icon="plus">Add fund</window.Button>}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Fund</th><th>Donor</th><th>Purpose</th><th style={{ textAlign: 'right' }}>Value</th><th style={{ textAlign: 'right' }}>Annual payout*</th></tr></thead>
              <tbody>
                {E.funds.map(f => (
                  <tr key={f.name}>
                    <td style={{ color: 'var(--fg)', fontWeight: 700 }}>{f.name}</td>
                    <td>{f.donor}</td>
                    <td style={{ color: 'var(--fg-subtle)' }}>{f.purpose}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={f.value} /></td>
                    <td style={{ textAlign: 'right', color: 'var(--accent)', fontWeight: 600 }}><window.FCFA value={Math.round(f.value * E.spendingRate / 100)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 8 }}>*Based on {E.spendingRate}% spending policy applied to trailing average value.</div>
        </window.Panel>
      </div>
    );
  }

  Object.assign(window, { Grants, Endowment });
})();
