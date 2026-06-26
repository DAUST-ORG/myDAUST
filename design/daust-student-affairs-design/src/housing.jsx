// ============================================================
// DAUST Student Affairs — Housing & Residential Life (deepest)
// ============================================================

function Segmented({ tabs, value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', background: C.s100, borderRadius: 10, padding: 3, gap: 2 }}>
      {tabs.map(t => {
        const active = value === t.id;
        return (
          <button key={t.id} onClick={() => onChange(t.id)}
            style={{
              border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              padding: '7px 14px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 7,
              background: active ? '#fff' : 'transparent', color: active ? C.teal700 : C.s500,
              boxShadow: active ? '0 1px 2px rgba(15,23,42,0.08)' : 'none', transition: 'all 160ms',
            }}>
            {t.icon && <Icon name={t.icon} size={15} color={active ? C.teal700 : C.s400} />}
            {t.label}{t.count != null && <span style={{ fontSize: 11, color: active ? C.teal600 : C.s400 }}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ---- AI assignment drawer ----
function AssignDrawer({ req, onClose, onAssign }) {
  const [phase, setPhase] = useState('idle'); // idle | computing | done
  const [picked, setPicked] = useState(null);
  useEffect(() => {
    setPhase('computing'); setPicked(null);
    const t = setTimeout(() => setPhase('done'), 1400);
    return () => clearTimeout(t);
  }, [req]);

  // synthesize AI room suggestions per request
  const suggestions = [
    { room: 'G-214', hall: 'Gorée Hall', score: 96, with: 'Aïssatou Diallo', reasons: ['Matches quiet-floor request', 'Roommate compatibility 94%', '2-min walk to engineering labs'] },
    { room: 'A-108', hall: 'Atlantic Hall', score: 89, with: 'Open single', reasons: ['International floor — 96 intl residents', 'Near halal dining hall', 'Mentor RA on floor'] },
    { room: 'B-117', hall: 'Baobab Hall', score: 82, with: 'Sofia Hassan', reasons: ['Graduate-adjacent quiet wing', 'Both prefer early schedules', 'Single bathroom share'] },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.35)', backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'relative', width: 520, maxWidth: '92vw', height: '100%', background: '#fff',
        boxShadow: '-16px 0 40px rgba(15,23,42,0.12)', overflowY: 'auto', animation: 'daustSlideIn 280ms cubic-bezier(0.16,1,0.3,1)',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.s100}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
          <div>
            <Eyebrow style={{ marginBottom: 6 }}>AI Assignment Optimizer</Eyebrow>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em' }}>{req.student}</h2>
            <div style={{ fontSize: 12.5, color: C.s500, marginTop: 3 }}>{req.sid} · {req.type} · Needs: {req.need}</div>
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.s200}`, background: '#fff', cursor: 'pointer', color: C.s500, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={17} />
          </button>
        </div>

        <div style={{ padding: 24 }}>
          {phase === 'computing' && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: C.grad, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Icon name="sparkles" size={24} color="#fff" />
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.s900 }}>Optimizing placement…</div>
              <div style={{ fontSize: 12.5, color: C.s500, marginTop: 6 }}>Scoring 72 open beds against preferences, proximity, and compatibility.</div>
              <div style={{ width: 200, margin: '20px auto 0' }}><Meter value={66} color={C.teal500} /></div>
            </div>
          )}

          {phase === 'done' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Icon name="sparkles" size={16} color={C.teal700} />
                <span style={{ fontSize: 13, color: C.s700 }}>Top {suggestions.length} placements, ranked by fit. Pick one to assign.</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {suggestions.map((s, i) => {
                  const sel = picked === i;
                  return (
                    <div key={s.room} onClick={() => setPicked(i)}
                      style={{
                        border: `1.5px solid ${sel ? C.teal700 : C.s200}`, borderRadius: 12, padding: 16, cursor: 'pointer',
                        background: sel ? C.teal50 : '#fff', transition: 'all 160ms',
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {i === 0 && <Badge tone="accent" dot={false}>Best match</Badge>}
                          <span style={{ fontSize: 15, fontWeight: 700, color: C.s900, fontFamily: 'IBM Plex Mono, monospace' }}>{s.room}</span>
                          <span style={{ fontSize: 12.5, color: C.s500 }}>{s.hall}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 20, fontWeight: 700, color: C.teal700, letterSpacing: '-0.02em' }}>{s.score}</span>
                          <span style={{ fontSize: 11, color: C.s400 }}>fit</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: C.s500, marginBottom: 10 }}>Pairs with <strong style={{ color: C.s700 }}>{s.with}</strong></div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {s.reasons.map(r => (
                          <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.s700 }}>
                            <Icon name="check" size={13} color={C.successFg} />{r}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <Button variant="primary" icon="check" disabled={picked == null} onClick={() => onAssign(req, suggestions[picked])} style={{ flex: 1 }}>
                  {picked == null ? 'Select a room' : `Assign to ${suggestions[picked].room}`}
                </Button>
                <Button variant="soft" onClick={onClose}>Cancel</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Housing() {
  const [tab, setTab] = useState('halls');
  const [drawer, setDrawer] = useState(null);
  const [requests, setRequests] = useState(REQUESTS);
  const [toast, setToast] = useState(null);

  const totalBeds = HALLS.reduce((a, h) => a + h.beds, 0);
  const filled = HALLS.reduce((a, h) => a + h.filled, 0);
  const intl = HALLS.reduce((a, h) => a + h.intl, 0);
  const flags = HALLS.reduce((a, h) => a + h.flags, 0);

  const handleAssign = (req, room) => {
    setRequests(rs => rs.filter(r => r.id !== req.id));
    setDrawer(null);
    setToast(`${req.student} assigned to ${room.room} · ${room.hall}`);
    setTimeout(() => setToast(null), 3500);
  };

  const tabs = [
    { id: 'halls', label: 'Halls', icon: 'building-2' },
    { id: 'requests', label: 'Requests', icon: 'inbox', count: requests.length },
    { id: 'roster', label: 'Roster', icon: 'list', count: STUDENTS.length },
    { id: 'flags', label: 'Flags', icon: 'flag-triangle-right', count: FLAGS.length },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Residential Life"
        title="Housing & Residence"
        desc="Occupancy, assignment requests, and risk flags across all five residence halls. The optimizer ranks open beds by preference fit, proximity, and roommate compatibility."
        actions={<>
          <Button variant="soft" icon="download">Occupancy report</Button>
          <Button variant="primary" icon="plus">New assignment</Button>
        </>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 22 }}>
        <StatTile label="Beds occupied" value={`${Math.round(filled/totalBeds*100)}%`} sub={`${filled} of ${totalBeds}`} tone="accent" />
        <StatTile label="Pending requests" value={requests.length} sub="across 5 halls" tone="warning" />
        <StatTile label="Open flags" value={flags} sub="3 high severity" tone="error" />
        <StatTile label="International residents" value={intl} sub="18% of beds" tone="info" />
      </div>

      <div style={{ marginBottom: 20 }}><Segmented tabs={tabs} value={tab} onChange={setTab} /></div>

      {tab === 'halls' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 18 }}>
          {HALLS.map(h => {
            const pct = Math.round((h.filled / h.beds) * 100);
            const open = h.beds - h.filled;
            return (
              <Card key={h.id} hover padding={0}>
                <div style={{ height: 6, background: h.color, borderRadius: '12px 12px 0 0' }} />
                <div style={{ padding: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>{h.name}</h3>
                      <div style={{ fontSize: 12, color: C.s500, marginTop: 3 }}>{h.kind}</div>
                    </div>
                    {h.flags > 0 ? <Badge tone="warning" dot={false}>{`${h.flags} flag${h.flags>1?'s':''}`}</Badge> : <Badge tone="success" dot={false}>Clear</Badge>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '16px 0 8px' }}>
                    <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: pct >= 97 ? C.warningFg : C.s900 }}>{pct}%</span>
                    <span style={{ fontSize: 12.5, color: C.s500 }}>full · {open} bed{open!==1?'s':''} open</span>
                  </div>
                  <Meter value={h.filled} max={h.beds} color={pct >= 97 ? C.warningFg : h.color} />
                  <div style={{ display: 'flex', gap: 18, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.s100}` }}>
                    <div><div style={{ fontSize: 17, fontWeight: 700, color: C.s900 }}>{h.filled}</div><div style={{ fontSize: 11, color: C.s500 }}>Residents</div></div>
                    <div><div style={{ fontSize: 17, fontWeight: 700, color: C.s900 }}>{h.intl}</div><div style={{ fontSize: 11, color: C.s500 }}>International</div></div>
                    <div style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}><Button variant="ghost" size="sm" iconRight="arrow-right">Open</Button></div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'requests' && (
        <Card padding={0}>
          {requests.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: C.s400 }}>
              <Icon name="check-circle-2" size={32} color={C.successFg} />
              <div style={{ marginTop: 12, fontSize: 14, color: C.s500 }}>All requests cleared. A quiet afternoon for a change.</div>
            </div>
          )}
          {requests.map((r, i) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '15px 20px', borderBottom: i < requests.length - 1 ? `1px solid ${C.s100}` : 'none' }}>
              <Avatar name={r.student} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.s900 }}>{r.student}</span>
                  {r.intl && <Badge tone="info" dot={false}>International</Badge>}
                  {r.priority === 'high' && <Badge tone="error" dot={false}>High priority</Badge>}
                </div>
                <div style={{ fontSize: 12, color: C.s500, marginTop: 3 }}>{r.type} · {r.need} · <span style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{r.id}</span></div>
              </div>
              <span style={{ fontSize: 11.5, color: C.s400 }}>{r.submitted}</span>
              <Button variant="primary" size="sm" icon="sparkles" onClick={() => setDrawer(r)}>Assign with AI</Button>
            </div>
          ))}
        </Card>
      )}

      {tab === 'roster' && (
        <Card padding={0}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.9fr 1.2fr 1fr 0.8fr', padding: '12px 20px', borderBottom: `1px solid ${C.s200}`, fontSize: 11, fontWeight: 600, color: C.s400, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <span>Student</span><span>Year</span><span>Major</span><span>Assignment</span><span>Status</span>
          </div>
          {STUDENTS.map((s, i) => (
            <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.9fr 1.2fr 1fr 0.8fr', alignItems: 'center', padding: '12px 20px', borderBottom: i < STUDENTS.length - 1 ? `1px solid ${C.s100}` : 'none' }}
              onMouseEnter={e => e.currentTarget.style.background = C.s50} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <Avatar name={s.name} size={32} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.s900, display: 'flex', alignItems: 'center', gap: 6 }}>{s.name}{s.intl && <Icon name="globe" size={12} color={C.infoFg} />}</div>
                  <div style={{ fontSize: 11, color: C.s400, fontFamily: 'IBM Plex Mono, monospace' }}>{s.id} · {s.origin}</div>
                </div>
              </div>
              <span style={{ fontSize: 12.5, color: C.s700 }}>{s.year}</span>
              <span style={{ fontSize: 12.5, color: C.s700 }}>{s.major}</span>
              <span style={{ fontSize: 12.5, color: s.hall === '—' ? C.s400 : C.s700 }}>{s.hall === '—' ? 'Unassigned' : `${s.hall} · ${s.room}`}</span>
              <span><Badge tone={s.status === 'assigned' ? 'success' : 'warning'} dot={false}>{s.status === 'assigned' ? 'Assigned' : 'Pending'}</Badge></span>
            </div>
          ))}
        </Card>
      )}

      {tab === 'flags' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FLAGS.map(f => (
            <Card key={f.id} hover>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: f.sev === 'high' ? 'rgba(239,68,68,0.10)' : f.sev === 'med' ? 'rgba(245,158,11,0.14)' : C.s100,
                  color: f.sev === 'high' ? C.errorFg : f.sev === 'med' ? C.warningFg : C.s500 }}>
                  <Icon name="alert-triangle" size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.s900 }}>{f.student}</span>
                    <Badge tone={f.sev === 'high' ? 'error' : f.sev === 'med' ? 'warning' : 'neutral'} dot={false}>{f.sev === 'high' ? 'High' : f.sev === 'med' ? 'Medium' : 'Low'}</Badge>
                    <span style={{ fontSize: 12, color: C.s400 }}>{f.hall}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.s700, marginTop: 6 }}>{f.kind}</div>
                  <div style={{ fontSize: 12.5, color: C.s500, marginTop: 3 }}>{f.note}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="soft" size="sm">Dismiss</Button>
                  <Button variant="primary" size="sm">Resolve</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {drawer && <AssignDrawer req={drawer} onClose={() => setDrawer(null)} onAssign={handleAssign} />}
      {toast && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 80,
          background: C.s900, color: '#fff', padding: '12px 18px', borderRadius: 10, fontSize: 13, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 16px 40px rgba(15,23,42,0.3)', animation: 'daustSlideUp 280ms cubic-bezier(0.16,1,0.3,1)' }}>
          <Icon name="check-circle-2" size={17} color={C.teal400} />{toast}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { Housing, Segmented, AssignDrawer });
