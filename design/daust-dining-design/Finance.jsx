/* ============================================================
   DAUST Dining — Admin: Finances & Settings
   ============================================================ */

function money(n){ return n.toLocaleString('fr-FR'); }

/* stacked monthly bars (plan + weekend) */
function StackedBar({ data, h=220 }){
  const max = Math.max(...data.map(d=>d.plan+d.weekend))*1.08;
  return (
    <div>
      <div style={{ display:'flex', alignItems:'flex-end', gap:16, height:h, padding:'0 4px' }}>
        {data.map(d=>{ const total=d.plan+d.weekend;
          return (
          <div key={d.m} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:8, height:'100%' }}>
            <div style={{ fontSize:11, color:D.fg3, fontWeight:600 }}>{fcfaShort(total)}</div>
            <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'flex-end', width:'62%', maxWidth:46 }}>
              <div title={`Weekend ${fcfaShort(d.weekend)}`} style={{ height:`${Math.max(d.weekend/max*100,1.5)}%`, background:D.orange, borderRadius:'5px 5px 0 0', minHeight:3 }} />
              <div title={`Plans ${fcfaShort(d.plan)}`} style={{ height:`${Math.max(d.plan/max*100,1.5)}%`, background:D.navy700, minHeight:3 }} />
            </div>
            <div style={{ fontSize:12, color:D.fg3, fontWeight:600 }}>{d.m}</div>
          </div>
        );})}
      </div>
      <div style={{ display:'flex', gap:18, marginTop:14, justifyContent:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:D.fg2 }}><span style={{ width:11, height:11, borderRadius:3, background:D.navy700 }} />Meal plans</div>
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:D.fg2 }}><span style={{ width:11, height:11, borderRadius:3, background:D.orange }} />Weekend orders</div>
      </div>
    </div>
  );
}

/* ---------- Finances ---------- */
function AdminFinance(){
  const f = termFinances();
  const [filter, setFilter] = React.useState('all');
  const [q, setQ] = React.useState('');
  const marginPct = Math.round(f.margin / f.revenue * 100);
  const txns = TRANSACTIONS.filter(t=>{
    if (filter!=='all' && t.type!==filter) return false;
    if (q && !(`${t.student.name} ${t.id}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });
  const methodColor = { 'Wave':'#0a8fc4', 'Orange Money':D.orange600, 'Bank transfer':D.navy700, 'Cash':D.fg2 };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
        <StatCard label="Term revenue" value={fcfaShort(f.revenue)} sub="FCFA · Spring 2026" icon="trending-up" tone="success" delta={9} />
        <StatCard label="Meal-plan revenue" value={fcfaShort(f.planRevenue)} sub="semester + annual" icon="badge-check" tone="navy" />
        <StatCard label="Weekend revenue" value={fcfaShort(f.weekendRevenue)} sub="Wave + Orange Money" icon="utensils" tone="orange" delta={12} />
        <StatCard label="Outstanding" value={fcfaShort(f.outstanding)} sub="unpaid / expired plans" icon="alert-triangle" tone="danger" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1.55fr 1fr', gap:16 }}>
        <Card>
          <SectionTitle action={<Pill tone="outline">Jan–May</Pill>}>Revenue by month</SectionTitle>
          <StackedBar data={REV_TREND} h={210} />
        </Card>
        {/* margin */}
        <Card style={{ display:'flex', flexDirection:'column' }}>
          <SectionTitle>Gross margin</SectionTitle>
          <div style={{ display:'flex', alignItems:'center', gap:18, marginBottom:16 }}>
            <Donut label="margin" center={marginPct+'%'} segments={[{value:f.margin,color:D.success},{value:f.foodCost,color:D.g200}]} size={134} />
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:D.display, fontWeight:700, fontSize:18, color:D.fg1, lineHeight:1.1 }}>Healthy surplus</div>
              <div style={{ fontSize:12.5, color:D.fg3, marginTop:5 }}>Term revenue comfortably covers food &amp; operating cost.</div>
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:9, borderTop:`1px solid ${D.g100}`, paddingTop:14 }}>
            <LineKV label="Revenue" value={fcfa(f.revenue)} />
            <LineKV label={`Food cost · ${money(f.mealsServedTerm)} meals`} value={'– '+fcfa(f.foodCost)} muted />
            <LineKV label="Gross margin" value={fcfa(f.margin)} strong />
          </div>
        </Card>
      </div>

      {/* settlement */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16 }}>
        {SETTLEMENT.map(s=>(
          <Card key={s.provider} style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:11 }}>
              <div style={{ width:42, height:42, borderRadius:11, background:s.color, color:'#fff', display:'grid', placeItems:'center', fontFamily:D.display, fontWeight:800, fontSize:s.provider.length>5?13:18 }}>{s.provider==='Wave'?'W':'OM'}</div>
              <div><div style={{ fontWeight:700, fontSize:15, color:D.fg1 }}>{s.provider}</div><div style={{ fontSize:11.5, color:D.fg3 }}>{s.account}</div></div>
            </div>
            <div>
              <div style={{ fontFamily:D.display, fontWeight:800, fontSize:26, color:D.fg1, lineHeight:1 }}>{fcfa(s.balance)}</div>
              <div style={{ fontSize:12, color:D.fg3, marginTop:4 }}>Available to settle · fee {fcfa(s.fee)}</div>
            </div>
            <button className="btn btn-outline" style={{ padding:'9px', fontSize:13 }}><Icon name="arrow-down-to-line" size={15} /> Withdraw to bank</button>
          </Card>
        ))}
        <Card style={{ display:'flex', flexDirection:'column', gap:12, background:`linear-gradient(135deg,${D.navy},${D.navyDeep})`, border:'none', color:'#fff' }}>
          <div style={{ display:'flex', alignItems:'center', gap:11 }}>
            <div style={{ width:42, height:42, borderRadius:11, background:'rgba(255,255,255,.14)', display:'grid', placeItems:'center' }}><Icon name="landmark" size={20} color="#fff" /></div>
            <div><div style={{ fontWeight:700, fontSize:15 }}>Next payout</div><div style={{ fontSize:11.5, color:D.onNavyMuted }}>Auto-settle · weekly</div></div>
          </div>
          <div>
            <div style={{ fontFamily:D.display, fontWeight:800, fontSize:26, lineHeight:1 }}>{fcfa(SETTLEMENT.reduce((a,s)=>a+s.balance,0))}</div>
            <div style={{ fontSize:12, color:D.onNavyMuted, marginTop:4 }}>Scheduled · Friday 31 May</div>
          </div>
          <button className="btn" style={{ background:D.orange, color:'#fff', padding:'9px', fontSize:13 }}><Icon name="zap" size={15} /> Settle now</button>
        </Card>
      </div>

      {/* transactions ledger */}
      <Card pad={0}>
        <div style={{ padding:'16px 20px', display:'flex', alignItems:'center', gap:12, borderBottom:`1px solid ${D.border}`, flexWrap:'wrap' }}>
          <div style={{ fontFamily:D.display, fontWeight:700, fontSize:17, color:D.fg1, marginRight:'auto' }}>Transactions</div>
          <div style={{ display:'flex', alignItems:'center', gap:8, background:D.subtle, borderRadius:8, padding:'8px 12px', width:230 }}>
            <Icon name="search" size={15} color={D.g400} /><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search student or ID…" style={{ border:'none', outline:'none', background:'transparent', fontSize:13, fontFamily:D.body, flex:1, color:D.fg1 }} />
          </div>
          <div style={{ display:'flex', gap:5, background:D.g100, padding:4, borderRadius:999 }}>
            {[['all','All'],['plan','Plans'],['weekend','Weekend'],['refund','Refunds']].map(([k,l])=>(
              <button key={k} onClick={()=>setFilter(k)} style={{ border:'none', cursor:'pointer', borderRadius:999, padding:'6px 13px', fontFamily:D.body, fontWeight:600, fontSize:12.5,
                background: filter===k?'#fff':'transparent', color: filter===k?D.navy:D.fg2, boxShadow: filter===k?'var(--shadow-sm)':'none' }}>{l}</button>
            ))}
          </div>
          <button className="btn btn-outline" style={{ padding:'9px 16px', fontSize:13 }}><Icon name="download" size={15} /> Export</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1.3fr 1.8fr 1.2fr 1.2fr 1fr 1fr', padding:'12px 20px', borderBottom:`1px solid ${D.border}`, fontSize:11, letterSpacing:'.06em', textTransform:'uppercase', color:D.fg3, fontWeight:700 }}>
          <div>Reference</div><div>Student</div><div>Type</div><div>Method</div><div>When</div><div style={{ textAlign:'right' }}>Amount</div>
        </div>
        <div className="scroll" style={{ maxHeight:360, overflowY:'auto' }}>
          {txns.map((t,i)=>{ const meta=TXN_TYPES[t.type];
            return (
            <div key={t.id} style={{ display:'grid', gridTemplateColumns:'1.3fr 1.8fr 1.2fr 1.2fr 1fr 1fr', alignItems:'center', padding:'12px 20px', borderBottom: i<txns.length-1?`1px solid ${D.g100}`:'none' }}>
              <div className="mono" style={{ fontSize:12.5, color:D.fg2, fontWeight:600 }}>{t.id}</div>
              <div style={{ display:'flex', alignItems:'center', gap:9 }}><Avatar name={t.student.name} size={28} /><span style={{ fontSize:13.5, color:D.fg1, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{t.student.name}</span></div>
              <div style={{ display:'flex', alignItems:'center', gap:7, fontSize:13, color:D.fg2 }}><span style={{ width:24, height:24, borderRadius:6, background:meta.color+'18', color:meta.color, display:'grid', placeItems:'center' }}><Icon name={meta.icon} size={13} /></span>{meta.label}</div>
              <div style={{ fontSize:13, fontWeight:600, color:methodColor[t.method] }}>{t.method}</div>
              <div style={{ fontSize:12.5, color:D.fg3 }}>{t.when}</div>
              <div style={{ textAlign:'right', fontFamily:D.display, fontWeight:700, fontSize:14, color: t.amount<0?D.danger:D.fg1 }}>
                {t.amount<0?'– ':''}{money(Math.abs(t.amount))} F
                {t.status==='pending' && <div style={{ fontSize:10, color:D.orange600, fontWeight:600 }}>pending</div>}
                {t.status==='refunded' && <div style={{ fontSize:10, color:D.danger, fontWeight:600 }}>refunded</div>}
              </div>
            </div>
          );})}
          {txns.length===0 && <div style={{ padding:'30px', textAlign:'center', color:D.g400, fontSize:13 }}>No transactions match.</div>}
        </div>
      </Card>
    </div>
  );
}

function LineKV({ label, value, muted, strong }){
  return <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
    <span style={{ fontSize:13, color: strong?D.fg1:D.fg3, fontWeight: strong?600:400 }}>{label}</span>
    <span style={{ fontFamily:D.display, fontWeight: strong?800:600, fontSize: strong?16:14, color: muted?D.fg3:(strong?D.success:D.fg1) }}>{value}</span>
  </div>;
}

/* ---------- Settings ---------- */
function AdminSettings(){
  const [weekendOpen, setWeekendOpen] = React.useState(true);
  const [autoSettle, setAutoSettle] = React.useState(true);
  const [block2x, setBlock2x] = React.useState(true);
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, alignItems:'start' }}>
      <Card>
        <SectionTitle>Meal service windows</SectionTitle>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {MEALS.map(m=>(
            <div key={m.key} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 13px', border:`1px solid ${D.border}`, borderRadius:10 }}>
              <span style={{ width:34, height:34, borderRadius:9, background:D.subtle, display:'grid', placeItems:'center', color:D.navy }}><Icon name={m.icon} size={17} /></span>
              <div style={{ flex:1, fontWeight:600, fontSize:14, color:D.fg1 }}>{m.label}</div>
              <input defaultValue={m.window.split(' – ')[0]} style={{ width:64, textAlign:'center', border:`1.5px solid ${D.border}`, borderRadius:7, padding:'7px', fontFamily:D.mono, fontSize:13 }} />
              <span style={{ color:D.fg3 }}>–</span>
              <input defaultValue={m.window.split(' – ')[1]} style={{ width:64, textAlign:'center', border:`1.5px solid ${D.border}`, borderRadius:7, padding:'7px', fontFamily:D.mono, fontSize:13 }} />
            </div>
          ))}
          <SettingToggle label="Block a second scan in the same meal" sub="Staff can still override" on={block2x} set={setBlock2x} />
        </div>
      </Card>

      <Card>
        <SectionTitle>Plan pricing</SectionTitle>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {Object.entries(PLAN_PRICES).map(([plan,price])=>(
            <div key={plan} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 13px', border:`1px solid ${D.border}`, borderRadius:10 }}>
              <div style={{ flex:1 }}><div style={{ fontWeight:600, fontSize:14, color:D.fg1 }}>{plan} plan</div><div style={{ fontSize:11.5, color:D.fg3 }}>{plan==='Annual'?'Sept–Aug · 3 meals/day':'One semester · 3 meals/day'}</div></div>
              <div style={{ display:'flex', alignItems:'center', gap:6, border:`1.5px solid ${D.border}`, borderRadius:8, padding:'7px 11px' }}>
                <input defaultValue={money(price)} style={{ width:78, border:'none', outline:'none', fontFamily:D.mono, fontSize:13.5, textAlign:'right' }} />
                <span style={{ fontSize:12, color:D.fg3 }}>FCFA</span>
              </div>
            </div>
          ))}
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 13px', background:D.subtle, borderRadius:10 }}>
            <div style={{ flex:1, fontSize:13.5, color:D.fg2 }}>Cost per meal (for margin)</div>
            <div style={{ display:'flex', alignItems:'center', gap:6, background:'#fff', border:`1.5px solid ${D.border}`, borderRadius:8, padding:'7px 11px' }}>
              <input defaultValue={money(COST_PER_MEAL)} style={{ width:50, border:'none', outline:'none', fontFamily:D.mono, fontSize:13.5, textAlign:'right' }} /><span style={{ fontSize:12, color:D.fg3 }}>FCFA</span>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>Payment accounts</SectionTitle>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {SETTLEMENT.map(s=>(
            <div key={s.provider} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 13px', border:`1px solid ${D.border}`, borderRadius:10 }}>
              <div style={{ width:34, height:34, borderRadius:9, background:s.color, color:'#fff', display:'grid', placeItems:'center', fontFamily:D.display, fontWeight:800, fontSize:s.provider.length>5?11:15 }}>{s.provider==='Wave'?'W':'OM'}</div>
              <div style={{ flex:1 }}><div style={{ fontWeight:600, fontSize:14, color:D.fg1 }}>{s.provider}</div><div className="mono" style={{ fontSize:12, color:D.fg3 }}>{s.account.split('· ')[1]}</div></div>
              <Pill tone="success"><Dot color={D.success} size={6} /> Connected</Pill>
            </div>
          ))}
          <SettingToggle label="Weekly auto-settlement" sub="Move balances to bank every Friday" on={autoSettle} set={setAutoSettle} />
        </div>
      </Card>

      <Card>
        <SectionTitle>Weekend ordering</SectionTitle>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <SettingToggle label="Accept weekend orders" sub="Students can order & pay for Sat/Sun meals" on={weekendOpen} set={setWeekendOpen} />
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 13px', border:`1px solid ${D.border}`, borderRadius:10 }}>
            <div style={{ flex:1 }}><div style={{ fontWeight:600, fontSize:14, color:D.fg1 }}>Order cut-off</div><div style={{ fontSize:11.5, color:D.fg3 }}>Last time students can order</div></div>
            <select defaultValue="Fri 18:00" style={{ border:`1.5px solid ${D.border}`, borderRadius:8, padding:'8px 12px', fontFamily:D.body, fontSize:13 }}><option>Fri 18:00</option><option>Fri 21:00</option><option>Sat 08:00</option></select>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 13px', border:`1px solid ${D.border}`, borderRadius:10 }}>
            <div style={{ flex:1 }}><div style={{ fontWeight:600, fontSize:14, color:D.fg1 }}>Scanner stations</div><div style={{ fontSize:11.5, color:D.fg3 }}>Entrance A · Entrance B · Staff gate</div></div>
            <Pill tone="navy">3 active</Pill>
          </div>
        </div>
      </Card>
    </div>
  );
}

function SettingToggle({ label, sub, on, set }){
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 13px', border:`1px solid ${D.border}`, borderRadius:10 }}>
      <div style={{ flex:1 }}><div style={{ fontWeight:600, fontSize:14, color:D.fg1 }}>{label}</div>{sub && <div style={{ fontSize:11.5, color:D.fg3 }}>{sub}</div>}</div>
      <button onClick={()=>set(!on)} style={{ width:46, height:27, borderRadius:999, border:'none', cursor:'pointer', background: on?D.success:D.g300, position:'relative', transition:'.18s', flexShrink:0 }}>
        <span style={{ position:'absolute', top:3, left: on?22:3, width:21, height:21, borderRadius:'50%', background:'#fff', transition:'.18s', boxShadow:'var(--shadow-sm)' }} />
      </button>
    </div>
  );
}

Object.assign(window, { AdminFinance, AdminSettings });
