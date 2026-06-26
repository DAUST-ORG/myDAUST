/* ============================================================
   DAUST Dining — Admin backend (desktop). Shell + Overview + Live.
   ============================================================ */

const ATTEND = [
  { d:'Mon', breakfast:312, lunch:381, dinner:298 },
  { d:'Tue', breakfast:298, lunch:372, dinner:305 },
  { d:'Wed', breakfast:321, lunch:388, dinner:289 },
  { d:'Thu', breakfast:305, lunch:369, dinner:312 },
  { d:'Fri', breakfast:288, lunch:355, dinner:251 },
];
const NAV = [
  { key:'overview', label:'Overview', icon:'layout-dashboard' },
  { key:'live', label:'Live Service', icon:'radio' },
  { key:'students', label:'Students', icon:'users' },
  { key:'orders', label:'Weekend Orders', icon:'shopping-bag' },
  { key:'menus', label:'Menus', icon:'book-open' },
  { key:'finance', label:'Finances', icon:'wallet' },
  { key:'reports', label:'Reports', icon:'bar-chart-3' },
  { key:'settings', label:'Settings', icon:'settings' },
];

function AdminApp({ onExit }){
  const [view, setView] = React.useState('overview');
  const [drawer, setDrawer] = React.useState(null); // student
  const cur = NAV.find(n=>n.key===view);
  return (
    <div style={{ width:'100%', height:'100%', display:'flex', background:D.subtle, fontFamily:D.body, overflow:'hidden' }}>
      {/* sidebar */}
      <div style={{ width:236, flexShrink:0, background:D.navy, display:'flex', flexDirection:'column', padding:'20px 14px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'4px 8px 18px' }}>
          <img src="assets/logo-daust-white.png" alt="DAUST" style={{ height:26 }} />
        </div>
        <div style={{ padding:'0 8px 14px', marginBottom:8, borderBottom:'1px solid rgba(255,255,255,.1)' }}>
          <div style={{ fontSize:11, letterSpacing:'.1em', textTransform:'uppercase', color:D.onNavyMuted, fontWeight:600 }}>Dining Admin</div>
        </div>
        <nav style={{ display:'flex', flexDirection:'column', gap:3, flex:1 }}>
          {NAV.map(n=>(
            <button key={n.key} onClick={()=>setView(n.key)} style={{ display:'flex', alignItems:'center', gap:11, padding:'10px 12px', borderRadius:10, border:'none', cursor:'pointer', textAlign:'left',
              background: view===n.key?'rgba(255,255,255,.12)':'transparent', color: view===n.key?'#fff':D.onNavyMuted, fontFamily:D.body, fontWeight:600, fontSize:13.5, transition:'.14s' }}
              onMouseEnter={e=>{ if(view!==n.key) e.currentTarget.style.color='#fff'; }} onMouseLeave={e=>{ if(view!==n.key) e.currentTarget.style.color=D.onNavyMuted; }}>
              <Icon name={n.icon} size={18} /> {n.label}
              {n.key==='orders' && <span style={{ marginLeft:'auto', background:D.orange, color:'#fff', fontSize:10.5, fontWeight:700, borderRadius:999, padding:'1px 7px' }}>{ORDERS.filter(o=>o.status==='pending').length}</span>}
            </button>
          ))}
        </nav>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 8px', borderTop:'1px solid rgba(255,255,255,.1)', marginTop:8 }}>
          <Avatar name="Khadija Mbaye" size={34} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ color:'#fff', fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>K. Mbaye</div>
            <div style={{ color:D.onNavyMuted, fontSize:11 }}>Dining Manager</div>
          </div>
          <button onClick={onExit} title="Exit" style={{ border:'none', background:'rgba(255,255,255,.1)', color:'#fff', width:30, height:30, borderRadius:8, cursor:'pointer', display:'grid', placeItems:'center' }}><Icon name="log-out" size={15} /></button>
        </div>
      </div>

      {/* main */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
        {/* topbar */}
        <div style={{ height:64, background:'#fff', borderBottom:`1px solid ${D.border}`, display:'flex', alignItems:'center', padding:'0 28px', gap:18, flexShrink:0 }}>
          <div>
            <div style={{ fontFamily:D.display, fontWeight:700, fontSize:20, color:D.fg1 }}>{cur.label}</div>
          </div>
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, background:D.subtle, borderRadius:999, padding:'8px 14px', color:D.fg3, fontSize:13 }}>
              <Icon name="calendar" size={15} /> Monday, 29 May 2026
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:7, background:D.successBg, color:D.success, borderRadius:999, padding:'8px 13px', fontSize:12.5, fontWeight:600 }}>
              <Dot color={D.success} size={7} pulse /> Lunch service live
            </div>
          </div>
        </div>

        {/* view */}
        <div className="scroll" style={{ flex:1, minHeight:0, padding:'24px 28px 40px' }}>
          {view==='overview' && <AdminOverview onView={setView} />}
          {view==='live' && <AdminLive />}
          {view==='students' && <AdminStudents onOpen={setDrawer} />}
          {view==='orders' && <AdminOrders />}
          {view==='menus' && <AdminMenus />}
          {view==='finance' && <AdminFinance />}
          {view==='reports' && <AdminReports />}
          {view==='settings' && <AdminSettings />}
        </div>
      </div>

      {drawer && <StudentDrawer student={drawer} onClose={()=>setDrawer(null)} />}
    </div>
  );
}

/* ---------- shared admin bits ---------- */
function Card({ children, style, pad=20 }){
  return <div style={{ background:'#fff', border:`1px solid ${D.border}`, borderRadius:14, padding:pad, boxShadow:'var(--shadow-sm)', ...style }}>{children}</div>;
}
function StatCard({ label, value, sub, icon, tone='navy', delta }){
  const tones = { navy:D.navy, orange:D.orange, success:D.success, danger:D.danger };
  return (
    <Card style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div style={{ width:40, height:40, borderRadius:10, background: tones[tone]+'14', color:tones[tone], display:'grid', placeItems:'center' }}><Icon name={icon} size={20} /></div>
        {delta && <span style={{ fontSize:12, fontWeight:700, color: delta>0?D.success:D.danger, display:'flex', alignItems:'center', gap:2 }}><Icon name={delta>0?'trending-up':'trending-down'} size={14} /> {Math.abs(delta)}%</span>}
      </div>
      <div>
        <div style={{ fontFamily:D.display, fontWeight:800, fontSize:32, color:D.fg1, lineHeight:1 }}>{value}</div>
        <div style={{ fontSize:13, color:D.fg2, fontWeight:600, marginTop:5 }}>{label}</div>
        {sub && <div style={{ fontSize:12, color:D.fg3, marginTop:2 }}>{sub}</div>}
      </div>
    </Card>
  );
}
function SectionTitle({ children, action }){
  return <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
    <div style={{ fontFamily:D.display, fontWeight:700, fontSize:17, color:D.fg1 }}>{children}</div>{action}
  </div>;
}

/* grouped bar chart */
function BarChart({ data, keys, colors, h=200 }){
  const max = Math.max(...data.flatMap(d=>keys.map(k=>d[k])))*1.1;
  return (
    <div>
      <div style={{ display:'flex', alignItems:'flex-end', gap:18, height:h, padding:'0 4px' }}>
        {data.map(d=>(
          <div key={d.d} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:8, height:'100%' }}>
            <div style={{ flex:1, display:'flex', alignItems:'flex-end', gap:5, width:'100%', justifyContent:'center' }}>
              {keys.map((k,i)=>(
                <div key={k} title={`${k}: ${d[k]}`} style={{ width:`${70/keys.length}%`, maxWidth:22, height:`${d[k]/max*100}%`, background:colors[i], borderRadius:'5px 5px 0 0', transition:'height .5s ease' }} />
              ))}
            </div>
            <div style={{ fontSize:12, color:D.fg3, fontWeight:600 }}>{d.d}</div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:18, marginTop:14, justifyContent:'center' }}>
        {keys.map((k,i)=>(<div key={k} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:D.fg2, textTransform:'capitalize' }}><span style={{ width:11, height:11, borderRadius:3, background:colors[i] }} />{k}</div>))}
      </div>
    </div>
  );
}

/* donut */
function Donut({ segments, size=150, label, center }){
  const total = segments.reduce((s,x)=>s+x.value,0);
  let acc = 0; const r=size/2-14, c=2*Math.PI*r;
  return (
    <div style={{ position:'relative', width:size, height:size }}>
      <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={D.g100} strokeWidth={14} />
        {segments.map((s,i)=>{ const len=s.value/total*c; const off=acc; acc+=len; return (
          <circle key={i} cx={size/2} cy={size/2} r={r} fill="none" stroke={s.color} strokeWidth={14} strokeDasharray={`${len} ${c-len}`} strokeDashoffset={-off} strokeLinecap="round" />
        );})}
      </svg>
      <div style={{ position:'absolute', inset:0, display:'grid', placeItems:'center', textAlign:'center' }}>
        <div><div style={{ fontFamily:D.display, fontWeight:800, fontSize:center!=null?28:26, color:D.fg1, lineHeight:1 }}>{center!=null?center:total}</div><div style={{ fontSize:11, color:D.fg3 }}>{label}</div></div>
      </div>
    </div>
  );
}

/* ---------- Overview ---------- */
function AdminOverview({ onView }){
  const activeCount = STUDENTS.filter(s=>s.status==='active').length;
  const unpaid = STUDENTS.filter(s=>s.status!=='active').length;
  const wkRevenue = ORDERS.filter(o=>o.status!=='pending').reduce((s,o)=>s+o.total,0);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:22 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
        <StatCard label="Meals served today" value="936" sub="across 3 services" icon="utensils" tone="navy" delta={4} />
        <StatCard label="Active meal plans" value={activeCount} sub={`of ${STUDENTS.length} students`} icon="badge-check" tone="success" delta={2} />
        <StatCard label="Unpaid / expired" value={unpaid} sub="need follow-up" icon="alert-triangle" tone="danger" delta={-6} />
        <StatCard label="Weekend revenue" value={fcfa(wkRevenue).replace(' FCFA','')} sub="FCFA · this weekend" icon="wallet" tone="orange" delta={12} />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:16 }}>
        <Card>
          <SectionTitle action={<div style={{ display:'flex', gap:6 }}><Pill tone="outline">This week</Pill></div>}>Attendance by meal</SectionTitle>
          <BarChart data={ATTEND} keys={['breakfast','lunch','dinner']} colors={[D.navy700, D.orange, D.steel]} h={210} />
        </Card>
        <Card>
          <SectionTitle>Today’s split</SectionTitle>
          <div style={{ display:'flex', alignItems:'center', gap:18 }}>
            <Donut label="served" segments={[{value:321,color:D.navy700},{value:388,color:D.orange},{value:227,color:D.steel}]} />
            <div style={{ display:'flex', flexDirection:'column', gap:12, flex:1 }}>
              {[['Breakfast',321,D.navy700],['Lunch',388,D.orange],['Dinner',227,D.steel]].map(([l,v,c])=>(
                <div key={l} style={{ display:'flex', alignItems:'center', gap:9 }}>
                  <span style={{ width:11, height:11, borderRadius:3, background:c }} />
                  <span style={{ fontSize:13, color:D.fg2, flex:1 }}>{l}</span>
                  <span style={{ fontFamily:D.display, fontWeight:700, color:D.fg1 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <Card>
          <SectionTitle action={<button onClick={()=>onView('live')} style={{ border:'none', background:'transparent', color:D.navy, fontWeight:600, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>Live view <Icon name="arrow-right" size={14} /></button>}>Recent scans</SectionTitle>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {RECENT_SCANS.slice(0,5).map((f,i)=>(
              <div key={i} style={{ display:'flex', alignItems:'center', gap:11, padding:'8px 4px', borderBottom: i<4?`1px solid ${D.g100}`:'none' }}>
                <div style={{ width:26, height:26, borderRadius:'50%', display:'grid', placeItems:'center', background: f.ok?D.successBg:D.dangerBg, color: f.ok?D.success:D.danger, flexShrink:0 }}><Icon name={f.ok?'check':'x'} size={14} strokeWidth={2.6} /></div>
                <span style={{ fontSize:13.5, fontWeight:600, color:D.fg1, flex:1 }}>{f.name}</span>
                <span className="mono" style={{ fontSize:12, color:D.fg3 }}>{f.id}</span>
                <span className="mono" style={{ fontSize:12, color:D.fg3 }}>{f.t}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle action={<button onClick={()=>onView('orders')} style={{ border:'none', background:'transparent', color:D.navy, fontWeight:600, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>Manage <Icon name="arrow-right" size={14} /></button>}>Weekend orders</SectionTitle>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {ORDERS.slice(0,5).map((o,i)=>{ const st=ORDER_STATUS[o.status]; return (
              <div key={o.code} style={{ display:'flex', alignItems:'center', gap:11, padding:'8px 4px', borderBottom: i<4?`1px solid ${D.g100}`:'none' }}>
                <span className="mono" style={{ fontSize:12, color:D.fg3, width:54 }}>{o.code}</span>
                <span style={{ fontSize:13.5, fontWeight:600, color:D.fg1, flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{o.student.name}</span>
                <Pill tone={st.tone}>{st.label}</Pill>
              </div>
            );})}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---------- Live Service ---------- */
function AdminLive(){
  const [feed, setFeed] = React.useState(RECENT_SCANS);
  const [count, setCount] = React.useState(388);
  React.useEffect(()=>{
    const id = setInterval(()=>{
      const s = STUDENTS[Math.floor(Math.random()*STUDENTS.length)];
      const ok = Math.random()>0.12;
      const t = new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
      setFeed(f=>[{ name:s.name, id:s.id, ok, t, reason: ok?null:'Already served' }, ...f].slice(0,12));
      if (ok) setCount(c=>c+1);
    }, 2600);
    return ()=>clearInterval(id);
  },[]);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
        <StatCard label="Lunch served (live)" value={count} sub="updating in real time" icon="utensils" tone="orange" />
        <StatCard label="Throughput" value="14/min" sub="last 5 minutes" icon="gauge" tone="navy" />
        <StatCard label="Turned away" value="9" sub="this service" icon="user-x" tone="danger" />
        <StatCard label="Capacity" value="78%" sub="of 500 seats" icon="armchair" tone="success" />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1.3fr', gap:16 }}>
        <Card>
          <SectionTitle>Stations</SectionTitle>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {[['Entrance A','Aliou S.',true],['Entrance B','Ndeye F.',true],['Staff gate','—',false]].map(([s,who,on])=>(
              <div key={s} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, background:D.subtle }}>
                <div style={{ width:38, height:38, borderRadius:10, background: on?D.successBg:D.g100, color: on?D.success:D.g400, display:'grid', placeItems:'center' }}><Icon name="scan-line" size={19} /></div>
                <div style={{ flex:1 }}><div style={{ fontWeight:600, fontSize:14, color:D.fg1 }}>{s}</div><div style={{ fontSize:12, color:D.fg3 }}>{on?`Staffed · ${who}`:'Offline'}</div></div>
                {on ? <Pill tone="success"><Dot color={D.success} size={6} pulse /> Live</Pill> : <Pill tone="neutral">Off</Pill>}
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle action={<Pill tone="success"><Dot color={D.success} size={6} pulse /> Live feed</Pill>}>Scan activity</SectionTitle>
          <div style={{ display:'flex', flexDirection:'column', gap:3, maxHeight:340, overflow:'hidden' }}>
            {feed.map((f,i)=>(
              <div key={f.id+f.t+i} style={{ display:'flex', alignItems:'center', gap:11, padding:'9px 4px', borderBottom:`1px solid ${D.g100}`, animation: i===0?'fadeUp .3s ease':'none' }}>
                <div style={{ width:26, height:26, borderRadius:'50%', display:'grid', placeItems:'center', background: f.ok?D.successBg:D.dangerBg, color: f.ok?D.success:D.danger, flexShrink:0 }}><Icon name={f.ok?'check':'x'} size={14} strokeWidth={2.6} /></div>
                <span style={{ fontSize:13.5, fontWeight:600, color:D.fg1, flex:1 }}>{f.name}</span>
                <span style={{ fontSize:12, color: f.ok?D.fg3:D.danger }}>{f.ok?f.id:f.reason}</span>
                <span className="mono" style={{ fontSize:12, color:D.fg3 }}>{f.t}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { AdminApp, Card, StatCard, SectionTitle, BarChart, Donut, ATTEND });
