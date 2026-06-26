// ============================================================
// DAUST Admin — Finance & Accounting module
// ============================================================
const { useState: useStateFin } = React;

function StatusPill({ status }) {
  const map = {
    Paid: 'success', Pending: 'warning', Overdue: 'error', Partial: 'info',
    Active: 'success', 'On Leave': 'warning',
  };
  return <Badge tone={map[status] || 'neutral'}>{status}</Badge>;
}

function FinanceOverview({ go }) {
  const F = window.FINANCE;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <Stat label="Tuition Billed (YTD)" value={<FCFA value={F.tuitionBilled} short />} delta="2,890 invoices" deltaTone="flat" icon="file-text" />
        <Stat label="Collected" value={<FCFA value={F.tuitionCollected} short />} delta="80% rate" deltaTone="up" icon="check-circle-2" />
        <Stat label="Outstanding" value={<FCFA value={F.outstanding} short />} delta="118 accounts" deltaTone="down" icon="alert-circle" />
        <Stat label="Net this term" value={<FCFA value={F.revenue.reduce((a,b)=>a+b,0) - F.expense.reduce((a,b)=>a+b,0)} short />} delta="+12.4%" deltaTone="up" icon="trending-up" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
        <Card padding={22}>
          <SectionTitle action={<Segmented size="sm" options={['Monthly', 'Quarterly']} value="Monthly" onChange={() => {}} />}>Cash flow</SectionTitle>
          <BarChart data={window.FINANCE.revenue} labels={window.MONTHS} color="var(--accent)" format={v => fmtFCFA(v, { short: true })} height={230} />
        </Card>
        <Card padding={22}>
          <SectionTitle>Payment methods</SectionTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <Donut size={148} thickness={20} centerLabel="80%" centerSub="collected" segments={[
              { label: 'Orange Money', value: 38, color: '#F97316' },
              { label: 'Bank Transfer', value: 31, color: '#153B6A' },
              { label: 'Wave', value: 19, color: '#0EA5E9' },
              { label: 'Card', value: 12, color: '#8B5CF6' },
            ]} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[['Orange Money', 38, '#F97316'], ['Bank Transfer', 31, '#153B6A'], ['Wave', 19, '#0EA5E9'], ['Card', 12, '#8B5CF6']].map(([l, v, c]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: c }} />
                  <span style={{ color: 'var(--fg-muted)', flex: 1 }}>{l}</span><b>{v}%</b>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function InvoicesTab() {
  const [q, setQ] = useStateFin('');
  const [filter, setFilter] = useStateFin('All');
  const [sel, setSel] = useStateFin(null);
  const [showCreate, setShowCreate] = useStateFin(false);
  const rows = window.INVOICES.filter(inv =>
    (filter === 'All' || inv.status === filter) &&
    (inv.student.toLowerCase().includes(q.toLowerCase()) || inv.id.toLowerCase().includes(q.toLowerCase()))
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <SearchInput placeholder="Search invoice or student…" value={q} onChange={setQ} width={280} />
        <Segmented size="sm" options={['All', 'Paid', 'Pending', 'Overdue', 'Partial']} value={filter} onChange={setFilter} />
        <div style={{ flex: 1 }} />
        <Button variant="outline" icon="download" size="md">Export CSV</Button>
        <Button variant="primary" icon="plus" size="md" onClick={() => setShowCreate(true)}>New Invoice</Button>
      </div>

      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="dt">
            <thead><tr>
              <th>Invoice</th><th>Student</th><th>Program</th><th>Amount</th><th>Method</th><th>Due</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {rows.map(inv => (
                <tr key={inv.id} style={{ cursor: 'pointer' }} onClick={() => setSel(inv)}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--fg)' }}>{inv.id}</td>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Avatar name={inv.student} size={28} /><span style={{ color: 'var(--fg)', fontWeight: 600 }}>{inv.student}</span></div></td>
                  <td><Badge tone="neutral" dot={false} size="sm">{inv.program}</Badge></td>
                  <td style={{ color: 'var(--fg)', fontWeight: 600 }}><FCFA value={inv.amount} /></td>
                  <td>{inv.method}</td>
                  <td>{inv.due}</td>
                  <td><StatusPill status={inv.status} /></td>
                  <td style={{ textAlign: 'right' }}><Icon name="chevron-right" size={16} style={{ color: 'var(--fg-faint)' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <EmptyState icon="receipt" title="No invoices found" sub="Try a different search or filter." />}
      </Card>

      <Drawer open={!!sel} onClose={() => setSel(null)} title={sel ? sel.id : ''} width={460}
        footer={<><Button variant="outline" icon="printer">Print</Button><Button variant="primary" icon="send">Send reminder</Button></>}>
        {sel && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar name={sel.student} size={46} />
                <div><div style={{ fontWeight: 700, fontSize: 16 }}>{sel.student}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)' }}>{sel.studentId}</div></div>
              </div>
              <StatusPill status={sel.status} />
            </div>
            <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)', padding: 18, textAlign: 'center' }}>
              <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginBottom: 4 }}>Amount due</div>
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}><FCFA value={sel.amount} /></div>
            </div>
            <DetailRow label="Program" value={sel.program} />
            <DetailRow label="Due date" value={sel.due} />
            <DetailRow label="Payment method" value={sel.method} />
            <DetailRow label="Term" value="Spring 2026" />
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 8 }}>Line items</div>
              <LineItem label="Tuition — base" value={sel.amount * 0.82} />
              <LineItem label="Lab & technology fee" value={sel.amount * 0.12} />
              <LineItem label="Student services" value={sel.amount * 0.06} />
            </div>
          </div>
        )}
      </Drawer>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New invoice" width={480}
        footer={<><Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button><Button variant="primary" icon="check" onClick={() => setShowCreate(false)}>Create invoice</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Student"><Input placeholder="Search by name or ID…" /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Term"><Select options={['Spring 2026', 'Fall 2026']} /></Field>
            <Field label="Amount (FCFA)"><Input type="number" placeholder="1 925 000" /></Field>
          </div>
          <Field label="Due date"><Input type="date" defaultValue="2026-06-15" /></Field>
          <Field label="Notes" hint="Optional — shown to the student"><textarea rows={3} style={{ padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)', fontFamily: 'var(--font-sans)', fontSize: 13.5, resize: 'vertical' }} /></Field>
        </div>
      </Modal>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--divider)', fontSize: 13.5 }}>
      <span style={{ color: 'var(--fg-subtle)' }}>{label}</span><b style={{ color: 'var(--fg)' }}>{value}</b>
    </div>
  );
}
function LineItem({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 13.5, color: 'var(--fg-muted)' }}>
      <span>{label}</span><span style={{ fontFamily: 'var(--font-mono)' }}>{fmtFCFA(value)}</span>
    </div>
  );
}

function PayrollTab() {
  const total = window.STAFF.reduce((a, s) => a + s.salary, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 16 }}>
        <Stat label="Monthly payroll" value={<FCFA value={window.FINANCE.payrollMonthly} short />} icon="wallet" delta="142 employees" deltaTone="flat" />
        <Stat label="Next run" value="Jun 1" icon="calendar" delta="3 days" deltaTone="flat" />
        <Stat label="Avg. salary" value={fmtFCFA(total / window.STAFF.length, { short: true }) + ' FCFA'} icon="bar-chart-2" delta="full-time" deltaTone="flat" />
      </div>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>May 2026 payroll run</h3>
          <Button variant="primary" size="sm" icon="play">Process run</Button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dt">
            <thead><tr><th>Employee</th><th>Department</th><th>Role</th><th>Type</th><th>Gross salary</th><th>Status</th></tr></thead>
            <tbody>
              {window.STAFF.map(s => (
                <tr key={s.id}>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Avatar name={s.name} size={28} /><span style={{ color: 'var(--fg)', fontWeight: 600 }}>{s.name}</span></div></td>
                  <td>{s.dept}</td><td>{s.role}</td>
                  <td><Badge tone={s.type === 'Full-time' ? 'teal' : 'neutral'} dot={false} size="sm">{s.type}</Badge></td>
                  <td style={{ fontWeight: 600, color: 'var(--fg)' }}><FCFA value={s.salary} /></td>
                  <td><StatusPill status={s.status === 'On Leave' ? 'On Leave' : 'Pending'} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function BudgetTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card padding={22}>
        <SectionTitle action={<Button variant="outline" size="sm" icon="sliders-horizontal">Adjust allocations</Button>}>FY 2025–26 budget · by category</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {window.BUDGET.map(b => {
            const pct = Math.round((b.spent / b.allocated) * 100);
            const over = pct > 92;
            return (
              <div key={b.category}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color }} />{b.category}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--fg-subtle)' }}>
                    <b style={{ color: 'var(--fg)' }}><FCFA value={b.spent} short /></b> / <FCFA value={b.allocated} short /> · <span style={{ color: over ? 'var(--error-500)' : 'var(--success-500)', fontWeight: 600 }}>{pct}%</span>
                  </span>
                </div>
                <Progress value={b.spent} max={b.allocated} tone={over ? 'error' : 'teal'} height={9} />
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Finance({ go }) {
  const [tab, setTab] = useStateFin('overview');
  return (
    <div className="fade-in">
      <PageHeader eyebrow="Finance & Accounting" title="Finance" subtitle="Tuition, invoicing, payroll and institutional budget — all in one ledger."
        actions={<Button variant="outline" icon="calendar">FY 2025–26</Button>} />
      <Tabs tabs={[{ value: 'overview', label: 'Overview' }, { value: 'invoices', label: 'Invoices' }, { value: 'payroll', label: 'Payroll' }, { value: 'budget', label: 'Budget' }]} active={tab} onChange={setTab} />
      {tab === 'overview' && <FinanceOverview go={go} />}
      {tab === 'invoices' && <InvoicesTab />}
      {tab === 'payroll' && <PayrollTab />}
      {tab === 'budget' && <BudgetTab />}
    </div>
  );
}

Object.assign(window, { Finance, StatusPill, DetailRow });
