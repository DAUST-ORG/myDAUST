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
function srngPpl(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}let x=h>>>0;return()=>{x=(x*1664525+1013904223)>>>0;return x/4294967296;};}
function pad2(n){return (n<10?'0':'')+n;}
function gradePpl(g){return g>=3.7?'A':g>=3.3?'A-':g>=3?'B+':g>=2.7?'B':g>=2.3?'B-':g>=2?'C+':'C';}
function enrichStudent(s){
  if(s._enriched) return s;
  const r = srngPpl(s.id);
  const pk = a => a[Math.floor(r()*a.length)];
  const dig = n => { let o=''; for(let i=0;i<n;i++) o+=Math.floor(r()*10); return o; };
  s.gender = pk(['Female','Male']);
  s.dob = '200'+(4+Math.floor(r()*4))+'-'+pad2(1+Math.floor(r()*12))+'-'+pad2(1+Math.floor(r()*28));
  s.phone = '+221 '+pk(['77','78','76','70'])+' '+dig(3)+' '+dig(2)+' '+dig(2);
  s.city = pk(['Dakar','Thiès','Somone','Saint-Louis','Mbour','Rufisque','Ziguinchor']);
  s.address = (100+Math.floor(r()*900))+' '+pk(['Rue','Avenue','Cité'])+' '+pk(['Léopold Senghor','Blaise Diagne','Cheikh Anta Diop','de la Corniche','des Almadies']);
  s.cohort = 'Class of ' + (2026 - s.year + 5);
  s.creditsEarned = Math.min(160, (s.year-1)*32 + Math.floor(r()*28));
  s.standing = s.gpa >= 3.5 ? 'Dean’s List' : s.gpa < 2.5 ? 'Academic Probation' : 'Good Standing';
  s.advisor = 'Dr. ' + pk(['Awa Diop','Khadim Fall','Modou Sow','Ibrahima Bâ','Fatou Sarr','Ousmane Gueye','Bineta Ndiaye']);
  s.guardian = { name: pk(['Awa','Mamadou','Fatou','Ousmane','Cheikh','Bineta','Ibrahima','Khady']) + ' ' + s.name.split(' ').slice(-1)[0], relation: pk(['Parent','Guardian','Sibling']), phone: '+221 '+pk(['77','78','76'])+' '+dig(3)+' '+dig(2)+' '+dig(2) };
  s.courses = (window.COURSES.filter(c => c.prog === s.program).length ? window.COURSES.filter(c => c.prog === s.program) : window.COURSES.slice(0,4)).map(c => { const g = Math.max(1.7, Math.min(4, s.gpa + (r()-0.5)*0.9)); return { code:c.code, name:c.name, credits:c.credits, gp:g, grade:gradePpl(g), instructor:c.instructor }; });
  s.payments = [];
  const np = 1 + Math.floor(r()*3);
  for(let i=0;i<np;i++) s.payments.push({ date: pad2(1+Math.floor(r()*28))+' '+pk(['Jan','Feb','Mar','Apr','May'])+' 2026', amount: pk([500000,962500,1925000,250000,180000]), method: pk(['Orange Money','Wave','Bank Transfer','Card']), ref: 'RCP-2026-'+(100000+Math.floor(r()*899999)), item: pk(['Tuition instalment','Lab fee','Student services','Tuition — Fall']) });
  s._enriched = true;
  return s;
}

function Students({ go }) {
  const [q, setQ] = useStatePpl('');
  const [prog, setProg] = useStatePpl('All');
  const [view, setView] = useStatePpl(null);
  const progOpts = [{ value: 'All', label: 'All programs' }, ...window.PROGRAMS.map(p => ({ value: p.code, label: p.name }))];
  const rows = window.STUDENTS.filter(s =>
    (prog === 'All' || s.program === prog) &&
    (s.name.toLowerCase().includes(q.toLowerCase()) || s.id.toLowerCase().includes(q.toLowerCase()))
  );
  const statusTone = { Enrolled: 'success', Probation: 'warning', Leave: 'neutral', 'On Hold': 'error' };

  if (view) return <StudentProfile s={enrichStudent(view)} statusTone={statusTone} onBack={() => setView(null)} go={go} />;

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
                <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setView(s)}>
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
    </div>
  );
}

// ---------- FULL STUDENT PROFILE (full page) ----------
function ProfileCard({ title, icon, children, action }) {
  return (
    <Card padding={0} style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', borderBottom: '1px solid var(--border)' }}>
        <h4 style={{ fontSize: 14.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 9 }}><Icon name={icon} size={16} style={{ color: 'var(--accent)' }} />{title}</h4>
        {action}
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </Card>
  );
}
function PKV({ k, v, strong }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, padding: '9px 0', borderBottom: '1px solid var(--divider)', fontSize: 13 }}>
      <span style={{ color: 'var(--fg-subtle)', flexShrink: 0 }}>{k}</span>
      <span style={{ color: 'var(--fg)', fontWeight: strong ? 700 : 600, textAlign: 'right' }}>{v}</span>
    </div>
  );
}
function ProfileStat({ label, value, unit, icon, tone }) {
  const c = tone === 'danger' ? 'var(--error-500)' : tone === 'accent' ? 'var(--accent)' : tone === 'ok' ? 'var(--success-500)' : 'var(--fg)';
  return (
    <Card padding={16}>
      <div style={{ fontSize: 12, color: 'var(--fg-subtle)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}><Icon name={icon} size={14} style={{ color: 'var(--accent)' }} />{label}</div>
      <div style={{ fontSize: 23, fontWeight: 800, marginTop: 8, color: c, letterSpacing: '-0.01em' }}>{value}{unit && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-faint)', marginLeft: 4 }}>{unit}</span>}</div>
    </Card>
  );
}

function StudentProfile({ s, statusTone, onBack, go }) {
  const [tab, setTab] = useStatePpl('overview');
  const gradeColor = gp => gp >= 3.3 ? 'var(--success-500)' : gp < 2.3 ? 'var(--error-500)' : 'var(--fg)';
  const totalPaid = s.payments.reduce((a, p) => a + p.amount, 0);

  return (
    <div className="fade-in">
      {/* Back + actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', fontWeight: 600, fontSize: 13.5, fontFamily: 'var(--font-sans)', padding: '6px 4px' }}>
          <Icon name="arrow-left" size={16} /> All students
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="outline" icon="file-text">Transcript</Button>
          {s.balance > 0 && <Button variant="outline" icon="send">Payment reminder</Button>}
          <Button variant="primary" icon="pencil">Edit record</Button>
        </div>
      </div>

      {/* Hero */}
      <div style={{ background: 'var(--grad-dark-surface)', borderRadius: 'var(--radius-xl)', padding: '26px 28px', color: '#fff', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <Avatar name={s.name} size={72} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>{s.name}</div>
          <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.65)', marginTop: 3 }}>{s.id} · {s.email}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <HeroPill icon="badge-check" tone={s.status === 'Enrolled' ? 'ok' : 'warn'}>{s.status}</HeroPill>
            <HeroPill icon="graduation-cap">{s.programName}</HeroPill>
            <HeroPill icon="calendar">Year {s.year} · {s.cohort}</HeroPill>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginTop: 16 }}>
        <ProfileStat label="Account balance" value={s.balance > 0 ? fmtFCFA(s.balance, { short: true }) : 'Cleared'} unit={s.balance > 0 ? 'FCFA' : ''} icon="wallet" tone={s.balance > 0 ? 'danger' : 'ok'} />
        <ProfileStat label="Cumulative GPA" value={s.gpa.toFixed(2)} unit="/ 4.0" icon="award" tone="accent" />
        <ProfileStat label="Credits earned" value={s.creditsEarned} unit="/ 160" icon="layers" />
        <ProfileStat label="Standing" value={s.standing === 'Academic Probation' ? 'Probation' : s.standing === 'Dean’s List' ? 'Dean’s List' : 'Good'} icon="check-circle-2" />
      </div>

      <div style={{ marginTop: 22 }}>
        <Tabs tabs={[{ value: 'overview', label: 'Overview' }, { value: 'academics', label: 'Academics' }, { value: 'finance', label: 'Finance' }, { value: 'personal', label: 'Personal & contact' }, { value: 'activity', label: 'Activity' }]} active={tab} onChange={setTab} />
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
          <ProfileCard title="Enrollment" icon="book-open">
            <PKV k="Program" v={s.programName} /><PKV k="Year of study" v={'Year ' + s.year} /><PKV k="Cohort" v={s.cohort} /><PKV k="Enrolled" v={s.enrolled || 'Sep 2022'} /><PKV k="Advisor" v={s.advisor} /><PKV k="Status" v={s.status} />
          </ProfileCard>
          <ProfileCard title="Account summary" icon="receipt">
            <PKV k="Balance" v={s.balance > 0 ? <span style={{ color: 'var(--error-500)' }}><FCFA value={s.balance} /></span> : <span style={{ color: 'var(--success-500)' }}>Cleared</span>} strong />
            <PKV k="Payments on record" v={s.payments.length} /><PKV k="Total paid (yr)" v={<FCFA value={totalPaid} />} /><PKV k="Credits this term" v={s.credits} />
          </ProfileCard>
          <ProfileCard title="Contact" icon="phone">
            <PKV k="Email" v={s.email} /><PKV k="Phone" v={s.phone} /><PKV k="City" v={s.city} /><PKV k="Nationality" v={s.country} />
          </ProfileCard>
        </div>
      )}

      {tab === 'academics' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.5fr)', gap: 16, alignItems: 'start' }}>
          <ProfileCard title="Standing" icon="award">
            <PKV k="Cumulative GPA" v={s.gpa.toFixed(2) + ' / 4.0'} strong /><PKV k="Academic standing" v={s.standing} /><PKV k="Credits earned" v={s.creditsEarned + ' / 160'} /><PKV k="Credits this term" v={s.credits} /><PKV k="Expected graduation" v={s.cohort} /><PKV k="Advisor" v={s.advisor} />
          </ProfileCard>
          <ProfileCard title="Current courses — Spring 2026" icon="book-open">
            <table className="dt" style={{ margin: '-4px 0' }}>
              <thead><tr><th>Code</th><th>Course</th><th>Cr.</th><th>Instructor</th><th>Grade</th></tr></thead>
              <tbody>
                {s.courses.map(c => (
                  <tr key={c.code}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--fg)', fontWeight: 600 }}>{c.code}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{c.name}</td>
                    <td>{c.credits}</td>
                    <td style={{ fontSize: 12.5 }}>{c.instructor}</td>
                    <td><span style={{ fontWeight: 800, color: gradeColor(c.gp) }}>{c.grade}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ProfileCard>
        </div>
      )}

      {tab === 'finance' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.5fr)', gap: 16, alignItems: 'start' }}>
          <ProfileCard title="Balance" icon="wallet">
            <div style={{ textAlign: 'center', padding: '10px 0 14px' }}>
              <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>Outstanding</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: s.balance > 0 ? 'var(--error-500)' : 'var(--success-500)', marginTop: 4 }}>{s.balance > 0 ? <FCFA value={s.balance} /> : 'Cleared'}</div>
            </div>
            <PKV k="Tuition (term)" v={<FCFA value={1925000} />} /><PKV k="Financial aid" v={s.gpa >= 3.5 ? '40% merit' : '—'} /><PKV k="Total paid (yr)" v={<FCFA value={totalPaid} />} /><PKV k="Last payment" v={s.payments[0] ? s.payments[0].date : '—'} />
            {s.balance > 0 && <Button variant="primary" icon="send" style={{ marginTop: 14, width: '100%' }}>Send payment reminder</Button>}
          </ProfileCard>
          <ProfileCard title="Payment history" icon="clock">
            {s.payments.length ? (
              <table className="dt" style={{ margin: '-4px 0' }}>
                <thead><tr><th>Date</th><th>Item</th><th>Method</th><th>Receipt</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                  {s.payments.map((p, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: 'nowrap' }}>{p.date}</td>
                      <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{p.item}</td>
                      <td>{p.method}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--fg-faint)' }}>{p.ref}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success-500)' }}><FCFA value={p.amount} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyState icon="clock" title="No payments recorded" />}
          </ProfileCard>
        </div>
      )}

      {tab === 'personal' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
          <ProfileCard title="Personal details" icon="user">
            <PKV k="Full name" v={s.name} /><PKV k="Student ID" v={s.id} /><PKV k="Date of birth" v={s.dob} /><PKV k="Gender" v={s.gender} /><PKV k="Nationality" v={s.country} />
          </ProfileCard>
          <ProfileCard title="Contact" icon="phone">
            <PKV k="Email" v={s.email} /><PKV k="Phone" v={s.phone} /><PKV k="Address" v={s.address} /><PKV k="City" v={s.city} />
          </ProfileCard>
          <ProfileCard title="Guardian / emergency" icon="users">
            <PKV k="Name" v={s.guardian.name} /><PKV k="Relationship" v={s.guardian.relation} /><PKV k="Phone" v={s.guardian.phone} />
          </ProfileCard>
        </div>
      )}

      {tab === 'activity' && (
        <ProfileCard title="Activity timeline" icon="activity">
          <Timeline s={s} />
        </ProfileCard>
      )}
    </div>
  );
}

function HeroPill({ icon, children, tone }) {
  const bg = tone === 'warn' ? 'rgba(245,158,11,0.24)' : 'rgba(255,255,255,0.12)';
  const ic = tone === 'ok' ? '#7ee0a8' : tone === 'warn' ? '#ffc98f' : 'var(--teal-300)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: bg, borderRadius: 999, padding: '5px 12px', fontSize: 11.5, fontWeight: 600, color: '#fff' }}>
      <Icon name={icon} size={13} style={{ color: ic }} />{children}
    </span>
  );
}

function Timeline({ s }) {
  const ev = [];
  ev.push({ icon: 'user-plus', tone: 'var(--accent)', t: 'Account created', d: (s.enrolled || 'Sep 2022') + ' · enrolled in ' + s.programName });
  s.payments.forEach(p => ev.push({ icon: 'check-circle-2', tone: 'var(--success-500)', t: 'Payment received — ' + fmtFCFA(p.amount) + ' FCFA', d: p.date + ' · ' + p.method + ' · ' + p.ref }));
  if (s.balance > 0) ev.push({ icon: 'clock', tone: 'var(--warning-500)', t: 'Balance outstanding — ' + fmtFCFA(s.balance) + ' FCFA', d: 'Payment due this term' });
  ev.push({ icon: 'award', tone: 'var(--accent)', t: 'Standing: ' + s.standing, d: 'GPA ' + s.gpa.toFixed(2) + ' · Year ' + s.year });
  return (
    <div>
      {ev.map((e, i) => (
        <div key={i} style={{ display: 'flex', gap: 14, paddingBottom: i < ev.length - 1 ? 18 : 0, position: 'relative' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-subtle)', border: '1px solid var(--border)', color: e.tone, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={e.icon} size={15} /></span>
            {i < ev.length - 1 && <span style={{ width: 1, flex: 1, minHeight: 18, background: 'var(--border)', marginTop: 2 }} />}
          </div>
          <div style={{ paddingTop: 5 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg)' }}>{e.t}</div>
            <div style={{ fontSize: 12, color: 'var(--fg-faint)', marginTop: 1 }}>{e.d}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { Admissions, Students });
