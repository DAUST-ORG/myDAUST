// ============================================================
// DAUST Admin — Finance › Payments (transaction ledger + reconciliation)
// ============================================================
(function () {
  const { useState, useEffect, useRef } = React;

  function Payments({ goFin }) {
    const [q, setQ] = useState('');
    const [method, setMethod] = useState('All');
    const [status, setStatus] = useState('All');
    const [sel, setSel] = useState(null);
    const T = window.TRANSACTIONS;
    const rows = T.filter(t =>
      (method === 'All' || t.method === method) &&
      (status === 'All' || t.status === status) &&
      (t.student.toLowerCase().includes(q.toLowerCase()) || t.id.toLowerCase().includes(q.toLowerCase()) || t.ref.toLowerCase().includes(q.toLowerCase())));

    const cleared = T.filter(t => t.status === 'Cleared');
    const totalCleared = cleared.reduce((a, t) => a + t.amount, 0);
    const unreconciled = cleared.filter(t => !t.reconciled);
    const pending = T.filter(t => t.status === 'Pending');
    const byMethod = ['Orange Money', 'Wave', 'Bank Transfer', 'Card', 'Cash'].map(m => ({
      label: m, value: cleared.filter(t => t.method === m).reduce((a, t) => a + t.amount, 0), color: window.METHOD_COLOR[m],
    })).filter(s => s.value > 0);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1.4fr)', gap: 16, alignItems: 'stretch' }}>
          <Card padding={18} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', fontWeight: 600 }}>Cleared today</div>
            <div style={{ fontSize: 24, fontWeight: 800, margin: '8px 0' }}><FCFA value={totalCleared} short /></div>
            <div style={{ fontSize: 12.5, color: 'var(--success-500)', fontWeight: 600 }}>{cleared.length} transactions</div>
          </Card>
          <Card padding={18} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', fontWeight: 600 }}>Awaiting reconciliation</div>
            <div style={{ fontSize: 24, fontWeight: 800, margin: '8px 0', color: 'var(--warning-500)' }}>{unreconciled.length}</div>
            <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{pending.length} pending · {T.filter(t => t.status === 'Failed').length} failed</div>
          </Card>
          <Panel title="Cleared by channel" pad={18}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Donut size={104} thickness={16} segments={byMethod} centerLabel={byMethod.length} centerSub="channels" />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {byMethod.map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                    <span style={{ flex: 1, color: 'var(--fg-muted)' }}>{s.label}</span>
                    <b style={{ color: 'var(--fg)' }}>{fmtFCFA(s.value, { short: true })}</b>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </div>

        <div>
          <Toolbar>
            <SearchInput placeholder="Search student, txn ID or reference…" value={q} onChange={setQ} width={300} />
            <Select options={['All', 'Orange Money', 'Wave', 'Bank Transfer', 'Card', 'Cash'].map(v => ({ value: v, label: v === 'All' ? 'All methods' : v }))} value={method} onChange={setMethod} />
            <Segmented size="sm" options={['All', 'Cleared', 'Pending', 'Failed']} value={status} onChange={setStatus} />
            <div style={{ flex: 1 }} />
            <Button variant="outline" icon="refresh-cw" size="md">Sync bank feed</Button>
            <Button variant="primary" icon="check-check" size="md">Reconcile all</Button>
          </Toolbar>

          <Card padding={0} style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="dt">
                <thead><tr><th>Date</th><th>Transaction</th><th>Student</th><th>Type</th><th>Method</th><th>Reference</th><th>Amount</th><th>Status</th><th>Recon.</th></tr></thead>
                <tbody>
                  {rows.map(t => (
                    <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setSel(t)}>
                      <td style={{ whiteSpace: 'nowrap' }}>{t.date}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{t.id}</td>
                      <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{t.student}</td>
                      <td><Badge tone="neutral" dot={false} size="sm">{t.type}</Badge></td>
                      <td><MethodTag method={t.method} /></td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-subtle)' }}>{t.ref}</td>
                      <td style={{ fontWeight: 700, color: t.status === 'Failed' ? 'var(--fg-faint)' : 'var(--fg)', textDecoration: t.status === 'Failed' ? 'line-through' : 'none' }}><FCFA value={t.amount} /></td>
                      <td><FinStatus status={t.status} /></td>
                      <td>{t.status === 'Cleared' ? (t.reconciled ? <Icon name="check-circle-2" size={17} style={{ color: 'var(--success-500)' }} /> : <Icon name="circle-dashed" size={17} style={{ color: 'var(--warning-500)' }} />) : <span style={{ color: 'var(--fg-faint)' }}>—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && <EmptyState icon="arrow-left-right" title="No transactions" sub="Adjust your filters." />}
          </Card>
        </div>

        <Drawer open={!!sel} onClose={() => setSel(null)} title="Transaction" width={440}
          footer={sel && (sel.status === 'Cleared' && !sel.reconciled ? <Button variant="primary" icon="check" onClick={() => setSel(null)}>Mark reconciled</Button> : sel.status === 'Pending' ? <><Button variant="danger" icon="x">Void</Button><Button variant="primary" icon="check">Clear</Button></> : <Button variant="outline" icon="printer">Receipt</Button>)}>
          {sel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em' }}><FCFA value={sel.amount} /></div>
                <div style={{ marginTop: 8 }}><FinStatus status={sel.status} /></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}><MethodTag method={sel.method} /></div>
              <div>
                <KV label="Transaction ID" value={sel.id} mono />
                <KV label="Reference" value={sel.ref} mono />
                <KV label="Student" value={sel.student} />
                <KV label="Account" value={sel.studentId} mono />
                <KV label="Fee type" value={sel.type} />
                <KV label="Date" value={sel.date} />
                <KV label="Reconciled" value={sel.reconciled ? 'Yes' : 'No'} />
              </div>
            </div>
          )}
        </Drawer>
      </div>
    );
  }

  Object.assign(window, { Payments });
})();
