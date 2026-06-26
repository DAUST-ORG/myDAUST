/* ============================================================
   DAUST Dining — Admin views: Students, Orders, Menus, Reports
   ============================================================ */

const STATUS_META = {
  active:  { label:'Active',  tone:'success' },
  pending: { label:'Pending', tone:'warn' },
  expired: { label:'Expired', tone:'danger' },
};

/* ---------- Students directory ---------- */
function AdminStudents({ onOpen }){
  const [q, setQ] = React.useState('');
  const [filter, setFilter] = React.useState('all');
  const filtered = STUDENTS.filter(s=>{
    if (filter!=='all' && s.status!==filter) return false;
    if (q && !(`${s.name} ${s.id}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  }).slice(0,60);
  const counts = { all:STUDENTS.length, active:STUDENTS.filter(s=>s.status==='active').length, pending:STUDENTS.filter(s=>s.status==='pending').length, expired:STUDENTS.filter(s=>s.status==='expired').length };
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:9, background:'#fff', border:`1.5px solid ${D.border}`, borderRadius:10, padding:'10px 14px', width:300 }}>
          <Icon name="search" size={17} color={D.g400} />
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search name or ID…" style={{ border:'none', outline:'none', fontSize:14, fontFamily:D.body, flex:1, color:D.fg1, background:'transparent' }} />
        </div>
        <div style={{ display:'flex', gap:6, background:D.g100, padding:4, borderRadius:999 }}>
          {['all','active','pending','expired'].map(f=>(
            <button key={f} onClick={()=>setFilter(f)} style={{ border:'none', cursor:'pointer', borderRadius:999, padding:'7px 15px', fontFamily:D.body, fontWeight:600, fontSize:12.5, textTransform:'capitalize',
              background: filter===f?'#fff':'transparent', color: filter===f?D.navy:D.fg2, boxShadow: filter===f?'var(--shadow-sm)':'none' }}>{f} <span style={{ color:D.g400 }}>{counts[f]}</span></button>
          ))}
        </div>
        <button className="btn btn-outline" style={{ marginLeft:'auto', padding:'10px 18px' }}><Icon name="download" size={16} /> Export CSV</button>
      </div>

      <Card pad={0}>
        <div style={{ display:'grid', gridTemplateColumns:'2.4fr 1.4fr 1fr 1.2fr 1fr', padding:'13px 20px', borderBottom:`1px solid ${D.border}`, fontSize:11.5, letterSpacing:'.06em', textTransform:'uppercase', color:D.fg3, fontWeight:700 }}>
          <div>Student</div><div>Program</div><div>Plan</div><div>Meals today</div><div>Status</div>
        </div>
        <div className="scroll" style={{ maxHeight:520, overflowY:'auto' }}>
          {filtered.map((s,i)=>{ const m=STATUS_META[s.status];
            return (
            <div key={s.id} onClick={()=>onOpen(s)} style={{ display:'grid', gridTemplateColumns:'2.4fr 1.4fr 1fr 1.2fr 1fr', alignItems:'center', padding:'12px 20px', borderBottom: i<filtered.length-1?`1px solid ${D.g100}`:'none', cursor:'pointer', transition:'.1s' }}
              onMouseEnter={e=>e.currentTarget.style.background=D.subtle} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <Avatar name={s.name} size={36} />
                <div><div style={{ fontWeight:600, fontSize:14, color:D.fg1 }}>{s.name}</div><div className="mono" style={{ fontSize:12, color:D.fg3 }}>{s.id}</div></div>
              </div>
              <div style={{ fontSize:13, color:D.fg2 }}>{s.program}</div>
              <div style={{ fontSize:13, color:D.fg2 }}>{s.plan}</div>
              <div style={{ display:'flex', gap:5 }}>
                {MEALS.map(meal=>{ const done=s.mealsToday[meal.key]; return (
                  <span key={meal.key} title={meal.label} style={{ width:26, height:26, borderRadius:7, display:'grid', placeItems:'center', background: done?D.successBg:D.g100, color: done?D.success:D.g400 }}><Icon name={meal.icon} size={13} /></span>
                );})}
              </div>
              <div><Pill tone={m.tone}>{m.label}</Pill></div>
            </div>
          );})}
        </div>
      </Card>
    </div>
  );
}

/* ---------- Student detail drawer ---------- */
function StudentDrawer({ student, onClose }){
  const s = student; const m = STATUS_META[s.status];
  const history = [
    { d:'Today', meals:[['breakfast',s.mealsToday.breakfast,'07:38'],['lunch',s.mealsToday.lunch,'12:51'],['dinner',false,'—']] },
    { d:'Fri 26 May', meals:[['breakfast',true,'07:44'],['lunch',true,'13:02'],['dinner',true,'19:22']] },
    { d:'Thu 25 May', meals:[['breakfast',false,'—'],['lunch',true,'12:40'],['dinner',true,'19:51']] },
  ];
  return (
    <div onClick={onClose} style={{ position:'absolute', inset:0, zIndex:40, background:'rgba(12,21,34,.45)', display:'flex', justifyContent:'flex-end', animation:'fadeIn .15s ease' }}>
      <div onClick={e=>e.stopPropagation()} className="scroll" style={{ width:420, background:'#fff', height:'100%', overflowY:'auto', animation:'drawerIn .26s cubic-bezier(.2,.7,.3,1)' }}>
        <div style={{ background:`linear-gradient(160deg,${D.navy},${D.navyDeep})`, padding:'24px 26px 26px', color:'#fff', position:'relative' }}>
          <button onClick={onClose} style={{ position:'absolute', top:18, right:18, border:'none', background:'rgba(255,255,255,.14)', color:'#fff', width:32, height:32, borderRadius:999, cursor:'pointer', display:'grid', placeItems:'center' }}><Icon name="x" size={17} /></button>
          <Avatar name={s.name} size={64} ring="rgba(255,255,255,.25)" />
          <div style={{ fontFamily:D.display, fontWeight:800, fontSize:23, marginTop:14 }}>{s.name}</div>
          <div className="mono" style={{ fontSize:13, color:D.onNavyMuted, marginTop:3 }}>{s.id}</div>
          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <Pill tone={m.tone}>{m.label}</Pill>
            <Pill tone="navy" style={{ background:'rgba(255,255,255,.14)' }}>{s.plan} plan</Pill>
          </div>
        </div>
        <div style={{ padding:'22px 26px 30px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:22 }}>
            {[['Program',s.program],['Year',s.year],['Valid until',s.validUntil],['Residence',s.room]].map(([k,v])=>(
              <div key={k} style={{ background:D.subtle, borderRadius:10, padding:'11px 13px' }}>
                <div style={{ fontSize:11, letterSpacing:'.05em', textTransform:'uppercase', color:D.fg3, fontWeight:600 }}>{k}</div>
                <div style={{ fontSize:14, color:D.fg1, fontWeight:600, marginTop:3 }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="eyebrow" style={{ marginBottom:12, color:D.fg3 }}>Dining history</div>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {history.map(h=>(
              <div key={h.d}>
                <div style={{ fontSize:12.5, fontWeight:700, color:D.fg2, marginBottom:7 }}>{h.d}</div>
                <div style={{ display:'flex', gap:8 }}>
                  {h.meals.map(([mk,done,t])=>(
                    <div key={mk} style={{ flex:1, background: done?D.successBg:D.subtle, borderRadius:10, padding:'10px', textAlign:'center' }}>
                      <Icon name={done?'check':'minus'} size={15} color={done?D.success:D.g400} strokeWidth={2.4} />
                      <div style={{ fontSize:11, color:D.fg2, textTransform:'capitalize', marginTop:4, fontWeight:600 }}>{mk}</div>
                      <div className="mono" style={{ fontSize:10.5, color:D.fg3 }}>{t}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:10, marginTop:24 }}>
            <button className="btn btn-navy" style={{ flex:1, padding:'12px' }}><Icon name="mail" size={16} /> Message</button>
            {s.status!=='active'
              ? <button className="btn btn-orange" style={{ flex:1, padding:'12px' }}><Icon name="check" size={16} /> Mark paid</button>
              : <button className="btn btn-outline" style={{ flex:1, padding:'12px' }}><Icon name="ban" size={16} /> Suspend</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Weekend Orders board ---------- */
function AdminOrders(){
  const [orders, setOrders] = React.useState(ORDERS);
  const flow = ['pending','paid','preparing','ready','collected'];
  function advance(code){ setOrders(os=>os.map(o=>{ if(o.code!==code) return o; const i=flow.indexOf(o.status); return { ...o, status: flow[Math.min(i+1,flow.length-1)] }; })); }
  const revenue = orders.filter(o=>o.status!=='pending').reduce((s,o)=>s+o.total,0);
  const cols = [
    { key:'pending', title:'Awaiting payment' },
    { key:'paid', title:'Paid' },
    { key:'preparing', title:'Preparing' },
    { key:'ready', title:'Ready' },
    { key:'collected', title:'Collected' },
  ];
  const nextLabel = { pending:'Confirm payment', paid:'Start preparing', preparing:'Mark ready', ready:'Mark collected' };
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
        <StatCard label="Orders this weekend" value={orders.length} icon="shopping-bag" tone="navy" />
        <StatCard label="Confirmed revenue" value={revenue.toLocaleString('fr-FR')} sub="FCFA" icon="wallet" tone="success" />
        <StatCard label="Awaiting payment" value={orders.filter(o=>o.status==='pending').length} icon="hourglass" tone="orange" />
        <StatCard label="Ready for pickup" value={orders.filter(o=>o.status==='ready').length} icon="package-check" tone="navy" />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, alignItems:'start' }}>
        {cols.map(col=>{ const items=orders.filter(o=>o.status===col.key); const meta=ORDER_STATUS[col.key];
          return (
          <div key={col.key} style={{ background:D.g50, borderRadius:14, padding:10, minHeight:200 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 6px 10px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:7 }}><Dot color={meta.color} size={8} /><span style={{ fontSize:12.5, fontWeight:700, color:D.fg1 }}>{col.title}</span></div>
              <span style={{ fontSize:12, color:D.fg3, fontWeight:700 }}>{items.length}</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
              {items.map(o=>(
                <div key={o.code} style={{ background:'#fff', border:`1px solid ${D.border}`, borderRadius:11, padding:'11px 12px', boxShadow:'var(--shadow-sm)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                    <span className="mono" style={{ fontSize:11, color:D.fg3, fontWeight:600 }}>{o.code}</span>
                    <span style={{ fontSize:10.5, fontWeight:700, color: o.method==='Wave'?'#0a8fc4':D.orange600 }}>{o.method}</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
                    <Avatar name={o.student.name} size={28} />
                    <div style={{ minWidth:0 }}><div style={{ fontSize:12.5, fontWeight:600, color:D.fg1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{o.student.name}</div><div style={{ fontSize:11, color:D.fg3 }}>{o.meal}</div></div>
                  </div>
                  <div style={{ fontSize:12.5, color:D.fg2, marginBottom:9 }}>{o.qty}× {o.item.name} · <strong style={{ color:D.fg1 }}>{o.total.toLocaleString('fr-FR')} F</strong></div>
                  {col.key!=='collected' && (
                    <button onClick={()=>advance(o.code)} className={col.key==='pending'?'btn btn-orange':'btn btn-outline'} style={{ width:'100%', padding:'7px', fontSize:12 }}>
                      {col.key==='pending' && <Icon name="check-circle" size={14} />} {nextLabel[col.key]}
                    </button>
                  )}
                  {col.key==='collected' && <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:5, fontSize:12, color:D.success, fontWeight:600 }}><Icon name="check" size={14} /> Done</div>}
                </div>
              ))}
              {items.length===0 && <div style={{ textAlign:'center', fontSize:12, color:D.g400, padding:'18px 0' }}>—</div>}
            </div>
          </div>
        );})}
      </div>
    </div>
  );
}

/* ---------- Menus editor ---------- */
function AdminMenus(){
  const [published, setPublished] = React.useState(true);
  const [adding, setAdding] = React.useState(false);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <Card style={{ display:'flex', alignItems:'center', gap:18, background:`linear-gradient(120deg,${D.navy},${D.navyDeep})`, border:'none', color:'#fff' }}>
        <div style={{ width:48, height:48, borderRadius:12, background:'rgba(255,255,255,.14)', display:'grid', placeItems:'center' }}><Icon name="calendar-days" size={24} color="#fff" /></div>
        <div style={{ flex:1 }}>
          <div className="eyebrow" style={{ color:D.orange }}>Weekend Menu</div>
          <div style={{ fontFamily:D.display, fontWeight:800, fontSize:21 }}>{WEEKEND_MENU.date}</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ textAlign:'right' }}><div style={{ fontSize:12, color:D.onNavyMuted }}>Visible to students</div><div style={{ fontWeight:700, fontSize:14 }}>{published?'Published':'Draft'}</div></div>
          <button onClick={()=>setPublished(p=>!p)} style={{ width:52, height:30, borderRadius:999, border:'none', cursor:'pointer', background: published?D.orange:'rgba(255,255,255,.2)', position:'relative', transition:'.18s' }}>
            <span style={{ position:'absolute', top:3, left: published?25:3, width:24, height:24, borderRadius:'50%', background:'#fff', transition:'.18s' }} />
          </button>
        </div>
      </Card>

      {WEEKEND_MENU.meals.map(meal=>(
        <Card key={meal.key}>
          <SectionTitle action={<button onClick={()=>setAdding(meal.key)} className="btn btn-outline" style={{ padding:'8px 16px', fontSize:13 }}><Icon name="plus" size={15} /> Add dish</button>}>
            {meal.label} <span style={{ fontWeight:400, fontSize:13, color:D.fg3 }}>· {meal.window}</span>
          </SectionTitle>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {meal.dishes.map(d=>(
              <div key={d.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 14px', border:`1px solid ${D.border}`, borderRadius:12 }}>
                <div style={{ width:46, height:46, borderRadius:10, background:`linear-gradient(135deg,${D.navy},${D.navy700})`, display:'grid', placeItems:'center', flexShrink:0 }}><Icon name="image" size={18} color="rgba(255,255,255,.7)" /></div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}><span style={{ fontWeight:700, fontSize:15, color:D.fg1, fontFamily:D.display }}>{d.name}</span>{d.tag && <Pill tone={d.tag==='Veg'?'success':'orange'}>{d.tag}</Pill>}</div>
                  <div style={{ fontSize:12.5, color:D.fg3, marginTop:2 }}>{d.desc}</div>
                </div>
                <div style={{ fontFamily:D.display, fontWeight:800, fontSize:16, color:D.navy, whiteSpace:'nowrap' }}>{d.price.toLocaleString('fr-FR')} F</div>
                <div style={{ display:'flex', gap:6 }}>
                  <button style={{ border:`1px solid ${D.border}`, background:'#fff', width:34, height:34, borderRadius:8, cursor:'pointer', display:'grid', placeItems:'center', color:D.fg2 }}><Icon name="pencil" size={15} /></button>
                  <button style={{ border:`1px solid ${D.border}`, background:'#fff', width:34, height:34, borderRadius:8, cursor:'pointer', display:'grid', placeItems:'center', color:D.danger }}><Icon name="trash-2" size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      {adding && <AddDishModal meal={adding} onClose={()=>setAdding(false)} />}
    </div>
  );
}

function AddDishModal({ meal, onClose }){
  return (
    <div onClick={onClose} style={{ position:'absolute', inset:0, zIndex:40, background:'rgba(12,21,34,.5)', display:'grid', placeItems:'center', animation:'fadeIn .15s ease' }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:460, background:'#fff', borderRadius:18, padding:'24px 26px', animation:'popIn .26s ease', boxShadow:D.navy && '0 24px 60px rgba(0,0,0,.35)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <div style={{ fontFamily:D.display, fontWeight:700, fontSize:19 }}>Add dish · {meal}</div>
          <button onClick={onClose} style={{ border:'none', background:D.subtle, width:32, height:32, borderRadius:999, cursor:'pointer', display:'grid', placeItems:'center', color:D.fg2 }}><Icon name="x" size={17} /></button>
        </div>
        {[['Dish name','e.g. Thiéboudienne'],['Description (French)','e.g. Riz au poisson']].map(([l,p])=>(
          <div key={l} style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, fontWeight:600, color:D.fg2, letterSpacing:'.04em', display:'block', marginBottom:6 }}>{l.toUpperCase()}</label>
            <input placeholder={p} style={{ width:'100%', border:`1.5px solid ${D.border}`, borderRadius:8, padding:'11px 13px', fontSize:14, fontFamily:D.body, outline:'none' }} />
          </div>
        ))}
        <div style={{ display:'flex', gap:12, marginBottom:18 }}>
          <div style={{ flex:1 }}><label style={{ fontSize:12, fontWeight:600, color:D.fg2, display:'block', marginBottom:6 }}>PRICE (FCFA)</label><input placeholder="2500" style={{ width:'100%', border:`1.5px solid ${D.border}`, borderRadius:8, padding:'11px 13px', fontSize:14, fontFamily:D.mono, outline:'none' }} /></div>
          <div style={{ flex:1 }}><label style={{ fontSize:12, fontWeight:600, color:D.fg2, display:'block', marginBottom:6 }}>TAG</label><input placeholder="Signature" style={{ width:'100%', border:`1.5px solid ${D.border}`, borderRadius:8, padding:'11px 13px', fontSize:14, fontFamily:D.body, outline:'none' }} /></div>
        </div>
        <div style={{ border:`1.5px dashed ${D.border}`, borderRadius:12, padding:'18px', textAlign:'center', color:D.fg3, marginBottom:18, fontSize:13 }}>
          <Icon name="upload-cloud" size={26} color={D.g400} /><div style={{ marginTop:6 }}>Drop a dish photo or click to upload</div>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex:1, padding:'12px' }}>Cancel</button>
          <button onClick={onClose} className="btn btn-orange" style={{ flex:1, padding:'12px' }}><Icon name="plus" size={16} /> Add to menu</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Reports ---------- */
function AdminReports(){
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
        {[['Weekly attendance','All meals, Mon–Fri','file-spreadsheet'],['Unpaid students','Plans pending or expired','users'],['Weekend revenue','Wave & Orange Money','wallet']].map(([t,s,ic])=>(
          <Card key={t} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ width:42, height:42, borderRadius:10, background:D.navy+'14', color:D.navy, display:'grid', placeItems:'center' }}><Icon name={ic} size={20} /></div>
            <div><div style={{ fontFamily:D.display, fontWeight:700, fontSize:16, color:D.fg1 }}>{t}</div><div style={{ fontSize:13, color:D.fg3, marginTop:3 }}>{s}</div></div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-outline" style={{ flex:1, padding:'9px', fontSize:13 }}><Icon name="file-down" size={15} /> CSV</button>
              <button className="btn btn-outline" style={{ flex:1, padding:'9px', fontSize:13 }}><Icon name="file-text" size={15} /> PDF</button>
            </div>
          </Card>
        ))}
      </div>
      <Card>
        <SectionTitle action={<Pill tone="outline">This week</Pill>}>Daily meals served</SectionTitle>
        <BarChart data={ATTEND} keys={['breakfast','lunch','dinner']} colors={[D.navy700,D.orange,D.steel]} h={220} />
      </Card>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <Card>
          <SectionTitle>Payment methods · weekend</SectionTitle>
          <div style={{ display:'flex', alignItems:'center', gap:20 }}>
            <Donut label="orders" segments={[{value:8,color:'#0a8fc4'},{value:6,color:D.orange}]} />
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:9 }}><span style={{ width:11, height:11, borderRadius:3, background:'#0a8fc4' }} /><span style={{ flex:1, fontSize:13, color:D.fg2 }}>Wave</span><span style={{ fontFamily:D.display, fontWeight:700 }}>57%</span></div>
              <div style={{ display:'flex', alignItems:'center', gap:9 }}><span style={{ width:11, height:11, borderRadius:3, background:D.orange }} /><span style={{ flex:1, fontSize:13, color:D.fg2 }}>Orange Money</span><span style={{ fontFamily:D.display, fontWeight:700 }}>43%</span></div>
            </div>
          </div>
        </Card>
        <Card>
          <SectionTitle>Plan distribution</SectionTitle>
          <div style={{ display:'flex', alignItems:'center', gap:20 }}>
            <Donut label="students" segments={[{value:STUDENTS.filter(s=>s.plan==='Annual').length,color:D.navy700},{value:STUDENTS.filter(s=>s.plan==='Semester').length,color:D.steel}]} />
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:9 }}><span style={{ width:11, height:11, borderRadius:3, background:D.navy700 }} /><span style={{ flex:1, fontSize:13, color:D.fg2 }}>Annual</span><span style={{ fontFamily:D.display, fontWeight:700 }}>{STUDENTS.filter(s=>s.plan==='Annual').length}</span></div>
              <div style={{ display:'flex', alignItems:'center', gap:9 }}><span style={{ width:11, height:11, borderRadius:3, background:D.steel }} /><span style={{ flex:1, fontSize:13, color:D.fg2 }}>Semester</span><span style={{ fontFamily:D.display, fontWeight:700 }}>{STUDENTS.filter(s=>s.plan==='Semester').length}</span></div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { AdminStudents, StudentDrawer, AdminOrders, AdminMenus, AddDishModal, AdminReports });
