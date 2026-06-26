/* MyDAUST Desktop — secondary screens: ID, Billing, Announcements,
   Events, Documents, Library, Settings */

// ══ STUDENT ID ════════════════════════════════════════════════
function DID({ lang, idStyle }) {
  const s = DSTR[lang];
  const style = idStyle || 'navy';
  const cardBg = {
    navy: 'linear-gradient(155deg, var(--daust-navy-700) 0%, var(--daust-navy) 50%, var(--daust-navy-deep) 100%)',
    gradient: 'linear-gradient(150deg, #1d4a82 0%, #153b6a 45%, #ed8425 165%)',
    light: '#ffffff',
  }[style];
  const onLight = style === 'light';
  const fg = onLight ? 'var(--fg1)' : '#fff';
  const muted = onLight ? 'var(--fg3)' : 'var(--fg-on-navy-muted)';
  const uses = [
    { icon: 'shield', label: 'Campus access', sub: 'Gates, labs & buildings' },
    { icon: 'check', label: 'Attendance', sub: 'Auto check-in to classes' },
    { icon: 'book', label: 'Library', sub: 'Borrow & return books' },
    { icon: 'utensils', label: 'Dining', sub: 'Meal plan & cafeteria' },
  ];
  return (
    <div>
      <PageHead title={s.id} sub="DAUST" />
      <div style={{ display: 'grid', gridTemplateColumns: '380px minmax(0,1fr)', gap: 24, alignItems: 'start' }}>
        {/* card + QR */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ borderRadius: 20, padding: 24, background: cardBg, color: fg, position: 'relative', overflow: 'hidden',
            boxShadow: onLight ? 'var(--shadow-lg)' : 'var(--shadow-navy)', border: onLight ? '1px solid var(--border)' : 'none' }}>
            <div style={{ position: 'absolute', right: 20, top: 20 }}><TriDash w={22} h={3.5} gap={5} /></div>
            <Eyebrow style={{ color: onLight ? 'var(--daust-orange-600)' : 'var(--daust-orange)' }}>Dakar American University</Eyebrow>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, letterSpacing: '.04em', marginTop: 2, color: fg }}>DAUST</div>
            <div style={{ display: 'flex', gap: 16, marginTop: 20, alignItems: 'center' }}>
              <Avatar initials={STUDENT.initials} size={72} />
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: fg }}>{STUDENT.name}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: muted, marginTop: 3 }}>{STUDENT.program}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: muted }}>{STUDENT.year} · {STUDENT.cohort}</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: muted }}>Student ID</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: fg }}>{STUDENT.id}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: muted }}>Valid thru</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: fg }}>{STUDENT.validThru}</div>
              </div>
            </div>
          </div>
          <DCard pad={22} style={{ textAlign: 'center' }}>
            <div style={{ display: 'inline-block', padding: 14, borderRadius: 16, background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
              <QRCode size={184} value={STUDENT.id + '|' + STUDENT.name} fg="#0f2c50" />
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg2)', marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icon name="scan" size={16} color="var(--daust-navy)" /> {s.present}
            </div>
          </DCard>
        </div>
        {/* uses */}
        <div>
          <DCard pad={0}>
            <div style={{ padding: '18px 22px 6px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--fg1)' }}>What your ID does</div>
            {uses.map((u, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 22px', borderTop: '1px solid var(--border)' }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(21,59,106,.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={u.icon} size={22} color="var(--daust-navy)" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15.5, color: 'var(--fg1)' }}>{u.label}</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg3)' }}>{u.sub}</div>
                </div>
                <Badge tone="success">Active</Badge>
              </div>
            ))}
          </DCard>
          <DCard style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-subtle)' }}>
            <Icon name="shield" size={22} color="var(--daust-navy)" />
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--fg2)' }}>Lost your physical card? Your digital ID stays valid. Report a lost card from Settings to disable the old one.</div>
          </DCard>
        </div>
      </div>
    </div>
  );
}

// ══ BILLING ═══════════════════════════════════════════════════
function DBilling({ lang }) {
  const s = DSTR[lang];
  const [pay, setPay] = React.useState(false);
  const pct = Math.round(BILLING.termPaid / BILLING.termTotal * 100);
  return (
    <div>
      <PageHead title={s.billing} sub={STUDENT.term} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 16, alignItems: 'start' }}>
        {/* transactions */}
        <DCard pad={0} style={{ overflow: 'hidden' }}>
          <div style={{ padding: '18px 22px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--fg1)' }}>Recent activity</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 0.8fr', padding: '10px 22px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
            {['Description', 'Date', 'Method', 'Amount'].map((h, i) => (
              <div key={i} style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--fg3)', textAlign: i === 3 ? 'right' : 'left' }}>{h}</div>
            ))}
          </div>
          {BILLING.transactions.map((tx, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 0.8fr', padding: '15px 22px', borderTop: i ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: tx.amount < 0 ? 'rgba(46,125,82,.10)' : 'rgba(21,59,106,.07)' }}>
                  <Icon name={tx.amount < 0 ? 'check' : 'receipt'} size={17} color={tx.amount < 0 ? 'var(--success)' : 'var(--daust-navy)'} />
                </div>
                <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13.5, color: 'var(--fg1)' }}>{tx.label}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg2)' }}>{tx.date}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg2)' }}>{tx.method}</div>
              <div style={{ textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13.5, color: tx.amount < 0 ? 'var(--success)' : 'var(--fg1)' }}>{tx.amount < 0 ? '– ' : ''}{fmtCFA(tx.amount)}</div>
            </div>
          ))}
        </DCard>
        {/* balance + breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <DCard navy pad={22} style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', right: -24, top: -34, width: 130, height: 130, borderRadius: 999, background: 'radial-gradient(circle, rgba(237,132,37,.2), transparent 70%)' }} />
            <Eyebrow style={{ color: 'var(--daust-orange)' }}>{s.balance}</Eyebrow>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, color: '#fff', marginTop: 6 }}>{fmtCFA(BILLING.balance)}</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg-on-navy-muted)', marginTop: 2 }}>Due {BILLING.dueDate}</div>
            <Button variant="primary" full style={{ marginTop: 16 }} onClick={() => setPay(true)}>{s.paynow}</Button>
          </DCard>
          <DCard pad={20}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--fg1)' }}>{STUDENT.term}</span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, color: 'var(--success)' }}>{pct}% paid</span>
            </div>
            <div style={{ height: 9, borderRadius: 999, background: 'var(--gray-200)', overflow: 'hidden', marginBottom: 14 }}>
              <div style={{ width: `${pct}%`, height: '100%', background: 'var(--success)', borderRadius: 999 }} />
            </div>
            <BRow label="Total tuition" value={fmtCFA(BILLING.termTotal)} />
            <BRow label="Paid to date" value={'– ' + fmtCFA(BILLING.termPaid)} green />
            <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />
            <BRow label="Remaining" value={fmtCFA(BILLING.balance)} bold />
          </DCard>
        </div>
      </div>
      {pay && <DPayModal onClose={() => setPay(false)} />}
    </div>
  );
}
function BRow({ label, value, green, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: bold ? 'var(--fg1)' : 'var(--fg2)', fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 13.5, fontWeight: bold ? 800 : 600, color: green ? 'var(--success)' : 'var(--fg1)' }}>{value}</span>
    </div>
  );
}
function DPayModal({ onClose }) {
  const [method, setMethod] = React.useState('wave');
  const [stage, setStage] = React.useState('select');
  const methods = [
    { id: 'wave', label: 'Wave', sub: STUDENT.phone, color: '#1DC8F2', letter: 'W' },
    { id: 'orange', label: 'Orange Money', sub: STUDENT.phone, color: '#FF7900', letter: 'O' },
    { id: 'card', label: 'Bank card', sub: 'Visa · Mastercard', color: 'var(--daust-navy)', letter: '⬢' },
  ];
  const confirm = () => { setStage('processing'); setTimeout(() => setStage('done'), 1400); };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} className="dlg-scrim" style={{ position: 'absolute', inset: 0, background: 'rgba(15,29,51,.5)', backdropFilter: 'blur(3px)' }} />
      <div className="dlg-pop" style={{ position: 'relative', width: 440, maxWidth: '90vw', background: '#fff', borderRadius: 20, padding: 28, boxShadow: 'var(--shadow-lg)' }}>
        {stage === 'done' ? (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div className="pop-in" style={{ width: 76, height: 76, borderRadius: 999, background: 'rgba(46,125,82,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon name="check" size={40} color="var(--success)" strokeWidth={2.4} />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--fg1)' }}>Payment confirmed</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--fg3)', marginTop: 8 }}>{fmtCFA(BILLING.balance)} paid via {methods.find(m => m.id === method).label}. A receipt was sent to {STUDENT.email}.</div>
            <Button variant="navy" full style={{ marginTop: 22 }} onClick={onClose}>Done</Button>
          </div>
        ) : (
          <React.Fragment>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 21, color: 'var(--fg1)' }}>Pay tuition</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg3)', marginTop: 2 }}>Amount due</div>
              </div>
              <button onClick={onClose} style={{ border: 'none', background: 'var(--bg-subtle)', width: 34, height: 34, borderRadius: 999, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={18} color="var(--fg2)" /></button>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 32, color: 'var(--daust-navy)', margin: '14px 0 20px' }}>{fmtCFA(BILLING.balance)}</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--fg3)', marginBottom: 10 }}>Pay with</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {methods.map(m => {
                const on = method === m.id;
                return (
                  <button key={m.id} onClick={() => setMethod(m.id)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: 13, borderRadius: 13, cursor: 'pointer', background: '#fff', border: on ? '2px solid var(--daust-navy)' : '1px solid var(--border)', textAlign: 'left' }}>
                    <div style={{ width: 42, height: 42, borderRadius: 11, background: m.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 19, flexShrink: 0 }}>{m.letter}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--fg1)' }}>{m.label}</div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--fg3)' }}>{m.sub}</div>
                    </div>
                    <div style={{ width: 22, height: 22, borderRadius: 999, border: on ? '6px solid var(--daust-navy)' : '2px solid var(--gray-300)', boxSizing: 'border-box' }} />
                  </button>
                );
              })}
            </div>
            <Button variant="primary" full style={{ marginTop: 22 }} onClick={confirm}>{stage === 'processing' ? 'Processing…' : `Pay ${fmtCFA(BILLING.balance)}`}</Button>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

// ══ ANNOUNCEMENTS ═════════════════════════════════════════════
function DAnnouncements({ lang }) {
  const s = DSTR[lang];
  const ac = (a) => a === 'orange' ? 'var(--daust-orange-600)' : a === 'steel' ? 'var(--fg2)' : 'var(--daust-navy)';
  const ab = (a) => a === 'orange' ? 'rgba(237,132,37,.12)' : a === 'steel' ? 'rgba(157,166,174,.18)' : 'rgba(21,59,106,.07)';
  return (
    <div>
      <PageHead title={s.announcements} sub={s.campus} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 820 }}>
        {ANNOUNCEMENTS.map((a, i) => (
          <DCard key={i} pad={20} style={{ borderLeft: a.pinned ? '3px solid var(--daust-orange)' : '1px solid var(--border)', display: 'flex', gap: 16 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: ab(a.accent) }}>
              <Icon name="megaphone" size={22} color={ac(a.accent)} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Eyebrow style={{ color: ac(a.accent) }}>{a.tag}</Eyebrow>
                {a.pinned && <Badge tone="orange">Pinned</Badge>}
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--fg3)' }}>{a.time}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--fg1)', marginTop: 6 }}>{a.title}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--fg2)', marginTop: 6, lineHeight: 1.6 }}>{a.body}</div>
            </div>
          </DCard>
        ))}
      </div>
    </div>
  );
}

// ══ EVENTS ════════════════════════════════════════════════════
function DEvents({ lang }) {
  const s = DSTR[lang];
  const cats = ['All', 'Clubs', 'Career', 'Sports', 'Culture'];
  const [cat, setCat] = React.useState('All');
  const list = EVENTS.filter(e => cat === 'All' || e.cat === cat);
  const tone = { Clubs: 'navy', Career: 'orange', Sports: 'steel', Culture: 'success' };
  return (
    <div>
      <PageHead title={s.events} sub="Events & clubs" />
      <div style={{ display: 'flex', gap: 9, marginBottom: 18 }}>
        {cats.map(c => (
          <button key={c} onClick={() => setCat(c)} style={{ border: 'none', cursor: 'pointer', borderRadius: 999, padding: '9px 18px', fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 600,
            background: cat === c ? 'var(--daust-navy)' : '#fff', color: cat === c ? '#fff' : 'var(--fg2)', border: cat === c ? 'none' : '1px solid var(--border)' }}>{c}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {list.map((e, i) => (
          <DCard key={i} pad={0} style={{ overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: 90, flexShrink: 0, background: 'var(--daust-navy)', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--fg-on-navy-muted)' }}>{e.day}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, margin: '2px 0' }}>{e.date.split(' ')[1]}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--fg-on-navy-muted)' }}>{e.date.split(' ')[0]}</div>
            </div>
            <div style={{ flex: 1, padding: 18 }}>
              <Badge tone={tone[e.cat]}>{e.cat}</Badge>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16.5, color: 'var(--fg1)', marginTop: 8, lineHeight: 1.2 }}>{e.title}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg3)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="pin" size={14} color="var(--fg3)" /> {e.loc}
              </div>
            </div>
          </DCard>
        ))}
      </div>
    </div>
  );
}

// ══ DOCUMENTS ═════════════════════════════════════════════════
function DDocuments({ lang }) {
  const s = DSTR[lang];
  return (
    <div>
      <PageHead title={s.documents} sub={s.account} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, maxWidth: 900 }}>
        {DOCUMENTS.map((d, i) => (
          <DCard key={i} pad={18} style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(21,59,106,.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={d.icon === 'badge-check' ? 'badge' : d.icon === 'book-open' ? 'book' : d.icon === 'calendar' ? 'calendar' : d.icon === 'receipt' ? 'receipt' : 'file'} size={23} color="var(--daust-navy)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15.5, color: 'var(--fg1)' }}>{d.title}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--fg3)' }}>{d.sub}</div>
            </div>
            <button style={{ display: 'flex', alignItems: 'center', gap: 7, border: '1px solid var(--border)', background: '#fff', borderRadius: 999, padding: '8px 16px', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--daust-navy)' }}>
              <Icon name="download" size={16} color="var(--daust-navy)" /> PDF
            </button>
          </DCard>
        ))}
      </div>
    </div>
  );
}

// ══ LIBRARY ═══════════════════════════════════════════════════
function DLibrary({ lang }) {
  const s = DSTR[lang];
  const loans = [
    { title: 'Introduction to Algorithms', author: 'Cormen, Leiserson, Rivest & Stein', due: 'Jun 4', soon: true },
    { title: 'Digital Design & Computer Architecture', author: 'Harris & Harris', due: 'Jun 18', soon: false },
  ];
  return (
    <div>
      <PageHead title={s.library} sub={s.campus} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 16, alignItems: 'start' }}>
        <DCard pad={0} style={{ overflow: 'hidden' }}>
          <div style={{ padding: '18px 22px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--fg1)' }}>On loan · {loans.length} items</div>
          {loans.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 22px', borderTop: '1px solid var(--border)' }}>
              <div style={{ width: 42, height: 56, borderRadius: 5, background: 'linear-gradient(150deg, var(--daust-navy-700), var(--daust-navy-deep))', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="book" size={20} color="rgba(255,255,255,.7)" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--fg1)' }}>{b.title}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg3)', marginTop: 2 }}>{b.author}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--fg3)' }}>Due</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14.5, color: b.soon ? 'var(--daust-orange-600)' : 'var(--fg1)' }}>{b.due}</div>
              </div>
              <Button variant="soft" size="sm">Renew</Button>
            </div>
          ))}
        </DCard>
        <DCard navy pad={22}>
          <Icon name="clock" size={26} color="var(--daust-orange)" />
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--fg-on-navy-muted)', marginTop: 12 }}>Open now</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19, color: '#fff', marginTop: 4 }}>08:00 – 00:00</div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg-on-navy-muted)', marginTop: 4 }}>Extended exam hours · Mon–Sat</div>
        </DCard>
      </div>
    </div>
  );
}

// ══ SETTINGS ══════════════════════════════════════════════════
function DSettings({ lang, setTweak, t }) {
  const s = DSTR[lang];
  const [notif, setNotif] = React.useState(true);
  return (
    <div>
      <PageHead title={s.settings} sub={s.account} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, maxWidth: 900, alignItems: 'start' }}>
        <DCard pad={22}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
            <Avatar initials={STUDENT.initials} size={60} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--fg1)' }}>{STUDENT.name}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg3)' }}>{STUDENT.email}</div>
            </div>
          </div>
          <SRow label="Program" value={STUDENT.program} />
          <SRow label="Advisor" value={STUDENT.advisor} />
          <SRow label="Phone" value={STUDENT.phone} />
          <SRow label="Campus" value="Somone, Senegal" last />
        </DCard>
        <DCard pad={22}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--fg1)', marginBottom: 16 }}>Preferences</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--fg1)' }}>Language</span>
            <div style={{ display: 'flex', gap: 6, background: 'var(--bg-subtle)', padding: 3, borderRadius: 999 }}>
              {['en', 'fr'].map(l => (
                <button key={l} onClick={() => setTweak('lang', l)} style={{ border: 'none', cursor: 'pointer', borderRadius: 999, padding: '6px 16px', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, textTransform: 'uppercase',
                  background: t.lang === l ? '#fff' : 'transparent', color: t.lang === l ? 'var(--daust-navy)' : 'var(--fg3)', boxShadow: t.lang === l ? 'var(--shadow-sm)' : 'none' }}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--fg1)' }}>Push notifications</span>
            <button onClick={() => setNotif(!notif)} style={{ width: 46, height: 28, borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative', background: notif ? 'var(--success)' : 'var(--gray-300)' }}>
              <span style={{ position: 'absolute', top: 3, left: notif ? 21 : 3, width: 22, height: 22, borderRadius: 999, background: '#fff', transition: 'left .18s ease', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
            </button>
          </div>
          <Button variant="outline" full style={{ marginTop: 18, color: 'var(--danger)', boxShadow: 'inset 0 0 0 1.5px var(--danger)' }}>
            <Icon name="logout" size={17} color="currentColor" /> Sign out
          </Button>
        </DCard>
      </div>
    </div>
  );
}
function SRow({ label, value, last }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--fg3)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 600, color: 'var(--fg1)' }}>{value}</span>
    </div>
  );
}

Object.assign(window, { DID, DBilling, DPayModal, DAnnouncements, DEvents, DDocuments, DLibrary, DSettings });
