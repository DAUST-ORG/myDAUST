/* ============================================================
   DAUST Dining — Student overlays: pass, checkout, success, detail
   ============================================================ */

function Sheet({ children, onClose, title, dark }){
  return (
    <div onClick={onClose} style={{ position:'absolute', inset:0, zIndex:20, background:'rgba(12,21,34,.5)', backdropFilter:'blur(4px)', display:'flex', flexDirection:'column', justifyContent:'flex-end', animation:'fadeIn .16s ease' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background: dark?D.navy:'#fff', borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:'92%', display:'flex', flexDirection:'column', animation:'sheetUp .3s cubic-bezier(.2,.7,.3,1)', boxShadow:'0 -12px 40px rgba(0,0,0,.3)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 8px' }}>
          <div style={{ fontFamily:D.display, fontWeight:700, fontSize:18, color: dark?'#fff':D.fg1 }}>{title}</div>
          <button onClick={onClose} style={{ border:'none', background: dark?'rgba(255,255,255,.12)':D.subtle, color:dark?'#fff':D.fg2, width:32, height:32, borderRadius:999, cursor:'pointer', display:'grid', placeItems:'center' }}><Icon name="x" size={17} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Dining pass (QR) ---------- */
function PassOverlay({ onClose }){
  return (
    <div onClick={onClose} style={{ position:'absolute', inset:0, zIndex:25, background:`linear-gradient(160deg,${D.navy},${D.navyDeep})`, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, animation:'fadeIn .2s ease' }}>
      <button onClick={onClose} style={{ position:'absolute', top:48, right:18, border:'none', background:'rgba(255,255,255,.14)', color:'#fff', width:36, height:36, borderRadius:999, cursor:'pointer', display:'grid', placeItems:'center' }}><Icon name="x" size={18} /></button>
      <img src="assets/logo-daust-white.png" alt="DAUST" style={{ height:26, marginBottom:26, opacity:.95 }} />
      <div style={{ background:'#fff', borderRadius:24, padding:'26px 26px 22px', display:'flex', flexDirection:'column', alignItems:'center', boxShadow:'0 24px 60px rgba(0,0,0,.4)', animation:'popIn .35s ease' }}>
        <QRCode value={`DAUST|${ME.id}|MEALPLAN|${ME.validUntil}`} size={224} />
        <div style={{ marginTop:18, textAlign:'center' }}>
          <div style={{ fontFamily:D.display, fontWeight:800, fontSize:20, color:D.fg1 }}>{ME.name}</div>
          <div className="mono" style={{ fontSize:13, color:D.fg2, marginTop:2 }}>{ME.id}</div>
        </div>
        <div style={{ marginTop:14, display:'flex', gap:8 }}>
          <Pill tone="success"><Dot color={D.success} size={6} /> {ME.plan} · Active</Pill>
        </div>
      </div>
      <div style={{ marginTop:22, color:'rgba(255,255,255,.7)', fontSize:13, display:'flex', alignItems:'center', gap:7 }}>
        <Icon name="scan-line" size={16} /> Present to dining staff at the entrance
      </div>
    </div>
  );
}

/* ---------- Checkout & payment ---------- */
function CheckoutFlow({ items, total, onClose, onPay, payStyle }){
  const [step, setStep] = React.useState('review'); // review | method | phone | processing
  const [method, setMethod] = React.useState(null);
  const [phone, setPhone] = React.useState('77 488 25 15');
  const PROVIDERS = [
    { key:'Wave', color:'#1dc3ff', text:'#063', logo:'W', sub:'Pay with your Wave balance' },
    { key:'Orange Money', color:'#ff7900', text:'#fff', logo:'OM', sub:'Pay with Orange Money' },
  ];

  function pay(){
    setStep('processing');
    setTimeout(()=>{ onPay(method); }, 2200);
  }

  return (
    <Sheet onClose={step==='processing'?()=>{}:onClose} title={ step==='review'?'Your order' : step==='processing'?'Confirming payment' : 'Payment' }>
      <div className="scroll" style={{ padding:'4px 20px 24px', overflowY:'auto' }}>
        {step==='review' && <>
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:8 }}>
            {items.map(({dish,q})=>(
              <div key={dish.id} style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:30, height:30, borderRadius:8, background:D.subtle, display:'grid', placeItems:'center', fontFamily:D.display, fontWeight:700, color:D.navy, fontSize:14 }}>{q}×</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:14.5, color:D.fg1 }}>{dish.name}</div>
                  <div style={{ fontSize:12, color:D.fg3 }}>{dish.fr}</div>
                </div>
                <div style={{ fontFamily:D.display, fontWeight:700, color:D.fg1 }}>{(dish.price*q).toLocaleString('fr-FR')} F</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop:`1px solid ${D.border}`, margin:'16px 0', paddingTop:14, display:'flex', flexDirection:'column', gap:8 }}>
            <Row label="Subtotal" value={fcfa(total)} />
            <Row label="Service" value="Included" muted />
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:4 }}>
              <span style={{ fontFamily:D.display, fontWeight:700, fontSize:17 }}>Total</span>
              <span style={{ fontFamily:D.display, fontWeight:800, fontSize:22, color:D.navy }}>{fcfa(total)}</span>
            </div>
          </div>
          <div style={{ background:D.subtle, borderRadius:12, padding:'12px 14px', display:'flex', gap:10, alignItems:'flex-start', marginBottom:18 }}>
            <Icon name="info" size={16} color={D.navy} /><div style={{ fontSize:12.5, color:D.fg2, lineHeight:1.5 }}>Pickup at the dining hall on <strong>{WEEKEND_MENU.date}</strong>. Show your order QR to collect.</div>
          </div>
          <button onClick={()=>setStep('method')} className="btn btn-orange" style={{ width:'100%', padding:'14px' }}>Continue to payment <Icon name="arrow-right" size={17} /></button>
        </>}

        {step==='method' && <>
          <div style={{ fontSize:13, color:D.fg2, margin:'6px 0 14px' }}>Choose how you’d like to pay</div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {PROVIDERS.map(p=>(
              <button key={p.key} onClick={()=>{ setMethod(p.key); setStep('phone'); }} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:14, border:`1.5px solid ${D.border}`, background:'#fff', cursor:'pointer', textAlign:'left', transition:'.14s' }}
                onMouseEnter={e=>e.currentTarget.style.borderColor=p.color} onMouseLeave={e=>e.currentTarget.style.borderColor=D.border}>
                <div style={{ width:46, height:46, borderRadius:12, background:p.color, color:p.text, display:'grid', placeItems:'center', fontFamily:D.display, fontWeight:800, fontSize:p.logo.length>1?15:20, flexShrink:0 }}>{p.logo}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:15.5, color:D.fg1 }}>{p.key}</div>
                  <div style={{ fontSize:12, color:D.fg3 }}>{p.sub}</div>
                </div>
                <Icon name="chevron-right" size={18} color={D.g400} />
              </button>
            ))}
          </div>
        </>}

        {step==='phone' && <>
          {(()=>{ const p=PROVIDERS.find(x=>x.key===method); return (
            <div style={{ display:'flex', alignItems:'center', gap:12, background:D.subtle, borderRadius:12, padding:'12px 14px', marginTop:6, marginBottom:18 }}>
              <div style={{ width:40, height:40, borderRadius:10, background:p.color, color:p.text, display:'grid', placeItems:'center', fontFamily:D.display, fontWeight:800, fontSize:p.logo.length>1?13:18 }}>{p.logo}</div>
              <div style={{ flex:1 }}><div style={{ fontWeight:700, fontSize:14.5 }}>{method}</div><div style={{ fontSize:12, color:D.fg3 }}>{fcfa(total)} to DAUST Dining</div></div>
              <button onClick={()=>setStep('method')} style={{ border:'none', background:'transparent', color:D.navy, fontWeight:600, fontSize:12.5, cursor:'pointer' }}>Change</button>
            </div>
          );})()}
          <label style={{ fontSize:12, fontWeight:600, letterSpacing:'.04em', color:D.fg2, display:'block', marginBottom:7 }}>MOBILE MONEY NUMBER</label>
          <div style={{ display:'flex', alignItems:'center', gap:10, border:`1.5px solid ${D.border}`, borderRadius:10, padding:'12px 14px', marginBottom:18 }}>
            <span style={{ fontWeight:700, color:D.fg2 }}>🇸🇳 +221</span>
            <input value={phone} onChange={e=>setPhone(e.target.value)} style={{ border:'none', outline:'none', fontSize:16, fontFamily:D.mono, flex:1, color:D.fg1 }} />
          </div>
          <button onClick={pay} className="btn btn-orange" style={{ width:'100%', padding:'14px' }}><Icon name="lock" size={16} /> Pay {fcfa(total)}</button>
          <div style={{ textAlign:'center', fontSize:11.5, color:D.fg3, marginTop:12, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}><Icon name="shield" size={13} /> You’ll get a prompt on your phone to approve</div>
        </>}

        {step==='processing' && (
          <div style={{ padding:'30px 0 26px', display:'flex', flexDirection:'column', alignItems:'center', gap:18 }}>
            <div style={{ position:'relative', width:74, height:74 }}>
              <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:`4px solid ${D.g100}`, borderTopColor:D.orange, animation:'spin 0.9s linear infinite' }} />
              <div style={{ position:'absolute', inset:0, display:'grid', placeItems:'center' }}><Icon name="smartphone" size={28} color={D.navy} /></div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontFamily:D.display, fontWeight:700, fontSize:17, color:D.fg1 }}>Approve on your phone</div>
              <div style={{ fontSize:13, color:D.fg3, marginTop:4 }}>Confirming {fcfa(total)} via {method}…</div>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function Row({ label, value, muted }){
  return <div style={{ display:'flex', justifyContent:'space-between', fontSize:13.5 }}><span style={{ color:D.fg3 }}>{label}</span><span style={{ color: muted?D.fg3:D.fg1, fontWeight:600 }}>{value}</span></div>;
}

/* ---------- Meal-plan manager & renewal ---------- */
function PlanManager({ onClose }){
  const [step, setStep] = React.useState('home'); // home | choose | method | phone | processing | done
  const [tier, setTier] = React.useState(ME.plan);
  const [method, setMethod] = React.useState(null);
  const price = PLAN_PRICES[tier];
  const history = [
    { label:`Annual plan · 2025–26`, amount:360000, method:'Bank transfer', when:'2 Sep 2025', status:'paid' },
    { label:`Top-up · weekend credit`, amount:6500, method:'Wave', when:'18 May 2026', status:'paid' },
  ];
  const PROVIDERS = [
    { key:'Wave', color:'#1dc3ff', logo:'W' },
    { key:'Orange Money', color:'#ff7900', logo:'OM' },
  ];
  function pay(){ setStep('processing'); setTimeout(()=>setStep('done'), 2200); }

  const title = step==='home'?'My meal plan' : step==='choose'?'Choose a plan' : step==='processing'?'Confirming payment' : step==='done'?'Plan renewed' : 'Payment';

  return (
    <Sheet onClose={step==='processing'?()=>{}:onClose} title={title}>
      <div className="scroll" style={{ padding:'4px 20px 26px', overflowY:'auto' }}>
        {step==='home' && <>
          <div style={{ background:`linear-gradient(135deg,${D.navy},${D.navyDeep})`, borderRadius:16, padding:'18px', color:'#fff', marginTop:6 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div className="eyebrow" style={{ color:D.orange }}>Current plan</div>
              <Pill tone="success"><Dot color={D.success} size={6} /> Active</Pill>
            </div>
            <div style={{ fontFamily:D.display, fontWeight:800, fontSize:24, marginTop:8 }}>{ME.plan} Plan</div>
            <div style={{ fontSize:12.5, color:D.onNavyMuted, marginTop:2 }}>Valid until {ME.validUntil}</div>
            <div style={{ marginTop:14, height:7, borderRadius:999, background:'rgba(255,255,255,.16)', overflow:'hidden' }}><div style={{ width:'68%', height:'100%', background:D.orange, borderRadius:999 }} /></div>
            <div style={{ fontSize:11.5, color:D.onNavyMuted, marginTop:7 }}>68% of the term used · 94 days remaining</div>
          </div>
          <div className="eyebrow" style={{ margin:'20px 0 10px', color:D.fg3 }}>Payment history</div>
          <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
            {history.map((h,i)=>(
              <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', border:`1px solid ${D.border}`, borderRadius:12 }}>
                <div style={{ width:36, height:36, borderRadius:9, background:D.successBg, color:D.success, display:'grid', placeItems:'center' }}><Icon name="check" size={17} strokeWidth={2.6} /></div>
                <div style={{ flex:1 }}><div style={{ fontWeight:600, fontSize:13.5, color:D.fg1 }}>{h.label}</div><div style={{ fontSize:11.5, color:D.fg3 }}>{h.when} · {h.method}</div></div>
                <div style={{ fontFamily:D.display, fontWeight:700, fontSize:14, color:D.fg1 }}>{h.amount.toLocaleString('fr-FR')} F</div>
              </div>
            ))}
          </div>
          <button onClick={()=>setStep('choose')} className="btn btn-orange" style={{ width:'100%', padding:'14px', marginTop:20 }}><Icon name="refresh-cw" size={16} /> Renew or change plan</button>
        </>}

        {step==='choose' && <>
          <div style={{ fontSize:13, color:D.fg2, margin:'6px 0 14px' }}>Pay for next term — meals every day, Monday to Friday.</div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {Object.entries(PLAN_PRICES).map(([p,pr])=>(
              <button key={p} onClick={()=>setTier(p)} style={{ textAlign:'left', cursor:'pointer', borderRadius:14, padding:'16px', border:`2px solid ${tier===p?D.navy:D.border}`, background: tier===p?'#f3f7fc':'#fff', display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ width:22, height:22, borderRadius:'50%', border:`2px solid ${tier===p?D.navy:D.g300}`, display:'grid', placeItems:'center', flexShrink:0 }}>{tier===p && <span style={{ width:11, height:11, borderRadius:'50%', background:D.navy }} />}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:D.display, fontWeight:700, fontSize:16.5, color:D.fg1 }}>{p} Plan</div>
                  <div style={{ fontSize:12, color:D.fg3 }}>{p==='Annual'?'September – August':'One semester'}</div>
                </div>
                <div style={{ fontFamily:D.display, fontWeight:800, fontSize:17, color:D.navy }}>{pr.toLocaleString('fr-FR')} <span style={{ fontSize:11, color:D.fg3 }}>F</span></div>
              </button>
            ))}
          </div>
          <button onClick={()=>setStep('method')} className="btn btn-orange" style={{ width:'100%', padding:'14px', marginTop:18 }}>Continue · {price.toLocaleString('fr-FR')} F <Icon name="arrow-right" size={16} /></button>
        </>}

        {step==='method' && <>
          <div style={{ fontSize:13, color:D.fg2, margin:'6px 0 14px' }}>{tier} plan · <strong>{fcfa(price)}</strong></div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {PROVIDERS.map(p=>(
              <button key={p.key} onClick={()=>{ setMethod(p.key); setStep('phone'); }} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:14, border:`1.5px solid ${D.border}`, background:'#fff', cursor:'pointer', textAlign:'left' }}>
                <div style={{ width:46, height:46, borderRadius:12, background:p.color, color:'#fff', display:'grid', placeItems:'center', fontFamily:D.display, fontWeight:800, fontSize:p.logo.length>1?15:20 }}>{p.logo}</div>
                <div style={{ flex:1 }}><div style={{ fontWeight:700, fontSize:15.5, color:D.fg1 }}>{p.key}</div><div style={{ fontSize:12, color:D.fg3 }}>Pay {fcfa(price)}</div></div>
                <Icon name="chevron-right" size={18} color={D.g400} />
              </button>
            ))}
            <div style={{ display:'flex', alignItems:'center', gap:10, fontSize:12.5, color:D.fg3, justifyContent:'center', marginTop:4 }}><Icon name="building-2" size={15} /> Bank transfer also available at the bursar's office</div>
          </div>
        </>}

        {step==='phone' && (()=>{ const p=PROVIDERS.find(x=>x.key===method); return <>
          <div style={{ display:'flex', alignItems:'center', gap:12, background:D.subtle, borderRadius:12, padding:'12px 14px', marginTop:6, marginBottom:18 }}>
            <div style={{ width:40, height:40, borderRadius:10, background:p.color, color:'#fff', display:'grid', placeItems:'center', fontFamily:D.display, fontWeight:800, fontSize:p.logo.length>1?13:18 }}>{p.logo}</div>
            <div style={{ flex:1 }}><div style={{ fontWeight:700, fontSize:14.5 }}>{method}</div><div style={{ fontSize:12, color:D.fg3 }}>{fcfa(price)} · {tier} plan</div></div>
            <button onClick={()=>setStep('method')} style={{ border:'none', background:'transparent', color:D.navy, fontWeight:600, fontSize:12.5, cursor:'pointer' }}>Change</button>
          </div>
          <label style={{ fontSize:12, fontWeight:600, letterSpacing:'.04em', color:D.fg2, display:'block', marginBottom:7 }}>MOBILE MONEY NUMBER</label>
          <div style={{ display:'flex', alignItems:'center', gap:10, border:`1.5px solid ${D.border}`, borderRadius:10, padding:'12px 14px', marginBottom:18 }}>
            <span style={{ fontWeight:700, color:D.fg2 }}>🇸🇳 +221</span>
            <input defaultValue="77 488 25 15" style={{ border:'none', outline:'none', fontSize:16, fontFamily:D.mono, flex:1, color:D.fg1 }} />
          </div>
          <button onClick={pay} className="btn btn-orange" style={{ width:'100%', padding:'14px' }}><Icon name="lock" size={16} /> Pay {fcfa(price)}</button>
        </>; })()}

        {step==='processing' && (
          <div style={{ padding:'30px 0 26px', display:'flex', flexDirection:'column', alignItems:'center', gap:18 }}>
            <div style={{ position:'relative', width:74, height:74 }}>
              <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:`4px solid ${D.g100}`, borderTopColor:D.orange, animation:'spin 0.9s linear infinite' }} />
              <div style={{ position:'absolute', inset:0, display:'grid', placeItems:'center' }}><Icon name="smartphone" size={28} color={D.navy} /></div>
            </div>
            <div style={{ textAlign:'center' }}><div style={{ fontFamily:D.display, fontWeight:700, fontSize:17 }}>Approve on your phone</div><div style={{ fontSize:13, color:D.fg3, marginTop:4 }}>Confirming {fcfa(price)} via {method}…</div></div>
          </div>
        )}

        {step==='done' && (
          <div style={{ padding:'18px 0 10px', display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
            <div style={{ width:78, height:78, borderRadius:'50%', background:D.successBg, display:'grid', placeItems:'center', animation:'popIn .4s ease' }}>
              <svg width="40" height="40" viewBox="0 0 52 52"><path d="M14 27 l8 8 l16 -18" fill="none" stroke={D.success} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray:60, strokeDashoffset:60, animation:'drawCheck .4s .12s ease forwards' }} /></svg>
            </div>
            <div style={{ textAlign:'center' }}><div style={{ fontFamily:D.display, fontWeight:800, fontSize:21, color:D.fg1 }}>{tier} plan active</div><div style={{ fontSize:13, color:D.fg3, marginTop:5 }}>{fcfa(price)} paid via {method}. Your dining pass is ready.</div></div>
            <button onClick={onClose} className="btn btn-navy" style={{ width:'100%', padding:'14px', marginTop:6 }}>Done</button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ---------- Success ---------- */
function OrderSuccess({ order, onClose }){
  return (
    <div style={{ position:'absolute', inset:0, zIndex:26, background:'#fff', display:'flex', flexDirection:'column', animation:'fadeIn .2s ease' }}>
      <div style={{ background:`linear-gradient(160deg,${D.success},#1f5e3c)`, padding:'56px 24px 30px', color:'#fff', textAlign:'center', position:'relative' }}>
        <div style={{ width:78, height:78, margin:'0 auto 14px', borderRadius:'50%', background:'rgba(255,255,255,.18)', display:'grid', placeItems:'center', animation:'popIn .4s ease' }}>
          <svg width="40" height="40" viewBox="0 0 52 52"><path d="M14 27 l8 8 l16 -18" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray:60, strokeDashoffset:60, animation:'drawCheck .4s .15s ease forwards' }} /></svg>
        </div>
        <div style={{ fontFamily:D.display, fontWeight:800, fontSize:24 }}>Payment confirmed</div>
        <div style={{ fontSize:13.5, color:'rgba(255,255,255,.85)', marginTop:5 }}>{fcfa(order.total)} paid via {order.method}</div>
      </div>
      <div className="scroll" style={{ flex:1, padding:'24px 24px 20px', display:'flex', flexDirection:'column', alignItems:'center' }}>
        <div style={{ fontSize:12.5, color:D.fg3, marginBottom:4, letterSpacing:'.04em' }}>SHOW THIS AT PICKUP</div>
        <div style={{ background:'#fff', border:`1px solid ${D.border}`, borderRadius:18, padding:18, boxShadow:'var(--shadow-md)' }}>
          <QRCode value={`DAUST|ORDER|${order.code}`} size={170} logo={false} />
        </div>
        <div className="mono" style={{ fontFamily:D.display, fontWeight:800, fontSize:22, letterSpacing:'.08em', color:D.navy, marginTop:14 }}>{order.code}</div>
        <div style={{ width:'100%', background:D.subtle, borderRadius:14, padding:'14px 16px', marginTop:18, display:'flex', flexDirection:'column', gap:9 }}>
          <Row label="Meal" value={`${order.item.name}${order.extra>0?` +${order.extra}`:''}`} />
          <Row label="Service" value={`${order.meal} · ${WEEKEND_MENU.date.split(',')[0]}`} />
          <Row label="Pickup" value="DAUST Dining Hall" />
        </div>
      </div>
      <div style={{ padding:'12px 24px 26px' }}>
        <button onClick={onClose} className="btn btn-navy" style={{ width:'100%', padding:'14px' }}>View my orders</button>
      </div>
    </div>
  );
}

/* ---------- Order detail w/ status tracker ---------- */
function OrderDetail({ order, onClose }){
  const steps = ['paid','preparing','ready','collected'];
  const labels = { paid:'Payment confirmed', preparing:'Kitchen preparing', ready:'Ready for pickup', collected:'Collected' };
  const curIdx = steps.indexOf(order.status);
  return (
    <Sheet onClose={onClose} title={order.code}>
      <div className="scroll" style={{ padding:'4px 20px 26px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:18 }}>
          <div style={{ width:48, height:48, borderRadius:12, background:`linear-gradient(135deg,${D.navy},${D.navy700})`, display:'grid', placeItems:'center' }}><Icon name="utensils" size={22} color="#fff" /></div>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:D.display, fontWeight:700, fontSize:17 }}>{order.item.name}{order.extra>0?` +${order.extra} more`:''}</div>
            <div style={{ fontSize:12.5, color:D.fg3 }}>{order.meal} · {fcfa(order.total)} · {order.method}</div>
          </div>
        </div>
        {order.status!=='collected' && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', background:D.subtle, borderRadius:16, padding:'18px', marginBottom:20 }}>
            <QRCode value={`DAUST|ORDER|${order.code}`} size={140} logo={false} />
            <div style={{ fontSize:12, color:D.fg3, marginTop:10 }}>Show at pickup counter</div>
          </div>
        )}
        <div style={{ position:'relative', paddingLeft:8 }}>
          {steps.map((s,i)=>{ const done=i<=curIdx; const active=i===curIdx;
            return (
            <div key={s} style={{ display:'flex', gap:14, paddingBottom: i<steps.length-1?20:0, position:'relative' }}>
              {i<steps.length-1 && <div style={{ position:'absolute', left:11, top:24, bottom:0, width:2, background: i<curIdx?D.success:D.border }} />}
              <div style={{ width:24, height:24, borderRadius:'50%', flexShrink:0, display:'grid', placeItems:'center', zIndex:1,
                background: done?D.success:'#fff', border:`2px solid ${done?D.success:D.border}`, color:'#fff' }}>
                {done ? <Icon name="check" size={13} strokeWidth={3} /> : <span style={{ width:7, height:7, borderRadius:'50%', background:D.g300 }} />}
              </div>
              <div style={{ paddingTop:1 }}>
                <div style={{ fontWeight:600, fontSize:14.5, color: done?D.fg1:D.fg3 }}>{labels[s]}</div>
                {active && <div style={{ fontSize:12, color:D.orange, fontWeight:600, marginTop:2 }}>Current status</div>}
              </div>
            </div>
          );})}
        </div>
      </div>
    </Sheet>
  );
}

Object.assign(window, { Sheet, PassOverlay, CheckoutFlow, OrderSuccess, OrderDetail, PlanManager });
