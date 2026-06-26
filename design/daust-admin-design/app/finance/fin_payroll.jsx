// ============================================================
// DAUST Admin — Finance › Payroll (runs, payslips, deductions)
// ============================================================
(function () {
  const { useState, useEffect, useRef } = React;

  function Payroll({ goFin }) {
    const [q, setQ] = useState('');
    const [dept, setDept] = useState('All');
    const [sel, setSel] = useState(null);
    const [runOpen, setRunOpen] = useState(false);
    const PT = window.PAYROLL_TOTALS;
    const depts = ['All', ...Array.from(new Set(window.STAFF.map(s => s.dept)))];
    const rows = window.STAFF.filter(s => (dept === 'All' || s.dept === dept) && s.name.toLowerCase().includes(q.toLowerCase()));

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Run summary */}
        <Card padding={22}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
            <div>
              <div className="label" style={{ marginBottom: 4 }}>Current run</div>
              <h3 style={{ fontSize: 19, fontWeight: 700 }}>May 2026 · {PT.count} employees</h3>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Badge tone="warning">Draft · not yet processed</Badge>
              <Button variant="outline" icon="file-down">Export bank file</Button>
              <Button variant="primary" icon="play" onClick={() => setRunOpen(true)}>Process run</Button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px,1fr))', gap: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <RunCell label="Gross payroll" value={PT.gross} tone="fg" />
            <RunCell label="IPRES pension (5.6%)" value={PT.ipres} tone="muted" prefix="−" />
            <RunCell label="Income tax (IR)" value={PT.ir} tone="muted" prefix="−" />
            <RunCell label="Net disbursement" value={PT.net} tone="accent" last />
          </div>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.6fr)', gap: 20, alignItems: 'start' }}>
          <Panel title="Payroll trend">
            <BarChart data={[396, 401, 405, 408, 410, 412].map(v => v * 1e6)} labels={['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May']} color="var(--accent)" format={v => fmtFCFA(v, { short: true })} height={196} />
          </Panel>
          <Panel title="Run history">
            <table className="dt" style={{ margin: '-4px 0' }}>
              <thead><tr><th>Period</th><th>Employees</th><th>Net paid</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {[['April 2026', 141, 408_900_000, '2026-05-01'], ['March 2026', 140, 405_200_000, '2026-04-01'], ['February 2026', 139, 401_600_000, '2026-03-01'], ['January 2026', 138, 397_400_000, '2026-02-01']].map((r, i) => (
                  <tr key={i}><td style={{ color: 'var(--fg)', fontWeight: 600 }}>{r[0]}</td><td>{r[1]}</td><td style={{ fontWeight: 600, color: 'var(--fg)' }}><FCFA value={r[2]} /></td><td>{r[3]}</td><td><FinStatus status="Paid" /></td></tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>

        {/* Employee payslips */}
        <div>
          <Toolbar>
            <SearchInput placeholder="Search employee…" value={q} onChange={setQ} width={260} />
            <Select options={depts.map(d => ({ value: d, label: d === 'All' ? 'All departments' : d }))} value={dept} onChange={setDept} />
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 13, color: 'var(--fg-subtle)' }}>Click a row for the payslip</span>
          </Toolbar>
          <Card padding={0} style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="dt">
                <thead><tr><th>Employee</th><th>Department</th><th>Role</th><th>Gross</th><th>IPRES</th><th>IR</th><th>Net pay</th><th></th></tr></thead>
                <tbody>
                  {rows.map(s => {
                    const p = window.payslip(s);
                    return (
                      <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setSel(s)}>
                        <td><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Avatar name={s.name} size={28} /><span style={{ color: 'var(--fg)', fontWeight: 600 }}>{s.name}</span></div></td>
                        <td>{s.dept}</td><td>{s.role}</td>
                        <td style={{ color: 'var(--fg)', fontWeight: 600 }}><FCFA value={p.gross} /></td>
                        <td style={{ color: 'var(--fg-subtle)' }}>−<FCFA value={p.ipres} /></td>
                        <td style={{ color: 'var(--fg-subtle)' }}>−<FCFA value={p.ir} /></td>
                        <td style={{ color: 'var(--accent)', fontWeight: 700 }}><FCFA value={p.net} /></td>
                        <td style={{ textAlign: 'right' }}><Icon name="chevron-right" size={16} style={{ color: 'var(--fg-faint)' }} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Payslip drawer */}
        <Drawer open={!!sel} onClose={() => setSel(null)} title="Payslip · May 2026" width={440}
          footer={sel && <><Button variant="outline" icon="printer">Print</Button><Button variant="primary" icon="send">Send to employee</Button></>}>
          {sel && <Payslip emp={sel} />}
        </Drawer>

        {/* Process run modal */}
        <Modal open={runOpen} onClose={() => setRunOpen(false)} title="Process May 2026 payroll" width={440}
          footer={<><Button variant="ghost" onClick={() => setRunOpen(false)}>Cancel</Button><Button variant="primary" icon="play" onClick={() => setRunOpen(false)}>Confirm & process</Button></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13.5 }}>You're about to process payroll for <b>{PT.count} employees</b>. This generates payslips, posts the journal entry, and queues the bank disbursement file.</p>
            <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
              <KV label="Gross" value={<FCFA value={PT.gross} />} />
              <KV label="Total deductions" value={<FCFA value={PT.ipres + PT.ir} />} />
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, fontSize: 15, fontWeight: 800 }}><span>Net to disburse</span><span style={{ color: 'var(--accent)' }}><FCFA value={PT.net} /></span></div>
            </div>
            <Select options={['Pay date: 2026-06-01', 'Pay date: 2026-05-31']} />
          </div>
        </Modal>
      </div>
    );
  }

  function RunCell({ label, value, tone, prefix = '', last }) {
    const color = tone === 'accent' ? 'var(--accent)' : tone === 'muted' ? 'var(--fg-subtle)' : 'var(--fg)';
    return (
      <div style={{ padding: '16px 18px', borderRight: last ? 'none' : '1px solid var(--border)', background: last ? 'var(--bg-tint)' : 'transparent' }}>
        <div style={{ fontSize: 12, color: 'var(--fg-subtle)', marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 19, fontWeight: 800, color, letterSpacing: '-0.01em' }}>{prefix}{fmtFCFA(value, { short: true })} <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>FCFA</span></div>
      </div>
    );
  }

  function Payslip({ emp }) {
    const p = window.payslip(emp);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar name={emp.name} size={48} />
          <div><div style={{ fontWeight: 700, fontSize: 16 }}>{emp.name}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{emp.role} · {emp.dept}</div><div style={{ fontSize: 11.5, color: 'var(--fg-faint)', fontFamily: 'var(--font-mono)' }}>{emp.id} · {emp.type}</div></div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--success-500)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Earnings</div>
          <Row label="Base salary" value={p.gross * 0.86} />
          <Row label="Responsibility allowance" value={p.gross * 0.09} />
          <Row label="Transport allowance" value={p.gross * 0.05} />
          <Row label="Gross pay" value={p.gross} strong />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--error-500)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Deductions</div>
          <Row label="IPRES pension (5.6%)" value={-p.ipres} />
          <Row label="Income tax — IR" value={-p.ir} />
          <Row label="Total deductions" value={-(p.ipres + p.ir)} strong />
        </div>
        <div style={{ background: 'var(--bg-tint)', borderRadius: 'var(--radius-lg)', padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>Net pay</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)' }}><FCFA value={p.net} /></span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>Employer also contributes <b>{fmtFCFA(p.css)} FCFA</b> to CSS (social security). Paid monthly via CBAO on the 1st.</div>
      </div>
    );
  }
  function Row({ label, value, strong }) {
    const neg = value < 0;
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--divider)', fontSize: 13.5 }}>
        <span style={{ color: strong ? 'var(--fg)' : 'var(--fg-muted)', fontWeight: strong ? 700 : 400 }}>{label}</span>
        <span style={{ color: strong ? 'var(--fg)' : neg ? 'var(--error-500)' : 'var(--fg)', fontWeight: strong ? 700 : 600, fontFamily: 'var(--font-mono)' }}>{neg ? '−' : ''}{fmtFCFA(Math.abs(value))}</span>
      </div>
    );
  }

  Object.assign(window, { Payroll });
})();
