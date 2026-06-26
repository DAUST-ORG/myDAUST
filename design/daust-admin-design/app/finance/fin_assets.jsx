// ============================================================
// DAUST Admin — Finance › Assets (fixed asset register + depreciation)
// ============================================================
(function () {
  const { useState } = React;

  function nbv(a) { return a.cost - a.accumDep; }

  function AssetRegister({ goFin }) {
    const [sel, setSel] = useState(null);
    const [q, setQ] = useState('');
    const A = window.ASSETS;
    const totalCost = A.reduce((s, a) => s + a.cost, 0);
    const totalDep = A.reduce((s, a) => s + a.accumDep, 0);
    const catColor = c => (window.ASSET_CATEGORIES.find(x => x.cat === c) || {}).color || 'var(--accent)';
    const rows = A.filter(a => a.name.toLowerCase().includes(q.toLowerCase()) || a.id.toLowerCase().includes(q.toLowerCase()));
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="Gross book value" value={<window.FCFA value={totalCost} short />} sub={A.length + ' assets'} tone="accent" icon="package" />
          <window.Metric label="Accumulated dep." value={<window.FCFA value={totalDep} short />} sub={Math.round(totalDep / totalCost * 100) + '% depreciated'} icon="trending-down" />
          <window.Metric label="Net book value" value={<window.FCFA value={totalCost - totalDep} short />} sub="carrying amount" tone="up" icon="landmark" />
          <window.Metric label="Monthly dep." value={<window.FCFA value={41_200_000} short />} sub="straight-line" icon="calendar" />
        </div>
        <window.Toolbar>
          <window.SearchInput placeholder="Search assets…" value={q} onChange={setQ} width={260} />
          <div style={{ flex: 1 }} />
          <window.Button variant="outline" icon="download">Export register</window.Button>
          <window.Button variant="primary" icon="plus">Add asset</window.Button>
        </window.Toolbar>
        <window.Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Tag</th><th>Asset</th><th>Category</th><th>Acquired</th><th style={{ textAlign: 'right' }}>Cost</th><th style={{ textAlign: 'right' }}>Accum. dep.</th><th style={{ textAlign: 'right' }}>NBV</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map(a => (
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => setSel(a)}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{a.id}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{a.name}</td>
                    <td><window.Badge tone="neutral" dot={false} size="sm"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: catColor(a.cat) }} />{a.cat}</span></window.Badge></td>
                    <td>{a.acquired}</td>
                    <td style={{ textAlign: 'right', color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{window.fmtFCFA(a.cost)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{window.fmtFCFA(a.accumDep)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{window.fmtFCFA(nbv(a))}</td>
                    <td><window.Badge tone={a.status === 'New' ? 'info' : 'success'} size="sm">{a.status}</window.Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Card>

        <window.Drawer open={!!sel} onClose={() => setSel(null)} title="Asset detail" width={460}
          footer={sel && <><window.Button variant="danger" icon="archive">Dispose</window.Button><window.Button variant="primary" icon="pencil">Edit</window.Button></>}>
          {sel && (() => {
            const cat = window.ASSET_CATEGORIES.find(c => c.cat === sel.cat) || { life: 10 };
            const pct = Math.round(sel.accumDep / sel.cost * 100);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div><div className="label" style={{ marginBottom: 6 }}>{sel.id}</div><div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{sel.name}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{sel.cat}</div></div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', padding: 14, textAlign: 'center' }}><div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-display)' }}><window.FCFA value={sel.cost} short /></div><div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>Cost</div></div>
                  <div style={{ flex: 1, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', padding: 14, textAlign: 'center' }}><div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--success-500)' }}><window.FCFA value={nbv(sel)} short /></div><div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>Net book value</div></div>
                </div>
                <div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginBottom: 7 }}>Depreciation progress</div><window.Progress value={sel.accumDep} max={sel.cost} tone={pct > 85 ? 'warning' : 'teal'} height={10} showLabel /></div>
                <window.KV label="GL account" value={cat.gl} mono />
                <window.KV label="Acquired" value={sel.acquired} />
                <window.KV label="Useful life" value={cat.life + ' years (straight-line)'} />
                <window.KV label="Annual depreciation" value={<window.FCFA value={Math.round(sel.cost / cat.life)} />} />
                <window.KV label="Status" value={sel.status} />
              </div>
            );
          })()}
        </window.Drawer>
      </div>
    );
  }

  function Depreciation({ goFin }) {
    const CATS = window.ASSET_CATEGORIES;
    const A = window.ASSETS;
    const byCat = CATS.map(c => {
      const items = A.filter(a => a.cat === c.cat);
      const cost = items.reduce((s, a) => s + a.cost, 0);
      const dep = items.reduce((s, a) => s + a.accumDep, 0);
      const annual = items.reduce((s, a) => s + Math.round(a.cost / c.life), 0);
      return { ...c, cost, dep, annual, count: items.length };
    }).filter(c => c.count > 0);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)', gap: 20, alignItems: 'start' }}>
          <window.Panel title="Net book value by class">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <window.Donut size={150} thickness={20} segments={byCat.map(c => ({ label: c.cat, value: c.cost - c.dep, color: c.color }))}
                centerLabel={window.fmtFCFA(byCat.reduce((s, c) => s + (c.cost - c.dep), 0), { short: true })} centerSub="NBV" />
              <window.LegendList items={byCat.map(c => ({ label: c.cat, value: c.cost - c.dep, color: c.color }))} fmt={v => window.fmtFCFA(v, { short: true })} />
            </div>
          </window.Panel>
          <window.Panel title="Depreciation schedule — by asset class" action={<window.Button variant="outline" size="sm" icon="play">Run monthly</window.Button>}>
            <div style={{ overflowX: 'auto' }}>
              <table className="dt" style={{ margin: '-4px 0' }}>
                <thead><tr><th>Class</th><th>Life</th><th>Assets</th><th style={{ textAlign: 'right' }}>Cost</th><th style={{ textAlign: 'right' }}>Annual dep.</th><th style={{ textAlign: 'right' }}>NBV</th></tr></thead>
                <tbody>
                  {byCat.map(c => (
                    <tr key={c.cat}>
                      <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--fg)' }}><span style={{ width: 9, height: 9, borderRadius: 3, background: c.color }} />{c.cat}</span></td>
                      <td>{c.life}y</td>
                      <td>{c.count}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{window.fmtFCFA(c.cost)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--cta)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{window.fmtFCFA(c.annual)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{window.fmtFCFA(c.cost - c.dep)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                    <td colSpan={3} style={{ fontWeight: 700, color: 'var(--fg)', padding: '13px 16px' }}>Total</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{window.fmtFCFA(byCat.reduce((s, c) => s + c.cost, 0))}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--cta)' }}>{window.fmtFCFA(byCat.reduce((s, c) => s + c.annual, 0))}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{window.fmtFCFA(byCat.reduce((s, c) => s + (c.cost - c.dep), 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </window.Panel>
        </div>
        <window.Panel title="5-year depreciation forecast">
          <window.BarChart data={[494, 458, 412, 366, 318].map(v => v * 1e6)} labels={['FY26', 'FY27', 'FY28', 'FY29', 'FY30']} color="var(--cta)" format={v => window.fmtFCFA(v, { short: true })} height={200} />
        </window.Panel>
      </div>
    );
  }

  Object.assign(window, { AssetRegister, Depreciation });
})();
