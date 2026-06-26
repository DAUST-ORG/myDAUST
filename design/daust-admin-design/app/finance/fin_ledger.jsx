// ============================================================
// DAUST Admin — Finance › Ledger (CoA, journal, trial balance)
// ============================================================
(function () {
  const { useState, useEffect, useRef } = React;

  const TYPE_TONE = { Asset: 'info', Liability: 'warning', Equity: 'teal', Revenue: 'success', Expense: 'error' };
  const TYPE_ORDER = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];

  function Ledger({ goFin }) {
    const [tab, setTab] = useState('coa');
    return (
      <div>
        <Tabs tabs={[{ value: 'coa', label: 'Chart of accounts' }, { value: 'journal', label: 'Journal entries' }, { value: 'trial', label: 'Trial balance' }]} active={tab} onChange={setTab} />
        {tab === 'coa' && <ChartOfAccounts />}
        {tab === 'journal' && <Journal />}
        {tab === 'trial' && <TrialBalance />}
      </div>
    );
  }

  function ChartOfAccounts() {
    const A = window.ACCOUNTS;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {TYPE_ORDER.map(type => {
          const accts = A.filter(a => a.type === type);
          const subtotal = accts.reduce((s, a) => s + a.balance, 0);
          return (
            <Card key={type} padding={0} style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}><Badge tone={TYPE_TONE[type]} dot={false} size="sm">{type}</Badge></span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--fg)' }}><FCFA value={subtotal} /></span>
              </div>
              <table className="dt">
                <tbody>
                  {accts.map(a => (
                    <tr key={a.code}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--fg-subtle)', width: 80 }}>{a.code}</td>
                      <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{a.name}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 13 }}><FCFA value={a.balance} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          );
        })}
      </div>
    );
  }

  function Journal() {
    const [sel, setSel] = useState(null);
    return (
      <div>
        <Toolbar>
          <SearchInput placeholder="Search entries…" value="" onChange={() => {}} width={260} />
          <div style={{ flex: 1 }} />
          <Button variant="outline" icon="download" size="md">Export</Button>
          <Button variant="primary" icon="plus" size="md">New entry</Button>
        </Toolbar>
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Entry</th><th>Date</th><th>Description</th><th>Debit</th><th>Credit</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {window.JOURNAL.map(j => (
                  <tr key={j.id} style={{ cursor: 'pointer' }} onClick={() => setSel(j)}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{j.id}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{j.date}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{j.desc}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{j.debit}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{j.credit}</td>
                    <td style={{ fontWeight: 700, color: 'var(--fg)' }}><FCFA value={j.amount} /></td>
                    <td><FinStatus status={j.posted ? 'Posted' : 'Draft'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Drawer open={!!sel} onClose={() => setSel(null)} title={sel ? sel.id : ''} width={440}
          footer={sel && (!sel.posted ? <><Button variant="outline">Edit</Button><Button variant="primary" icon="check">Post entry</Button></> : <Button variant="outline" icon="printer">Print</Button>)}>
          {sel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div><div style={{ fontSize: 15, fontWeight: 700 }}>{sel.desc}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{sel.date} · {sel.posted ? 'Posted' : 'Draft'}</div></div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 14px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md) var(--radius-md) 0 0', fontSize: 11.5, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <span>Account</span><span>Debit</span><span>Credit</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', border: '1px solid var(--border)', borderTop: 'none', fontSize: 13.5 }}>
                  <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{sel.debit}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg)' }}>{fmtFCFA(sel.amount)}</span>
                  <span style={{ color: 'var(--fg-faint)' }}>—</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 var(--radius-md) var(--radius-md)', fontSize: 13.5 }}>
                  <span style={{ color: 'var(--fg)', fontWeight: 600, paddingLeft: 16 }}>{sel.credit}</span>
                  <span style={{ color: 'var(--fg-faint)' }}>—</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg)' }}>{fmtFCFA(sel.amount)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 700, padding: '0 14px' }}>
                <span>Balanced</span><span style={{ color: 'var(--success-500)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="check-circle-2" size={16} />Dr = Cr</span>
              </div>
            </div>
          )}
        </Drawer>
      </div>
    );
  }

  function TrialBalance() {
    const A = window.ACCOUNTS;
    // Debit-normal: Asset, Expense. Credit-normal: Liability, Equity, Revenue.
    const isDebit = t => t === 'Asset' || t === 'Expense';
    const totalDr = A.filter(a => isDebit(a.type)).reduce((s, a) => s + a.balance, 0);
    const totalCr = A.filter(a => !isDebit(a.type)).reduce((s, a) => s + a.balance, 0);
    return (
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>Trial balance · as of 28 May 2026</h3>
          <Button variant="outline" size="sm" icon="download">Export</Button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dt">
            <thead><tr><th>Code</th><th>Account</th><th>Type</th><th style={{ textAlign: 'right' }}>Debit</th><th style={{ textAlign: 'right' }}>Credit</th></tr></thead>
            <tbody>
              {A.map(a => {
                const dr = isDebit(a.type);
                return (
                  <tr key={a.code}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--fg-subtle)' }}>{a.code}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{a.name}</td>
                    <td><Badge tone={TYPE_TONE[a.type]} dot={false} size="sm">{a.type}</Badge></td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: dr ? 'var(--fg)' : 'var(--fg-faint)' }}>{dr ? fmtFCFA(a.balance) : '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: !dr ? 'var(--fg)' : 'var(--fg-faint)' }}>{!dr ? fmtFCFA(a.balance) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                <td colSpan={3} style={{ fontWeight: 700, color: 'var(--fg)', padding: '14px 16px' }}>Totals</td>
                <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--fg)' }}>{fmtFCFA(totalDr)}</td>
                <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--fg)' }}>{fmtFCFA(totalCr)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style={{ padding: '12px 18px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--success-500)', fontWeight: 600 }}>
          <Icon name="check-circle-2" size={16} /> Balanced — debits equal credits
        </div>
      </Card>
    );
  }

  Object.assign(window, { Ledger });
})();
