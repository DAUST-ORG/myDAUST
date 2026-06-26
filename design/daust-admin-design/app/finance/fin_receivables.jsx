// ============================================================
// DAUST Admin — Finance › Receivables (invoices, plans, holds)
// ============================================================
(function () {
  const { useState, useEffect, useRef } = React;

  function Receivables({ goFin }) {
    const [tab, setTab] = useState('invoices');
    return (
      <div>
        <Tabs tabs={[{ value: 'invoices', label: 'Invoices' }, { value: 'plans', label: 'Payment plans' }, { value: 'holds', label: 'Holds' }, { value: 'aging', label: 'Aging report' }]} active={tab} onChange={setTab} />
        {tab === 'invoices' && <InvoicesView />}
        {tab === 'plans' && <PlansView />}
        {tab === 'holds' && <HoldsView />}
        {tab === 'aging' && <AgingView />}
      </div>
    );
  }

  function InvoicesView() {
    const [q, setQ] = useState('');
    const [filter, setFilter] = useState('All');
    const [sel, setSel] = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    const [payOpen, setPayOpen] = useState(false);
    const rows = window.INVOICES.filter(inv => (filter === 'All' || inv.status === filter) && (inv.student.toLowerCase().includes(q.toLowerCase()) || inv.id.toLowerCase().includes(q.toLowerCase())));
    const totals = window.INVOICES.reduce((a, i) => { a[i.status] = (a[i.status] || 0) + i.amount; return a; }, {});

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 12 }}>
          <MiniTile label="Billed" value={window.FINANCE.tuitionBilled} tone="neutral" icon="file-text" />
          <MiniTile label="Collected" value={window.FINANCE.tuitionCollected} tone="success" icon="check-circle-2" />
          <MiniTile label="Pending" value={totals.Pending || 0} tone="warning" icon="clock" />
          <MiniTile label="Overdue" value={totals.Overdue || 0} tone="error" icon="alert-triangle" />
        </div>

        <Toolbar>
          <SearchInput placeholder="Search invoice or student…" value={q} onChange={setQ} width={280} />
          <Segmented size="sm" options={['All', 'Paid', 'Pending', 'Overdue', 'Partial']} value={filter} onChange={setFilter} />
          <div style={{ flex: 1 }} />
          <Button variant="outline" icon="download" size="md">Export CSV</Button>
          <Button variant="primary" icon="plus" size="md" onClick={() => setShowCreate(true)}>New invoice</Button>
        </Toolbar>

        <Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Invoice</th><th>Student</th><th>Program</th><th>Amount</th><th>Method</th><th>Due</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.map(inv => (
                  <tr key={inv.id} style={{ cursor: 'pointer' }} onClick={() => setSel(inv)}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--fg)' }}>{inv.id}</td>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Avatar name={inv.student} size={28} /><span style={{ color: 'var(--fg)', fontWeight: 600 }}>{inv.student}</span></div></td>
                    <td><Badge tone="neutral" dot={false} size="sm">{inv.program}</Badge></td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}><FCFA value={inv.amount} /></td>
                    <td>{inv.method === '—' ? <span style={{ color: 'var(--fg-faint)' }}>—</span> : <MethodTag method={inv.method} />}</td>
                    <td>{inv.due}</td>
                    <td><FinStatus status={inv.status} /></td>
                    <td style={{ textAlign: 'right' }}><Icon name="chevron-right" size={16} style={{ color: 'var(--fg-faint)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <EmptyState icon="receipt" title="No invoices found" sub="Try a different search or filter." />}
        </Card>

        {/* Invoice detail drawer */}
        <Drawer open={!!sel} onClose={() => setSel(null)} title={sel ? sel.id : ''} width={500}
          footer={sel && <><Button variant="outline" icon="printer">Print</Button><Button variant="outline" icon="send">Reminder</Button><Button variant="primary" icon="banknote" onClick={() => setPayOpen(true)}>Record payment</Button></>}>
          {sel && <InvoiceDetail inv={sel} />}
        </Drawer>

        {/* Record payment modal */}
        <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Record payment" width={440}
          footer={<><Button variant="ghost" onClick={() => setPayOpen(false)}>Cancel</Button><Button variant="primary" icon="check" onClick={() => setPayOpen(false)}>Post payment</Button></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {sel && <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', padding: '12px 14px', fontSize: 13 }}>Invoice <b style={{ fontFamily: 'var(--font-mono)' }}>{sel.id}</b> · {sel.student}</div>}
            <Field label="Amount received (FCFA)"><Input type="number" defaultValue={sel ? sel.amount : ''} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Method"><Select options={['Orange Money', 'Wave', 'Bank Transfer', 'Card', 'Cash']} /></Field>
              <Field label="Date"><Input type="date" defaultValue="2026-05-29" /></Field>
            </div>
            <Field label="Reference / receipt no."><Input placeholder="e.g. OM-748210" /></Field>
          </div>
        </Modal>

        {/* Create invoice */}
        <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New invoice" width={480}
          footer={<><Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button><Button variant="primary" icon="check" onClick={() => setShowCreate(false)}>Create invoice</Button></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Student"><Input placeholder="Search by name or ID…" /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Term"><Select options={['Spring 2026', 'Fall 2026']} /></Field>
              <Field label="Fee type"><Select options={['Tuition', 'Housing', 'Lab fee', 'Application']} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Amount (FCFA)"><Input type="number" placeholder="1 925 000" /></Field>
              <Field label="Due date"><Input type="date" defaultValue="2026-06-15" /></Field>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  function InvoiceDetail({ inv }) {
    const paid = inv.status === 'Paid' ? inv.amount : inv.status === 'Partial' ? Math.round(inv.amount * 0.5) : 0;
    const bal = inv.amount - paid;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar name={inv.student} size={46} />
            <div><div style={{ fontWeight: 700, fontSize: 16 }}>{inv.student}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)' }}>{inv.studentId}</div></div>
          </div>
          <FinStatus status={inv.status} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)', padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>Invoice total</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}><FCFA value={inv.amount} /></div>
          </div>
          <div style={{ background: bal > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.10)', borderRadius: 'var(--radius-lg)', padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>Balance due</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: bal > 0 ? 'var(--error-500)' : 'var(--success-500)' }}>{bal > 0 ? <FCFA value={bal} /> : 'Paid'}</div>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 8 }}>Line items</div>
          <LineItem label="Tuition — base" value={inv.amount * 0.82} />
          <LineItem label="Lab & technology fee" value={inv.amount * 0.12} />
          <LineItem label="Student services" value={inv.amount * 0.06} />
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', fontSize: 14, fontWeight: 700, borderTop: '1px solid var(--border)', marginTop: 4 }}>
            <span>Total</span><span><FCFA value={inv.amount} /></span>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 8 }}>Payment history</div>
          {paid > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--divider)' }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(16,185,129,0.12)', color: 'var(--success-500)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={15} /></span>
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{inv.method !== '—' ? inv.method : 'Bank Transfer'}</div><div style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>2026-02-14</div></div>
              <span style={{ fontWeight: 700, color: 'var(--fg)' }}><FCFA value={paid} /></span>
            </div>
          ) : <div style={{ fontSize: 13, color: 'var(--fg-faint)', padding: '8px 0' }}>No payments recorded yet.</div>}
        </div>

        <div>
          <KV label="Program" value={inv.program} />
          <KV label="Due date" value={inv.due} />
          <KV label="Term" value="Spring 2026" />
        </div>
      </div>
    );
  }

  function LineItem({ label, value }) {
    return <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 13.5, color: 'var(--fg-muted)' }}><span>{label}</span><span style={{ fontFamily: 'var(--font-mono)' }}>{fmtFCFA(value)}</span></div>;
  }

  function MiniTile({ label, value, tone, icon }) {
    const c = { success: 'var(--success-500)', warning: 'var(--warning-500)', error: 'var(--error-500)', neutral: 'var(--fg-subtle)' }[tone];
    return (
      <Card padding={16} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 38, height: 38, borderRadius: 'var(--radius-md)', background: 'var(--bg-subtle)', color: c, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={icon} size={18} /></span>
        <div style={{ minWidth: 0 }}><div style={{ fontSize: 17, fontWeight: 800, color: 'var(--fg)' }}>{fmtFCFA(value, { short: true })} <span style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>FCFA</span></div><div style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>{label}</div></div>
      </Card>
    );
  }

  // ---- Payment plans ----
  function PlansView() {
    return (
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="dt">
            <thead><tr><th>Plan</th><th>Student</th><th>Total</th><th>Per installment</th><th>Progress</th><th>Next due</th><th>Status</th></tr></thead>
            <tbody>
              {window.PAYMENT_PLANS.map(p => (
                <tr key={p.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--fg)' }}>{p.id}</td>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Avatar name={p.student} size={28} /><span style={{ color: 'var(--fg)', fontWeight: 600 }}>{p.student}</span></div></td>
                  <td style={{ fontWeight: 600, color: 'var(--fg)' }}><FCFA value={p.total} /></td>
                  <td><FCFA value={p.perInstallment} /></td>
                  <td style={{ minWidth: 150 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Progress value={p.paid} max={p.installments} tone={p.status === 'Behind' ? 'error' : 'teal'} height={6} />
                      <span style={{ fontSize: 12, color: 'var(--fg-subtle)', whiteSpace: 'nowrap' }}>{p.paid}/{p.installments}</span>
                    </div>
                  </td>
                  <td>{p.nextDue}</td>
                  <td><FinStatus status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  // ---- Holds ----
  function HoldsView() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-lg)', padding: '12px 16px' }}>
          <Icon name="lock" size={18} style={{ color: 'var(--error-500)' }} />
          <span style={{ fontSize: 13.5, color: 'var(--fg-muted)' }}><b style={{ color: 'var(--fg)' }}>{window.HOLDS.length} active holds</b> — accounts over 1M FCFA outstanding are auto-flagged and blocked from registration & transcripts.</span>
        </div>
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Student</th><th>Program</th><th>Balance</th><th>Reason</th><th>Blocks</th><th>Placed</th><th></th></tr></thead>
              <tbody>
                {window.HOLDS.map(h => (
                  <tr key={h.studentId}>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Avatar name={h.student} size={28} /><div><div style={{ color: 'var(--fg)', fontWeight: 600 }}>{h.student}</div><div style={{ fontSize: 11.5, color: 'var(--fg-faint)', fontFamily: 'var(--font-mono)' }}>{h.studentId}</div></div></div></td>
                    <td><Badge tone="neutral" dot={false} size="sm">{h.program}</Badge></td>
                    <td style={{ fontWeight: 700, color: 'var(--error-500)' }}><FCFA value={h.balance} /></td>
                    <td>{h.reason}</td>
                    <td><Badge tone="error" dot={false} size="sm">{h.blocks}</Badge></td>
                    <td>{h.placed}</td>
                    <td style={{ textAlign: 'right' }}><Button variant="outline" size="sm" icon="unlock">Release</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  // ---- Aging report ----
  function AgingView() {
    const total = window.AR_AGING.reduce((a, d) => a + d.amount, 0);
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)', gap: 20, alignItems: 'start' }}>
        <Panel title="Aging summary">
          <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}><FCFA value={total} /></div>
          <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginBottom: 16 }}>total receivable · 558 accounts</div>
          <AgingBar data={window.AR_AGING} height={16} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
            {window.AR_AGING.map(d => (
              <div key={d.bucket} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color }} />
                <span style={{ flex: 1, fontSize: 13.5, color: 'var(--fg-muted)' }}>{d.bucket}</span>
                <span style={{ fontSize: 12, color: 'var(--fg-faint)' }}>{d.count} accts</span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--fg)', minWidth: 90, textAlign: 'right' }}><FCFA value={d.amount} /></span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="By program">
          <table className="dt" style={{ margin: '-4px 0' }}>
            <thead><tr><th>Program</th><th>Students owing</th><th>Outstanding</th></tr></thead>
            <tbody>
              {window.PROGRAMS.slice(0, 7).map((p, i) => {
                const owing = 12 + (i * 9) % 40;
                const amt = (window.AR_AGING[i % 5].amount) * (0.6 + (i % 3) * 0.2) / 3;
                return <tr key={p.code}><td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: p.color }} />{p.name}</span></td><td>{owing}</td><td style={{ fontWeight: 600, color: 'var(--fg)' }}><FCFA value={amt} /></td></tr>;
              })}
            </tbody>
          </table>
        </Panel>
      </div>
    );
  }

  Object.assign(window, { Receivables });
})();
