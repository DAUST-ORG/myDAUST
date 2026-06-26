// ============================================================
// DAUST Admin — Finance › Receivables 2
// Fee structure, refunds & credit notes, collections, student statements
// ============================================================
(function () {
  const { useState } = React;

  // ---- Fee Structure ----
  function FeeStructure({ goFin }) {
    const [edit, setEdit] = useState(null);
    const FEE = window.FEE_ITEMS;
    const catTone = { Tuition: 'teal', Admissions: 'info', Registration: 'info', Academic: 'neutral', Auxiliary: 'warning', Services: 'neutral' };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <window.Panel title="Per-program tuition (annual)" action={<window.Button variant="outline" size="sm" icon="pencil">Edit pricing</window.Button>}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Program</th><th>Degree</th><th>School</th><th style={{ textAlign: 'right' }}>Annual tuition</th><th style={{ textAlign: 'right' }}>With fees*</th></tr></thead>
              <tbody>
                {window.PROGRAMS.map(p => (
                  <tr key={p.code}>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><span style={{ width: 30, height: 30, borderRadius: 7, background: p.color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{p.code}</span><b style={{ color: 'var(--fg)' }}>{p.name}</b></span></td>
                    <td><window.Badge tone="neutral" dot={false} size="sm">{p.degree}</window.Badge></td>
                    <td>{p.school}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={p.tuition} /></td>
                    <td style={{ textAlign: 'right', color: 'var(--fg-subtle)' }}><window.FCFA value={p.tuition + 360000} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 8 }}>*Includes mandatory registration, lab, library and insurance fees.</div>
        </window.Panel>

        <window.Panel title="Fee items catalog" action={<window.Button variant="primary" size="sm" icon="plus">Add fee item</window.Button>}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Fee item</th><th>Category</th><th>GL account</th><th>Mandatory</th><th style={{ textAlign: 'right' }}>Amount</th><th></th></tr></thead>
              <tbody>
                {FEE.map(f => (
                  <tr key={f.id} style={{ cursor: 'pointer' }} onClick={() => setEdit(f)}>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{f.name}</td>
                    <td><window.Badge tone={catTone[f.category] || 'neutral'} dot={false} size="sm">{f.category}</window.Badge></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-subtle)' }}>{f.gl}</td>
                    <td>{f.mandatory ? <window.Badge tone="success" size="sm">Required</window.Badge> : <window.Badge tone="neutral" dot={false} size="sm">Optional</window.Badge>}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}>{f.perProgram ? <span style={{ color: 'var(--fg-subtle)', fontWeight: 500, fontStyle: 'italic' }}>per program</span> : <window.FCFA value={f.amount} />}</td>
                    <td style={{ textAlign: 'right' }}><window.Icon name="pencil" size={14} style={{ color: 'var(--fg-faint)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Panel>

        <window.Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? 'Edit · ' + edit.name : ''} width={440}
          footer={<><window.Button variant="ghost" onClick={() => setEdit(null)}>Cancel</window.Button><window.Button variant="primary" icon="check" onClick={() => setEdit(null)}>Save</window.Button></>}>
          {edit && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <window.Field label="Fee name"><window.Input defaultValue={edit.name} /></window.Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <window.Field label="Amount (FCFA)"><window.Input type="number" defaultValue={edit.amount || ''} placeholder="per program" /></window.Field>
                <window.Field label="GL account"><window.Input defaultValue={edit.gl} /></window.Field>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><window.Toggle checked={edit.mandatory} onChange={() => {}} /><span style={{ fontSize: 13.5, color: 'var(--fg-muted)' }}>Mandatory for all students</span></div>
            </div>
          )}
        </window.Modal>
      </div>
    );
  }

  // ---- Refunds & Credit Notes ----
  function Refunds({ goFin }) {
    const [sel, setSel] = useState(null);
    const [create, setCreate] = useState(false);
    const R = window.REFUNDS;
    const pending = R.filter(x => x.status === 'Pending');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
          <window.Metric label="Pending refunds" value={pending.length} sub={window.fmtFCFA(pending.reduce((a, x) => a + x.amount, 0), { short: true }) + ' FCFA'} tone="down" icon="undo-2" />
          <window.Metric label="Issued (term)" value={R.filter(x => x.status === 'Paid').length} sub="this term" icon="check-circle-2" />
          <window.Metric label="Credit notes" value={R.filter(x => x.type === 'Credit Note').length} sub="applied to accounts" icon="file-minus" />
        </div>
        <window.Toolbar>
          <window.SearchInput placeholder="Search student or note…" value="" onChange={() => {}} width={280} />
          <div style={{ flex: 1 }} />
          <window.Button variant="primary" icon="plus" onClick={() => setCreate(true)}>New refund / credit</window.Button>
        </window.Toolbar>
        <window.Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Reference</th><th>Student</th><th>Type</th><th>Reason</th><th style={{ textAlign: 'right' }}>Amount</th><th>Date</th><th>Approval</th><th>Status</th></tr></thead>
              <tbody>
                {R.map(x => (
                  <tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => setSel(x)}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{x.id}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{x.student}</td>
                    <td><window.Badge tone={x.type === 'Refund' ? 'warning' : 'info'} dot={false} size="sm">{x.type}</window.Badge></td>
                    <td style={{ color: 'var(--fg-subtle)' }}>{x.reason}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={x.amount} /></td>
                    <td>{x.date}</td>
                    <td><window.ApprovalChain stage={x.stage} compact /></td>
                    <td><window.FinStatus status={x.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Card>

        <window.Drawer open={!!sel} onClose={() => setSel(null)} title={sel ? sel.id : ''} width={440}
          footer={sel && (sel.status === 'Pending' ? <><window.Button variant="danger" icon="x">Reject</window.Button><window.Button variant="primary" icon="check">Approve</window.Button></> : <window.Button variant="outline" icon="printer">Print note</window.Button>)}>
          {sel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)', padding: 18, textAlign: 'center' }}>
                <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{sel.type}</div>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-display)', margin: '6px 0' }}><window.FCFA value={sel.amount} /></div>
                <window.FinStatus status={sel.status} />
              </div>
              <window.KV label="Student" value={sel.student} />
              <window.KV label="Account" value={sel.studentId} mono />
              <window.KV label="Reason" value={sel.reason} />
              <window.KV label="Requested" value={sel.date} />
              <div style={{ marginTop: 4 }}><div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg-muted)', marginBottom: 10 }}>Approval workflow</div><window.ApprovalChain stage={sel.stage} /></div>
            </div>
          )}
        </window.Drawer>
        <window.Modal open={create} onClose={() => setCreate(false)} title="New refund / credit note" width={460}
          footer={<><window.Button variant="ghost" onClick={() => setCreate(false)}>Cancel</window.Button><window.Button variant="primary" icon="send" onClick={() => setCreate(false)}>Submit</window.Button></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <window.Field label="Student"><window.Input placeholder="Search name or ID…" /></window.Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <window.Field label="Type"><window.Select options={['Refund (cash out)', 'Credit Note (to account)']} /></window.Field>
              <window.Field label="Amount (FCFA)"><window.Input type="number" placeholder="0" /></window.Field>
            </div>
            <window.Field label="Reason"><window.Select options={['Course withdrawal — pro-rata', 'Overpayment (duplicate)', 'Scholarship applied after payment', 'Housing not taken up', 'Other']} /></window.Field>
          </div>
        </window.Modal>
      </div>
    );
  }

  // ---- Collections / Dunning ----
  function Collections({ goFin }) {
    const [sel, setSel] = useState(null);
    const HOLDS = window.HOLDS;
    const stageOf = b => b > 1_800_000 ? 'Final notice' : b > 1_200_000 ? '2nd reminder' : '1st reminder';
    const stageTone = { '1st reminder': 'info', '2nd reminder': 'warning', 'Final notice': 'error' };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="In collections" value={window.fmtFCFA(window.FINANCE.outstanding, { short: true }) + ' FCFA'} sub="118 accounts" tone="down" icon="alert-circle" />
          <window.Metric label="Active holds" value={HOLDS.length} sub="registration / transcript" tone="down" icon="lock" />
          <window.Metric label="90+ days overdue" value={<window.FCFA value={43_000_000} short />} sub="19 accounts" tone="down" icon="clock-alert" />
          <window.Metric label="Recovered (month)" value={<window.FCFA value={186_000_000} short />} sub="241 payments" tone="up" icon="trending-up" />
        </div>
        <window.Panel title="Dunning queue — accounts on hold" action={<window.Button variant="primary" size="sm" icon="send">Send batch reminders</window.Button>}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Student</th><th>Program</th><th>Blocks</th><th>Placed</th><th>Dunning stage</th><th style={{ textAlign: 'right' }}>Balance</th><th></th></tr></thead>
              <tbody>
                {HOLDS.map(h => (
                  <tr key={h.studentId} style={{ cursor: 'pointer' }} onClick={() => setSel(h)}>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><window.Avatar name={h.student} size={28} /><div><div style={{ color: 'var(--fg)', fontWeight: 600 }}>{h.student}</div><div style={{ fontSize: 11.5, color: 'var(--fg-faint)', fontFamily: 'var(--font-mono)' }}>{h.studentId}</div></div></span></td>
                    <td><window.Badge tone="neutral" dot={false} size="sm">{h.program}</window.Badge></td>
                    <td style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>{h.blocks}</td>
                    <td>{h.placed}</td>
                    <td><window.Badge tone={stageTone[stageOf(h.balance)]} size="sm">{stageOf(h.balance)}</window.Badge></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--error-500)' }}><window.FCFA value={h.balance} /></td>
                    <td style={{ textAlign: 'right' }}><window.Icon name="chevron-right" size={16} style={{ color: 'var(--fg-faint)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Panel>

        <window.Drawer open={!!sel} onClose={() => setSel(null)} title="Collections case" width={460}
          footer={sel && <><window.Button variant="outline" icon="unlock">Lift hold</window.Button><window.Button variant="primary" icon="send">Send reminder</window.Button></>}>
          {sel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <window.Avatar name={sel.student} size={48} />
                <div><div style={{ fontWeight: 700, fontSize: 16 }}>{sel.student}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)' }}>{sel.studentId} · {sel.program}</div></div>
              </div>
              <div style={{ background: 'rgba(192,57,43,0.08)', borderRadius: 'var(--radius-lg)', padding: 18, textAlign: 'center' }}>
                <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>Outstanding balance</div>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--error-500)' }}><window.FCFA value={sel.balance} /></div>
              </div>
              <window.KV label="Reason" value={sel.reason} />
              <window.KV label="Hold placed" value={sel.placed} />
              <window.KV label="Services blocked" value={sel.blocks} />
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg-muted)', marginTop: 4 }}>Dunning history</div>
              {[['1st reminder', '2026-04-20', 'Email'], ['2nd reminder', '2026-05-08', 'Email + SMS'], ['Phone follow-up', '2026-05-20', 'No answer']].map((h, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '7px 0', borderBottom: '1px solid var(--divider)' }}>
                  <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{h[0]}</span><span style={{ color: 'var(--fg-subtle)' }}>{h[1]} · {h[2]}</span>
                </div>
              ))}
            </div>
          )}
        </window.Drawer>
      </div>
    );
  }

  Object.assign(window, { FeeStructure, Refunds, Collections });
})();
