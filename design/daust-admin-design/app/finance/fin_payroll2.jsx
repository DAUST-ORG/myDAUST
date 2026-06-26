// ============================================================
// DAUST Admin — Finance › Payroll extras + Report Library
// Employees & contracts · Leave & accruals · Scheduled reports
// (Pay run + payslips live in fin_payroll.jsx as Payroll())
// ============================================================
(function () {
  const { useState } = React;

  // ---- Employees & contracts ----
  function PayrollEmployees({ goFin }) {
    const [sel, setSel] = useState(null);
    const [q, setQ] = useState('');
    const STAFF = window.STAFF;
    const rows = STAFF.filter(s => s.name.toLowerCase().includes(q.toLowerCase()));
    const contractTone = { 'Full-time': 'teal', Adjunct: 'info', Contract: 'warning' };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
          <window.Metric label="Headcount" value="142" sub="all contracts" tone="accent" icon="users" />
          <window.Metric label="Full-time" value={STAFF.filter(s => s.type === 'Full-time').length * 9} sub="permanent" icon="user-check" />
          <window.Metric label="Contracts expiring" value="6" sub="next 90 days" tone="down" icon="calendar-clock" />
          <window.Metric label="Avg. tenure" value="3.4 yr" sub="across faculty" icon="history" />
        </div>
        <window.Toolbar>
          <window.SearchInput placeholder="Search employee…" value={q} onChange={setQ} width={260} />
          <div style={{ flex: 1 }} />
          <window.Button variant="primary" icon="user-plus">Add employee</window.Button>
        </window.Toolbar>
        <window.Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Employee</th><th>Department</th><th>Role</th><th>Contract</th><th style={{ textAlign: 'right' }}>Gross salary</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.map(s => (
                  <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setSel(s)}>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><window.Avatar name={s.name} size={30} /><div><div style={{ color: 'var(--fg)', fontWeight: 600 }}>{s.name}</div><div style={{ fontSize: 11.5, color: 'var(--fg-faint)', fontFamily: 'var(--font-mono)' }}>{s.id}</div></div></span></td>
                    <td>{s.dept}</td><td>{s.role}</td>
                    <td><window.Badge tone={contractTone[s.type]} dot={false} size="sm">{s.type}</window.Badge></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={s.salary} /></td>
                    <td><window.Badge tone={s.status === 'Active' ? 'success' : 'warning'} size="sm">{s.status}</window.Badge></td>
                    <td style={{ textAlign: 'right' }}><window.Icon name="chevron-right" size={16} style={{ color: 'var(--fg-faint)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Card>

        <window.Drawer open={!!sel} onClose={() => setSel(null)} title="Employee · contract" width={460}
          footer={sel && <><window.Button variant="outline" icon="file-text">Payslip history</window.Button><window.Button variant="primary" icon="pencil">Edit contract</window.Button></>}>
          {sel && (() => {
            const p = window.payslip(sel);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <window.Avatar name={sel.name} size={52} />
                  <div><div style={{ fontWeight: 700, fontSize: 17 }}>{sel.name}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{sel.role} · {sel.dept}</div><div style={{ marginTop: 5 }}><window.Badge tone={contractTone[sel.type]} dot={false} size="sm">{sel.type}</window.Badge></div></div>
                </div>
                <window.KV label="Employee ID" value={sel.id} mono />
                <window.KV label="Gross salary (monthly)" value={<window.FCFA value={sel.salary} />} />
                <window.KV label="Net pay (monthly)" value={<window.FCFA value={p.net} />} strong />
                <window.KV label="Contract type" value={sel.type} />
                <window.KV label="Contract end" value={sel.type === 'Full-time' ? 'Permanent' : '2026-12-31'} />
                <window.KV label="IPRES number" value={'SN-' + (3000000 + sel.id.charCodeAt(3) * 137)} mono />
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg-muted)', marginTop: 4 }}>Recent payslips</div>
                {['May 2026', 'April 2026', 'March 2026'].map((m, i) => (
                  <div key={m} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '7px 0', borderBottom: '1px solid var(--divider)' }}>
                    <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{m}</span><span style={{ fontFamily: 'var(--font-mono)' }}>{window.fmtFCFA(p.net)} FCFA</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </window.Drawer>
      </div>
    );
  }

  // ---- Leave & accruals ----
  function LeaveAccruals({ goFin }) {
    const STAFF = window.STAFF.slice(0, 10);
    const acc = (s, i) => ({ annual: 30, taken: 4 + (i % 14), eos: Math.round(s.salary * (2 + i % 4) / 12 * (3 + i % 5)) });
    const pendingReqs = [
      { staff: 'Dr. A. Diop', type: 'Annual leave', days: 5, from: '2026-06-09', status: 'Pending' },
      { staff: 'K. Mbaye', type: 'Sick leave', days: 2, from: '2026-05-30', status: 'Approved' },
      { staff: 'Dr. M. Sow', type: 'Conference', days: 3, from: '2026-06-16', status: 'Pending' },
    ];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="Leave liability" value={<window.FCFA value={184_500_000} short />} sub="accrued, unused" tone="down" icon="calendar" />
          <window.Metric label="End-of-service liability" value={<window.FCFA value={612_000_000} short />} sub="gratuity provision" tone="down" icon="briefcase" />
          <window.Metric label="Pending requests" value={pendingReqs.filter(r => r.status === 'Pending').length} sub="need approval" icon="clock" />
          <window.Metric label="Avg. leave balance" value="22 days" sub="of 30 annual" icon="sun" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
          <window.Panel title="Leave & end-of-service accruals">
            <div style={{ overflowX: 'auto' }}>
              <table className="dt" style={{ margin: '-4px 0' }}>
                <thead><tr><th>Employee</th><th>Annual</th><th>Taken</th><th>Balance</th><th style={{ textAlign: 'right' }}>EOS provision</th></tr></thead>
                <tbody>
                  {STAFF.map((s, i) => { const a = acc(s, i); return (
                    <tr key={s.id}>
                      <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><window.Avatar name={s.name} size={26} /><span style={{ color: 'var(--fg)', fontWeight: 600 }}>{s.name}</span></span></td>
                      <td>{a.annual}d</td><td>{a.taken}d</td>
                      <td><b style={{ color: a.annual - a.taken < 8 ? 'var(--warning-500)' : 'var(--fg)' }}>{a.annual - a.taken}d</b></td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--fg)' }}>{window.fmtFCFA(a.eos)}</td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          </window.Panel>
          <window.Panel title="Leave requests" action={<window.Button variant="ghost" size="sm" icon="plus" /> }>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pendingReqs.map((r, i) => (
                <div key={i} style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--fg)' }}>{r.staff}</span><window.FinStatus status={r.status} />
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{r.type} · {r.days} days · from {r.from}</div>
                  {r.status === 'Pending' && <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><window.Button variant="primary" size="sm" icon="check">Approve</window.Button><window.Button variant="ghost" size="sm">Decline</window.Button></div>}
                </div>
              ))}
            </div>
          </window.Panel>
        </div>
      </div>
    );
  }

  // ---- Report Library (scheduled / on-demand) ----
  function ReportLibrary({ goFin }) {
    const reports = [
      { icon: 'wallet', title: 'Tuition collection report', desc: 'Billed vs collected by program & term', cat: 'Receivables', sched: 'Weekly · Mon 06:00' },
      { icon: 'trending-up', title: 'Management accounts pack', desc: 'Full P&L, balance sheet, cash flow + commentary', cat: 'Statements', sched: 'Monthly · close+2' },
      { icon: 'users', title: 'Payroll summary', desc: 'Gross-to-net, deductions, by department', cat: 'Payroll', sched: 'Monthly · run day' },
      { icon: 'award', title: 'Grant burn & compliance', desc: 'Spend vs award, sponsor reporting', cat: 'Funds', sched: 'Quarterly' },
      { icon: 'landmark', title: 'Treasury & cash position', desc: 'Bank balances, 30-day projection', cat: 'Treasury', sched: 'Daily · 07:00' },
      { icon: 'pie-chart', title: 'Budget variance', desc: 'Allocated vs actual vs encumbered', cat: 'Budget', sched: 'Monthly' },
      { icon: 'shield-check', title: 'Tax & statutory pack', desc: 'TVA, IR, IPRES, CSS filing summary', cat: 'Compliance', sched: 'Monthly · pre-deadline' },
      { icon: 'package', title: 'Fixed asset register', desc: 'NBV, depreciation, additions/disposals', cat: 'Assets', sched: 'On demand' },
      { icon: 'file-bar-chart', title: 'Board finance dashboard', desc: 'KPIs, scenarios, ratios — board-ready', cat: 'Executive', sched: 'Quarterly' },
    ];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <window.Toolbar>
          <window.SearchInput placeholder="Search reports…" value="" onChange={() => {}} width={260} />
          <div style={{ flex: 1 }} />
          <window.Button variant="outline" icon="calendar-clock">Scheduled</window.Button>
          <window.Button variant="primary" icon="plus">Custom report</window.Button>
        </window.Toolbar>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
          {reports.map(r => (
            <window.Card key={r.title} hover padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ width: 42, height: 42, borderRadius: 'var(--radius-md)', background: 'var(--bg-tint)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><window.Icon name={r.icon} size={20} /></span>
                <window.Badge tone="neutral" dot={false} size="sm">{r.cat}</window.Badge>
              </div>
              <div><div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--fg)' }}>{r.title}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginTop: 3 }}>{r.desc}</div></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--fg-faint)' }}><window.Icon name="clock" size={12} />{r.sched}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 6 }}>
                <window.Button variant="outline" size="sm" icon="eye">Preview</window.Button>
                <window.Button variant="ghost" size="sm" icon="download">Export</window.Button>
              </div>
            </window.Card>
          ))}
        </div>
      </div>
    );
  }

  Object.assign(window, { PayrollEmployees, LeaveAccruals, ReportLibrary });
})();
