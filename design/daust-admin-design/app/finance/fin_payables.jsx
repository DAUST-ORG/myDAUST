// ============================================================
// DAUST Admin — Finance › Payables (bills, POs, reimbursements)
// ============================================================
(function () {
  const { useState, useEffect, useRef } = React;

  function Payables({ goFin }) {
    const [tab, setTab] = useState('bills');
    const bills = window.BILLS;
    const due = bills.filter(b => b.status !== 'Paid').reduce((a, b) => a + b.amount, 0);
    const pendingApproval = bills.filter(b => b.status === 'Pending').length;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 16 }}>
          <window.Stat label="Outstanding payables" value={<FCFA value={due} short />} delta={bills.filter(b => b.status !== 'Paid').length + ' open bills'} deltaTone="flat" icon="file-text" />
          <window.Stat label="Pending approval" value={pendingApproval} delta="needs sign-off" deltaTone="down" icon="clock" />
          <window.Stat label="Open POs" value={window.PURCHASE_ORDERS.filter(p => p.status !== 'Received').length} delta="this term" deltaTone="flat" icon="shopping-cart" />
          <window.Stat label="Reimbursements" value={window.REIMBURSEMENTS.filter(r => r.status === 'Pending').length} delta="awaiting" deltaTone="flat" icon="undo-2" />
        </div>

        <div>
          <Tabs tabs={[{ value: 'bills', label: 'Vendor bills' }, { value: 'po', label: 'Purchase orders' }, { value: 'reimb', label: 'Reimbursements' }]} active={tab} onChange={setTab} />
          {tab === 'bills' && <BillsView />}
          {tab === 'po' && <POView />}
          {tab === 'reimb' && <ReimbView />}
        </div>
      </div>
    );
  }

  function BillsView() {
    const [filter, setFilter] = useState('All');
    const [sel, setSel] = useState(null);
    const rows = window.BILLS.filter(b => filter === 'All' || b.status === filter);
    return (
      <div>
        <Toolbar>
          <Segmented size="sm" options={['All', 'Pending', 'Approved', 'Paid', 'Overdue']} value={filter} onChange={setFilter} />
          <div style={{ flex: 1 }} />
          <Button variant="primary" icon="plus" size="md">New bill</Button>
        </Toolbar>
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Bill</th><th>Vendor</th><th>Category</th><th>PO</th><th>Amount</th><th>Due</th><th>Approver</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.map(b => (
                  <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => setSel(b)}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{b.id}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{b.vendor}</td>
                    <td><Badge tone="neutral" dot={false} size="sm">{b.category}</Badge></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-subtle)' }}>{b.po}</td>
                    <td style={{ fontWeight: 700, color: 'var(--fg)' }}><FCFA value={b.amount} /></td>
                    <td>{b.due}</td>
                    <td>{b.approver}</td>
                    <td><FinStatus status={b.status} /></td>
                    <td style={{ textAlign: 'right' }}><Icon name="chevron-right" size={16} style={{ color: 'var(--fg-faint)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Drawer open={!!sel} onClose={() => setSel(null)} title={sel ? sel.id : ''} width={440}
          footer={sel && (sel.status === 'Pending' ? <><Button variant="danger" icon="x">Reject</Button><Button variant="primary" icon="check">Approve</Button></> : sel.status === 'Approved' ? <Button variant="primary" icon="banknote">Schedule payment</Button> : <Button variant="outline" icon="printer">Receipt</Button>)}>
          {sel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)', padding: 18, textAlign: 'center' }}>
                <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{sel.vendor}</div>
                <div style={{ fontSize: 28, fontWeight: 800, margin: '6px 0' }}><FCFA value={sel.amount} /></div>
                <FinStatus status={sel.status} />
              </div>
              <div>
                <KV label="Category" value={sel.category} />
                <KV label="Purchase order" value={sel.po} mono />
                <KV label="Due date" value={sel.due} />
                <KV label="Approver" value={sel.approver} />
                <KV label="GL account" value="5200 Facilities & Utilities" />
              </div>
              {sel.status === 'Pending' && <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'rgba(245,158,11,0.1)', borderRadius: 'var(--radius-md)', padding: '11px 14px', fontSize: 13, color: 'var(--fg-muted)' }}><Icon name="alert-triangle" size={16} style={{ color: 'var(--warning-500)' }} />Requires approval before payment can be scheduled.</div>}
            </div>
          )}
        </Drawer>
      </div>
    );
  }

  function POView() {
    return (
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="dt">
            <thead><tr><th>PO</th><th>Description</th><th>Vendor</th><th>Department</th><th>Amount</th><th>Raised</th><th>Status</th></tr></thead>
            <tbody>
              {window.PURCHASE_ORDERS.map(p => (
                <tr key={p.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{p.id}</td>
                  <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{p.desc}</td>
                  <td>{p.vendor}</td>
                  <td><Badge tone="neutral" dot={false} size="sm">{p.dept}</Badge></td>
                  <td style={{ fontWeight: 700, color: 'var(--fg)' }}><FCFA value={p.amount} /></td>
                  <td>{p.raised}</td>
                  <td><FinStatus status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  function ReimbView() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {window.REIMBURSEMENTS.map(rb => (
          <Card key={rb.id} padding={16} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Avatar name={rb.staff} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--fg)' }}>{rb.desc}</div>
              <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{rb.staff} · {rb.id} · {rb.date}</div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--fg)' }}><FCFA value={rb.amount} /></div>
            <div style={{ width: 92, display: 'flex', justifyContent: 'flex-end' }}><FinStatus status={rb.status} /></div>
            {rb.status === 'Pending' ? <Button variant="primary" size="sm" icon="check">Approve</Button> : <span style={{ width: 96 }} />}
          </Card>
        ))}
      </div>
    );
  }

  Object.assign(window, { Payables });
})();
