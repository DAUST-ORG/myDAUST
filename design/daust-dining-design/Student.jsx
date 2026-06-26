/* ============================================================
   DAUST Dining — Student app (phone)
   ============================================================ */

const ME = { name:'Aïssatou Diop', first:'Aïssatou', id:'DA240021', program:'Computer Engineering', year:'Junior',
  plan:'Annual', status:'active', validUntil:'31 Aug 2026', balance:6500,
  meals:{ breakfast:{done:true, t:'07:42'}, lunch:{done:false}, dinner:{done:false} } };

function StudentApp({ onExit, payStyle='sheet' }){
  const [tab, setTab] = React.useState('home');
  const [cart, setCart] = React.useState({}); // dishId -> qty
  const [overlay, setOverlay] = React.useState(null); // 'pass' | 'checkout' | {order}
  const [orders, setOrders] = React.useState([
    { code:'WK-4188', item:WEEKEND_MENU.meals[0].dishes[1], qty:1, total:2000, method:'Wave', status:'ready', meal:'Lunch', time:'Last Saturday' },
    { code:'WK-4102', item:WEEKEND_MENU.meals[1].dishes[0], qty:1, total:3000, method:'Orange Money', status:'collected', meal:'Dinner', time:'2 weeks ago' },
  ]);
  const dishes = WEEKEND_MENU.meals.flatMap(m=>m.dishes);
  const cartItems = Object.entries(cart).filter(([,q])=>q>0).map(([id,q])=>({ dish:dishes.find(d=>d.id===id), q }));
  const cartTotal = cartItems.reduce((s,c)=>s+c.dish.price*c.q,0);
  const cartCount = cartItems.reduce((s,c)=>s+c.q,0);

  function add(id,delta){ setCart(c=>({ ...c, [id]: Math.max(0,(c[id]||0)+delta) })); }

  function placeOrder(method){
    const items = cartItems;
    const code = 'WK-' + (4200 + Math.floor(Math.random()*90));
    const main = items[0];
    const order = { code, item:main.dish, qty:main.q, total:cartTotal, method, status:'paid', meal: main.dish.id.match(/dibi|cebu|pastel/)?'Dinner':'Lunch', time:'Just now', extra: items.length-1 };
    setOrders(o=>[order,...o]); setCart({}); setOverlay({ type:'success', order });
    setTimeout(()=>{ setOrders(o=>o.map(x=>x.code===code?{...x,status:'preparing'}:x)); }, 4000);
  }

  return (
    <div style={{ width:'100%', height:'100%', background:D.subtle, position:'relative', overflow:'hidden', fontFamily:D.body, display:'flex', flexDirection:'column' }}>
      {/* scrollable content */}
      <div className="scroll" style={{ flex:1, minHeight:0 }}>
        {tab==='home' && <StudentHome onPass={()=>setOverlay({type:'pass'})} onWeekend={()=>setTab('weekend')} onPlan={()=>setOverlay({type:'plan'})} onExit={onExit} />}
        {tab==='weekend' && <StudentWeekend cart={cart} add={add} />}
        {tab==='orders' && <StudentOrders orders={orders} onOpen={o=>setOverlay({type:'detail',order:o})} />}
      </div>

      {/* cart bar */}
      {tab==='weekend' && cartCount>0 && !overlay && (
        <div style={{ position:'absolute', left:14, right:14, bottom:74, animation:'fadeUp .25s ease', zIndex:5 }}>
          <button onClick={()=>setOverlay({type:'checkout'})} className="btn btn-orange" style={{ width:'100%', padding:'15px 20px', justifyContent:'space-between', boxShadow:D.navy && '0 12px 30px rgba(237,132,37,.4)' }}>
            <span style={{ display:'flex', alignItems:'center', gap:9 }}><span style={{ background:'rgba(255,255,255,.25)', borderRadius:999, padding:'2px 9px', fontWeight:700 }}>{cartCount}</span> View order</span>
            <span style={{ fontWeight:700 }}>{fcfa(cartTotal)}</span>
          </button>
        </div>
      )}

      {/* bottom nav */}
      <div style={{ height:64, background:'#fff', borderTop:`1px solid ${D.border}`, display:'flex', flexShrink:0, paddingBottom:'env(safe-area-inset-bottom)' }}>
        {[['home','Home','home'],['weekend','Weekend','utensils'],['orders','Orders','receipt']].map(([k,label,icon])=>(
          <button key={k} onClick={()=>setTab(k)} style={{ flex:1, border:'none', background:'transparent', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, color: tab===k?D.navy:D.g400, position:'relative' }}>
            <Icon name={icon} size={21} strokeWidth={tab===k?2.4:2} />
            <span style={{ fontSize:10.5, fontWeight:600 }}>{label}</span>
            {k==='orders' && orders.some(o=>o.status==='ready') && <span style={{ position:'absolute', top:8, right:'calc(50% - 16px)', width:7, height:7, borderRadius:'50%', background:D.orange }} />}
          </button>
        ))}
      </div>

      {/* overlays */}
      {overlay?.type==='pass' && <PassOverlay onClose={()=>setOverlay(null)} />}
      {overlay?.type==='plan' && <PlanManager onClose={()=>setOverlay(null)} />}
      {overlay?.type==='checkout' && <CheckoutFlow items={cartItems} total={cartTotal} payStyle={payStyle} onClose={()=>setOverlay(null)} onPay={placeOrder} />}
      {overlay?.type==='success' && <OrderSuccess order={overlay.order} onClose={()=>{ setOverlay(null); setTab('orders'); }} />}
      {overlay?.type==='detail' && <OrderDetail order={overlay.order} onClose={()=>setOverlay(null)} />}
    </div>
  );
}

/* ---------- Home ---------- */
function StudentHome({ onPass, onWeekend, onPlan, onExit }){
  const mealList = MEALS.map(m=>({ ...m, state: ME.meals[m.key] }));
  const cur = currentMealKey();
  return (
    <div>
      {/* header */}
      <div style={{ background:`linear-gradient(160deg, ${D.navy}, ${D.navyDeep})`, padding:'52px 20px 26px', color:'#fff', position:'relative' }}>
        <button onClick={onExit} style={{ position:'absolute', top:48, right:18, border:'none', background:'rgba(255,255,255,.12)', color:'#fff', width:34, height:34, borderRadius:999, cursor:'pointer', display:'grid', placeItems:'center' }}><Icon name="x" size={16} /></button>
        <div style={{ display:'flex', alignItems:'center', gap:13 }}>
          <Avatar name={ME.name} size={48} ring="rgba(255,255,255,.25)" />
          <div>
            <div style={{ fontSize:13, color:D.onNavyMuted }}>Bonjour,</div>
            <div style={{ fontFamily:D.display, fontWeight:700, fontSize:22, lineHeight:1.1 }}>{ME.first}</div>
          </div>
        </div>
        {/* plan card */}
        <button onClick={onPlan} style={{ width:'100%', textAlign:'left', cursor:'pointer', marginTop:20, background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.14)', borderRadius:16, padding:'16px 18px', color:'#fff' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontSize:11.5, letterSpacing:'.1em', textTransform:'uppercase', color:D.onNavyMuted, fontWeight:600 }}>Meal Plan</div>
            <Pill tone="success"><Dot color={D.success} size={6} /> Active</Pill>
          </div>
          <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginTop:10 }}>
            <div>
              <div style={{ fontFamily:D.display, fontWeight:800, fontSize:24 }}>{ME.plan} Plan</div>
              <div style={{ fontSize:12, color:D.onNavyMuted, marginTop:2, display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap' }}>Valid until {ME.validUntil} <Icon name="chevron-right" size={14} color={D.onNavyMuted} /></div>
            </div>
            <TriDash w={20} />
          </div>
        </button>
      </div>

      <div style={{ padding:'18px 20px 30px' }}>
        {/* pass button */}
        <button onClick={onPass} style={{ width:'100%', border:`1.5px solid ${D.border}`, background:'#fff', borderRadius:16, padding:'16px 18px', display:'flex', alignItems:'center', gap:14, cursor:'pointer', boxShadow:'var(--shadow-sm)', marginBottom:22 }}>
          <div style={{ width:52, height:52, borderRadius:12, background:D.navy, display:'grid', placeItems:'center', flexShrink:0 }}><Icon name="qr-code" size={28} color="#fff" /></div>
          <div style={{ flex:1, textAlign:'left' }}>
            <div style={{ fontFamily:D.display, fontWeight:700, fontSize:17, color:D.fg1 }}>My Dining Pass</div>
            <div style={{ fontSize:12.5, color:D.fg3 }}>Show this QR at the entrance</div>
          </div>
          <Icon name="chevron-right" size={20} color={D.g400} />
        </button>

        {/* today meals */}
        <div className="eyebrow" style={{ marginBottom:12 }}>Today · Mon 29 May</div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {mealList.map(m=>{ const done=m.state?.done; const isNow = m.key===cur && !done;
            return (
            <div key={m.key} style={{ background:'#fff', border:`1.5px solid ${isNow?D.orange:D.border}`, borderRadius:14, padding:'13px 15px', display:'flex', alignItems:'center', gap:13 }}>
              <div style={{ width:40, height:40, borderRadius:10, background: done?D.successBg:D.subtle, display:'grid', placeItems:'center', color: done?D.success:D.fg2 }}>
                <Icon name={done?'check':m.icon} size={19} strokeWidth={done?2.6:2} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:15, color:D.fg1 }}>{m.label}</div>
                <div style={{ fontSize:12, color:D.fg3 }}>{m.window}</div>
              </div>
              {done ? <Pill tone="success">Served {m.state.t}</Pill> : isNow ? <Pill tone="warn">Open now</Pill> : <span style={{ fontSize:12, color:D.g400, fontWeight:600 }}>Upcoming</span>}
            </div>
          );})}
        </div>

        {/* weekend teaser */}
        <button onClick={onWeekend} style={{ width:'100%', marginTop:22, border:'none', borderRadius:16, padding:'18px 20px', cursor:'pointer', textAlign:'left', position:'relative', overflow:'hidden',
          background:`linear-gradient(120deg, ${D.orange}, ${D.orange600})`, color:'#fff' }}>
          <div style={{ position:'absolute', right:-10, top:-10, opacity:.18 }}><Icon name="utensils-crossed" size={96} color="#fff" /></div>
          <div style={{ fontSize:11.5, letterSpacing:'.1em', textTransform:'uppercase', fontWeight:700, opacity:.9 }}>Weekend Menu</div>
          <div style={{ fontFamily:D.display, fontWeight:800, fontSize:21, marginTop:5, maxWidth:'80%' }}>Order & pay for Saturday meals</div>
          <div style={{ fontSize:13, marginTop:6, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>Browse menu <Icon name="arrow-right" size={15} /></div>
        </button>
      </div>
    </div>
  );
}

/* ---------- Weekend menu ---------- */
function StudentWeekend({ cart, add }){
  return (
    <div>
      <div style={{ background:D.navy, padding:'52px 20px 22px', color:'#fff' }}>
        <div className="eyebrow" style={{ color:D.orange }}>Weekend Dining</div>
        <div style={{ fontFamily:D.display, fontWeight:800, fontSize:24, marginTop:5 }}>This Weekend</div>
        <div style={{ fontSize:13, color:D.onNavyMuted, marginTop:3, display:'flex', alignItems:'center', gap:7 }}><Icon name="calendar" size={14} /> {WEEKEND_MENU.date}</div>
      </div>
      <div style={{ padding:'18px 16px 90px' }}>
        {WEEKEND_MENU.meals.map(meal=>(
          <div key={meal.key} style={{ marginBottom:24 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
              <div style={{ fontFamily:D.display, fontWeight:700, fontSize:18, color:D.fg1 }}>{meal.label}</div>
              <div style={{ fontSize:12, color:D.fg3, whiteSpace:'nowrap' }}>{meal.window}</div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {meal.dishes.map(d=>{ const q=cart[d.id]||0;
                return (
                <div key={d.id} style={{ background:'#fff', borderRadius:14, overflow:'hidden', border:`1px solid ${D.border}`, boxShadow:'var(--shadow-sm)' }}>
                  <div style={{ height:96, position:'relative', background:`linear-gradient(135deg, ${D.navy} 0%, ${D.navy700} 70%, ${D.orange600} 140%)` }}>
                    <div style={{ position:'absolute', inset:0, backgroundImage:'radial-gradient(rgba(255,255,255,.08) 1px, transparent 1px)', backgroundSize:'16px 16px' }} />
                    <div style={{ position:'absolute', left:12, bottom:10, display:'flex', alignItems:'center', gap:6, color:'rgba(255,255,255,.7)', fontSize:11.5 }}><Icon name="image" size={13} /> Dish photo</div>
                    {d.tag && <span style={{ position:'absolute', top:10, right:10 }}><Pill tone={d.tag==='Veg'?'success':'orange'}>{d.tag}</Pill></span>}
                  </div>
                  <div style={{ padding:'13px 15px 15px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'flex-start' }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontFamily:D.display, fontWeight:700, fontSize:16.5, color:D.fg1, lineHeight:1.18 }}>{d.name}</div>
                        <div style={{ fontSize:12, color:D.fg3, fontStyle:'italic', marginTop:2 }}>{d.fr}</div>
                      </div>
                      <div style={{ fontFamily:D.display, fontWeight:800, fontSize:16, color:D.navy, whiteSpace:'nowrap', flexShrink:0 }}>{d.price.toLocaleString('fr-FR')} <span style={{ fontSize:11, color:D.fg3 }}>F</span></div>
                    </div>
                    <p style={{ fontSize:12.5, color:D.fg2, lineHeight:1.5, margin:'8px 0 12px' }}>{d.desc}</p>
                    {q===0
                      ? <button onClick={()=>add(d.id,1)} className="btn btn-outline" style={{ width:'100%', padding:'10px' }}><Icon name="plus" size={16} /> Add to order</button>
                      : <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:D.subtle, borderRadius:999, padding:4 }}>
                          <button onClick={()=>add(d.id,-1)} style={{ width:38, height:38, borderRadius:999, border:'none', background:'#fff', cursor:'pointer', display:'grid', placeItems:'center', boxShadow:'var(--shadow-sm)' }}><Icon name="minus" size={16} color={D.navy} /></button>
                          <span style={{ fontFamily:D.display, fontWeight:700, fontSize:17, color:D.fg1 }}>{q}</span>
                          <button onClick={()=>add(d.id,1)} style={{ width:38, height:38, borderRadius:999, border:'none', background:D.navy, cursor:'pointer', display:'grid', placeItems:'center' }}><Icon name="plus" size={16} color="#fff" /></button>
                        </div>}
                  </div>
                </div>
              );})}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Orders list ---------- */
function StudentOrders({ orders, onOpen }){
  return (
    <div>
      <div style={{ background:D.navy, padding:'52px 20px 22px', color:'#fff' }}>
        <div className="eyebrow" style={{ color:D.orange }}>My Orders</div>
        <div style={{ fontFamily:D.display, fontWeight:800, fontSize:24, marginTop:5 }}>Weekend Orders</div>
      </div>
      <div style={{ padding:'18px 16px 30px', display:'flex', flexDirection:'column', gap:12 }}>
        {orders.map(o=>{ const st=ORDER_STATUS[o.status];
          return (
          <button key={o.code} onClick={()=>onOpen(o)} style={{ background:'#fff', border:`1px solid ${D.border}`, borderRadius:14, padding:'14px 15px', cursor:'pointer', textAlign:'left', boxShadow:'var(--shadow-sm)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:9 }}>
              <span className="mono" style={{ fontSize:12, color:D.fg3, fontWeight:600 }}>{o.code}</span>
              <Pill tone={st.tone}>{st.label}</Pill>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:44, height:44, borderRadius:10, background:`linear-gradient(135deg,${D.navy},${D.navy700})`, display:'grid', placeItems:'center', flexShrink:0 }}><Icon name="utensils" size={20} color="#fff" /></div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:15, color:D.fg1, fontFamily:D.display }}>{o.item.name}{o.extra>0?` +${o.extra} more`:''}</div>
                <div style={{ fontSize:12, color:D.fg3 }}>{o.meal} · {o.time}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontFamily:D.display, fontWeight:800, fontSize:15, color:D.fg1 }}>{o.total.toLocaleString('fr-FR')} F</div>
                <div style={{ fontSize:11, color:D.fg3 }}>{o.method}</div>
              </div>
            </div>
          </button>
        );})}
      </div>
    </div>
  );
}

Object.assign(window, { StudentApp, ME });
