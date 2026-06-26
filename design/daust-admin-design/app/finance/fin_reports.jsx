// ============================================================
// DAUST Admin — Finance › Reports (financial statements)
// ============================================================
(function () {
  const { useState, useEffect, useRef } = React;

  function Reports({ goFin }) {
    const [stmt, setStmt] = useState('pl');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <Segmented options={[{ value: 'pl', label: 'Income statement' }, { value: 'bs', label: 'Balance sheet' }, { value: 'cf', label: 'Cash flow' }]} value={stmt} onChange={setStmt} />
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="outline" icon="calendar">FY 2025–26</Button>
            <Button variant="outline" icon="printer">Print</Button>
            <Button variant="primary" icon="download">Export PDF</Button>
          </div>
        </div>
        {stmt === 'pl' && <IncomeStatement />}
        {stmt === 'bs' && <BalanceSheet />}
        {stmt === 'cf' && <CashFlow />}
      </div>
    );
  }

  function StatementShell({ title, sub, children, right }) {
    return (
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '22px 26px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><window.Icon name="graduation-cap" size={18} style={{ color: 'var(--accent)' }} /><span style={{ fontWeight: 700, fontSize: 14 }}>DAUST</span></div>
            <h2 style={{ fontSize: 22, marginTop: 12 }}>{title}</h2>
            <div style={{ fontSize: 13, color: 'var(--fg-subtle)', marginTop: 2 }}>{sub}</div>
          </div>
          {right}
        </div>
        <div style={{ padding: '8px 26px 24px', maxWidth: 760 }}>{children}</div>
      </Card>
    );
  }

  function Line({ label, value, indent, strong, top, color, pct }) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: strong ? '12px 0' : '7px 0',
        paddingLeft: indent ? 22 : 0, borderTop: top ? '1px solid var(--border-strong)' : 'none', marginTop: top ? 4 : 0 }}>
        <span style={{ fontSize: strong ? 14.5 : 13.5, fontWeight: strong ? 700 : 400, color: strong ? 'var(--fg)' : 'var(--fg-muted)' }}>{label}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          {pct != null && <span style={{ fontSize: 11.5, color: 'var(--fg-faint)', minWidth: 40, textAlign: 'right' }}>{pct}</span>}
          <span style={{ fontSize: strong ? 15 : 13.5, fontWeight: strong ? 800 : 600, color: color || 'var(--fg)', fontFamily: 'var(--font-mono)', minWidth: 130, textAlign: 'right' }}>{typeof value === 'number' ? fmtFCFA(value) : value}</span>
        </span>
      </div>
    );
  }
  function GroupHead({ children }) {
    return <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 18, marginBottom: 2 }}>{children}</div>;
  }

  function IncomeStatement() {
    const tuition = 5_240_000_000, grants = 640_000_000, aux = 412_000_000;
    const totalRev = tuition + grants + aux;
    const salaries = 2_640_000_000, facilities = 1_120_000_000, aid = 980_000_000, supplies = 520_000_000;
    const totalExp = salaries + facilities + aid + supplies;
    const net = totalRev - totalExp;
    const pc = v => Math.round(v / totalRev * 100) + '%';
    return (
      <StatementShell title="Income Statement" sub="For the fiscal year ending 31 August 2026 · FCFA" right={<Badge tone="info" dot={false}>Unaudited</Badge>}>
        <GroupHead>Revenue</GroupHead>
        <Line label="Tuition & fees" value={tuition} indent pct={pc(tuition)} />
        <Line label="Grants & contracts" value={grants} indent pct={pc(grants)} />
        <Line label="Auxiliary (housing)" value={aux} indent pct={pc(aux)} />
        <Line label="Total revenue" value={totalRev} strong top />
        <GroupHead>Operating expenses</GroupHead>
        <Line label="Salaries & benefits" value={salaries} indent pct={pc(salaries)} />
        <Line label="Facilities & utilities" value={facilities} indent pct={pc(facilities)} />
        <Line label="Financial aid" value={aid} indent pct={pc(aid)} />
        <Line label="Supplies & services" value={supplies} indent pct={pc(supplies)} />
        <Line label="Total expenses" value={totalExp} strong top />
        <Line label="Net operating surplus" value={net} strong top color="var(--success-500)" />
        <div style={{ marginTop: 22 }}>
          <div style={{ fontSize: 12, color: 'var(--fg-subtle)', marginBottom: 8 }}>Monthly net trend</div>
          <AreaChart labels={window.MONTHS} series={[{ name: 'Net', data: window.FINANCE.revenue.map((r, i) => r - window.FINANCE.expense[i]) }]} colors={['var(--accent)']} format={v => fmtFCFA(v, { short: true })} height={150} />
        </div>
      </StatementShell>
    );
  }

  function BalanceSheet() {
    const A = window.ACCOUNTS;
    const sum = t => A.filter(a => a.type === t).reduce((s, a) => s + a.balance, 0);
    const assets = sum('Asset'), liab = sum('Liability'), equity = sum('Equity');
    return (
      <StatementShell title="Balance Sheet" sub="As of 28 May 2026 · FCFA" right={<Badge tone="info" dot={false}>Unaudited</Badge>}>
        <GroupHead>Assets</GroupHead>
        {A.filter(a => a.type === 'Asset').map(a => <Line key={a.code} label={a.name} value={a.balance} indent />)}
        <Line label="Total assets" value={assets} strong top />
        <GroupHead>Liabilities</GroupHead>
        {A.filter(a => a.type === 'Liability').map(a => <Line key={a.code} label={a.name} value={a.balance} indent />)}
        <Line label="Total liabilities" value={liab} strong top />
        <GroupHead>Net assets (equity)</GroupHead>
        {A.filter(a => a.type === 'Equity').map(a => <Line key={a.code} label={a.name} value={a.balance} indent />)}
        <Line label="Total net assets" value={equity} strong top />
        <Line label="Liabilities + net assets" value={liab + equity} strong top color="var(--accent)" />
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--success-500)', fontWeight: 600 }}>
          <Icon name="check-circle-2" size={16} /> Balances ({fmtFCFA(assets)} = {fmtFCFA(liab + equity)})
        </div>
      </StatementShell>
    );
  }

  function CashFlow() {
    const ops = 1_640_000_000, inv = -820_000_000, fin = 210_000_000;
    const open = 1_080_000_000;
    const net = ops + inv + fin;
    return (
      <StatementShell title="Statement of Cash Flows" sub="For the period ending 28 May 2026 · FCFA" right={<Badge tone="info" dot={false}>Unaudited</Badge>}>
        <GroupHead>Operating activities</GroupHead>
        <Line label="Tuition & fees collected" value={4_185_600_000} indent />
        <Line label="Grants received" value={420_000_000} indent />
        <Line label="Salaries & benefits paid" value={-2_180_000_000} indent color="var(--fg-muted)" />
        <Line label="Suppliers & utilities paid" value={-785_600_000} indent color="var(--fg-muted)" />
        <Line label="Net cash from operations" value={ops} strong top color="var(--success-500)" />
        <GroupHead>Investing activities</GroupHead>
        <Line label="Equipment & facilities" value={-620_000_000} indent color="var(--fg-muted)" />
        <Line label="Endowment contributions" value={-200_000_000} indent color="var(--fg-muted)" />
        <Line label="Net cash used in investing" value={inv} strong top color="var(--error-500)" />
        <GroupHead>Financing activities</GroupHead>
        <Line label="Restricted gifts" value={fin} indent />
        <Line label="Net cash from financing" value={fin} strong top />
        <Line label="Net change in cash" value={net} strong top />
        <Line label="Opening cash" value={open} indent />
        <Line label="Closing cash" value={open + net} strong top color="var(--accent)" />
      </StatementShell>
    );
  }

  Object.assign(window, { FinReports: Reports });
})();
