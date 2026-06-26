/* MyDAUST — More menu, Billing + pay sheet, Announcements, Events,
   Documents, Library, Settings */

// ── More (tab) ────────────────────────────────────────────────
function MoreScreen() {
  const nav = useNav();
  const items = [
    { icon: 'wallet', label: 'Billing & Payments', sub: `${fmtCFA(BILLING.balance)} due`, go: 'billing', tone: 'orange' },
    { icon: 'megaphone', label: 'Announcements', sub: `${ANNOUNCEMENTS.length} new`, go: 'announcements', tone: 'navy' },
    { icon: 'sparkles', label: 'Life @ DAUST', sub: 'Events & clubs', go: 'events', tone: 'navy' },
    { icon: 'file', label: 'Documents', sub: 'Certificates, transcript', go: 'documents', tone: 'navy' },
    { icon: 'book', label: 'Library', sub: '2 items on loan', go: 'library', tone: 'navy' },
    { icon: 'settings', label: 'Settings', sub: 'Profile, language', go: 'settings', tone: 'navy' },
  ];
  return (
    <div>
      <TabHeader title="More" sub="MyDAUST" />
      {/* profile card */}
      <div style={{ padding: '8px 20px 0' }}>
        <Card onClick={() => nav.go('settings')} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar initials={STUDENT.initials} size={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--fg1)' }}>{STUDENT.name}</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--fg3)' }}>{STUDENT.id} · {STUDENT.programShort}</div>
          </div>
          <Icon name="chevR" size={18} color="var(--gray-400)" />
        </Card>
      </div>

      <div style={{ padding: '16px 20px 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((it, i) => (
            <Card key={i} onClick={() => nav.go(it.go)} pad={14} style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: it.tone === 'orange' ? 'rgba(237,132,37,.12)' : 'rgba(21,59,106,.07)' }}>
                <Icon name={it.icon} size={21} color={it.tone === 'orange' ? 'var(--daust-orange-600)' : 'var(--daust-navy)'} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--fg1)' }}>{it.label}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg3)' }}>{it.sub}</div>
              </div>
              <Icon name="chevR" size={18} color="var(--gray-400)" />
            </Card>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <img src="daust/assets/logo-daust-navy.png" alt="DAUST" style={{ height: 30, opacity: .45 }} />
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 10.5, color: 'var(--fg3)', marginTop: 6 }}>MyDAUST · v1.0 · Somone, Senegal</div>
        </div>
      </div>
    </div>
  );
}

// ── Billing ───────────────────────────────────────────────────
function BillingScreen() {
  const [pay, setPay] = React.useState(false);
  const pct = Math.round(BILLING.termPaid / BILLING.termTotal * 100);
  return (
    <div>
      <SubHeader title="Billing" />
      <div style={{ padding: '16px 20px 0' }}>
        <Card navy style={{ position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -30, top: -40, width: 150, height: 150, borderRadius: 999, background: 'radial-gradient(circle, rgba(237,132,37,.22), transparent 70%)' }} />
          <Eyebrow style={{ color: 'var(--daust-orange)' }}>Balance due</Eyebrow>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 34, color: '#fff', marginTop: 4, letterSpacing: '.01em' }}>{fmtCFA(BILLING.balance)}</div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg-on-navy-muted)', marginTop: 2 }}>Due {BILLING.dueDate}</div>
          <Button variant="primary" full style={{ marginTop: 16 }} onClick={() => setPay(true)}>Pay now</Button>
        </Card>
      </div>

      {/* term breakdown */}
      <div style={{ padding: '16px 20px 0' }}>
        <Card pad={16}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--fg1)' }}>{STUDENT.term} tuition</span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, color: 'var(--success)' }}>{pct}% paid</span>
          </div>
          <div style={{ height: 9, borderRadius: 999, background: 'var(--gray-200)', overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--success)', borderRadius: 999 }} />
          </div>
          <BillRow label="Total tuition" value={fmtCFA(BILLING.termTotal)} />
          <BillRow label="Paid to date" value={'– ' + fmtCFA(BILLING.termPaid)} green />
          <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />
          <BillRow label="Remaining" value={fmtCFA(BILLING.balance)} bold />
        </Card>
      </div>

      {/* transactions */}
      <div style={{ padding: '18px 20px 0' }}>
        <SectionLabel title="Recent activity" />
        <Card pad={0} style={{ overflow: 'hidden' }}>
          {BILLING.transactions.map((tx, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: tx.amount < 0 ? 'rgba(46,125,82,.10)' : 'rgba(21,59,106,.07)' }}>
                <Icon name={tx.amount < 0 ? 'check' : 'receipt'} size={18} color={tx.amount < 0 ? 'var(--success)' : 'var(--daust-navy)'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13.5, color: 'var(--fg1)' }}>{tx.label}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--fg3)' }}>{tx.date} · {tx.method}</div>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: tx.amount < 0 ? 'var(--success)' : 'var(--fg1)', whiteSpace: 'nowrap' }}>
                {tx.amount < 0 ? '– ' : ''}{fmtCFA(tx.amount)}
              </div>
            </div>
          ))}
        </Card>
      </div>

      {pay && <PaySheet onClose={() => setPay(false)} />}
    </div>
  );
}

function BillRow({ label, value, green, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: bold ? 'var(--fg1)' : 'var(--fg2)', fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 13.5, fontWeight: bold ? 800 : 600, color: green ? 'var(--success)' : 'var(--fg1)' }}>{value}</span>
    </div>
  );
}

// ── Pay sheet (bottom sheet) ──────────────────────────────────
function PaySheet({ onClose }) {
  const nav = useNav();
  const [method, setMethod] = React.useState('wave');
  const [stage, setStage] = React.useState('select'); // select → processing → done
  const methods = [
    { id: 'wave', label: 'Wave', sub: STUDENT.phone, color: '#1DC8F2', letter: 'W' },
    { id: 'orange', label: 'Orange Money', sub: STUDENT.phone, color: '#FF7900', letter: 'O' },
    { id: 'card', label: 'Bank card', sub: 'Visa · Mastercard', color: 'var(--daust-navy)', letter: '⬢' },
  ];
  const confirm = () => {
    setStage('processing');
    setTimeout(() => setStage('done'), 1400);
  };
  const sheet = (
    <div style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={onClose} className="sheet-scrim" style={{ position: 'absolute', inset: 0, background: 'rgba(15,29,51,.5)', backdropFilter: 'blur(2px)' }} />
      <div className="sheet-up" style={{ position: 'relative', width: '100%', background: '#fff', borderRadius: '24px 24px 0 0', padding: '12px 20px 40px', boxShadow: '0 -20px 50px rgba(15,44,80,.3)' }}>
        <div style={{ width: 40, height: 5, borderRadius: 999, background: 'var(--gray-200)', margin: '0 auto 16px' }} />
        {stage === 'done' ? (
          <div style={{ textAlign: 'center', padding: '20px 0 10px' }}>
            <div className="pop-in" style={{ width: 72, height: 72, borderRadius: 999, background: 'rgba(46,125,82,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon name="check" size={38} color="var(--success)" strokeWidth={2.4} />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 21, color: 'var(--fg1)' }}>Payment confirmed</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--fg3)', marginTop: 6 }}>{fmtCFA(BILLING.balance)} paid via {methods.find(m => m.id === method).label}. A receipt was sent to your email.</div>
            <Button variant="navy" full style={{ marginTop: 22 }} onClick={onClose}>Done</Button>
          </div>
        ) : (
          <React.Fragment>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--fg1)' }}>Pay tuition</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg3)', marginTop: 2, marginBottom: 16 }}>Amount due</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, color: 'var(--daust-navy)', marginBottom: 18 }}>{fmtCFA(BILLING.balance)}</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--fg3)', marginBottom: 10 }}>Pay with</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {methods.map(m => {
                const on = method === m.id;
                return (
                  <button key={m.id} onClick={() => setMethod(m.id)} disabled={stage === 'processing'} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, cursor: 'pointer',
                    background: '#fff', border: on ? '2px solid var(--daust-navy)' : '1px solid var(--border)', textAlign: 'left',
                  }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: m.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, flexShrink: 0 }}>{m.letter}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14.5, color: 'var(--fg1)' }}>{m.label}</div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg3)' }}>{m.sub}</div>
                    </div>
                    <div style={{ width: 21, height: 21, borderRadius: 999, border: on ? '6px solid var(--daust-navy)' : '2px solid var(--gray-300)', boxSizing: 'border-box' }} />
                  </button>
                );
              })}
            </div>
            <Button variant="primary" full style={{ marginTop: 20 }} onClick={confirm}>
              {stage === 'processing' ? 'Processing…' : `Pay ${fmtCFA(BILLING.balance)}`}
            </Button>
          </React.Fragment>
        )}
      </div>
    </div>
  );
  return nav.host ? ReactDOM.createPortal(sheet, nav.host) : sheet;
}
function AnnouncementsScreen() {
  const nav = useNav();
  const accentColor = (a) => a === 'orange' ? 'var(--daust-orange-600)' : a === 'steel' ? 'var(--fg2)' : 'var(--daust-navy)';
  const accentBg = (a) => a === 'orange' ? 'rgba(237,132,37,.12)' : a === 'steel' ? 'rgba(157,166,174,.18)' : 'rgba(21,59,106,.07)';
  return (
    <div>
      <SubHeader title="Announcements" />
      <div style={{ padding: '16px 20px 0', display: 'flex', flexDirection: 'column', gap: 11 }}>
        {ANNOUNCEMENTS.map((a, i) => (
          <Card key={i} onClick={() => nav.go('announcement', { item: a })} pad={15} style={{ borderLeft: a.pinned ? '3px solid var(--daust-orange)' : '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: accentBg(a.accent), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="megaphone" size={17} color={accentColor(a.accent)} />
              </div>
              <Eyebrow style={{ color: accentColor(a.accent), fontSize: 10 }}>{a.tag}</Eyebrow>
              {a.pinned && <Badge tone="orange" style={{ marginLeft: 'auto' }}><Icon name="bookmark" size={11} color="var(--daust-orange-600)" /> Pinned</Badge>}
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15.5, color: 'var(--fg1)', lineHeight: 1.25 }}>{a.title}</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg2)', marginTop: 6, lineHeight: 1.5 }}>{a.body}</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--fg3)', marginTop: 9 }}>{a.time}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AnnouncementDetail({ item }) {
  const a = item || ANNOUNCEMENTS[0];
  return (
    <div>
      <SubHeader title="Announcement" />
      <div style={{ padding: '18px 20px 0' }}>
        <Eyebrow>{a.tag}</Eyebrow>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 25, color: 'var(--fg1)', lineHeight: 1.15, marginTop: 8, letterSpacing: '.005em' }}>{a.title}</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--fg3)', marginTop: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon name="clock" size={14} color="var(--fg3)" /> {a.time}
        </div>
        <TriDash style={{ margin: '18px 0' }} />
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 14.5, color: 'var(--fg2)', lineHeight: 1.65 }}>{a.body}</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 14.5, color: 'var(--fg2)', lineHeight: 1.65, marginTop: 14 }}>
          For questions, contact the {a.tag.toLowerCase()} office or visit the front desk in the Administration Building during working hours.
        </div>
        <Card style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-subtle)' }}>
          <Icon name="mail" size={20} color="var(--daust-navy)" />
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg2)', flex: 1 }}>Replies and updates are also sent to your DAUST email.</div>
        </Card>
      </div>
    </div>
  );
}

// ── Events (Life @ DAUST) ─────────────────────────────────────
function EventsScreen() {
  const cats = ['All', 'Clubs', 'Career', 'Sports', 'Culture'];
  const [cat, setCat] = React.useState('All');
  const list = EVENTS.filter(e => cat === 'All' || e.cat === cat);
  const catTone = { Clubs: 'navy', Career: 'orange', Sports: 'steel', Culture: 'success' };
  return (
    <div>
      <SubHeader title="Life @ DAUST" />
      <div style={{ display: 'flex', gap: 8, padding: '14px 20px 4px', overflowX: 'auto' }}>
        {cats.map(c => (
          <button key={c} onClick={() => setCat(c)} style={{
            flexShrink: 0, border: 'none', cursor: 'pointer', borderRadius: 999, padding: '8px 16px',
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
            background: cat === c ? 'var(--daust-navy)' : '#fff', color: cat === c ? '#fff' : 'var(--fg2)',
            border: cat === c ? 'none' : '1px solid var(--border)',
          }}>{c}</button>
        ))}
      </div>
      <div style={{ padding: '12px 20px 0', display: 'flex', flexDirection: 'column', gap: 11 }}>
        {list.map((e, i) => (
          <Card key={i} pad={0} style={{ overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: 72, flexShrink: 0, background: 'var(--daust-navy)', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '14px 0' }}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--fg-on-navy-muted)' }}>{e.day}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, marginTop: 2 }}>{e.date.split(' ')[1]}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 10.5, color: 'var(--fg-on-navy-muted)' }}>{e.date.split(' ')[0]}</div>
            </div>
            <div style={{ flex: 1, padding: 14 }}>
              <Badge tone={catTone[e.cat]}>{e.cat}</Badge>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--fg1)', marginTop: 7, lineHeight: 1.2 }}>{e.title}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--fg3)', marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="pin" size={13} color="var(--fg3)" /> {e.loc}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Documents ─────────────────────────────────────────────────
function DocumentsScreen() {
  return (
    <div>
      <SubHeader title="Documents" />
      <div style={{ padding: '16px 20px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {DOCUMENTS.map((d, i) => (
          <Card key={i} pad={14} style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, background: 'rgba(21,59,106,.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={d.icon === 'badge-check' ? 'badge' : d.icon === 'book-open' ? 'book' : d.icon === 'calendar' ? 'calendar' : d.icon === 'receipt' ? 'receipt' : 'file'} size={21} color="var(--daust-navy)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14.5, color: 'var(--fg1)' }}>{d.title}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg3)' }}>{d.sub}</div>
            </div>
            <div style={{ width: 38, height: 38, borderRadius: 999, background: 'var(--bg-subtle)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="download" size={18} color="var(--daust-navy)" />
            </div>
          </Card>
        ))}
        <Card style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-subtle)' }}>
          <Icon name="shield" size={20} color="var(--daust-navy)" />
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--fg2)', flex: 1 }}>Official documents carry a verifiable QR seal from the Registrar.</div>
        </Card>
      </div>
    </div>
  );
}

// ── Library ───────────────────────────────────────────────────
function LibraryScreen() {
  const loans = [
    { title: 'Introduction to Algorithms', author: 'Cormen et al.', due: 'Jun 4', soon: true },
    { title: 'Digital Design & Computer Architecture', author: 'Harris & Harris', due: 'Jun 18', soon: false },
  ];
  return (
    <div>
      <SubHeader title="Library" />
      <div style={{ padding: '16px 20px 0' }}>
        <Card navy style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Icon name="clock" size={26} color="var(--daust-orange)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--fg-on-navy-muted)' }}>Open now</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: '#fff' }}>08:00 – 00:00 · Exam hours</div>
          </div>
          <Badge tone="onNavy">Mon–Sat</Badge>
        </Card>
      </div>
      <div style={{ padding: '18px 20px 0' }}>
        <SectionLabel title="On loan" sub={`${loans.length} items`} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loans.map((b, i) => (
            <Card key={i} pad={14} style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <div style={{ width: 38, height: 50, borderRadius: 5, background: 'linear-gradient(150deg, var(--daust-navy-700), var(--daust-navy-deep))', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="book" size={18} color="rgba(255,255,255,.7)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, color: 'var(--fg1)', lineHeight: 1.2 }}>{b.title}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg3)', marginTop: 2 }}>{b.author}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 10.5, color: 'var(--fg3)' }}>Due</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13.5, color: b.soon ? 'var(--daust-orange-600)' : 'var(--fg1)' }}>{b.due}</div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────
function SettingsScreen() {
  const [notif, setNotif] = React.useState(true);
  const [email, setEmail] = React.useState(true);
  return (
    <div>
      <SubHeader title="Settings" />
      <div style={{ padding: '16px 20px 0' }}>
        <Card style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar initials={STUDENT.initials} size={56} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 17, color: 'var(--fg1)' }}>{STUDENT.name}</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--fg3)' }}>{STUDENT.email}</div>
          </div>
        </Card>
      </div>
      <div style={{ padding: '16px 20px 0' }}>
        <SectionLabel title="Account" />
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <InfoRow icon="user" label="Program" value={STUDENT.programShort} />
          <InfoRow icon="cap" label="Advisor" value={STUDENT.advisor} />
          <InfoRow icon="phone" label="Phone" value={STUDENT.phone} />
          <InfoRow icon="building" label="Campus" value="Somone" last />
        </Card>
      </div>
      <div style={{ padding: '16px 20px 0' }}>
        <SectionLabel title="Preferences" />
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <ToggleRow icon="bell" label="Push notifications" on={notif} set={setNotif} />
          <ToggleRow icon="mail" label="Email digests" on={email} set={setEmail} last />
        </Card>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--fg3)', marginTop: 8, paddingLeft: 4 }}>
          Tip: switch language (EN / FR) and ID-card style from the Tweaks panel.
        </div>
      </div>
      <div style={{ padding: '16px 20px 0' }}>
        <a href="MyDAUST-Desktop.html" style={{ textDecoration: 'none' }}>
          <Card pad={14} style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, background: 'rgba(21,59,106,.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="building" size={21} color="var(--daust-navy)" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--fg1)' }}>Open desktop portal</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg3)' }}>Full dashboard, timetable & more</div>
            </div>
            <Icon name="arrowUR" size={18} color="var(--gray-400)" />
          </Card>
        </a>
      </div>
      <div style={{ padding: '18px 20px 0' }}>
        <Button variant="outline" full style={{ color: 'var(--danger)', boxShadow: 'inset 0 0 0 1.5px var(--danger)' }}>
          <Icon name="logout" size={18} color="currentColor" /> Sign out
        </Button>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <Icon name={icon} size={19} color="var(--daust-navy)" />
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--fg2)', flex: 1 }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 600, color: 'var(--fg1)', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}
function ToggleRow({ icon, label, on, set, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <Icon name={icon} size={19} color="var(--daust-navy)" />
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--fg1)', flex: 1 }}>{label}</span>
      <button onClick={() => set(!on)} style={{
        width: 46, height: 28, borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative',
        background: on ? 'var(--success)' : 'var(--gray-300)', transition: 'background .18s ease',
      }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 22, height: 22, borderRadius: 999, background: '#fff', transition: 'left .18s ease', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
      </button>
    </div>
  );
}

Object.assign(window, {
  MoreScreen, BillingScreen, PaySheet, AnnouncementsScreen, AnnouncementDetail,
  EventsScreen, DocumentsScreen, LibraryScreen, SettingsScreen,
});
