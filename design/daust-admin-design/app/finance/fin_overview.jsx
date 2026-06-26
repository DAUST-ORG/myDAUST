// ============================================================
// DAUST Admin — Finance › Overview
// ============================================================
(function () {

  function FinOverview({ go, goFin }) {
    const F = window.FINANCE;
    const arTotal = window.AR_AGING.reduce((a, d) => a + d.amount, 0);
    const net = F.revenue.reduce((a, b) => a + b, 0) - F.expense.reduce((a, b) => a + b, 0);
    const topOutstanding = window.STUDENTS.filter(s => s.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 5);
    const recent = window.TRANSACTIONS.slice(0, 6);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px,1fr))', gap: 16 }}>
          <Stat label="Cash on hand" value={<FCFA value={F.cashOnHand} short />} delta="CBAO + mobile" deltaTone="flat" icon="landmark" />
          <Stat label="Net position (term)" value={<FCFA value={net} short />} delta="+12.4%" deltaTone="up" icon="trending-up" />
          <Stat label="Collected YTD" value={<FCFA value={F.tuitionCollected} short />} delta="80% of billed" deltaTone="up" icon="check-circle-2" />
          <Stat label="A/R outstanding" value={<FCFA value={arTotal} short />} delta="558 accounts" deltaTone="down" icon="alert-circle" />
          <Stat label="Payables due" value={<FCFA value={286_400_000} short />} delta="9 bills" deltaTone="flat" icon="file-text" />
        </div>

        {/* Cash flow + AR aging */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.55fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
          <Panel title="Revenue vs. expenditure" action={<Button variant="ghost" size="sm" iconRight="arrow-right" onClick={() => goFin('reports')}>Statements</Button>}>
            <div style={{ display: 'flex', gap: 22, marginBottom: 10 }}>
              <Legend color="var(--accent)" label="Revenue" />
              <Legend color="var(--slate-400)" label="Expenditure" dashed />
            </div>
            <AreaChart labels={window.MONTHS} series={[{ name: 'Revenue', data: F.revenue }, { name: 'Expenditure', data: F.expense, dashed: true }]} colors={['var(--accent)', 'var(--slate-400)']} format={v => fmtFCFA(v, { short: true })} height={232} />
          </Panel>

          <Panel title="Accounts receivable aging" action={<Button variant="ghost" size="sm" iconRight="arrow-right" onClick={() => goFin('receivables')}>Manage</Button>}>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}><FCFA value={arTotal} /></div>
            <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginBottom: 14 }}>across 558 student accounts</div>
            <AgingBar data={window.AR_AGING} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 16 }}>
              {window.AR_AGING.map(d => (
                <div key={d.bucket} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                  <span style={{ color: 'var(--fg-muted)', flex: 1 }}>{d.bucket}</span>
                  <span style={{ color: 'var(--fg-faint)', fontSize: 12 }}>{d.count}</span>
                  <b style={{ color: 'var(--fg)', minWidth: 64, textAlign: 'right' }}>{fmtFCFA(d.amount, { short: true })}</b>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* Top outstanding + recent transactions */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)', gap: 20, alignItems: 'start' }}>
          <Panel title="Top outstanding accounts" action={<Button variant="ghost" size="sm" iconRight="arrow-right" onClick={() => goFin('receivables')}>All</Button>}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {topOutstanding.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 0', borderBottom: i < 4 ? '1px solid var(--divider)' : 'none' }}>
                  <window.Avatar name={s.name} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg)' }}>{s.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', fontFamily: 'var(--font-mono)' }}>{s.id} · {s.program}</div>
                  </div>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--error-500)' }}><FCFA value={s.balance} /></span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Recent payments" action={<Button variant="ghost" size="sm" iconRight="arrow-right" onClick={() => goFin('payments')}>Ledger</Button>}>
            <div style={{ overflowX: 'auto', margin: '-4px -4px 0' }}>
              <table className="dt">
                <tbody>
                  {recent.map(t => (
                    <tr key={t.id}>
                      <td style={{ paddingLeft: 4 }}><div style={{ fontWeight: 600, color: 'var(--fg)' }}>{t.student}</div><div style={{ fontSize: 11.5, color: 'var(--fg-faint)', fontFamily: 'var(--font-mono)' }}>{t.id}</div></td>
                      <td><MethodTag method={t.method} /></td>
                      <td style={{ fontWeight: 700, color: 'var(--fg)' }}><FCFA value={t.amount} /></td>
                      <td style={{ paddingRight: 4 }}><FinStatus status={t.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  function Legend({ color, label, dashed }) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--fg-subtle)' }}>
      <span style={{ width: 18, height: 0, borderTop: `2.5px ${dashed ? 'dashed' : 'solid'} ${color}` }} />{label}</span>;
  }

  Object.assign(window, { FinOverview });
})();
