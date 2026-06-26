/* MyDAUST Desktop — Inbox: conversation list + thread + reply + compose */

function DInbox({ lang }) {
  const s = DSTR[lang];
  const [convos, setConvos] = React.useState(() => CONVERSATIONS.map(c => ({ ...c, messages: [...c.messages] })));
  const [sel, setSel] = React.useState(convos[0].id);
  const [reply, setReply] = React.useState('');
  const [compose, setCompose] = React.useState(false);
  const active = convos.find(c => c.id === sel);
  const L = lang === 'fr'
    ? { reply: 'Écrire une réponse…', send: 'Envoyer', compose: 'Nouveau message', to: 'À', subject: 'Objet', msg: 'Message', sendmsg: 'Envoyer le message', search: 'Rechercher' }
    : { reply: 'Write a reply…', send: 'Send', compose: 'New message', to: 'To', subject: 'Subject', msg: 'Message', sendmsg: 'Send message', search: 'Search' };

  const openConvo = (id) => {
    setSel(id);
    setConvos(cs => cs.map(c => c.id === id ? { ...c, unread: false } : c));
  };
  const sendReply = () => {
    if (!reply.trim()) return;
    setConvos(cs => cs.map(c => c.id === sel ? { ...c, messages: [...c.messages, { me: true, name: 'You', time: 'Just now', text: reply.trim() }] } : c));
    setReply('');
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <Eyebrow style={{ marginBottom: 6 }}>{s.communication}</Eyebrow>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 30, margin: 0, color: 'var(--fg1)' }}>{s.inbox}</h1>
        </div>
        <Button variant="navy" onClick={() => setCompose(true)}><Icon name="pencil" size={16} color="#fff" /> {L.compose}</Button>
      </div>

      <DCard pad={0} style={{ display: 'flex', height: 'calc(100vh - 210px)', minHeight: 460, overflow: 'hidden' }}>
        {/* list */}
        <div style={{ width: 340, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 999, padding: '9px 14px' }}>
              <Icon name="grid" size={15} color="var(--fg3)" />
              <input placeholder={L.search} style={{ border: 'none', background: 'none', outline: 'none', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg1)', flex: 1, width: '100%' }} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {convos.map(c => {
              const on = c.id === sel;
              return (
                <button key={c.id} onClick={() => openConvo(c.id)} style={{ display: 'flex', gap: 12, width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', padding: '14px 16px',
                  background: on ? 'rgba(21,59,106,.06)' : 'transparent', borderBottom: '1px solid var(--border)', borderLeft: on ? '3px solid var(--daust-orange)' : '3px solid transparent' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 999, background: c.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, flexShrink: 0 }}>{c.initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontWeight: on || c.unread ? 700 : 600, fontSize: 13.5, color: 'var(--fg1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--fg3)', flexShrink: 0 }}>{c.time}</span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.subject}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: c.unread ? 'var(--fg2)' : 'var(--fg3)', fontWeight: c.unread ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{c.messages[c.messages.length - 1].text}</span>
                      {c.unread && <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--daust-orange)', flexShrink: 0 }} />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        {/* thread */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 13 }}>
            <div style={{ width: 44, height: 44, borderRadius: 999, background: active.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, flexShrink: 0 }}>{active.initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--fg1)' }}>{active.name}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--fg3)' }}>{active.role}</div>
            </div>
            {active.course && <Badge tone="navy">{active.course}</Badge>}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 22, background: 'var(--bg-subtle)' }}>
            <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, color: 'var(--fg3)', marginBottom: 18 }}>{active.subject}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {active.messages.map((m, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.me ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '74%', padding: '11px 15px', borderRadius: m.me ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: m.me ? 'var(--daust-navy)' : '#fff', color: m.me ? '#fff' : 'var(--fg1)',
                    border: m.me ? 'none' : '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
                    fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.55 }}>{m.text}</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--fg3)', margin: '4px 4px 0' }}>{m.me ? '' : m.name + ' · '}{m.time}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ padding: 14, borderTop: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea value={reply} onChange={e => setReply(e.target.value)} placeholder={L.reply} rows={1}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
              style={{ flex: 1, resize: 'none', border: '1px solid var(--border)', borderRadius: 14, padding: '11px 14px', fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--fg1)', outline: 'none', maxHeight: 100 }} />
            <button onClick={sendReply} style={{ width: 44, height: 44, borderRadius: 999, border: 'none', background: 'var(--daust-orange)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="send" size={19} color="#fff" />
            </button>
          </div>
        </div>
      </DCard>

      {compose && <ComposeModal L={L} onClose={() => setCompose(false)} />}
    </div>
  );
}

function ComposeModal({ L, onClose }) {
  const [sent, setSent] = React.useState(false);
  const [to, setTo] = React.useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} className="dlg-scrim" style={{ position: 'absolute', inset: 0, background: 'rgba(15,29,51,.5)', backdropFilter: 'blur(3px)' }} />
      <div className="dlg-pop" style={{ position: 'relative', width: 520, maxWidth: '92vw', background: '#fff', borderRadius: 20, padding: 26, boxShadow: 'var(--shadow-lg)' }}>
        {sent ? (
          <div style={{ textAlign: 'center', padding: '14px 0' }}>
            <div className="pop-in" style={{ width: 72, height: 72, borderRadius: 999, background: 'rgba(46,125,82,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Icon name="check" size={38} color="var(--success)" strokeWidth={2.4} />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 21, color: 'var(--fg1)' }}>Message sent</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--fg3)', marginTop: 6 }}>You’ll get a reply in your inbox.</div>
            <Button variant="navy" full style={{ marginTop: 20 }} onClick={onClose}>Done</Button>
          </div>
        ) : (
          <React.Fragment>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--fg1)' }}>{L.compose}</div>
              <button onClick={onClose} style={{ border: 'none', background: 'var(--bg-subtle)', width: 34, height: 34, borderRadius: 999, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={18} color="var(--fg2)" /></button>
            </div>
            <Field label={L.to}>
              <select value={to} onChange={e => setTo(e.target.value)} style={inputStyle}>
                <option value="">—</option>
                {RECIPIENTS.map((r, i) => <option key={i} value={r.label}>{r.label}</option>)}
              </select>
            </Field>
            <Field label={L.subject}><input style={inputStyle} placeholder="…" /></Field>
            <Field label={L.msg}><textarea rows={5} style={{ ...inputStyle, resize: 'vertical', minHeight: 110 }} placeholder="…" /></Field>
            <Button variant="primary" full style={{ marginTop: 8 }} onClick={() => setSent(true)}><Icon name="send" size={16} color="#fff" /> {L.sendmsg}</Button>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--fg2)', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
const inputStyle = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 11, padding: '11px 13px', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--fg1)', outline: 'none', background: '#fff' };

Object.assign(window, { DInbox, ComposeModal });
