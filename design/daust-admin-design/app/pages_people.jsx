// ============================================================
// DAUST Admin — Admissions & Students modules
// ============================================================
const { useState: useStatePpl } = React;

// ---------- ADMISSIONS ----------
const STAGES = ['Submitted', 'Under Review', 'Interview', 'Offer', 'Accepted'];
const STAGE_TONE = { Submitted: 'neutral', 'Under Review': 'info', Interview: 'warning', Offer: 'teal', Accepted: 'success', Waitlist: 'warning', Rejected: 'error' };
function Admissions({ go }) {
  const [q, setQ] = useStatePpl('');
  const [view, setView] = useStatePpl(null);
  const [adding, setAdding] = useStatePpl(false);
  const [, force] = useStatePpl(0);
  const apps = window.APPLICANTS;
  const counts = STAGES.map(st => apps.filter(a => a.stage === st).length);
  const rows = apps.filter(a => a.name.toLowerCase().includes(q.toLowerCase()) || a.id.toLowerCase().includes(q.toLowerCase()));

  if (view) return <ApplicantDetail a={enrichApplicant(view)} onBack={() => setView(null)} onChange={() => force(n => n + 1)} go={go} />;

  return (
    <div className="fade-in">
      <PageHeader eyebrow="Admissions & Registration" title="Admissions" subtitle="Track applicants through the pipeline — from first submission to enrollment."
        actions={<><Button variant="outline" icon="download">Export</Button><Button variant="primary" icon="user-plus" onClick={() => setAdding(true)}>Add applicant</Button></>} />

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
        <span style={{ fontSize: 13, color: 'var(--fg-subtle)' }}>{rows.length} applicants</span>
      </div>

      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="dt">
            <thead><tr><th>Applicant</th><th>Program</th><th>Country</th><th>Score</th><th>Documents</th><th>Stage</th><th>Submitted</th><th></th></tr></thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => setView(a)}>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Avatar name={a.name} size={28} /><div><div style={{ color: 'var(--fg)', fontWeight: 600 }}>{a.name}</div><div style={{ fontSize: 11.5, color: 'var(--fg-faint)', fontFamily: 'var(--font-mono)' }}>{a.id}</div></div></div></td>
                  <td><Badge tone="neutral" dot={false} size="sm">{a.programName}</Badge></td>
                  <td>{a.country}</td>
                  <td><span style={{ fontWeight: 700, color: a.score >= 85 ? 'var(--success-500)' : a.score >= 70 ? 'var(--fg)' : 'var(--warning-500)' }}>{a.score}</span></td>
                  <td>{a.docs ? <Badge tone="success" size="sm">Complete</Badge> : <Badge tone="warning" size="sm">Missing</Badge>}</td>
                  <td><Badge tone={STAGE_TONE[a.stage]} size="sm">{a.stage}</Badge></td>
                  <td>{a.submitted}</td>
                  <td style={{ textAlign: 'right' }}><Icon name="chevron-right" size={16} style={{ color: 'var(--fg-faint)' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AddApplicantModal open={adding} onClose={() => setAdding(false)} onCreate={(a) => { window.APPLICANTS.unshift(a); setAdding(false); force(n => n + 1); setView(a); }} />
    </div>
  );
}

function enrichApplicant(a) {
  if (a._enriched) return a;
  const r = srngPpl(a.id);
  const pk = arr => arr[Math.floor(r() * arr.length)];
  const dig = n => { let o = ''; for (let i = 0; i < n; i++) o += Math.floor(r() * 10); return o; };
  a.email = a.email || (a.name.split(' ')[0][0] + a.name.split(' ').slice(-1)[0]).toLowerCase().normalize('NFD').replace(/[^\w]/g, '') + '@gmail.com';
  a.phone = '+221 ' + pk(['77', '78', '76', '70']) + ' ' + dig(3) + ' ' + dig(2) + ' ' + dig(2);
  a.dob = '200' + (5 + Math.floor(r() * 3)) + '-' + pad2(1 + Math.floor(r() * 12)) + '-' + pad2(1 + Math.floor(r() * 28));
  a.gender = pk(['Female', 'Male']);
  a.priorSchool = pk(['Lycée Blaise Diagne', 'Cours Sainte-Marie de Hann', 'Lycée Seydina Limamou Laye', 'Prytanée Militaire', 'Mariama Bâ School', 'Lycée Lamine Guèye']);
  a.priorGrade = (12 + r() * 6).toFixed(1) + ' / 20';
  a.satMath = 600 + Math.floor(r() * 200);
  a.satVerbal = 520 + Math.floor(r() * 200);
  a.essayScore = a.score;
  a.interviewScore = a.stage === 'Interview' || a.stage === 'Offer' || a.stage === 'Accepted' ? 70 + Math.floor(r() * 28) : null;
  a.documents = [
    { name: 'Application form', done: true },
    { name: 'Academic transcript', done: a.docs },
    { name: 'National ID / passport', done: a.docs },
    { name: 'Recommendation letters', done: a.docs || r() > 0.5 },
    { name: 'English proficiency', done: a.docs && r() > 0.3 },
  ];
  a.aidRequested = r() > 0.55;
  a.notes = pk(['Strong maths profile, recommended for interview.', 'Excellent essay; verify transcript authenticity.', 'Needs English proficiency proof before offer.', 'Outstanding candidate — fast-track.', 'Awaiting recommendation letters.']);
  a._enriched = true;
  return a;
}

function AddApplicantModal({ open, onClose, onCreate }) {
  const progs = window.PROGRAMS.filter(p => p.degree !== 'Cert.');
  const [f, setF] = useStatePpl({ name: '', program: progs[0].code, country: 'Senegal', score: '', email: '' });
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));
  const submit = () => {
    if (!f.name.trim()) return;
    const p = window.PROGRAMS.find(x => x.code === f.program);
    onCreate({ id: 'APP' + (5100 + Math.floor(Math.random() * 899)), name: f.name.trim(), program: f.program, programName: p.name, stage: 'Submitted', score: parseInt(f.score, 10) || 70, submitted: new Date().toISOString().slice(0, 10), country: f.country || 'Senegal', docs: false, email: f.email.trim() });
    setF({ name: '', program: progs[0].code, country: 'Senegal', score: '', email: '' });
  };
  return (
    <Modal open={open} onClose={onClose} title="Add applicant" width={480}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon="user-plus" onClick={submit}>Create applicant</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <Field label="Full name"><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Awa Diop" /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Program"><Select options={progs.map(p => ({ value: p.code, label: p.name }))} value={f.program} onChange={v => set('program', v)} /></Field>
          <Field label="Country"><Input value={f.country} onChange={e => set('country', e.target.value)} /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Admission score" hint="0–100"><Input type="number" value={f.score} onChange={e => set('score', e.target.value)} placeholder="75" /></Field>
          <Field label="Email"><Input value={f.email} onChange={e => set('email', e.target.value)} placeholder="applicant@gmail.com" /></Field>
        </div>
      </div>
    </Modal>
  );
}

function ApplicantDetail({ a, onBack, onChange, go }) {
  const [tab, setTab] = useStatePpl('overview');
  const advance = () => { const i = STAGES.indexOf(a.stage); if (i >= 0 && i < STAGES.length - 1) { a.stage = STAGES[i + 1]; onChange(); } };
  const setStage = st => { a.stage = st; onChange(); };
  const docsDone = a.documents.filter(d => d.done).length;

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', fontWeight: 600, fontSize: 13.5, fontFamily: 'var(--font-sans)', padding: '6px 4px' }}>
          <Icon name="arrow-left" size={16} /> All applicants
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="danger" icon="x" onClick={() => setStage('Rejected')}>Reject</Button>
          <Button variant="outline" icon="arrow-right" onClick={advance}>Advance stage</Button>
          {a.stage !== 'Accepted' ? <Button variant="primary" icon="check" onClick={() => setStage('Offer')}>Make offer</Button>
            : <Button variant="primary" icon="user-check" onClick={() => go && go('students')}>Enroll student</Button>}
        </div>
      </div>

      {/* Hero */}
      <div style={{ background: 'var(--grad-dark-surface)', borderRadius: 'var(--radius-xl)', padding: '26px 28px', color: '#fff', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <Avatar name={a.name} size={72} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>{a.name}</div>
          <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.65)', marginTop: 3 }}>{a.id} · {a.email}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <HeroPill icon="graduation-cap">{a.programName}</HeroPill>
            <HeroPill icon="map-pin">{a.country}</HeroPill>
            <HeroPill icon="flag" tone={a.stage === 'Accepted' ? 'ok' : a.stage === 'Rejected' ? 'warn' : undefined}>{a.stage}</HeroPill>
          </div>
        </div>
      </div>

      {/* Pipeline tracker */}
      <Card padding={18} style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          {STAGES.map((st, i) => {
            const cur = STAGES.indexOf(a.stage);
            const reached = a.stage === 'Rejected' ? false : i <= cur;
            return (
              <React.Fragment key={st}>
                <button onClick={() => setStage(st)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, flex: '0 0 auto' }}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: reached ? 'var(--accent)' : 'var(--bg-subtle)', border: reached ? 'none' : '1px solid var(--border-strong)', color: reached ? '#fff' : 'var(--fg-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12.5 }}>{reached ? <Icon name="check" size={15} /> : i + 1}</span>
                  <span style={{ fontSize: 11.5, fontWeight: reached ? 700 : 500, color: reached ? 'var(--fg)' : 'var(--fg-subtle)' }}>{st}</span>
                </button>
                {i < STAGES.length - 1 && <div style={{ flex: 1, height: 2, background: STAGES.indexOf(a.stage) > i && a.stage !== 'Rejected' ? 'var(--accent)' : 'var(--border)', borderRadius: 2 }} />}
              </React.Fragment>
            );
          })}
        </div>
      </Card>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginTop: 16 }}>
        <ProfileStat label="Admission score" value={a.score} unit="/ 100" icon="target" tone="accent" />
        <ProfileStat label="Documents" value={docsDone + '/' + a.documents.length} icon="file-check" tone={docsDone === a.documents.length ? 'ok' : 'danger'} />
        <ProfileStat label="Interview" value={a.interviewScore ? a.interviewScore + '/100' : 'Pending'} icon="mic" />
        <ProfileStat label="Financial aid" value={a.aidRequested ? 'Requested' : 'No'} icon="gift" />
      </div>

      <div style={{ marginTop: 22 }}>
        <Tabs tabs={[{ value: 'overview', label: 'Overview' }, { value: 'academic', label: 'Academic record' }, { value: 'documents', label: 'Documents' }, { value: 'timeline', label: 'Timeline' }]} active={tab} onChange={setTab} />
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
          <ProfileCard title="Applicant" icon="user">
            <PKV k="Full name" v={a.name} /><PKV k="Date of birth" v={a.dob} /><PKV k="Gender" v={a.gender} /><PKV k="Nationality" v={a.country} /><PKV k="Email" v={a.email} /><PKV k="Phone" v={a.phone} />
          </ProfileCard>
          <ProfileCard title="Application" icon="clipboard-list">
            <PKV k="Applying to" v={a.programName} /><PKV k="Application ID" v={a.id} /><PKV k="Submitted" v={a.submitted} /><PKV k="Current stage" v={<Badge tone={STAGE_TONE[a.stage]} size="sm">{a.stage}</Badge>} /><PKV k="Financial aid" v={a.aidRequested ? 'Requested' : 'Not requested'} />
          </ProfileCard>
          <ProfileCard title="Reviewer notes" icon="message-square">
            <p style={{ fontSize: 13.5, color: 'var(--fg-muted)', lineHeight: 1.6, margin: 0 }}>{a.notes}</p>
          </ProfileCard>
        </div>
      )}

      {tab === 'academic' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, alignItems: 'start' }}>
          <ProfileCard title="Prior education" icon="book-open">
            <PKV k="School" v={a.priorSchool} /><PKV k="Final grade" v={a.priorGrade} /><PKV k="Graduation" v="2025" />
          </ProfileCard>
          <ProfileCard title="Entrance scores" icon="bar-chart-3">
            <PKV k="SAT — Math" v={a.satMath} /><PKV k="SAT — Verbal" v={a.satVerbal} /><PKV k="Essay" v={a.essayScore + ' / 100'} /><PKV k="Interview" v={a.interviewScore ? a.interviewScore + ' / 100' : 'Not yet held'} />
          </ProfileCard>
        </div>
      )}

      {tab === 'documents' && (
        <ProfileCard title="Required documents" icon="folder">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {a.documents.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < a.documents.length - 1 ? '1px solid var(--divider)' : 'none' }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: d.done ? 'rgba(16,185,129,0.12)' : 'var(--bg-subtle)', color: d.done ? 'var(--success-500)' : 'var(--fg-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={d.done ? 'check' : 'clock'} size={15} /></span>
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--fg)' }}>{d.name}</span>
                {d.done ? <Badge tone="success" size="sm">Received</Badge> : <Button variant="outline" size="sm" icon="upload" onClick={() => { d.done = true; onChange(); }}>Upload</Button>}
              </div>
            ))}
          </div>
        </ProfileCard>
      )}

      {tab === 'timeline' && (
        <ProfileCard title="Application timeline" icon="activity">
          <div>
            {[['Application submitted', a.submitted, true], ['Documents verified', '2026-04-02', a.docs], ['Under academic review', '2026-04-10', a.stage !== 'Submitted' && a.stage !== 'Rejected'], ['Interview', a.interviewScore ? '2026-04-18' : '—', ['Interview', 'Offer', 'Accepted'].includes(a.stage)], ['Decision', ['Offer', 'Accepted', 'Rejected'].includes(a.stage) ? '2026-04-25' : '—', ['Offer', 'Accepted', 'Rejected'].includes(a.stage)]].map(([l, d, done], i, arr) => (
              <div key={i} style={{ display: 'flex', gap: 14, paddingBottom: i < arr.length - 1 ? 18 : 0, position: 'relative' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ width: 32, height: 32, borderRadius: '50%', background: done ? 'var(--accent)' : 'var(--bg-subtle)', border: done ? 'none' : '1px solid var(--border-strong)', color: done ? '#fff' : 'var(--fg-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={done ? 'check' : 'circle'} size={done ? 15 : 8} /></span>
                  {i < arr.length - 1 && <span style={{ width: 1, flex: 1, minHeight: 18, background: 'var(--border)', marginTop: 2 }} />}
                </div>
                <div style={{ paddingTop: 5 }}><div style={{ fontSize: 13.5, fontWeight: 600, color: done ? 'var(--fg)' : 'var(--fg-faint)' }}>{l}</div><div style={{ fontSize: 12, color: 'var(--fg-faint)', marginTop: 1 }}>{d}</div></div>
              </div>
            ))}
          </div>
        </ProfileCard>
      )}
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
  const [, force] = useStatePpl(0);
  const [editing, setEditing] = useStatePpl(null); // section key or null
  const [linkFor, setLinkFor] = useStatePpl(null);
  const gradeColor = gp => gp >= 3.3 ? 'var(--success-500)' : gp < 2.3 ? 'var(--error-500)' : 'var(--fg)';
  const totalPaid = s.payments.reduce((a, p) => a + p.amount, 0);
  const pencil = section => <button onClick={() => setEditing(section)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-faint)', display: 'inline-flex', padding: 4, borderRadius: 6 }} onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--fg-faint)'}><Icon name="pencil" size={14} /></button>;

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
          {s.balance > 0 && <Button variant="outline" icon="link" onClick={() => setLinkFor(s)}>Payment link</Button>}
          <Button variant="primary" icon="pencil" onClick={() => setEditing('all')}>Edit record</Button>
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
          <ProfileCard title="Enrollment" icon="book-open" action={pencil('enrollment')}>
            <PKV k="Program" v={s.programName} /><PKV k="Year of study" v={'Year ' + s.year} /><PKV k="Cohort" v={s.cohort} /><PKV k="Enrolled" v={s.enrolled || 'Sep 2022'} /><PKV k="Advisor" v={s.advisor} /><PKV k="Status" v={s.status} />
          </ProfileCard>
          <ProfileCard title="Account summary" icon="receipt" action={s.balance > 0 ? <button onClick={() => setLinkFor(s)} title="Payment link" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-faint)', display: 'inline-flex', padding: 4 }}><Icon name="link" size={14} /></button> : null}>
            <PKV k="Balance" v={s.balance > 0 ? <span style={{ color: 'var(--error-500)' }}><FCFA value={s.balance} /></span> : <span style={{ color: 'var(--success-500)' }}>Cleared</span>} strong />
            <PKV k="Payments on record" v={s.payments.length} /><PKV k="Total paid (yr)" v={<FCFA value={totalPaid} />} /><PKV k="Credits this term" v={s.credits} />
          </ProfileCard>
          <ProfileCard title="Contact" icon="phone" action={pencil('contact')}>
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
            {s.balance > 0 && <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <Button variant="outline" icon="send" style={{ flex: 1 }}>Reminder</Button>
              <Button variant="primary" icon="link" style={{ flex: 1 }} onClick={() => setLinkFor(s)}>Payment link</Button>
            </div>}
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
          <ProfileCard title="Personal details" icon="user" action={pencil('personal')}>
            <PKV k="Full name" v={s.name} /><PKV k="Student ID" v={s.id} /><PKV k="Date of birth" v={s.dob} /><PKV k="Gender" v={s.gender} /><PKV k="Nationality" v={s.country} />
          </ProfileCard>
          <ProfileCard title="Contact" icon="phone" action={pencil('contact')}>
            <PKV k="Email" v={s.email} /><PKV k="Phone" v={s.phone} /><PKV k="Address" v={s.address} /><PKV k="City" v={s.city} />
          </ProfileCard>
          <ProfileCard title="Guardian / emergency" icon="users" action={pencil('guardian')}>
            <PKV k="Name" v={s.guardian.name} /><PKV k="Relationship" v={s.guardian.relation} /><PKV k="Phone" v={s.guardian.phone} />
          </ProfileCard>
        </div>
      )}

      {tab === 'activity' && (
        <ProfileCard title="Activity timeline" icon="activity">
          <Timeline s={s} />
        </ProfileCard>
      )}

      <StudentEditModal s={s} section={editing} onClose={() => setEditing(null)} onSave={() => { setEditing(null); force(n => n + 1); }} />
      <PaymentLinkModal s={linkFor} onClose={() => setLinkFor(null)} />
    </div>
  );
}

function PaymentLinkModal({ s, onClose }) {
  const [copied, setCopied] = useStatePpl(false);
  if (!s) return null;
  const p = new URLSearchParams({ ref: s.id + '-F26', name: s.name, id: s.id, program: s.programName, email: s.email, amount: String(s.balance), due: '15 Jul 2026', expiry: '18 Jul 2026', term: 'Tuition Payment' });
  const url = 'DAUST Payment Link.html?' + p.toString();
  const copy = () => { try { navigator.clipboard.writeText(url); } catch (e) { const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e2) {} document.body.removeChild(t); } setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <Modal open={!!s} onClose={onClose} title="Payment link" width={480}
      footer={<Button variant="ghost" onClick={onClose}>Done</Button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', padding: '12px 14px' }}>
          <Icon name="link" size={17} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Share this link with <b style={{ color: 'var(--fg)' }}>{s.name}</b> to pay <b style={{ color: 'var(--fg)' }}><FCFA value={s.balance} /></b>.</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '4px 4px 4px 13px' }}>
          <input readOnly value={url} style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontSize: 12.5, color: 'var(--fg-subtle)', fontFamily: 'var(--font-sans)', textOverflow: 'ellipsis' }} />
          <Button variant={copied ? 'secondary' : 'primary'} size="sm" icon={copied ? 'check' : 'copy'} onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function StudentEditModal({ s, section, onClose, onSave }) {
  const all = section === 'all';
  const show = k => all || section === k;
  const [f, setF] = useStatePpl(null);
  React.useEffect(() => { if (section) setF({ name: s.name, email: s.email, phone: s.phone, city: s.city, country: s.country, address: s.address, status: s.status, year: s.year, advisor: s.advisor, dob: s.dob, gender: s.gender, gName: s.guardian.name, gRel: s.guardian.relation, gPhone: s.guardian.phone }); }, [section]);
  if (!section || !f) return null;
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));
  const save = () => {
    s.name = f.name; s.email = f.email; s.phone = f.phone; s.city = f.city; s.country = f.country; s.address = f.address;
    s.status = f.status; s.year = parseInt(f.year, 10) || s.year; s.advisor = f.advisor; s.dob = f.dob; s.gender = f.gender;
    s.guardian = { name: f.gName, relation: f.gRel, phone: f.gPhone };
    s.cohort = 'Class of ' + (2026 - s.year + 5);
    onSave();
  };
  return (
    <Modal open={!!section} onClose={onClose} title={all ? 'Edit student record' : 'Edit ' + section} width={500}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon="check" onClick={save}>Save changes</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        {(show('personal') || all) && <>
          <Field label="Full name"><Input value={f.name} onChange={e => set('name', e.target.value)} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Date of birth"><Input type="date" value={f.dob} onChange={e => set('dob', e.target.value)} /></Field>
            <Field label="Gender"><Select options={['Female', 'Male']} value={f.gender} onChange={v => set('gender', v)} /></Field>
          </div>
        </>}
        {show('enrollment') && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Year of study"><Select options={[1, 2, 3, 4, 5].map(y => ({ value: y, label: 'Year ' + y }))} value={f.year} onChange={v => set('year', v)} /></Field>
          <Field label="Status"><Select options={['Enrolled', 'Probation', 'Leave', 'On Hold']} value={f.status} onChange={v => set('status', v)} /></Field>
          <Field label="Advisor" style={{ gridColumn: '1 / -1' }}><Input value={f.advisor} onChange={e => set('advisor', e.target.value)} /></Field>
        </div>}
        {(show('contact') || all) && <>
          <Field label="Email"><Input value={f.email} onChange={e => set('email', e.target.value)} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Phone"><Input value={f.phone} onChange={e => set('phone', e.target.value)} /></Field>
            <Field label="City"><Input value={f.city} onChange={e => set('city', e.target.value)} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Address"><Input value={f.address} onChange={e => set('address', e.target.value)} /></Field>
            <Field label="Nationality"><Input value={f.country} onChange={e => set('country', e.target.value)} /></Field>
          </div>
        </>}
        {(show('guardian') || all) && <>
          {all && <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>Guardian / emergency</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Guardian name"><Input value={f.gName} onChange={e => set('gName', e.target.value)} /></Field>
            <Field label="Relationship"><Input value={f.gRel} onChange={e => set('gRel', e.target.value)} /></Field>
          </div>
          <Field label="Guardian phone"><Input value={f.gPhone} onChange={e => set('gPhone', e.target.value)} /></Field>
        </>}
      </div>
    </Modal>
  );
}

function HeroPill({ icon, children, tone }) {
  const bg = tone === 'warn' ? 'rgba(245,158,11,0.24)' : 'rgba(255,255,255,0.12)';
  const ic = tone === 'ok' ? '#7ee0a8' : tone === 'warn' ? '#ffc98f' : 'var(--daust-orange)';
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
