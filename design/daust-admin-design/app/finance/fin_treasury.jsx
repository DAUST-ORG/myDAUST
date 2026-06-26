// ============================================================
// DAUST Admin — Finance › Treasury (bank accounts, cash position, transfers)
// ============================================================
(function () {
  const { useState } = React;

  function fmtAcctBal(a) {
    if (a.currency === 'USD') return '$' + window.fmtFCFA(Math.round(a.balance / window.USD_XOF));
    return window.fmtFCFA(a.balance) + ' FCFA';
  }

  // ---- Bank Accounts ----
  function TreasuryBanks({ goFin }) {
    const [sel, setSel] = useState(null);
    const [xfer, setXfer] = useState(false);
    const BA = window.BANK_ACCOUNTS;
    const totalXOF = BA.reduce((a, b) => a + b.balance, 0);
    const typeTone = { Current: 'info', Restricted: 'warning', Investment: 'teal', Wallet: 'neutral' };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="Total cash (all accounts)" value={<window.FCFA value={totalXOF} short />} sub={BA.length + ' accounts · 2 currencies'} tone="accent" icon="landmark" />
          <window.Metric label="Operating liquidity" value={<window.FCFA value={BA.filter(b => b.type === 'Current').reduce((a, b) => a + b.balance, 0)} short />} sub="immediately available" tone="up" icon="wallet" />
          <window.Metric label="Restricted" value={<window.FCFA value={BA.filter(b => b.type === 'Restricted').reduce((a, b) => a + b.balance, 0)} short />} sub="grant-locked" icon="lock" />
          <window.Metric label="Days cash on hand" value="142" sub="target ≥ 90" tone="up" icon="calendar-check" />
        </div>

        <window.Panel title="Bank & wallet accounts" action={<window.Button variant="primary" size="sm" icon="arrow-left-right" onClick={() => setXfer(true)}>New transfer</window.Button>}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Account</th><th>Bank</th><th>Number</th><th>Type</th><th>GL</th><th style={{ textAlign: 'right' }}>Balance</th><th></th></tr></thead>
              <tbody>
                {BA.map(a => (
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => setSel(a)}>
                    <td style={{ color: 'var(--fg)', fontWeight: 700 }}>{a.label}</td>
                    <td>{a.bank}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-subtle)' }}>{a.number}</td>
                    <td><window.Badge tone={typeTone[a.type]} dot={false} size="sm">{a.type}</window.Badge></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-subtle)' }}>{a.glCode}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>{fmtAcctBal(a)}{a.currency === 'USD' && <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}> USD</span>}</td>
                    <td style={{ textAlign: 'right' }}><window.Icon name="chevron-right" size={16} style={{ color: 'var(--fg-faint)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Panel>

        <window.Drawer open={!!sel} onClose={() => setSel(null)} title={sel ? sel.label : ''} width={460}
          footer={sel && <><window.Button variant="outline" icon="file-text">Statement</window.Button><window.Button variant="primary" icon="arrow-left-right" onClick={() => { setSel(null); setXfer(true); }}>Transfer</window.Button></>}>
          {sel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ background: 'var(--grad-dark-surface)', borderRadius: 'var(--radius-lg)', padding: 20, color: '#fff' }}>
                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)' }}>{sel.bank}</div>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-display)', margin: '8px 0' }}>{fmtAcctBal(sel)}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.04em' }}>{sel.number}</div>
              </div>
              <window.KV label="Account type" value={sel.type} />
              <window.KV label="Currency" value={sel.currency} />
              <window.KV label="GL mapping" value={sel.glCode} mono />
              <window.KV label="Last reconciled" value="2026-05-28" />
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg-muted)', marginTop: 4 }}>Recent movement</div>
              {window.BANK_TRANSFERS.filter(t => t.from.includes(sel.bank.split(' ')[0]) || t.to.includes(sel.bank.split(' ')[0])).slice(0, 3).map(t => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--divider)' }}>
                  <span style={{ color: 'var(--fg-muted)' }}>{t.memo}</span><span style={{ fontFamily: 'var(--font-mono)' }}>{window.fmtFCFA(t.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </window.Drawer>
        <TransferModal open={xfer} onClose={() => setXfer(false)} />
      </div>
    );
  }

  function TransferModal({ open, onClose }) {
    const opts = window.BANK_ACCOUNTS.map(a => a.label);
    return (
      <window.Modal open={open} onClose={onClose} title="New bank transfer" width={460}
        footer={<><window.Button variant="ghost" onClick={onClose}>Cancel</window.Button><window.Button variant="primary" icon="send" onClick={onClose}>Submit for approval</window.Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <window.Field label="From account"><window.Select options={opts} /></window.Field>
          <window.Field label="To account"><window.Select options={opts} /></window.Field>
          <window.Field label="Amount (FCFA)"><window.Input type="number" placeholder="420 000 000" /></window.Field>
          <window.Field label="Memo"><window.Input placeholder="e.g. May payroll funding" /></window.Field>
          <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', padding: '11px 14px', fontSize: 12.5, color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <window.Icon name="info" size={15} style={{ color: 'var(--accent)' }} />Transfers over 100M FCFA require Director approval.
          </div>
        </div>
      </window.Modal>
    );
  }

  // ---- Cash Position ----
  function TreasuryPosition({ goFin }) {
    const CP = window.CASH_POSITION;
    const labels = CP.filter((_, i) => i % 3 === 0).map(d => 'D' + d.day);
    const balances = CP.filter((_, i) => i % 3 === 0).map(d => d.balance);
    const minBal = Math.min(...CP.map(d => d.balance));
    const minDay = CP.find(d => d.balance === minBal).day;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="Opening balance" value={<window.FCFA value={3_700_000_000} short />} sub="today" icon="play" />
          <window.Metric label="Projected (30d)" value={<window.FCFA value={CP[CP.length - 1].balance} short />} sub="end of horizon" tone="up" icon="trending-up" />
          <window.Metric label="Lowest point" value={<window.FCFA value={minBal} short />} sub={'day ' + minDay + ' (post-payroll)'} tone={minBal < 2e9 ? 'down' : 'accent'} icon="trending-down" />
          <window.Metric label="Net 30-day flow" value={<window.FCFA value={CP[CP.length - 1].balance - 3_700_000_000} short />} sub="inflow − outflow" tone="up" icon="activity" />
        </div>
        <window.Panel title="30-day cash position projection" action={<window.Segmented size="sm" options={['30 days', '60 days', '90 days']} value="30 days" onChange={() => {}} />}>
          <window.AreaChart labels={labels} series={[{ name: 'Projected balance', data: balances }]} colors={['var(--accent)']} format={v => window.fmtFCFA(v, { short: true })} height={240} />
        </window.Panel>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 20 }}>
          <window.Panel title="Daily flow — next 7 days">
            <table className="dt" style={{ margin: '-4px 0' }}>
              <thead><tr><th>Day</th><th style={{ textAlign: 'right' }}>Inflow</th><th style={{ textAlign: 'right' }}>Outflow</th><th style={{ textAlign: 'right' }}>Balance</th></tr></thead>
              <tbody>
                {CP.slice(0, 7).map(d => (
                  <tr key={d.day}>
                    <td style={{ fontWeight: 600, color: 'var(--fg)' }}>Day {d.day}</td>
                    <td style={{ textAlign: 'right', color: 'var(--success-500)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>+{window.fmtFCFA(d.inflow, { short: true })}</td>
                    <td style={{ textAlign: 'right', color: 'var(--error-500)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>−{window.fmtFCFA(d.outflow, { short: true })}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{window.fmtFCFA(d.balance, { short: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </window.Panel>
          <window.Panel title="Liquidity guidance">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Guidance icon="alert-triangle" tone="warning" title="Payroll funding (Day 3)" body="Fund SGBS payroll account with 420M FCFA before the May run." />
              <Guidance icon="trending-up" tone="success" title="Tuition inflow steady" body="Weekly settlement cycles keep operating liquidity above 2.0B FCFA." />
              <Guidance icon="lock" tone="info" title="Restricted balance" body="1.28B FCFA in Ecobank is grant-locked — exclude from operating planning." />
            </div>
          </window.Panel>
        </div>
      </div>
    );
  }
  function Guidance({ icon, tone, title, body }) {
    const c = { warning: 'var(--warning-500)', success: 'var(--success-500)', info: 'var(--info-500)' }[tone];
    return (
      <div style={{ display: 'flex', gap: 12 }}>
        <span style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: `color-mix(in srgb, ${c} 12%, var(--surface))`, color: c, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><window.Icon name={icon} size={16} /></span>
        <div><div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--fg)' }}>{title}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginTop: 2 }}>{body}</div></div>
      </div>
    );
  }

  // ---- Transfers ----
  function TreasuryTransfers({ goFin }) {
    const [xfer, setXfer] = useState(false);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <window.Toolbar>
          <window.SearchInput placeholder="Search transfers…" value="" onChange={() => {}} width={260} />
          <div style={{ flex: 1 }} />
          <window.Button variant="primary" icon="plus" onClick={() => setXfer(true)}>New transfer</window.Button>
        </window.Toolbar>
        <window.Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Transfer</th><th>From</th><th>To</th><th>Memo</th><th>Initiator</th><th style={{ textAlign: 'right' }}>Amount</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {window.BANK_TRANSFERS.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{t.id}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{t.from}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><window.Icon name="arrow-right" size={13} style={{ color: 'var(--fg-faint)' }} />{t.to}</span></td>
                    <td style={{ color: 'var(--fg-subtle)' }}>{t.memo}</td>
                    <td>{t.initiator}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={t.amount} /></td>
                    <td>{t.date}</td>
                    <td><window.FinStatus status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Card>
        <TransferModal open={xfer} onClose={() => setXfer(false)} />
      </div>
    );
  }

  Object.assign(window, { TreasuryBanks, TreasuryPosition, TreasuryTransfers });
})();
