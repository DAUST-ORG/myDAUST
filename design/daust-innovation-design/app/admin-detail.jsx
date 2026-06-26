/* DAUST Innovation Tracker — Admin project detail, review queue, global tasks */

const { T } = window.DAUST_UI;

// ---------- Admin project detail / review ----------
function AdminProjectDetail({ project, tweaks, onBack }) {
  const { PHASES, phaseIndex, fmtDate, fmtShort, TODAY, feedbackFor, computeFromTasks } = window.DAUST_DATA;
  const [tasks, setTasks] = React.useState(project.tasks.map((t) => ({ ...t })));
  const [comments, setComments] = React.useState(feedbackFor(project));
  const [draft, setDraft] = React.useState('');
  const [grade, setGrade] = React.useState(project.grade || '');
  const [tab, setTab] = React.useState('overview');
  const [flagged, setFlagged] = React.useState(project.health === 'behind');
  const [toast, setToast] = React.useState(null);

  const live = { ...project, ...computeFromTasks(tasks), tasks };
  const submitted = tasks.filter((t) => t.status === 'submitted');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };
  const setStatus = (task, status, verb) => {
    setTasks((ts) => ts.map((t) => (t.id === task.id && t.phase === task.phase ? { ...t, status } : t)));
    showToast(`${task.title} — ${verb}`);
  };
  const addComment = () => {
    if (!draft.trim()) return;
    setComments((c) => [{ who: 'Review Office', role: 'Admin', when: 'just now', text: draft.trim() }, ...c]);
    setDraft('');
    showToast('Feedback posted to the team');
  };

  const GRADES = ['A', 'A−', 'B+', 'B', 'B−', 'C+', 'C'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 26, left: '50%', transform: 'translateX(-50%)', zIndex: 100,
          background: T.navy, color: '#fff', fontFamily: T.body, fontWeight: 600, fontSize: 13.5, padding: '11px 20px',
          borderRadius: 999, boxShadow: T.shadowLg, display: 'flex', alignItems: 'center', gap: 9 }}>
          <Icon name="check-circle" size={16} color={T.orange} />{toast}
        </div>
      )}

      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none',
        cursor: 'pointer', fontFamily: T.body, fontWeight: 600, fontSize: 13, color: T.fg2, padding: 0, width: 'fit-content' }}>
        <Icon name="arrow-left" size={16} />Back to all projects
      </button>

      {/* Header card */}
      <Card pad={24}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 320 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Tag tone="navy" style={{ fontSize: 11 }}>{project.code}</Tag>
              <Tag tone="neutral" style={{ fontSize: 11 }}>{project.type}</Tag>
              <span style={{ fontFamily: T.body, fontSize: 12.5, color: T.fg3 }}>{project.program} · {project.track}</span>
            </div>
            <h2 style={{ fontFamily: T.display, fontWeight: 700, fontSize: 26, color: T.fg1, margin: 0, lineHeight: 1.12, maxWidth: 600 }}>{project.title}</h2>
            <p style={{ fontFamily: T.body, fontSize: 14, color: T.fg2, lineHeight: 1.55, margin: '10px 0 0', maxWidth: 640 }}>{project.abstract}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <AvatarStack names={project.members} size={30} />
                <span style={{ fontFamily: T.body, fontSize: 12.5, color: T.fg2 }}>{project.members.length} member{project.members.length > 1 ? 's' : ''}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: T.body, fontSize: 13, color: T.fg2 }}>
                <Icon name="user-check" size={15} color={T.orange} />{project.advisor}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 14, minWidth: 180 }}>
            <HealthBadge value={live.health} />
            <Progress project={live} style={tweaks.progressStyle === 'steps' ? 'ring' : tweaks.progressStyle} />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant={flagged ? 'danger' : 'subtle'} size="sm" icon="flag"
                onClick={() => { setFlagged((f) => !f); showToast(flagged ? 'Flag removed' : 'Project flagged as behind'); }}>
                {flagged ? 'Flagged' : 'Flag'}</Button>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 20, paddingTop: 18, borderTop: `1px solid ${T.g100}` }}>
          <RoadmapStepper project={live} />
        </div>
      </Card>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, background: T.g50, padding: 5, borderRadius: 999, width: 'fit-content', border: `1px solid ${T.border}` }}>
        {[['overview', 'Review', submitted.length], ['tasks', 'All tasks', null], ['feedback', 'Feedback', comments.length], ['grade', 'Grade', null]].map(([id, label, badge]) => {
          const active = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px',
              borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: T.body, fontWeight: 600, fontSize: 13,
              background: active ? '#fff' : 'transparent', color: active ? T.navy : T.fg2, boxShadow: active ? T.shadowSm : 'none' }}>
              {label}{badge ? <span style={{ background: active ? T.orange : T.g200, color: active ? '#fff' : T.fg2, borderRadius: 999, fontSize: 11, padding: '1px 7px' }}>{badge}</span> : null}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20, alignItems: 'start' }}>
          <Card pad={22}>
            <SectionTitle eyebrow="Awaiting your review" title={`${submitted.length} submission${submitted.length !== 1 ? 's' : ''}`} />
            {submitted.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {submitted.map((t) => (
                  <div key={t.id + t.phase} style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0, background: '#e7eefa', color: T.info,
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="file-clock" size={18} /></div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: T.body, fontWeight: 600, fontSize: 14.5, color: T.fg1 }}>{t.title}</div>
                        <div style={{ fontFamily: T.body, fontSize: 12, color: T.fg3, marginTop: 2 }}>{PHASES[phaseIndex(t.phase)].name} phase · {t.kind} · submitted {fmtShort(t.due)}</div>
                        <p style={{ fontFamily: T.body, fontSize: 13, color: T.fg2, margin: '8px 0 0', lineHeight: 1.5 }}>{t.desc}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 10, padding: '8px 12px', borderRadius: 8, background: T.g50, width: 'fit-content' }}>
                          <Icon name="paperclip" size={14} color={T.fg3} />
                          <span style={{ fontFamily: T.body, fontSize: 12.5, color: T.fg2 }}>{t.kind === 'Video' ? 'pitch-video.mp4' : t.kind === 'Poster' ? 'expo-poster.pdf' : 'submission.pdf'}</span>
                          <span style={{ fontFamily: T.body, fontSize: 11.5, color: T.info, fontWeight: 600, cursor: 'pointer' }}>View</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 9, marginTop: 14, justifyContent: 'flex-end' }}>
                      <Button variant="danger" size="sm" icon="rotate-ccw" onClick={() => setStatus(t, 'rejected', 'changes requested')}>Request changes</Button>
                      <Button variant="success" size="sm" icon="check" onClick={() => setStatus(t, 'approved', 'approved')}>Approve</Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ width: 54, height: 54, borderRadius: 999, background: '#e7f2ec', color: T.success, margin: '0 auto 14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check-check" size={26} /></div>
                <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: 17, color: T.fg1 }}>All caught up</div>
                <div style={{ fontFamily: T.body, fontSize: 13, color: T.fg3, marginTop: 4 }}>No submissions waiting for review on this project.</div>
              </div>
            )}
          </Card>
          <Card pad={20}>
            <SectionTitle title="Project facts" style={{ marginBottom: 14 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {[['Lead', project.lead, 'user'], ['Advisor', project.advisor, 'user-check'], ['Program', project.program, 'graduation-cap'],
                ['Track', project.track, 'tag'], ['Repository', project.repo, 'github'], ['Last activity', `${project.lastActiveDays}d ago`, 'history']].map(([k, v, ic]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <Icon name={ic} size={15} color={T.fg3} />
                  <span style={{ fontFamily: T.body, fontSize: 12, color: T.fg3, width: 86 }}>{k}</span>
                  <span style={{ fontFamily: T.body, fontSize: 13, fontWeight: 600, color: T.fg1, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'tasks' && (
        <Card pad={22}>
          <SectionTitle title="All milestones" right={<span style={{ fontFamily: T.body, fontSize: 13, color: T.fg3 }}>{live.done}/{live.total} complete</span>} />
          {PHASES.map((ph) => {
            const phTasks = tasks.filter((t) => t.phase === ph.id);
            if (!phTasks.length) return null;
            return (
              <div key={ph.id} style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '6px 0 10px' }}>
                  <span style={{ fontFamily: T.body, fontWeight: 700, fontSize: 12, color: T.navy, letterSpacing: '.06em', textTransform: 'uppercase' }}>{ph.name}</span>
                  <span style={{ flex: 1, height: 1, background: T.g100 }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {phTasks.map((t) => (
                    <TaskRow key={t.id + t.phase} task={t}
                      onAction={t.status === 'submitted' ? (tk) => setStatus(tk, 'approved', 'approved') : null}
                      actionLabel="Approve" />
                  ))}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {tab === 'feedback' && (
        <Card pad={22} style={{ maxWidth: 760 }}>
          <SectionTitle eyebrow="Visible to the team" title="Feedback & comments" />
          <div style={{ display: 'flex', gap: 11, marginBottom: 20 }}>
            <Avatar name="Review Office" size={36} />
            <div style={{ flex: 1 }}>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write feedback to the team…"
                style={{ width: '100%', boxSizing: 'border-box', minHeight: 70, resize: 'vertical', fontFamily: T.body, fontSize: 13.5,
                  color: T.fg1, padding: 12, borderRadius: 10, border: `1px solid ${T.border}`, outline: 'none', lineHeight: 1.5 }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <Button variant="navy" size="sm" icon="send" onClick={addComment} disabled={!draft.trim()}>Post feedback</Button>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {comments.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 11 }}>
                <Avatar name={c.who} size={36} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: T.body, fontWeight: 600, fontSize: 13.5, color: T.fg1 }}>{c.who}</span>
                    <Tag tone={c.role === 'Admin' ? 'navy' : 'outline'} style={{ fontSize: 10, padding: '1px 8px' }}>{c.role}</Tag>
                    <span style={{ fontFamily: T.body, fontSize: 12, color: T.fg3 }}>{c.when}</span>
                  </div>
                  <p style={{ fontFamily: T.body, fontSize: 13.5, color: T.fg2, lineHeight: 1.55, margin: '5px 0 0' }}>{c.text}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === 'grade' && (
        <Card pad={24} style={{ maxWidth: 620 }}>
          <SectionTitle eyebrow="Assessment" title="Grade this project" />
          <p style={{ fontFamily: T.body, fontSize: 13.5, color: T.fg2, lineHeight: 1.55, margin: '0 0 18px' }}>
            Set a working grade based on milestones completed, deliverable quality and the final report. The grade is shared with the advisor.
          </p>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginBottom: 20 }}>
            {GRADES.map((g) => {
              const active = grade === g;
              return (
                <button key={g} onClick={() => { setGrade(g); showToast(`Grade set to ${g}`); }}
                  style={{ width: 56, height: 56, borderRadius: 12, cursor: 'pointer', fontFamily: T.display, fontWeight: 700, fontSize: 20,
                    border: active ? 'none' : `1.5px solid ${T.border}`, background: active ? T.navy : '#fff', color: active ? '#fff' : T.fg2,
                    boxShadow: active ? T.shadowMd : 'none', transition: 'all .12s' }}>{g}</button>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 12, background: T.g50 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: T.body, fontSize: 12, color: T.fg3 }}>Completion so far</div>
              <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: 22, color: T.fg1 }}>{live.pct}%</div>
            </div>
            <div style={{ width: 1, height: 36, background: T.border }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: T.body, fontSize: 12, color: T.fg3 }}>Current grade</div>
              <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: 22, color: grade ? T.navy : T.fg3 }}>{grade || '—'}</div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------- Review queue (cross-project submissions) ----------
function AdminReviewQueue({ projects, onOpenProject }) {
  const { PHASES, phaseIndex, fmtShort } = window.DAUST_DATA;
  const items = [];
  projects.forEach((p) => p.tasks.filter((t) => t.status === 'submitted').forEach((t) => items.push({ p, t })));
  items.sort((a, b) => new Date(a.t.due) - new Date(b.t.due));
  const [kind, setKind] = React.useState('all');
  const kinds = ['all', ...Array.from(new Set(items.map((i) => i.t.kind)))];
  const shown = kind === 'all' ? items : items.filter((i) => i.t.kind === kind);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card pad={18} style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: '#e7eefa', color: T.info, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="inbox" size={22} /></div>
          <div>
            <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: 22, color: T.fg1, lineHeight: 1 }}>{items.length}</div>
            <div style={{ fontFamily: T.body, fontSize: 12.5, color: T.fg3 }}>submissions awaiting review across {new Set(items.map((i) => i.p.id)).size} projects</div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {kinds.map((k) => {
            const active = kind === k;
            return <button key={k} onClick={() => setKind(k)} style={{ padding: '7px 14px', borderRadius: 999, cursor: 'pointer', border: 'none',
              fontFamily: T.body, fontWeight: 600, fontSize: 12.5, background: active ? T.navy : T.g50, color: active ? '#fff' : T.fg2,
              boxShadow: active ? 'none' : `inset 0 0 0 1px ${T.border}` }}>{k === 'all' ? 'All' : k}</button>;
          })}
        </div>
      </Card>

      <Card pad={0} style={{ overflow: 'hidden' }}>
        {shown.slice(0, 30).map((it, i) => (
          <div key={i} onClick={() => onOpenProject(it.p)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px', cursor: 'pointer',
            borderBottom: i < Math.min(shown.length, 30) - 1 ? `1px solid ${T.g100}` : 'none', transition: 'background .12s' }}
            onMouseEnter={(e) => e.currentTarget.style.background = T.g50} onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}>
            <div style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0, background: '#e7eefa', color: T.info, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={{ Video: 'video', Document: 'file-text', Poster: 'image', Demo: 'monitor-play' }[it.t.kind] || 'file-clock'} size={17} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: T.body, fontWeight: 600, fontSize: 14, color: T.fg1 }}>{it.t.title}</div>
              <div style={{ fontFamily: T.body, fontSize: 12, color: T.fg3, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.p.title} · {it.p.code} · {it.p.lead}</div>
            </div>
            <Tag tone="outline" style={{ fontSize: 11 }}>{PHASES[phaseIndex(it.t.phase)].name}</Tag>
            <StatusPill status="submitted" size="sm" />
            <Button variant="subtle" size="sm" icon="arrow-right">Review</Button>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ---------- Global tasks management ----------
function AdminGlobalTasks({ projects }) {
  const { GLOBAL_TASKS, PHASES, phaseIndex, fmtDate, TODAY, daysBetween } = window.DAUST_DATA;
  const total = projects.length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card pad={22} style={{ background: `linear-gradient(135deg, ${T.navy}, ${T.navy700})`, border: 'none', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <Eyebrow color="#f0b27a" style={{ marginBottom: 6 }}>Required of every project</Eyebrow>
            <h2 style={{ fontFamily: T.display, fontWeight: 700, fontSize: 22, margin: 0 }}>Global Tasks & Deadlines</h2>
            <p style={{ fontFamily: T.body, fontSize: 13.5, color: '#cdd6e3', margin: '8px 0 0', maxWidth: 560, lineHeight: 1.5 }}>
              These {GLOBAL_TASKS.length} milestones are assigned automatically to all {total} projects. Editing a deadline updates it everywhere.
            </p>
          </div>
          <Button variant="primary" size="md" icon="plus">New global task</Button>
        </div>
      </Card>

      <Card pad={0} style={{ overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2.4fr 1fr 1fr 1.6fr 0.6fr', gap: 14, padding: '12px 22px', background: T.g50,
          borderBottom: `1px solid ${T.border}`, fontFamily: T.body, fontSize: 11, fontWeight: 700, color: T.fg3, letterSpacing: '.06em', textTransform: 'uppercase' }}>
          <div>Task</div><div>Phase</div><div>Deadline</div><div>Completion</div><div></div>
        </div>
        {GLOBAL_TASKS.map((g, i) => {
          const completed = projects.filter((p) => p.tasks.some((t) => t.id === g.id && (t.status === 'done' || t.status === 'approved'))).length;
          const pct = Math.round((completed / total) * 100);
          const days = daysBetween(TODAY, g.due);
          const past = days < 0;
          const kindIcon = { Document: 'file-text', Video: 'video', Demo: 'monitor-play', Review: 'clipboard-check', Poster: 'image', Event: 'calendar', Handover: 'package' }[g.kind] || 'circle-dot';
          return (
            <div key={g.id} style={{ display: 'grid', gridTemplateColumns: '2.4fr 1fr 1fr 1.6fr 0.6fr', gap: 14, padding: '15px 22px', alignItems: 'center',
              borderBottom: i < GLOBAL_TASKS.length - 1 ? `1px solid ${T.g100}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: T.g50, color: T.navy, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={kindIcon} size={16} /></div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: T.body, fontWeight: 600, fontSize: 13.5, color: T.fg1 }}>{g.title}</div>
                  <div style={{ fontFamily: T.body, fontSize: 11.5, color: T.fg3 }}>{g.kind}</div>
                </div>
              </div>
              <div><Tag tone="outline" style={{ fontSize: 11 }}>{PHASES[phaseIndex(g.phase)].name}</Tag></div>
              <div>
                <div style={{ fontFamily: T.body, fontWeight: 600, fontSize: 13, color: past ? T.fg2 : T.fg1 }}>{fmtDate(g.due)}</div>
                <div style={{ fontFamily: T.body, fontSize: 11, color: past ? T.success : days <= 14 ? T.orange : T.fg3, fontWeight: 600 }}>{past ? 'Closed' : `${days}d left`}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 7, borderRadius: 999, background: T.g100, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: pct > 70 ? T.success : pct > 35 ? T.orange : T.navy }} />
                </div>
                <span style={{ fontFamily: T.body, fontSize: 12, fontWeight: 600, color: T.fg2, width: 64 }}>{completed}/{total}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.fg3, padding: 6 }}><Icon name="pencil" size={15} /></button>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

Object.assign(window, { AdminProjectDetail, AdminReviewQueue, AdminGlobalTasks });
