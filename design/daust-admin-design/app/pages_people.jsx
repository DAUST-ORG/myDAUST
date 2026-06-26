// ============================================================
// DAUST Admin — Admissions & Students modules
// ============================================================
const { useState: useStatePpl } = React;

// ---------- ADMISSIONS ----------
const STAGES = ['Submitted', 'Under Review', 'Interview', 'Offer', 'Accepted'];
function Admissions({ go }) {
  const [q, setQ] = useStatePpl('');
  const [sel, setSel] = useStatePpl(null);
  const apps = window.APPLICANTS;
  const counts = STAGES.map(st => apps.filter(a => a.stage === st).length);
  const rows = apps.filter(a => a.name.toLowerCase().includes(q.toLowerCase()) || a.id.toLowerCase().includes(q.toLowerCase()));
  const stageTone = { Submitted: 'neutral', 'Under Review': 'info', Interview: 'warning', Offer: 'teal', Accepted: 'success', Waitlist: 'warning', Rejected: 'error' };

  return (
    <div className="fade-in">
      <PageHeader eyebrow="Admissions & Registration" title="Admissions" subtitle="Track applicants through the pipeline — from first submission to enrollment."
        actions={<><Button variant="outline" icon="filter">Filters</Button><Button variant="primary" icon="user-plus">Add applicant</Button></>} />

      {/* Funnel */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 22, flexWrap: 'wrap' }}>
        {STAGES.map((st, i) => (
          <Card key={st} padding={16} style={{ flex: 1, minWidth: 150 }}>
            <div style={{ fontSize: 11.5, color: 'var(--fg-subtle)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{st}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--fg)', margin: '6px 0' }}>{counts[i] + (i === 0 ? 320 : i === 1 ? 14 : 0)}</div>
            <Progress value={counts[i] + (i === 0 ? 320 : 0)} max={342} tone="teal" height={6} />
          </Card>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <SearchInput placeholder="Search applicants…" value={q} onChange={setQ} width={280} />
        <div style={{ flex: 1 }} />
        <Button variant="outline" icon="download" size="md">Export</Button>
      </div>

      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="dt">
            <thead><tr><th>Applicant</th><th>Program</th><th>Country</th><th>Score</th><th>Documents</th><th>Stage</th><th>Submitted</th><th></th></tr></thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => setSel(a)}>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Avatar name={a.name} size={28} /><div><div style={{ color: 'var(--fg)', fontWeight: 600 }}>{a.name}</div><div style={{ fontSize: 11.5, color: 'var(--fg-faint)', fontFamily: 'var(--font-mono)' }}>{a.id}</div></div></div></td>
                  <td><Badge tone="neutral" dot={false} size="sm">{a.programName}</Badge></td>
                  <td>{a.country}</td>
                  <td><span style={{ fontWeight: 700, color: a.score >= 85 ? 'var(--success-500)' : a.score >= 70 ? 'var(--fg)' : 'var(--warning-500)' }}>{a.score}</span></td>
                  <td>{a.docs ? <Badge tone="success" size="sm">Complete</Badge> : <Badge tone="warning" size="sm">Missing</Badge>}</td>
                  <td><Badge tone={stageTone[a.stage]} size="sm">{a.stage}</Badge></td>
                  <td>{a.submitted}</td>
                  <td style={{ textAlign: 'right' }}><Icon name="chevron-right" size={16} style={{ color: 'var(--fg-faint)' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Drawer open={!!sel} onClose={() => setSel(null)} title="Applicant" width={480}
        footer={sel && <><Button variant="danger" icon="x">Reject</Button><Button variant="outline" icon="arrow-right">Advance stage</Button><Button variant="primary" icon="check">Make offer</Button></>}>
        {sel && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <Avatar name={sel.name} size={56} />
              <div><div style={{ fontWeight: 700, fontSize: 18 }}>{sel.name}</div>
                <div style={{ fontSize: 13, color: 'var(--fg-subtle)' }}>{sel.programName} · {sel.country}</div>
                <div style={{ marginTop: 6 }}><Badge tone={stageTone[sel.stage]} size="sm">{sel.stage}</Badge></div>
              </div>
            </div>
            <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)', padding: 16, display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
              <div><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)' }}>{sel.score}</div><div style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>Admission score</div></div>
              <div style={{ width: 1, background: 'var(--border)' }} />
              <div><div style={{ fontSize: 24, fontWeight: 800, color: sel.docs ? 'var(--success-500)' : 'var(--warning-500)' }}>{sel.docs ? '5/5' : '3/5'}</div><div style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>Documents</div></div>
            </div>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 10 }}>Application timeline</div>
              {[['Application submitted', sel.submitted, true], ['Documents verified', '2026-04-02', sel.docs], ['Under academic review', '2026-04-10', sel.stage !== 'Submitted'], ['Interview scheduled', '—', ['Interview', 'Offer', 'Accepted'].includes(sel.stage)], ['Decision', '—', ['Offer', 'Accepted'].includes(sel.stage)]].map(([l, d, done], i) => (
                <div key={i} style={{ display: 'flex', gap: 12, paddingBottom: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ width: 18, height: 18, borderRadius: '50%', background: done ? 'var(--accent)' : 'var(--bg-subtle)', border: done ? 'none' : '1px solid var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{done && <Icon name="check" size={11} style={{ color: '#fff' }} />}</span>
                    {i < 4 && <span style={{ width: 1, flex: 1, minHeight: 16, background: 'var(--border)' }} />}
                  </div>
                  <div><div style={{ fontSize: 13.5, fontWeight: 600, color: done ? 'var(--fg)' : 'var(--fg-faint)' }}>{l}</div><div style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>{d}</div></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ---------- STUDENTS ----------
function Students({ go }) {
  const [q, setQ] = useStatePpl('');
  const [prog, setProg] = useStatePpl('All');
  const [sel, setSel] = useStatePpl(null);
  const progOpts = [{ value: 'All', label: 'All programs' }, ...window.PROGRAMS.map(p => ({ value: p.code, label: p.name }))];
  const rows = window.STUDENTS.filter(s =>
    (prog === 'All' || s.program === prog) &&
    (s.name.toLowerCase().includes(q.toLowerCase()) || s.id.toLowerCase().includes(q.toLowerCase()))
  );
  const statusTone = { Enrolled: 'success', Probation: 'warning', Leave: 'neutral', 'On Hold': 'error' };

  return (
    <div className="fade-in">
      <PageHeader eyebrow="Student Records" title="Students" subtitle={`${window.TOTAL_STUDENTS.toLocaleString()} enrolled across ${window.PROGRAMS.length} programs.`}
        actions={<><Button variant="outline" icon="upload">Import</Button><Button variant="primary" icon="user-plus">Enroll student</Button></>} />

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <SearchInput placeholder="Search by name or ID…" value={q} onChange={setQ} width={280} />
        <Select options={progOpts} value={prog} onChange={setProg} />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: 'var(--fg-subtle)' }}>{rows.length} of {window.STUDENTS.length} shown</span>
      </div>

      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="dt">
            <thead><tr><th>Student</th><th>Program</th><th>Year</th><th>GPA</th><th>Credits</th><th>Balance</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map(s => (
                <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setSel(s)}>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Avatar name={s.name} size={30} /><div><div style={{ color: 'var(--fg)', fontWeight: 600 }}>{s.name}</div><div style={{ fontSize: 11.5, color: 'var(--fg-faint)', fontFamily: 'var(--font-mono)' }}>{s.id}</div></div></div></td>
                  <td><Badge tone="neutral" dot={false} size="sm">{s.program}</Badge></td>
                  <td>Year {s.year}</td>
                  <td><span style={{ fontWeight: 700, color: s.gpa >= 3.5 ? 'var(--success-500)' : s.gpa < 2.5 ? 'var(--warning-500)' : 'var(--fg)' }}>{s.gpa.toFixed(2)}</span></td>
                  <td>{s.credits}</td>
                  <td style={{ color: s.balance > 0 ? 'var(--error-500)' : 'var(--fg-subtle)', fontWeight: s.balance > 0 ? 600 : 400 }}>{s.balance > 0 ? <FCFA value={s.balance} /> : 'Cleared'}</td>
                  <td><Badge tone={statusTone[s.status]} size="sm">{s.status}</Badge></td>
                  <td style={{ textAlign: 'right' }}><Icon name="chevron-right" size={16} style={{ color: 'var(--fg-faint)' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <EmptyState icon="users" title="No students found" sub="Adjust your search or program filter." />}
      </Card>

      <Drawer open={!!sel} onClose={() => setSel(null)} title="Student record" width={500}
        footer={sel && <><Button variant="outline" icon="file-text">Transcript</Button><Button variant="primary" icon="pencil">Edit record</Button></>}>
        {sel && <StudentDetail s={sel} statusTone={statusTone} />}
      </Drawer>
    </div>
  );
}

function StudentDetail({ s, statusTone }) {
  const [tab, setTab] = useStatePpl('overview');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Avatar name={s.name} size={56} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{s.name}</div>
          <div style={{ fontSize: 13, color: 'var(--fg-subtle)' }}>{s.email}</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6 }}><Badge tone={statusTone[s.status]} size="sm">{s.status}</Badge><Badge tone="neutral" dot={false} size="sm">{s.programName}</Badge></div>
        </div>
      </div>
      <Tabs tabs={[{ value: 'overview', label: 'Overview' }, { value: 'academics', label: 'Academics' }, { value: 'finance', label: 'Finance' }]} active={tab} onChange={setTab} />
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <DetailRow label="Student ID" value={s.id} />
          <DetailRow label="Program" value={s.programName} />
          <DetailRow label="Year" value={'Year ' + s.year} />
          <DetailRow label="Country" value={s.country} />
          <DetailRow label="Enrolled" value="Sep 2022" />
          <DetailRow label="Credits this term" value={s.credits} />
        </div>
      )}
      {tab === 'academics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)', padding: 16, display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
            <div><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)' }}>{s.gpa.toFixed(2)}</div><div style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>Cumulative GPA</div></div>
            <div style={{ width: 1, background: 'var(--border)' }} />
            <div><div style={{ fontSize: 24, fontWeight: 800, color: 'var(--fg)' }}>{84 + s.year * 12}</div><div style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>Credits earned</div></div>
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-muted)' }}>Current courses</div>
          {window.COURSES.filter(c => c.prog === s.program).slice(0, 3).map(c => (
            <div key={c.code} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--divider)', fontSize: 13.5 }}>
              <div><b style={{ color: 'var(--fg)' }}>{c.code}</b> <span style={{ color: 'var(--fg-muted)' }}>{c.name}</span></div>
              <span style={{ color: 'var(--fg-subtle)' }}>{c.credits} cr</span>
            </div>
          ))}
        </div>
      )}
      {tab === 'finance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: s.balance > 0 ? 'rgba(239,68,68,0.08)' : 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)', padding: 18, textAlign: 'center' }}>
            <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginBottom: 4 }}>Account balance</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.balance > 0 ? 'var(--error-500)' : 'var(--success-500)' }}>{s.balance > 0 ? <FCFA value={s.balance} /> : 'Cleared'}</div>
          </div>
          <DetailRow label="Tuition (term)" value={<FCFA value={1925000} />} />
          <DetailRow label="Financial aid" value={s.gpa >= 3.5 ? '40% merit' : '—'} />
          <DetailRow label="Last payment" value="2026-02-14" />
          {s.balance > 0 && <Button variant="primary" icon="send" style={{ marginTop: 4 }}>Send payment reminder</Button>}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { Admissions, Students });
