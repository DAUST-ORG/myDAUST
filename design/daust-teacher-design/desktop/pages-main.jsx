// ── Desktop pages: Dashboard · Classes · Course · Schedule · Messages ──
function DashTimeline({ go }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {TODAY.map((t, i) => {
        const c = COURSES.find(x => x.id === t.course);
        const dot = t.status === 'now' ? ORANGE : t.status === 'done' ? '#bcc6d1' : NAVY;
        return (
          <div key={t.id} onClick={() => c && go('course', { id: c.id })}
            style={{ display: 'flex', gap: 16, cursor: c ? 'pointer' : 'default', opacity: t.status === 'done' ? 0.6 : 1 }}>
            <div style={{ width: 52, textAlign: 'right', paddingTop: 14, flexShrink: 0, fontFamily: 'Saira, sans-serif', fontWeight: 600, fontSize: 14, color: t.status === 'done' ? '#9da6ae' : '#141a21' }}>{t.time}</div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: t.status === 'now' ? ORANGE : '#fff', border: `2.5px solid ${dot}`, marginTop: 15 }} />
              {i < TODAY.length - 1 && <span style={{ flex: 1, width: 2, background: '#e9edf2' }} />}
            </div>
            <div style={{ flex: 1, paddingBottom: i < TODAY.length - 1 ? 14 : 0 }}>
              <div style={{ background: t.status === 'now' ? '#fffaf4' : '#f5f7f9', border: '1px solid ' + (t.status === 'now' ? '#f6d6b3' : '#eef1f5'), borderRadius: 12, padding: '12px 15px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 14, color: '#141a21' }}>{t.label}</div>
                  <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: '#6c7884', marginTop: 2 }}>{t.sub} · until {t.end}</div>
                </div>
                {t.status === 'now' && <Badge tone="orange">Now</Badge>}
                {t.status === 'done' && <Icon name="check" size={16} color="#9da6ae" />}
                {t.kind === 'class' && t.status !== 'done' && <button onClick={(e) => { e.stopPropagation(); go('attendance', { id: t.course }); }} style={ghostBtn()}>Attendance</button>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CourseMiniCard({ c, go }) {
  return (
    <div onClick={() => go('course', { id: c.id })} style={{ border: '1px solid #e9edf2', borderRadius: 13, padding: 0, overflow: 'hidden', cursor: 'pointer', transition: 'box-shadow .15s, transform .12s', background: '#fff' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 10px 24px rgba(15,44,80,.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}>
      <div style={{ height: 4, background: c.color }} />
      <div style={{ padding: 15 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 14, color: c.color }}>{c.code}</span>
          {c.ungraded > 0 && <Badge tone="orange">{c.ungraded} to grade</Badge>}
        </div>
        <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 600, fontSize: 15.5, color: '#141a21', marginTop: 7, lineHeight: 1.25 }}>{c.name}</div>
        <div style={{ display: 'flex', gap: 14, marginTop: 11, fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: '#6c7884' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="users" size={14} color="#9da6ae" />{c.students}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="mapPin" size={14} color="#9da6ae" />{c.room}</span>
        </div>
      </div>
    </div>
  );
}

function ActionRow({ a, go, last }) {
  const tones = { urgent: ORANGE, warn: '#d6731a', info: NAVY };
  const col = tones[a.tone] || NAVY;
  return (
    <div onClick={() => a.go && go(a.go, { id: 'ce201' })} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 0', borderBottom: last ? 'none' : '1px solid #eef1f5', cursor: a.go ? 'pointer' : 'default' }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: col + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={a.icon} size={18} color={col} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13.5, color: '#141a21' }}>{a.label}</div>
        <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: a.tone === 'urgent' ? ORANGE : '#9da6ae', marginTop: 2, fontWeight: a.tone === 'urgent' ? 600 : 400 }}>{a.meta}</div>
      </div>
      {a.go && <Icon name="chevR" size={17} color="#bcc6d1" />}
    </div>
  );
}

function DashboardPage({ go }) {
  const totalStudents = COURSES.reduce((s, c) => s + c.students, 0);
  const totalUngraded = COURSES.reduce((s, c) => s + c.ungraded, 0);
  return (
    <div style={{ padding: 28, maxWidth: 1320, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 22 }}>
        <StatCard value={COURSES.length} label="Active courses" icon="book" color={NAVY} onClick={() => go('classes')} />
        <StatCard value={totalStudents} label="Students taught" icon="users" color="#1d4a82" />
        <StatCard value={totalUngraded} label="Items to grade" icon="edit" color={ORANGE} onClick={() => go('gradebook')} />
        <StatCard value="92%" label="Avg. attendance" icon="trend" color="#2e7d52" trend="+3%" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Panel title="Today · Thursday, May 29" action="Full schedule" onAction={() => go('schedule')}><DashTimeline go={go} /></Panel>
          <Panel title="My Classes" action="View all" onAction={() => go('classes')}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {COURSES.map(c => <CourseMiniCard key={c.id} c={c} go={go} />)}
            </div>
          </Panel>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Panel title="Needs your attention" pad={'2px 20px'}>
            {ACTIONS.map((a, i) => <ActionRow key={a.id} a={a} go={go} last={i === ACTIONS.length - 1} />)}
          </Panel>
          <Panel title="Announcements" action="View all" onAction={() => go('notifications')} pad={'4px 20px'}>
            {ANNOUNCEMENTS.slice(0, 3).map((n, i) => (
              <div key={n.id} onClick={() => go('notifications')} style={{ display: 'flex', gap: 11, padding: '13px 0', borderBottom: i < 2 ? '1px solid #eef1f5' : 'none', cursor: 'pointer' }}>
                <div style={{ width: 7, paddingTop: 5 }}>{n.unread && <span style={{ width: 7, height: 7, borderRadius: '50%', background: ORANGE, display: 'block' }} />}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 12, color: NAVY }}>{n.from}</span>
                    <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11, color: '#9da6ae' }}>{n.time}</span>
                  </div>
                  <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 13, color: '#36414d', marginTop: 3, lineHeight: 1.35 }}>{n.title}</div>
                </div>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ClassesPage({ go }) {
  return (
    <div style={{ padding: 28, maxWidth: 1320, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
        {COURSES.map(c => (
          <div key={c.id} onClick={() => go('course', { id: c.id })} style={{ background: '#fff', border: '1px solid #e9edf2', borderRadius: 16, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 1px 2px rgba(15,44,80,.05)', transition: 'box-shadow .15s, transform .12s' }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 12px 28px rgba(15,44,80,.13)'; e.currentTarget.style.transform = 'translateY(-3px)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,44,80,.05)'; e.currentTarget.style.transform = 'none'; }}>
            <div style={{ background: `linear-gradient(135deg, ${c.color} 0%, ${c.color}cc 100%)`, padding: '18px 20px', color: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 20 }}>{c.code}</span>
                {c.ungraded > 0 && <Badge tone="orange" style={{ background: 'rgba(255,255,255,.18)', color: '#fff' }}>{c.ungraded} to grade</Badge>}
              </div>
              <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500, fontSize: 14, marginTop: 6, color: 'rgba(255,255,255,.92)' }}>{c.name}</div>
            </div>
            <div style={{ padding: 18, display: 'flex', gap: 22 }}>
              {[['Students', c.students], ['Attendance', c.attRate + '%'], ['Starts', c.time]].map(([l, v]) => (
                <div key={l}><div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 17, color: '#141a21' }}>{v}</div><div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11, color: '#9da6ae', marginTop: 1 }}>{l}</div></div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CoursePage({ params, go }) {
  const c = COURSES.find(x => x.id === params.id) || COURSES[0];
  const [tab, setTab] = React.useState('overview');
  const [toast, setToast] = React.useState(false);
  const tabs = [['overview', 'Overview'], ['roster', 'Roster'], ['gradebook', 'Gradebook'], ['attendance', 'Attendance'], ['materials', 'Materials'], ['posts', 'Posts']];
  return (
    <div style={{ padding: 28, maxWidth: 1320, margin: '0 auto' }}>
      <div style={{ borderRadius: 18, overflow: 'hidden', boxShadow: '0 12px 30px rgba(15,44,80,.16)', marginBottom: 20 }}>
        <div style={{ background: `linear-gradient(135deg, ${c.color} 0%, ${c.color}cc 100%)`, padding: '24px 28px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Eyebrow color="rgba(255,255,255,.78)">{c.term} · {c.meets} · {c.time} · {c.room}</Eyebrow>
            <div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 30, marginTop: 8 }}>{c.code} <span style={{ fontWeight: 500, fontSize: 22, opacity: .9 }}>— {c.name}</span></div>
          </div>
          <div style={{ display: 'flex', gap: 32 }}>
            {[['Students', c.students], ['Attendance', c.attRate + '%'], ['To grade', c.ungraded]].map(([l, v]) => (
              <div key={l} style={{ textAlign: 'center' }}><div style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 26 }}>{v}</div><div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 10.5, letterSpacing: '.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,.72)', marginTop: 2 }}>{l}</div></div>
            ))}
          </div>
        </div>
        <div style={{ background: '#fff', display: 'flex', gap: 4, padding: '0 20px', borderBottom: '1px solid #eef1f5' }}>
          {tabs.map(([id, lbl]) => {
            const on = tab === id;
            return <button key={id} onClick={() => setTab(id)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '15px 16px', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13.5, color: on ? c.color : '#9da6ae', borderBottom: '2.5px solid ' + (on ? c.color : 'transparent'), marginBottom: -1 }}>{lbl}</button>;
          })}
        </div>
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, alignItems: 'start' }}>
          <Panel title="Recent activity" pad={'4px 20px'}>
            {ASSIGNMENTS.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 0', borderBottom: i < ASSIGNMENTS.length - 1 ? '1px solid #eef1f5' : 'none' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: c.color + '14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={a.avg == null ? 'edit' : 'check'} size={17} color={a.avg == null ? ORANGE : c.color} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13.5, color: '#141a21' }}>{a.name}</div>
                  <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: '#9da6ae', marginTop: 2 }}>{a.done}/{a.total} submitted{a.avg != null ? ' · avg ' + a.avg + '%' : ''}</div>
                </div>
                {a.avg == null ? <Badge tone="orange">Needs grading</Badge> : <Badge tone="green">Graded</Badge>}
              </div>
            ))}
          </Panel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Panel title="Quick actions">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[['Take attendance', 'clipboard', ORANGE, () => setTab('attendance')], ['Open gradebook', 'chart', NAVY, () => setTab('gradebook')], ['Message class', 'message', '#1d4a82', () => go('messages')], ['Materials', 'file', '#2e7d52', () => go('documents')]].map(([lbl, ic, col, fn]) => (
                  <button key={lbl} onClick={fn} style={{ border: '1px solid #e9edf2', background: '#fff', borderRadius: 12, padding: 14, cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: col + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 9 }}><Icon name={ic} size={17} color={col} /></div>
                    <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 12.5, color: '#141a21' }}>{lbl}</div>
                  </button>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      )}
      {tab === 'roster' && <Panel title={'Roster · ' + c.students + ' students'} pad={'6px 20px 14px'}><DRosterTable color={c.color} /></Panel>}
      {tab === 'gradebook' && <Panel title="Gradebook" action="Export CSV" pad={'6px 20px 14px'}><DGradebookTable courseId={c.id} /></Panel>}
      {tab === 'attendance' && <Panel title="Attendance · Today" pad={20}><DAttendanceTable courseId={c.id} onSubmit={() => setToast(true)} /></Panel>}
      {tab === 'materials' && <MaterialsTab course={c} />}
      {tab === 'posts' && <PostsTab course={c} />}

      {toast && <Toast text={c.code + ' attendance submitted for today.'} onDone={() => setToast(false)} />}
    </div>
  );
}

function Toast({ text, onDone }) {
  React.useEffect(() => { const id = setTimeout(onDone, 2600); return () => clearTimeout(id); }, []);
  return (
    <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#141a21', color: '#fff', padding: '13px 22px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'Montserrat, sans-serif', fontWeight: 500, fontSize: 13.5, boxShadow: '0 14px 40px rgba(0,0,0,.3)', zIndex: 100 }}>
      <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#2e7d52', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={14} color="#fff" /></span>
      {text}
    </div>
  );
}

function MaterialsTab({ course }) {
  const [mats, setMats] = React.useState(() => (MATERIALS[course.id] || []).map(m => ({ ...m })));
  return (
    <Panel title={'Course materials · ' + mats.length} action="+ Upload" pad={'4px 20px 14px'}>
      {mats.length === 0 && <div style={{ padding: '24px 0', textAlign: 'center', color: '#9da6ae', fontFamily: 'Montserrat, sans-serif' }}>No materials yet.</div>}
      {mats.map((m, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 0', borderBottom: i < mats.length - 1 ? '1px solid #eef1f5' : 'none' }}>
          <div style={{ width: 34, height: 40, borderRadius: 6, background: m.type === 'PDF' ? '#fbeae8' : m.type === 'DOCX' ? '#eaf0f8' : '#fdeede', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><span style={{ fontFamily: 'Saira, sans-serif', fontWeight: 700, fontSize: 9, color: m.type === 'PDF' ? '#a83024' : m.type === 'DOCX' ? NAVY : '#c4660f' }}>{m.type}</span></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13.5, color: '#141a21' }}>{m.name}</div>
            <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 11.5, color: '#9da6ae', marginTop: 2 }}>{m.type} · {m.size}</div>
          </div>
          <span style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12, color: m.pub ? '#1f6e46' : '#9da6ae', fontWeight: 600 }}>{m.pub ? 'Published' : 'Draft'}</span>
          <button onClick={() => setMats(p => p.map((x, j) => j === i ? { ...x, pub: !x.pub } : x))} style={{ width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', background: m.pub ? '#2e7d52' : '#d7dee6', position: 'relative', transition: 'background .15s' }}>
            <span style={{ position: 'absolute', top: 3, left: m.pub ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
          </button>
        </div>
      ))}
    </Panel>
  );
}

function PostsTab({ course }) {
  const [posts, setPosts] = React.useState(() => (CLASS_POSTS[course.id] || []).map(p => ({ ...p })));
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const post = () => { if (!title.trim()) return; setPosts(p => [{ title, body, time: 'Just now', pinned: false, fresh: true }, ...p]); setTitle(''); setBody(''); };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 20, alignItems: 'start' }}>
      <Panel title="New announcement">
        <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 12.5, color: '#9da6ae', marginBottom: 12 }}>Posts go to all {course.students} students in {course.code}.</div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" style={{ width: '100%', border: '1px solid #d7dee6', borderRadius: 9, padding: '11px 13px', fontFamily: 'Montserrat, sans-serif', fontSize: 13.5, fontWeight: 600, color: '#141a21', outline: 'none', marginBottom: 10, boxSizing: 'border-box' }} />
        <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Write your message to the class…" rows={4} style={{ width: '100%', border: '1px solid #d7dee6', borderRadius: 9, padding: '11px 13px', fontFamily: 'Montserrat, sans-serif', fontSize: 13.5, color: '#36414d', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5 }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={post} style={{ background: ORANGE, color: '#fff', border: 'none', borderRadius: 10, padding: '11px 20px', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>Post to class</button>
        </div>
      </Panel>
      <Panel title={'Posted · ' + posts.length} pad={'4px 20px 14px'}>
        {posts.length === 0 && <div style={{ padding: '24px 0', textAlign: 'center', color: '#9da6ae', fontFamily: 'Montserrat, sans-serif' }}>No posts yet.</div>}
        {posts.map((p, i) => (
          <div key={i} style={{ padding: '14px 0', borderBottom: i < posts.length - 1 ? '1px solid #eef1f5' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {p.pinned && <Icon name="award" size={14} color={ORANGE} />}
              <span style={{ fontFamily: 'Saira, sans-serif', fontWeight: 600, fontSize: 15, color: '#141a21' }}>{p.title}</span>
              {p.fresh && <Badge tone="green">Sent</Badge>}
              <span style={{ marginLeft: 'auto', fontFamily: 'Montserrat, sans-serif', fontSize: 11.5, color: '#9da6ae' }}>{p.time}</span>
            </div>
            {p.body && <div style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 13, color: '#6c7884', marginTop: 5, lineHeight: 1.5 }}>{p.body}</div>}
          </div>
        ))}
      </Panel>
    </div>
  );
}

Object.assign(window, { DashboardPage, ClassesPage, CoursePage, Toast, MaterialsTab, PostsTab });
