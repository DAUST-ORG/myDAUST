// ============================================================
// DAUST Admin — Finance › Accounting extras
// Recurring journals · Bank reconciliation · Period close · Tax & compliance
// (CoA / Journal / Trial balance live in fin_ledger.jsx)
// ============================================================
(function () {
  const { useState } = React;

  // ---- Recurring journals ----
  function RecurringJournals({ goFin }) {
    const [items, setItems] = useState(window.RECURRING.map(r => ({ ...r })));
    const toggle = id => setItems(items.map(r => r.id === id ? { ...r, active: !r.active } : r));
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="Active templates" value={items.filter(r => r.active).length} sub={'of ' + items.length} tone="up" icon="repeat" />
          <window.Metric label="Monthly auto-post" value={<window.FCFA value={items.filter(r => r.active).reduce((a, r) => a + r.amount, 0)} short />} sub="total recurring" icon="calendar-clock" />
          <window.Metric label="Next run" value="May 28" sub="depreciation + deferred rev." icon="clock" />
        </div>
        <window.Panel title="Recurring journal templates" action={<window.Button variant="primary" size="sm" icon="plus">New template</window.Button>}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Template</th><th>Schedule</th><th>Debit</th><th>Credit</th><th style={{ textAlign: 'right' }}>Amount</th><th>Next run</th><th>Active</th></tr></thead>
              <tbody>
                {items.map(r => (
                  <tr key={r.id}>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{r.desc}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{r.schedule}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.debit}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.credit}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={r.amount} /></td>
                    <td>{r.next}</td>
                    <td><window.Toggle checked={r.active} onChange={() => toggle(r.id)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Panel>
      </div>
    );
  }

  // ---- Bank reconciliation (matching) ----
  function Reconciliation({ goFin }) {
    const R = window.RECON;
    const [items, setItems] = useState(R.items.map(i => ({ ...i })));
    const matchedCount = items.filter(i => i.matched).length;
    const unmatched = items.filter(i => !i.matched);
    const diff = R.statementBal - R.bookBal;
    const toggle = id => setItems(items.map(i => i.id === id ? { ...i, matched: !i.matched } : i));
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="Statement balance" value={<window.FCFA value={R.statementBal} short />} sub={R.account} icon="building-2" />
          <window.Metric label="Book balance" value={<window.FCFA value={R.bookBal} short />} sub="general ledger" icon="book-open" />
          <window.Metric label="Difference" value={<window.FCFA value={diff} short />} sub={unmatched.length + ' unreconciled items'} tone={diff === 0 ? 'up' : 'down'} icon="git-compare" />
          <window.Metric label="Matched" value={matchedCount + '/' + items.length} sub="auto + manual" tone="up" icon="check-check" />
        </div>
        <window.Panel title="Reconciliation items" action={<window.Button variant="primary" size="sm" icon="check-check">Auto-match</window.Button>}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Date</th><th>Description</th><th style={{ textAlign: 'right' }}>Bank</th><th style={{ textAlign: 'right' }}>Book</th><th>Match</th></tr></thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id} style={{ background: i.matched ? 'transparent' : 'rgba(237,132,37,0.05)' }}>
                    <td>{i.date}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{i.desc}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: i.bank < 0 ? 'var(--error-500)' : 'var(--fg)' }}>{i.bank ? window.fmtFCFA(i.bank) : '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: i.book < 0 ? 'var(--error-500)' : 'var(--fg)' }}>{i.book ? window.fmtFCFA(i.book) : '—'}</td>
                    <td>{i.matched ? <window.Badge tone="success" size="sm">Matched</window.Badge> : <window.Button variant="outline" size="sm" icon="link" onClick={() => toggle(i.id)}>Match</window.Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {unmatched.length > 0 && (
            <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', background: 'rgba(237,132,37,0.1)', borderRadius: 'var(--radius-md)', padding: '11px 14px', fontSize: 13, color: 'var(--fg-muted)' }}>
              <window.Icon name="alert-triangle" size={16} style={{ color: 'var(--warning-500)' }} />
              {unmatched.length} items need attention — bank charges & interest must be posted to the ledger; uncleared cheque is timing only.
            </div>
          )}
        </window.Panel>
      </div>
    );
  }

  // ---- Period close ----
  function PeriodClose({ goFin }) {
    const [tasks, setTasks] = useState(window.CLOSE_TASKS.map(t => ({ ...t })));
    const done = tasks.filter(t => t.done).length;
    const pct = Math.round(done / tasks.length * 100);
    const toggle = id => setTasks(tasks.map(t => t.id === id ? { ...t, done: !t.done } : t));
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <window.Card padding={22}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
            <div>
              <div className="label" style={{ marginBottom: 4 }}>Accounting period</div>
              <h3 style={{ fontSize: 20, fontFamily: 'var(--font-display)' }}>May 2026 — Month-end close</h3>
              <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginTop: 2 }}>{done} of {tasks.length} tasks complete · target lock 2026-06-05</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 34, fontWeight: 800, fontFamily: 'var(--font-display)', color: pct === 100 ? 'var(--success-500)' : 'var(--cta)' }}>{pct}%</div>
              <window.Button variant={pct === 100 ? 'primary' : 'outline'} size="sm" icon="lock" style={{ marginTop: 6 }}>{pct === 100 ? 'Lock period' : 'Lock (pending)'}</window.Button>
            </div>
          </div>
          <div style={{ marginTop: 16 }}><window.Progress value={done} max={tasks.length} tone={pct === 100 ? 'success' : 'teal'} height={10} /></div>
        </window.Card>
        <window.Panel title="Close checklist">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {tasks.map((t, i) => (
              <div key={t.id} onClick={() => toggle(t.id)} className="row-hover" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 6px', borderBottom: i < tasks.length - 1 ? '1px solid var(--divider)' : 'none', cursor: 'pointer' }}>
                <span style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, background: t.done ? 'var(--success-500)' : 'transparent', border: t.done ? 'none' : '1.5px solid var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t.done && <window.Icon name="check" size={14} style={{ color: '#fff' }} />}</span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: t.done ? 'var(--fg-subtle)' : 'var(--fg)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.task}</span>
                <window.Badge tone="neutral" dot={false} size="sm">{t.owner}</window.Badge>
              </div>
            ))}
          </div>
        </window.Panel>
      </div>
    );
  }

  // ---- Tax & statutory compliance ----
  function TaxCompliance({ goFin }) {
    const [sel, setSel] = useState(null);
    const T = window.TAX_FILINGS;
    const pending = T.filter(t => t.status === 'Pending');
    const dueTotal = pending.reduce((a, t) => a + t.amount, 0);
    const authTone = { DGID: 'info', IPRES: 'teal', CSS: 'warning' };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="Due this period" value={<window.FCFA value={dueTotal} short />} sub={pending.length + ' filings'} tone="down" icon="alert-circle" />
          <window.Metric label="Next deadline" value="Jun 10" sub="IPRES + CSS" tone="down" icon="calendar-clock" />
          <window.Metric label="Filed (YTD)" value={T.filter(t => t.status === 'Filed').length} sub="on time" tone="up" icon="check-circle-2" />
          <window.Metric label="Compliance" value="100%" sub="no penalties" tone="up" icon="shield-check" />
        </div>
        <window.Panel title="Statutory filings — Senegal" action={<window.Button variant="primary" size="sm" icon="upload">File return</window.Button>}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Filing</th><th>Authority</th><th>Base</th><th>Rate</th><th style={{ textAlign: 'right' }}>Amount due</th><th>Due date</th><th>Status</th></tr></thead>
              <tbody>
                {T.map(t => (
                  <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setSel(t)}>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{t.name}</td>
                    <td><window.Badge tone={authTone[t.authority]} dot={false} size="sm">{t.authority}</window.Badge></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--fg-subtle)' }}>{window.fmtFCFA(t.base)}</td>
                    <td style={{ fontSize: 12.5 }}>{t.rate}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={t.amount} /></td>
                    <td>{t.due}</td>
                    <td><window.FinStatus status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Panel>
        <window.Drawer open={!!sel} onClose={() => setSel(null)} title={sel ? sel.name : ''} width={420}
          footer={sel && (sel.status === 'Pending' ? <window.Button variant="primary" icon="upload">Mark as filed</window.Button> : <window.Button variant="outline" icon="download">Receipt</window.Button>)}>
          {sel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)', padding: 18, textAlign: 'center' }}>
                <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>Amount due to {sel.authority}</div>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-display)', margin: '6px 0' }}><window.FCFA value={sel.amount} /></div>
                <window.FinStatus status={sel.status} />
              </div>
              <window.KV label="Taxable base" value={<window.FCFA value={sel.base} />} />
              <window.KV label="Rate" value={sel.rate} />
              <window.KV label="Authority" value={sel.authority} />
              <window.KV label="Due date" value={sel.due} />
            </div>
          )}
        </window.Drawer>
      </div>
    );
  }

  Object.assign(window, { RecurringJournals, Reconciliation, PeriodClose, TaxCompliance });
})();
