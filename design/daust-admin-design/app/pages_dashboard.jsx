// ============================================================
// DAUST Admin — Dashboard (super-admin overview)
// ============================================================
const { useState: useStateDash } = React;

function ActivityFeed() {
  const toneColor = { success: 'var(--success-500)', warning: 'var(--warning-500)', info: 'var(--info-500)', teal: 'var(--accent)', neutral: 'var(--fg-subtle)' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {window.ACTIVITY.map((a, i) => (
        <div key={i} className="row-hover" style={{ display: 'flex', gap: 12, padding: '11px 6px', borderBottom: i < window.ACTIVITY.length - 1 ? '1px solid var(--divider)' : 'none' }}>
          <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: '50%', background: 'var(--bg-subtle)', color: toneColor[a.tone],
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={a.icon} size={15} /></span>
          <div style={{ fontSize: 13.5, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
            <b style={{ color: 'var(--fg)' }}>{a.who}</b> {a.action} <b style={{ color: 'var(--fg)' }}>{a.target}</b>
            <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 1 }}>{a.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function QuickAction({ icon, label, onClick }) {
  return (
    <button onClick={onClick} className="lift" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 9, alignItems: 'flex-start',
      padding: '15px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', cursor: 'pointer',
      fontFamily: 'var(--font-sans)', textAlign: 'left' }}>
      <span style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--bg-tint)', color: 'var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={18} /></span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{label}</span>
    </button>
  );
}

function Dashboard({ go }) {
  const F = window.FINANCE;
  const enrollSegments = window.PROGRAMS.map(p => ({ label: p.name, value: p.students, color: p.color }));
  const collectPct = Math.round((F.tuitionCollected / F.tuitionBilled) * 100);
  const today = new Date('2026-05-29').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader
        eyebrow={today}
        title="Welcome back, Dr. Senghor"
        subtitle="Here's how Dakar American University of Science & Technology is running today."
        actions={<>
          <Button variant="outline" icon="download" size="md">Export</Button>
          <Button variant="primary" icon="plus" size="md" onClick={() => go('admissions')}>New Intake</Button>
        </>}
      />

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
        <Stat label="Total Enrollment" value={window.TOTAL_STUDENTS.toLocaleString()} delta="+4.2% YoY" deltaTone="up" icon="users" spark={[1180, 1210, 1245, 1320, 1380, 1420, 1486]} />
        <Stat label="Tuition Collected" value={<FCFA value={F.tuitionCollected} short />} delta={collectPct + '% of billed'} deltaTone="up" icon="wallet" spark={[2.1, 2.6, 3.1, 3.4, 3.8, 4.0, 4.18]} />
        <Stat label="Outstanding Fees" value={<FCFA value={F.outstanding} short />} delta="118 students" deltaTone="down" icon="alert-circle" spark={[1.4, 1.3, 1.25, 1.2, 1.15, 1.08, 1.05]} />
        <Stat label="Open Applications" value="342" delta="+58 this week" deltaTone="up" icon="file-text" spark={[180, 220, 250, 290, 310, 330, 342]} />
        <Stat label="Cash on Hand" value={<FCFA value={F.cashOnHand} short />} delta="Healthy" deltaTone="flat" icon="landmark" spark={[1.9, 2.0, 2.1, 2.0, 2.2, 2.3, 2.31]} />
      </div>

      {/* Main two-column */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
        <Card padding={22}>
          <SectionTitle action={<Segmented size="sm" options={['9 mo', 'YTD', 'All']} value="9 mo" onChange={() => {}} />}>Revenue vs. Expenditure</SectionTitle>
          <div style={{ display: 'flex', gap: 22, marginBottom: 10 }}>
            <Legend color="var(--accent)" label="Revenue" />
            <Legend color="var(--slate-400)" label="Expenditure" dashed />
          </div>
          <AreaChart
            labels={window.MONTHS}
            series={[{ name: 'Revenue', data: F.revenue }, { name: 'Expenditure', data: F.expense, dashed: true }]}
            colors={['var(--accent)', 'var(--slate-400)']}
            format={v => fmtFCFA(v, { short: true })}
            height={236}
          />
        </Card>

        <Card padding={22}>
          <SectionTitle action={<Button variant="ghost" size="sm" iconRight="arrow-right" onClick={() => go('academics')}>Programs</Button>}>Enrollment by Program</SectionTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <Donut segments={enrollSegments} size={150} thickness={20} centerLabel={window.TOTAL_STUDENTS.toLocaleString()} centerSub="students" />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
              {window.PROGRAMS.slice(0, 6).map(p => (
                <div key={p.code} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: p.color, flexShrink: 0 }} />
                  <span style={{ color: 'var(--fg-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  <b style={{ color: 'var(--fg)' }}>{p.students}</b>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Quick actions */}
      <div>
        <SectionTitle>Quick actions</SectionTitle>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <QuickAction icon="user-plus" label="Enroll student" onClick={() => go('students')} />
          <QuickAction icon="receipt" label="Create invoice" onClick={() => go('finance')} />
          <QuickAction icon="megaphone" label="Post announcement" onClick={() => go('comms')} />
          <QuickAction icon="calendar-plus" label="Schedule course" onClick={() => go('academics')} />
          <QuickAction icon="file-bar-chart" label="Run report" onClick={() => go('reports')} />
          <QuickAction icon="user-cog" label="Manage roles" onClick={() => go('settings')} />
        </div>
      </div>

      {/* Bottom two-column */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
        <Card padding={22}>
          <SectionTitle action={<Button variant="ghost" size="sm" iconRight="arrow-right" onClick={() => go('comms')}>All</Button>}>Recent activity</SectionTitle>
          <ActivityFeed />
        </Card>

        <Card padding={22}>
          <SectionTitle action={<Button variant="ghost" size="sm" iconRight="arrow-right" onClick={() => go('finance')}>Finance</Button>}>Fee collection</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7, fontSize: 13 }}>
                <span style={{ color: 'var(--fg-subtle)' }}>Collected this year</span>
                <b style={{ color: 'var(--fg)' }}><FCFA value={F.tuitionCollected} /></b>
              </div>
              <Progress value={F.tuitionCollected} max={F.tuitionBilled} showLabel />
              <div style={{ fontSize: 12, color: 'var(--fg-faint)', marginTop: 6 }}>of <FCFA value={F.tuitionBilled} /> billed</div>
            </div>
            <div style={{ height: 1, background: 'var(--divider)' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <MiniStat label="Overdue invoices" value="18" tone="error" icon="clock-alert" />
              <MiniStat label="Paid this month" value="241" tone="success" icon="check-circle-2" />
              <MiniStat label="Payroll (monthly)" value={fmtFCFA(F.payrollMonthly, { short: true }) + ' FCFA'} tone="info" icon="wallet" />
              <MiniStat label="Endowment" value={fmtFCFA(F.endowment, { short: true }) + ' FCFA'} tone="teal" icon="landmark" />
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Legend({ color, label, dashed }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--fg-subtle)' }}>
      <span style={{ width: 18, height: 0, borderTop: `2.5px ${dashed ? 'dashed' : 'solid'} ${color}` }} />{label}
    </span>
  );
}

function MiniStat({ label, value, tone, icon }) {
  const c = { error: 'var(--error-500)', success: 'var(--success-500)', info: 'var(--info-500)', teal: 'var(--accent)' }[tone];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'var(--bg-subtle)', color: c,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={icon} size={16} /></span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>{value}</div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>{label}</div>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard });
