// ============================================================
// DAUST Student Affairs — Engagement: Clubs, Events, Budget, Abroad
// ============================================================

function Clubs() {
  const catColor = { Engineering: '#153b6a', Advocacy: '#6c7884', Culture: '#ed8425', Business: '#3a6ea5', Academic: '#1d4a82' };
  const totalMembers = CLUBS.reduce((a, c) => a + c.members, 0);
  return (
    <div>
      <PageHeader eyebrow="Engagement" title="Clubs & Organizations"
        desc="Recognized student organizations, membership, and budget allocation. Two organizations are up for annual recognition review."
        actions={<Button variant="primary" icon="plus">Recognize org</Button>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 22 }}>
        <StatTile label="Active organizations" value={CLUBS.filter(c=>c.status==='active').length} sub="1 under review" tone="accent" />
        <StatTile label="Total members" value={totalMembers.toLocaleString()} sub="32% of student body" tone="info" />
        <StatTile label="Allocated budget" value={`FCFA ${CLUBS.reduce((a,c)=>a+c.budget,0).toFixed(1)}M`} sub="CFA this term" tone="neutral" />
        <StatTile label="Events hosted" value="28" sub="this term" tone="success" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px,1fr))', gap: 16 }}>
        {CLUBS.map(c => (
          <Card key={c.name} hover>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 11, background: catColor[c.cat] + '1A', color: catColor[c.cat], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="flag" size={20} />
              </div>
              {c.status === 'review' ? <Badge tone="warning" dot={false}>Review due</Badge> : <Badge tone="success" dot={false}>Active</Badge>}
            </div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.3 }}>{c.name}</h3>
            <div style={{ fontSize: 12, color: C.s500, marginTop: 4 }}>{c.cat} · Led by {c.lead}</div>
            <div style={{ display: 'flex', gap: 20, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.s100}` }}>
              <div><div style={{ fontSize: 16, fontWeight: 700, color: C.s900 }}>{c.members}</div><div style={{ fontSize: 11, color: C.s500 }}>Members</div></div>
              <div><div style={{ fontSize: 16, fontWeight: 700, color: C.s900 }}>FCFA {c.budget}M</div><div style={{ fontSize: 11, color: C.s500 }}>Budget</div></div>
              <div style={{ marginLeft: 'auto', alignSelf: 'center' }}><Button variant="ghost" size="sm" iconRight="arrow-right">Open</Button></div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Events() {
  const statusTone = { upcoming: 'accent', planning: 'warning', past: 'neutral' };
  return (
    <div>
      <PageHeader eyebrow="Engagement" title="Events & Programs"
        desc="Hackathons, fairs, summits, and cultural programming. The optimizer balances venue capacity, dates, and budget to avoid conflicts and maximize turnout."
        actions={<>
          <Button variant="soft" icon="calendar">Calendar</Button>
          <Button variant="primary" icon="plus">New event</Button>
        </>} />
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20 }}>
        <Card padding={0}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.s200}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.s700 }}>Program calendar</span>
            <span style={{ fontSize: 12, color: C.s400 }}>June 2026</span>
          </div>
          {EVENTS.map((e, i) => (
            <div key={e.name} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '15px 18px', borderBottom: i < EVENTS.length - 1 ? `1px solid ${C.s100}` : 'none', opacity: e.status === 'past' ? 0.6 : 1 }}>
              <div style={{ width: 56, textAlign: 'center', flexShrink: 0, padding: '8px 0', borderRadius: 9, background: e.status === 'past' ? C.s100 : C.teal50 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: e.status === 'past' ? C.s400 : C.teal700, textTransform: 'uppercase' }}>{e.date.split(' ')[0]}</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: C.s900, letterSpacing: '-0.02em' }}>{e.date.replace(/[^0-9–]/g,'').split('–')[0]}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.s900 }}>{e.name}</span>
                  {e.tag === 'Flagship' && <Badge tone="accent" dot={false}>Flagship</Badge>}
                </div>
                <div style={{ fontSize: 12, color: C.s500, marginTop: 3 }}>{e.venue} · {e.org} · {e.attendees} expected</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Badge tone={statusTone[e.status]} dot={false}>{e.status === 'upcoming' ? 'Confirmed' : e.status === 'planning' ? 'Planning' : 'Complete'}</Badge>
                <div style={{ fontSize: 11.5, color: C.s400, marginTop: 5, fontFamily: 'IBM Plex Mono, monospace' }}>FCFA {e.budget}M</div>
              </div>
            </div>
          ))}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <AIPanel title="AI Event Optimizer" action="Apply schedule">
            <div style={{ fontSize: 13, color: C.s700, lineHeight: 1.55, marginBottom: 12 }}>
              <strong style={{ color: C.s900 }}>Conflict detected:</strong> Cultural Night and the Career Fair both target the Atrium on overlapping setup days.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { i: 'calendar-clock', t: 'Move Cultural Night to Central Quad', s: 'frees Atrium, +120 capacity' },
                { i: 'wallet', t: 'Shift FCFA 0.8M to A/V from contingency', s: 'covers larger venue' },
                { i: 'users', t: 'Stagger volunteer pools', s: '14 students double-booked' },
              ].map(x => (
                <div key={x.t} style={{ display: 'flex', gap: 10, background: '#fff', border: `1px solid ${C.teal100}`, borderRadius: 9, padding: '10px 12px' }}>
                  <Icon name={x.i} size={16} color={C.teal700} />
                  <div><div style={{ fontSize: 12.5, fontWeight: 600, color: C.s900 }}>{x.t}</div><div style={{ fontSize: 11, color: C.s500 }}>{x.s}</div></div>
                </div>
              ))}
            </div>
          </AIPanel>
          <Card>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Turnout forecast</h3>
            {EVENTS.filter(e=>e.status!=='past').map(e => (
              <div key={e.name} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                  <span style={{ color: C.s700 }}>{e.name.split('—')[0].split(',')[0]}</span>
                  <span style={{ color: C.s500, fontWeight: 600 }}>{e.attendees}</span>
                </div>
                <Meter value={e.attendees} max={650} color={C.teal500} height={6} />
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Budget() {
  const alloc = BUDGET.reduce((a,b)=>a+b.allocated,0);
  const spent = BUDGET.reduce((a,b)=>a+b.spent,0);
  return (
    <div>
      <PageHeader eyebrow="Engagement" title="Co-curricular Budget"
        desc="Allocated versus spent across the student-life portfolio (figures in millions CFA). The optimizer reallocates uncommitted funds toward the highest-impact programs."
        actions={<Button variant="soft" icon="download">Export ledger</Button>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 22 }}>
        <StatTile label="Total allocated" value={`FCFA ${alloc.toFixed(1)}M`} sub="academic year" tone="neutral" />
        <StatTile label="Committed" value={`FCFA ${spent.toFixed(1)}M`} sub={`${Math.round(spent/alloc*100)}% of budget`} tone="accent" />
        <StatTile label="Remaining" value={`FCFA ${(alloc-spent).toFixed(1)}M`} sub="uncommitted" tone="success" />
        <StatTile label="Programs funded" value="34" sub="across 5 lines" tone="info" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20 }}>
        <Card>
          <h3 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 600 }}>Allocation by line</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {BUDGET.map(b => {
              const pct = Math.round(b.spent / b.allocated * 100);
              return (
                <div key={b.line}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color }} />
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: C.s900 }}>{b.line}</span>
                    </div>
                    <span style={{ fontSize: 12.5, color: C.s500, fontFamily: 'IBM Plex Mono, monospace' }}>FCFA {b.spent}M / FCFA {b.allocated}M · {pct}%</span>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <Meter value={b.spent} max={b.allocated} color={b.color} height={10} />
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.s100}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.s900 }}>Total committed</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.teal700, fontFamily: 'IBM Plex Mono, monospace' }}>FCFA {spent.toFixed(1)}M / FCFA {alloc.toFixed(1)}M</span>
            </div>
            <Meter value={spent} max={alloc} color={C.teal700} height={12} />
          </div>
        </Card>

        <AIPanel title="AI Budget Optimizer" action="Preview reallocation" style={{ alignSelf: 'flex-start' }}>
          <div style={{ fontSize: 13, color: C.s700, lineHeight: 1.55, marginBottom: 14 }}>
            <strong style={{ color: C.s900 }}>FCFA {(alloc-spent).toFixed(1)}M uncommitted</strong> with 6 weeks left. Study-abroad and internship lines are underspending while events demand is high.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { from: 'Study abroad support', to: 'Events & programming', amt: 'FCFA 1.5M', why: 'Hack 48 + Career Fair oversubscribed' },
              { from: 'Wellness contingency', to: 'Clubs & orgs', amt: 'FCFA 0.6M', why: '3 orgs hit funding cap' },
            ].map(r => (
              <div key={r.to} style={{ background: '#fff', border: `1px solid ${C.teal100}`, borderRadius: 10, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: C.s900 }}>
                  <span>{r.from}</span><Icon name="arrow-right" size={14} color={C.teal700} /><span>{r.to}</span>
                  <span style={{ marginLeft: 'auto', color: C.teal700 }}>{r.amt}</span>
                </div>
                <div style={{ fontSize: 11.5, color: C.s500, marginTop: 5 }}>{r.why}</div>
              </div>
            ))}
          </div>
        </AIPanel>
      </div>
    </div>
  );
}

function Abroad() {
  const statusTone = { open: 'success', full: 'neutral' };
  return (
    <div>
      <PageHeader eyebrow="Engagement" title="Study Abroad & Internships"
        desc="Exchange partnerships and internship placements with seats, deadlines, and application status. Stipend support draws from the co-curricular budget."
        actions={<Button variant="primary" icon="plus">Add program</Button>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 22 }}>
        <StatTile label="Active programs" value={ABROAD.length} sub="3 open for applications" tone="accent" />
        <StatTile label="Seats filled" value="23/29" sub="79% utilization" tone="info" />
        <StatTile label="Applications" value="64" sub="12 pending review" tone="warning" />
        <StatTile label="Stipend committed" value="FCFA 6.4M" sub="of FCFA 13M budget" tone="success" />
      </div>
      <Card padding={0}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 1.2fr 0.9fr 0.9fr', padding: '12px 20px', borderBottom: `1px solid ${C.s200}`, fontSize: 11, fontWeight: 600, color: C.s400, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          <span>Program</span><span>Type</span><span>Partner</span><span>Seats</span><span>Deadline</span>
        </div>
        {ABROAD.map((p, i) => (
          <div key={p.name} style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 1.2fr 0.9fr 0.9fr', alignItems: 'center', padding: '15px 20px', borderBottom: i < ABROAD.length - 1 ? `1px solid ${C.s100}` : 'none' }}
            onMouseEnter={e => e.currentTarget.style.background = C.s50} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: p.kind === 'Internship' ? 'rgba(58,110,165,0.12)' : C.teal50, color: p.kind === 'Internship' ? '#3a6ea5' : C.teal700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={p.kind === 'Internship' ? 'briefcase' : 'plane'} size={17} />
              </div>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: C.s900 }}>{p.name}</span>
            </div>
            <span style={{ fontSize: 12.5, color: C.s700 }}>{p.kind}</span>
            <span style={{ fontSize: 12.5, color: C.s700 }}>{p.partner}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.s900, fontFamily: 'IBM Plex Mono, monospace' }}>{p.seats}</span>
            <span><Badge tone={p.deadline === 'Closed' ? 'neutral' : 'info'} dot={false}>{p.deadline}</Badge></span>
          </div>
        ))}
      </Card>
    </div>
  );
}

Object.assign(window, { Clubs, Events, Budget, Abroad });
