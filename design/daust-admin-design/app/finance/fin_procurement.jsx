// ============================================================
// DAUST Admin — Finance › Procurement, Expense Claims, Petty Cash
// (Payables cluster — bills/PO already exist in fin_payables.jsx)
// ============================================================
(function () {
  const { useState } = React;

  // ---- Procurement (vendors / RFQs / contracts) ----
  function Procurement({ goFin }) {
    const [tab, setTab] = useState('vendors');
    return (
      <div>
        <window.Tabs tabs={[{ value: 'vendors', label: 'Vendor registry' }, { value: 'rfq', label: 'RFQs / tenders' }, { value: 'contracts', label: 'Contracts' }]} active={tab} onChange={setTab} />
        {tab === 'vendors' && <Vendors />}
        {tab === 'rfq' && <RFQs />}
        {tab === 'contracts' && <Contracts />}
      </div>
    );
  }

  function Vendors() {
    const [sel, setSel] = useState(null);
    const [q, setQ] = useState('');
    const V = window.VENDORS.filter(v => v.name.toLowerCase().includes(q.toLowerCase()));
    const tone = { Approved: 'success', Review: 'warning', Suspended: 'error' };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <window.Toolbar>
          <window.SearchInput placeholder="Search vendors…" value={q} onChange={setQ} width={260} />
          <div style={{ flex: 1 }} />
          <window.Button variant="primary" icon="plus">Register vendor</window.Button>
        </window.Toolbar>
        <window.Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Vendor</th><th>Category</th><th>Terms</th><th>Rating</th><th style={{ textAlign: 'right' }}>YTD spend</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {V.map(v => (
                  <tr key={v.id} style={{ cursor: 'pointer' }} onClick={() => setSel(v)}>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><span style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--bg-tint)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>{v.name[0]}</span><b style={{ color: 'var(--fg)' }}>{v.name}</b></span></td>
                    <td><window.Badge tone="neutral" dot={false} size="sm">{v.category}</window.Badge></td>
                    <td style={{ fontSize: 12.5 }}>{v.terms}</td>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, color: v.rating >= 4.2 ? 'var(--success-500)' : 'var(--fg)' }}><window.Icon name="star" size={13} style={{ color: 'var(--cta)' }} />{v.rating.toFixed(1)}</span></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={v.ytdSpend} /></td>
                    <td><window.Badge tone={tone[v.status]} size="sm">{v.status}</window.Badge></td>
                    <td style={{ textAlign: 'right' }}><window.Icon name="chevron-right" size={16} style={{ color: 'var(--fg-faint)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Card>
        <window.Drawer open={!!sel} onClose={() => setSel(null)} title="Vendor" width={440}
          footer={sel && <><window.Button variant="outline" icon="file-text">Bills</window.Button><window.Button variant="primary" icon="shopping-cart">New PO</window.Button></>}>
          {sel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'var(--bg-tint)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20 }}>{sel.name[0]}</span>
                <div><div style={{ fontWeight: 700, fontSize: 16 }}>{sel.name}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{sel.category} · {sel.id}</div></div>
              </div>
              <window.KV label="Contact" value={sel.contact} />
              <window.KV label="Payment terms" value={sel.terms} />
              <window.KV label="Rating" value={sel.rating.toFixed(1) + ' / 5'} />
              <window.KV label="YTD spend" value={<window.FCFA value={sel.ytdSpend} />} />
              <window.KV label="Status" value={sel.status} />
            </div>
          )}
        </window.Drawer>
      </div>
    );
  }

  function RFQs() {
    const tone = { Draft: 'neutral', Evaluating: 'warning', Awarded: 'success' };
    return (
      <window.Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>Requests for quotation</h3>
          <window.Button variant="primary" size="sm" icon="plus">New RFQ</window.Button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dt">
            <thead><tr><th>RFQ</th><th>Title</th><th>Department</th><th>Bids</th><th style={{ textAlign: 'right' }}>Lowest bid</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>
              {window.RFQS.map(rq => (
                <tr key={rq.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{rq.id}</td>
                  <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{rq.title}</td>
                  <td><window.Badge tone="neutral" dot={false} size="sm">{rq.dept}</window.Badge></td>
                  <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><window.Icon name="users" size={13} style={{ color: 'var(--fg-faint)' }} />{rq.bids}</span></td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={rq.lowest} /></td>
                  <td>{rq.due}</td>
                  <td><window.Badge tone={tone[rq.status]} size="sm">{rq.status}</window.Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </window.Card>
    );
  }

  function Contracts() {
    const tone = { Active: 'success', Expiring: 'warning', Expired: 'error' };
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(330px,1fr))', gap: 16 }}>
        {window.CONTRACTS.map(c => (
          <window.Card key={c.id} padding={20}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div><div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>{c.title}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{c.vendor} · {c.id}</div></div>
              <window.Badge tone={tone[c.status]} size="sm">{c.status}</window.Badge>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--fg)', marginBottom: 12 }}><window.FCFA value={c.value} /></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--fg-subtle)', paddingTop: 12, borderTop: '1px solid var(--divider)' }}>
              <span>{c.start} → {c.end}</span><span>Renewal: <b style={{ color: 'var(--fg-muted)' }}>{c.renewal}</b></span>
            </div>
          </window.Card>
        ))}
      </div>
    );
  }

  // ---- Expense Claims (multi-level approval) ----
  function ExpenseClaims({ goFin }) {
    const [sel, setSel] = useState(null);
    const [create, setCreate] = useState(false);
    const E = window.EXPENSE_CLAIMS;
    const pending = E.filter(x => x.status === 'Pending');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
          <window.Metric label="Awaiting approval" value={pending.length} sub={window.fmtFCFA(pending.reduce((a, x) => a + x.amount, 0), { short: true }) + ' FCFA'} tone="down" icon="clock" />
          <window.Metric label="Approved (month)" value={E.filter(x => x.status === 'Approved').length} sub="ready to pay" tone="up" icon="check-circle-2" />
          <window.Metric label="Rejected" value={E.filter(x => x.status === 'Rejected').length} sub="this month" icon="x-circle" />
        </div>
        <window.Toolbar>
          <window.SearchInput placeholder="Search claims…" value="" onChange={() => {}} width={260} />
          <div style={{ flex: 1 }} />
          <window.Button variant="primary" icon="plus" onClick={() => setCreate(true)}>New claim</window.Button>
        </window.Toolbar>
        <window.Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Claim</th><th>Staff</th><th>Department</th><th>Purpose</th><th style={{ textAlign: 'right' }}>Amount</th><th>Approval</th><th>Status</th></tr></thead>
              <tbody>
                {E.map(x => (
                  <tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => setSel(x)}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{x.id}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{x.staff}</td>
                    <td>{x.dept}</td>
                    <td style={{ color: 'var(--fg-subtle)' }}>{x.purpose}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={x.amount} /></td>
                    <td><window.ApprovalChain stage={x.status === 'Rejected' ? null : x.stage} rejected={x.status === 'Rejected'} compact /></td>
                    <td><window.FinStatus status={x.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Card>

        <window.Drawer open={!!sel} onClose={() => setSel(null)} title={sel ? sel.id : ''} width={460}
          footer={sel && (sel.status === 'Pending' ? <><window.Button variant="danger" icon="x">Reject</window.Button><window.Button variant="primary" icon="check">Approve & advance</window.Button></> : <window.Button variant="outline" icon="printer">Print</window.Button>)}>
          {sel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)', padding: 18, textAlign: 'center' }}>
                <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{sel.purpose}</div>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-display)', margin: '6px 0' }}><window.FCFA value={sel.amount} /></div>
                <window.ThresholdNote amount={sel.amount} />
              </div>
              <window.KV label="Claimant" value={sel.staff} />
              <window.KV label="Department" value={sel.dept} />
              <window.KV label="Date" value={sel.date} />
              <div style={{ marginTop: 4 }}><div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg-muted)', marginBottom: 12 }}>Approval workflow</div><window.ApprovalChain stage={sel.status === 'Rejected' ? null : sel.stage} rejected={sel.status === 'Rejected'} /></div>
            </div>
          )}
        </window.Drawer>
        <window.Modal open={create} onClose={() => setCreate(false)} title="New expense claim" width={460}
          footer={<><window.Button variant="ghost" onClick={() => setCreate(false)}>Cancel</window.Button><window.Button variant="primary" icon="send" onClick={() => setCreate(false)}>Submit claim</window.Button></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <window.Field label="Purpose"><window.Input placeholder="e.g. Conference travel" /></window.Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <window.Field label="Amount (FCFA)"><window.Input type="number" placeholder="0" /></window.Field>
              <window.Field label="Date"><window.Input type="date" defaultValue="2026-05-29" /></window.Field>
            </div>
            <window.Field label="Attach receipt" hint="PDF or image"><window.Input type="file" /></window.Field>
          </div>
        </window.Modal>
      </div>
    );
  }

  // ---- Petty Cash ----
  function PettyCash({ goFin }) {
    const P = window.PETTY_CASH;
    const used = P.float - P.balance;
    const catColor = { Supplies: '#153B6A', Hospitality: '#ED8425', Transport: '#5B89C0', Postage: '#9DA6AE', Facilities: '#2E7D52' };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1.4fr)', gap: 16 }}>
          <window.Metric label="Float" value={<window.FCFA value={P.float} short />} sub="imprest amount" icon="wallet" />
          <window.Metric label="Balance on hand" value={<window.FCFA value={P.balance} short />} sub={'replenish at 400k'} tone={P.balance < 700000 ? 'down' : 'up'} icon="banknote" />
          <window.Card padding={18}>
            <div style={{ fontSize: 12, color: 'var(--fg-subtle)', fontWeight: 600, marginBottom: 8 }}>Float utilisation</div>
            <window.Progress value={used} max={P.float} tone={used > P.float * 0.7 ? 'warning' : 'teal'} height={10} showLabel />
            <div style={{ fontSize: 11.5, color: 'var(--fg-subtle)', marginTop: 8 }}>Custodian: <b style={{ color: 'var(--fg-muted)' }}>{P.custodian}</b></div>
          </window.Card>
        </div>
        <window.Panel title="Petty cash log" action={<div style={{ display: 'flex', gap: 8 }}><window.Button variant="outline" size="sm" icon="rotate-ccw">Replenish</window.Button><window.Button variant="primary" size="sm" icon="plus">Record expense</window.Button></div>}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Voucher</th><th>Date</th><th>Description</th><th>Category</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
              <tbody>
                {P.transactions.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{t.id}</td>
                    <td>{t.date}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{t.desc}</td>
                    <td><window.Badge tone="neutral" dot={false} size="sm"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: catColor[t.category] }} />{t.category}</span></window.Badge></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>{window.fmtFCFA(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Panel>
      </div>
    );
  }

  Object.assign(window, { Procurement, ExpenseClaims, PettyCash });
})();
