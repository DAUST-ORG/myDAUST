// ============================================================
// DAUST Admin — Library, Housing, Communications, Reports, Settings
// ============================================================
const { useState: useStateAdmin } = React;

// ---------- LIBRARY ----------
function Library() {
  return (
    <div className="fade-in">
      <PageHeader eyebrow="Library & Resources" title="Library" subtitle="Catalog, circulation, and digital resource subscriptions."
        actions={<><Button variant="outline" icon="scan-line">Check in / out</Button><Button variant="primary" icon="plus">Add title</Button></>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 16, marginBottom: 22 }}>
        <Stat label="Titles in catalog" value="24,180" icon="book" delta="+312 this year" deltaTone="up" />
        <Stat label="On loan" value="1,847" icon="book-open" delta="68 overdue" deltaTone="down" />
        <Stat label="Digital databases" value="42" icon="database" delta="IEEE · ACM · JSTOR" deltaTone="flat" />
        <Stat label="Study room bookings" value="96" icon="door-open" delta="today" deltaTone="flat" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}><h3 style={{ fontSize: 15, fontWeight: 700 }}>Recently circulated</h3></div>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Title</th><th>Borrower</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                {[['Introduction to Algorithms', 'Awa Diop', '2026-06-02', 'On loan'], ['Petroleum Reservoir Engineering', 'Modou Fall', '2026-05-20', 'Overdue'], ['Deep Learning', 'Fatou Sow', '2026-06-10', 'On loan'], ['Process Dynamics & Control', 'Cheikh Bâ', '2026-06-05', 'On loan'], ['Signals and Systems', 'Bineta Gueye', '2026-05-18', 'Overdue']].map((r, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{r[0]}</td>
                    <td>{r[1]}</td><td>{r[2]}</td>
                    <td><Badge tone={r[3] === 'Overdue' ? 'error' : 'info'} size="sm">{r[3]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card padding={22}>
          <SectionTitle>Collection by subject</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[['Engineering', 38, '#153B6A'], ['Computer Science', 26, '#0EA5E9'], ['Mathematics', 14, '#8B5CF6'], ['Sciences', 12, '#F97316'], ['General', 10, '#64748B']].map(([l, v, c]) => (
              <div key={l}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}><span style={{ color: 'var(--fg-muted)' }}>{l}</span><b>{v}%</b></div>
                <div style={{ height: 7, background: 'var(--bg-subtle)', borderRadius: 999 }}><div style={{ width: v + '%', height: '100%', background: c, borderRadius: 999 }} /></div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------- HOUSING ----------
function Housing() {
  const total = window.HOUSING.reduce((a, b) => a + b.capacity, 0);
  const occ = window.HOUSING.reduce((a, b) => a + b.occupied, 0);
  return (
    <div className="fade-in">
      <PageHeader eyebrow="Campus & Facilities" title="Housing" subtitle="Residence blocks, occupancy and Fall 2026 applications."
        actions={<><Button variant="outline" icon="list">Waitlist</Button><Button variant="primary" icon="plus">Assign room</Button></>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))', gap: 16, marginBottom: 22 }}>
        <Stat label="Total beds" value={total} icon="bed" delta="4 blocks" deltaTone="flat" />
        <Stat label="Occupied" value={occ} icon="users" delta={Math.round(occ / total * 100) + '% full'} deltaTone="up" />
        <Stat label="Available" value={total - occ} icon="door-open" delta="Fall intake" deltaTone="flat" />
        <Stat label="Applications" value="214" icon="file-text" delta="open" deltaTone="flat" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: 16 }}>
        {window.HOUSING.map(h => {
          const pct = Math.round(h.occupied / h.capacity * 100);
          return (
            <Card key={h.block} padding={20}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div><div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--fg)' }}>{h.block}</div><div style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>{h.gender}</div></div>
                <Badge tone={pct > 95 ? 'error' : pct > 80 ? 'warning' : 'success'} size="sm">{pct}%</Badge>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--fg)' }}>{h.occupied}</span>
                <span style={{ fontSize: 14, color: 'var(--fg-subtle)' }}>/ {h.capacity} beds</span>
              </div>
              <Progress value={h.occupied} max={h.capacity} tone={pct > 95 ? 'error' : 'teal'} height={8} />
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ---------- COMMUNICATIONS ----------
function Comms() {
  const [showNew, setShowNew] = useStateAdmin(false);
  const tagTone = { Academics: 'info', Finance: 'teal', Staff: 'neutral', Campus: 'warning', Housing: 'success' };
  return (
    <div className="fade-in">
      <PageHeader eyebrow="Communications" title="Announcements" subtitle="Broadcast to students, faculty, or the whole campus."
        actions={<Button variant="primary" icon="megaphone" onClick={() => setShowNew(true)}>New announcement</Button>} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 860 }}>
        {window.ANNOUNCEMENTS.map(a => (
          <Card key={a.id} hover padding={18}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <span style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--bg-tint)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={a.pinned ? 'pin' : 'megaphone'} size={18} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>{a.title}</span>
                  {a.pinned && <Badge tone="warning" dot={false} size="sm">Pinned</Badge>}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Badge tone={tagTone[a.tag]} dot={false} size="sm">{a.tag}</Badge>
                  <span>{a.audience}</span><span>·</span><span>{a.author}</span><span>·</span><span>{a.date}</span>
                </div>
              </div>
              <IconButton name="more-horizontal" title="More" />
            </div>
          </Card>
        ))}
      </div>
      <Modal open={showNew} onClose={() => setShowNew(false)} title="New announcement" width={520}
        footer={<><Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button><Button variant="outline" icon="save">Save draft</Button><Button variant="primary" icon="send" onClick={() => setShowNew(false)}>Publish</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Title"><Input placeholder="e.g. Final exam schedule published" /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Audience"><Select options={['All students', 'Faculty', 'Staff', 'Whole campus']} /></Field>
            <Field label="Category"><Select options={['Academics', 'Finance', 'Staff', 'Campus', 'Housing']} /></Field>
          </div>
          <Field label="Message"><textarea rows={4} style={{ padding: '9px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)', fontFamily: 'var(--font-sans)', fontSize: 13.5, resize: 'vertical' }} /></Field>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Toggle checked={true} onChange={() => {}} /><span style={{ fontSize: 13.5, color: 'var(--fg-muted)' }}>Also send as email & push</span></div>
        </div>
      </Modal>
    </div>
  );
}

// ---------- REPORTS ----------
function Reports() {
  const reports = [
    { icon: 'wallet', title: 'Tuition collection report', desc: 'Billed vs. collected by program and term', tag: 'Finance' },
    { icon: 'users', title: 'Enrollment census', desc: 'Headcount by program, year and nationality', tag: 'Students' },
    { icon: 'trending-up', title: 'Revenue & expenditure', desc: 'Monthly P&L with budget variance', tag: 'Finance' },
    { icon: 'graduation-cap', title: 'Academic standing', desc: 'GPA distribution, probation and honors lists', tag: 'Academics' },
    { icon: 'file-check', title: 'Admissions funnel', desc: 'Conversion from application to enrollment', tag: 'Admissions' },
    { icon: 'briefcase', title: 'Payroll summary', desc: 'Salary outlay by department and contract type', tag: 'HR' },
    { icon: 'bed', title: 'Housing occupancy', desc: 'Bed utilization and waitlist by block', tag: 'Facilities' },
    { icon: 'shield-check', title: 'Audit & access log', desc: 'Who changed what, when — full trail', tag: 'System' },
  ];
  return (
    <div className="fade-in">
      <PageHeader eyebrow="Reports & Analytics" title="Reports" subtitle="Generate, schedule and export institutional reports."
        actions={<Button variant="primary" icon="plus">Custom report</Button>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px,1fr))', gap: 16 }}>
        {reports.map(r => (
          <Card key={r.title} hover padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <span style={{ width: 42, height: 42, borderRadius: 'var(--radius-lg)', background: 'var(--bg-tint)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={r.icon} size={20} /></span>
              <Badge tone="neutral" dot={false} size="sm">{r.tag}</Badge>
            </div>
            <div><div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>{r.title}</div><div style={{ fontSize: 13, color: 'var(--fg-subtle)', marginTop: 4 }}>{r.desc}</div></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 8 }}>
              <Button variant="outline" size="sm" icon="eye">Preview</Button>
              <Button variant="ghost" size="sm" icon="download">Export</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------- SETTINGS / ROLES ----------
function Settings() {
  const [tab, setTab] = useStateAdmin('roles');
  return (
    <div className="fade-in">
      <PageHeader eyebrow="Administration" title="Settings" subtitle="Roles, permissions, users and system configuration."
        actions={<Button variant="primary" icon="user-plus">Invite user</Button>} />
      <Tabs tabs={[{ value: 'roles', label: 'Roles & permissions' }, { value: 'users', label: 'Users' }, { value: 'general', label: 'General' }]} active={tab} onChange={setTab} />
      {tab === 'roles' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px,1fr))', gap: 16 }}>
          {window.ROLES_LIST.map(r => (
            <Card key={r.role} padding={20}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>{r.role}</div>
                <Badge tone="teal" dot={false} size="sm">{r.users} users</Badge>
              </div>
              <p style={{ fontSize: 13, color: 'var(--fg-subtle)', marginBottom: 14 }}>{r.desc}</p>
              <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, marginBottom: 6 }}>Access</div>
              <div style={{ fontSize: 13, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>{r.perms}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <Button variant="outline" size="sm" icon="pencil">Edit</Button>
                <Button variant="ghost" size="sm" icon="copy">Duplicate</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {tab === 'users' && (
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>User</th><th>Role</th><th>Last active</th><th>Status</th></tr></thead>
              <tbody>
                {[['Dr. Léopold Senghor', 'Super Admin', 'Active now', 'Active'], ['Aïssatou Faye', 'Accountant', '5 min ago', 'Active'], ['Moussa Diouf', 'Registrar', '1 h ago', 'Active'], ['Pape Sarr', 'Dean / Dept Head', '3 h ago', 'Active'], ['Khady Mbaye', 'HR Officer', 'Yesterday', 'Active'], ['Ibrahima Kane', 'IT Admin', '2 days ago', 'Invited']].map((u, i) => (
                  <tr key={i}>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Avatar name={u[0]} size={30} /><span style={{ color: 'var(--fg)', fontWeight: 600 }}>{u[0]}</span></div></td>
                    <td><Badge tone="neutral" dot={false} size="sm">{u[1]}</Badge></td>
                    <td>{u[2]}</td>
                    <td><Badge tone={u[3] === 'Active' ? 'success' : 'warning'} size="sm">{u[3]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {tab === 'general' && (
        <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card padding={22}>
            <SectionTitle>Institution</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Field label="Institution name"><Input defaultValue="Dakar American University of Science & Technology" /></Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Currency"><Select options={['FCFA (XOF)', 'USD', 'EUR']} /></Field>
                <Field label="Academic year"><Select options={['2025–26', '2026–27']} /></Field>
              </div>
            </div>
          </Card>
          <Card padding={22}>
            <SectionTitle>Preferences</SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[['Two-factor authentication', 'Require 2FA for all admin accounts', true], ['Email notifications', 'Daily digest of overdue invoices', true], ['Auto-lock holds', 'Hold records over 1.5M FCFA outstanding', false]].map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 14, borderBottom: i < 2 ? '1px solid var(--divider)' : 'none' }}>
                  <div><div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{p[0]}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{p[1]}</div></div>
                  <SettingToggle initial={p[2]} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
function SettingToggle({ initial }) { const [v, setV] = useStateAdmin(initial); return <Toggle checked={v} onChange={setV} />; }

Object.assign(window, { Library, Housing, Comms, Reports, Settings });
