/* ============================================================
   DAUST Dining — Scanner Station (entrance tablet, landscape)
   ============================================================ */

function beep(ok){
  try {
    const ac = beep._ac || (beep._ac = new (window.AudioContext||window.webkitAudioContext)());
    const t = ac.currentTime;
    if (ok){
      [659.25, 880].forEach((f,i)=>{ const o=ac.createOscillator(),g=ac.createGain(); o.type='sine'; o.frequency.value=f; o.connect(g); g.connect(ac.destination); g.gain.setValueAtTime(0,t+i*0.09); g.gain.linearRampToValueAtTime(0.16,t+i*0.09+0.01); g.gain.exponentialRampToValueAtTime(0.001,t+i*0.09+0.18); o.start(t+i*0.09); o.stop(t+i*0.09+0.2); });
    } else {
      const o=ac.createOscillator(),g=ac.createGain(); o.type='square'; o.frequency.value=160; o.connect(g); g.connect(ac.destination); g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(0.12,t+0.01); g.gain.exponentialRampToValueAtTime(0.001,t+0.32); o.start(t); o.stop(t+0.34);
    }
  } catch(e){}
}

function evaluate(stu, mealKey){
  if (stu.status === 'expired') return { ok:false, code:'EXPIRED', reason:`Meal plan expired · ${stu.validUntil}`, override:false };
  if (stu.status === 'pending') return { ok:false, code:'UNPAID', reason:'Payment not confirmed for this term', override:true };
  if (stu.mealsToday && stu.mealsToday[mealKey]) return { ok:false, code:'SERVED', reason:`Already served ${mealKey} today`, override:true };
  return { ok:true, code:'OK', reason:'Meal plan active · '+stu.plan };
}

function ScannerStation({ onExit, resultStyle = 'flood', sound = true }){
  const [mealKey, setMealKey] = React.useState(currentMealKey());
  const meal = MEALS.find(m=>m.key===mealKey);
  const [served, setServed] = React.useState(247);
  const [denied, setDenied] = React.useState(8);
  const [feed, setFeed] = React.useState(RECENT_SCANS);
  const [scanning, setScanning] = React.useState(false);
  const [result, setResult] = React.useState(null); // {stu, eval, overridden}
  const timer = React.useRef(null);

  const now = new Date();
  const clock = now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});

  function runScan(stu){
    if (scanning || result) return;
    setScanning(true);
    setTimeout(()=>{
      setScanning(false);
      const ev = evaluate(stu, mealKey);
      if (sound) beep(ev.ok);
      setResult({ stu, ev, overridden:false });
      setFeed(f => [{ name:stu.name, id:stu.id, ok:ev.ok, t:clock, reason: ev.ok?null:ev.reason }, ...f].slice(0,7));
      if (ev.ok) setServed(s=>s+1); else setDenied(s=>s+1);
      clearTimeout(timer.current);
      timer.current = setTimeout(()=>setResult(null), ev.ok ? 2600 : 4200);
    }, 850);
  }
  function override(){
    setResult(r => ({ ...r, overridden:true, ev:{...r.ev, ok:true} }));
    setServed(s=>s+1); setDenied(s=>Math.max(0,s-1));
    setFeed(f => { const [first,...rest]=f; return [{...first, ok:true, reason:'Override'}, ...rest]; });
    clearTimeout(timer.current); timer.current = setTimeout(()=>setResult(null), 1800);
  }
  function dismiss(){ clearTimeout(timer.current); setResult(null); }

  return (
    <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', background:D.subtle, position:'relative', overflow:'hidden', fontFamily:D.body }}>
      {/* top bar */}
      <div style={{ height:74, background:D.navy, display:'flex', alignItems:'center', padding:'0 26px', gap:22, flexShrink:0, boxShadow:'0 2px 14px rgba(15,44,80,.3)' }}>
        <img src="assets/logo-daust-white.png" alt="DAUST" style={{ height:30 }} />
        <div style={{ width:1, height:30, background:'rgba(255,255,255,.16)' }} />
        <div style={{ color:'#fff', fontFamily:D.display, fontWeight:600, fontSize:16, letterSpacing:'.02em' }}>Dining Entrance · <span style={{ color:D.onNavyMuted, fontWeight:500 }}>Main Hall</span></div>

        {/* meal segmented control */}
        <div style={{ marginLeft:'auto', display:'flex', gap:4, background:'rgba(255,255,255,.08)', padding:4, borderRadius:999 }}>
          {MEALS.map(m=>(
            <button key={m.key} onClick={()=>setMealKey(m.key)} style={{ border:'none', cursor:'pointer', borderRadius:999, padding:'8px 16px',
              background: mealKey===m.key ? D.orange : 'transparent', color: mealKey===m.key ? '#fff' : D.onNavyMuted,
              fontFamily:D.body, fontWeight:600, fontSize:13, letterSpacing:'.02em', display:'flex', alignItems:'center', gap:7, transition:'.15s' }}>
              <Icon name={m.icon} size={15} /> {m.label}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2, color:'#fff', minWidth:96 }}>
          <div style={{ fontFamily:D.mono, fontWeight:600, fontSize:18, letterSpacing:'.04em' }}>{clock}</div>
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:D.onNavyMuted }}><Dot color="#4ade80" size={7} pulse /> Online</div>
        </div>
        <button onClick={onExit} title="Exit station" style={{ border:'none', background:'rgba(255,255,255,.1)', color:'#fff', width:38, height:38, borderRadius:999, cursor:'pointer', display:'grid', placeItems:'center' }}><Icon name="x" size={18} /></button>
      </div>

      {/* body */}
      <div style={{ flex:1, display:'flex', minHeight:0 }}>
        {/* left: viewfinder */}
        <div style={{ flex:1, padding:'26px 24px', display:'flex', flexDirection:'column', minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'baseline', gap:12, marginBottom:14 }}>
            <div style={{ fontFamily:D.display, fontWeight:700, fontSize:24, color:D.fg1 }}>Scan student QR</div>
            <Pill tone="warn"><Icon name={meal.icon} size={12} /> {meal.label} · {meal.window}</Pill>
          </div>

          {/* camera */}
          <div style={{ flex:1, borderRadius:18, position:'relative', overflow:'hidden', minHeight:0,
            background:'radial-gradient(120% 120% at 50% 30%, #1a2733 0%, #0c151d 100%)', boxShadow:'inset 0 0 80px rgba(0,0,0,.5)' }}>
            <div style={{ position:'absolute', inset:0, backgroundImage:'radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize:'22px 22px' }} />
            {/* reticle */}
            <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'min(46%, 270px)', aspectRatio:'1', }}>
              {['tl','tr','bl','br'].map(c=>{ const v={ tl:{top:0,left:0}, tr:{top:0,right:0}, bl:{bottom:0,left:0}, br:{bottom:0,right:0} }[c];
                const bw = (s)=>c.includes(s); return (
                <span key={c} style={{ position:'absolute', width:42, height:42, ...v,
                  borderTop: bw('t')?`4px solid ${D.orange}`:'none', borderBottom: bw('b')?`4px solid ${D.orange}`:'none',
                  borderLeft: bw('l')?`4px solid ${D.orange}`:'none', borderRight: bw('r')?`4px solid ${D.orange}`:'none',
                  borderTopLeftRadius: c==='tl'?14:0, borderTopRightRadius:c==='tr'?14:0, borderBottomLeftRadius:c==='bl'?14:0, borderBottomRightRadius:c==='br'?14:0 }} />
              );})}
              {scanning && <div style={{ position:'absolute', left:'4%', right:'4%', height:3, borderRadius:999, background:`linear-gradient(90deg, transparent, ${D.orange}, transparent)`, boxShadow:`0 0 16px ${D.orange}`, animation:'scanSweep 1.1s ease-in-out infinite' }} />}
              <div style={{ position:'absolute', inset:0, display:'grid', placeItems:'center', opacity:.5 }}>
                <Icon name={scanning?'loader':'qr-code'} size={56} color="rgba(255,255,255,.5)" />
              </div>
            </div>
            <div style={{ position:'absolute', bottom:20, left:0, right:0, textAlign:'center', color:'rgba(255,255,255,.62)', fontSize:14, letterSpacing:'.02em' }}>
              {scanning ? 'Reading code…' : 'Hold the student’s QR code inside the frame'}
            </div>
          </div>

          {/* demo scan chips */}
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:11, letterSpacing:'.1em', textTransform:'uppercase', color:D.fg3, fontWeight:600, marginBottom:9, display:'flex', alignItems:'center', gap:7 }}>
              <Icon name="hand" size={13} /> Demo · tap a student to simulate a scan
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {SCAN_DEMO.map(s=>{ const ev=evaluate(s, mealKey);
                return <button key={s.id} onClick={()=>runScan(s)} disabled={scanning||!!result} style={{ cursor:'pointer', border:`1.5px solid ${D.border}`, background:'#fff', borderRadius:999, padding:'7px 13px 7px 7px', display:'flex', alignItems:'center', gap:9, fontFamily:D.body, transition:'.14s', opacity: (scanning||result)?0.5:1 }}
                  onMouseEnter={e=>!scanning&&!result&&(e.currentTarget.style.borderColor=D.navy)} onMouseLeave={e=>e.currentTarget.style.borderColor=D.border}>
                  <Avatar name={s.name} size={30} />
                  <span style={{ textAlign:'left' }}>
                    <span style={{ display:'block', fontSize:12.5, fontWeight:600, color:D.fg1, lineHeight:1.1 }}>{s.name.split(' ')[0]} {s.name.split(' ')[1]?.[0]}.</span>
                    <span style={{ display:'block', fontSize:10.5, color: ev.ok?D.success:D.danger, fontWeight:600 }}>{ev.ok?'Eligible':ev.code}</span>
                  </span>
                </button>; })}
            </div>
          </div>
        </div>

        {/* right: live panel */}
        <div style={{ width:312, flexShrink:0, background:'#fff', borderLeft:`1px solid ${D.border}`, display:'flex', flexDirection:'column', padding:'22px 20px' }}>
          <div style={{ display:'flex', gap:12, marginBottom:18 }}>
            <div style={{ flex:1, background:D.successBg, borderRadius:14, padding:'14px 16px' }}>
              <div style={{ fontFamily:D.display, fontWeight:800, fontSize:34, color:D.success, lineHeight:1 }}>{served}</div>
              <div style={{ fontSize:11.5, color:D.fg2, fontWeight:600, marginTop:4 }}>Served · {meal.label}</div>
            </div>
            <div style={{ flex:1, background:D.dangerBg, borderRadius:14, padding:'14px 16px' }}>
              <div style={{ fontFamily:D.display, fontWeight:800, fontSize:34, color:D.danger, lineHeight:1 }}>{denied}</div>
              <div style={{ fontSize:11.5, color:D.fg2, fontWeight:600, marginTop:4 }}>Turned away</div>
            </div>
          </div>
          <div style={{ fontSize:11, letterSpacing:'.1em', textTransform:'uppercase', color:D.fg3, fontWeight:600, marginBottom:10 }}>Recent scans</div>
          <div className="scroll" style={{ flex:1, display:'flex', flexDirection:'column', gap:7, minHeight:0 }}>
            {feed.map((f,i)=>(
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 10px', borderRadius:10, background: i===0?D.subtle:'transparent', animation: i===0?'fadeUp .3s ease':'none' }}>
                <div style={{ width:28, height:28, borderRadius:'50%', display:'grid', placeItems:'center', flexShrink:0, background: f.ok?D.successBg:D.dangerBg, color: f.ok?D.success:D.danger }}>
                  <Icon name={f.ok?'check':'x'} size={15} strokeWidth={2.6} />
                </div>
                <div style={{ minWidth:0, flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:D.fg1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{f.name}</div>
                  <div style={{ fontSize:11, color:D.fg3 }}>{f.ok ? f.id : f.reason}</div>
                </div>
                <div className="mono" style={{ fontSize:11, color:D.fg3 }}>{f.t}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RESULT overlay */}
      {result && <ScanResult key={result.stu.id+result.overridden} data={result} meal={meal} style={resultStyle} onOverride={override} onDismiss={dismiss} />}
    </div>
  );
}

function ScanResult({ data, meal, style, onOverride, onDismiss }){
  const { stu, ev, overridden } = data;
  const ok = ev.ok;
  const accent = ok ? D.success : D.danger;

  const Identity = ({ light }) => (
    <div style={{ display:'flex', alignItems:'center', gap:18 }}>
      <Avatar name={stu.name} size={84} ring={ light ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.06)'} />
      <div style={{ textAlign:'left' }}>
        <div style={{ fontFamily:D.display, fontWeight:800, fontSize:30, lineHeight:1.05, color: light?'#fff':D.fg1 }}>{stu.name}</div>
        <div className="mono" style={{ fontSize:14, color: light?'rgba(255,255,255,.8)':D.fg2, marginTop:4 }}>{stu.id} · {stu.program}</div>
      </div>
    </div>
  );
  const Reason = ({ light }) => (
    <div style={{ fontSize:16, fontWeight:600, color: light?'rgba(255,255,255,.92)':D.fg2, marginTop:4 }}>
      {overridden ? 'Manual override approved by staff' : ev.reason}
    </div>
  );
  const Symbol = ({ size=120, light }) => (
    <div style={{ position:'relative', width:size, height:size, display:'grid', placeItems:'center' }}>
      <span style={{ position:'absolute', inset:0, borderRadius:'50%', background: light?'rgba(255,255,255,.18)':accent+'1a' }} />
      <span style={{ position:'absolute', inset:0, borderRadius:'50%', border:`3px solid ${light?'rgba(255,255,255,.45)':accent}`, animation:'ringPulse 1.6s ease-out infinite' }} />
      <svg width={size*0.5} height={size*0.5} viewBox="0 0 52 52">
        {ok
          ? <path d="M14 27 l8 8 l16 -18" fill="none" stroke={light?'#fff':accent} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray:60, strokeDashoffset:60, animation:'drawCheck .4s .12s ease forwards' }} />
          : <g stroke={light?'#fff':accent} strokeWidth="6" strokeLinecap="round"><line x1="16" y1="16" x2="36" y2="36" /><line x1="36" y1="16" x2="16" y2="36" /></g>}
      </svg>
    </div>
  );

  // FLOOD — full color takeover
  if (style === 'flood'){
    return (
      <div onClick={onDismiss} style={{ position:'absolute', inset:0, zIndex:30, display:'grid', placeItems:'center', cursor:'pointer',
        background: ok ? `linear-gradient(160deg, #2e7d52, #1f5e3c)` : `linear-gradient(160deg, #c0392b, #8f2317)`, animation: ok?'fadeIn .18s ease':'fadeIn .18s ease' }}>
        <div style={{ textAlign:'center', animation: ok?'popIn .4s ease':'shakeX .5s ease', display:'flex', flexDirection:'column', alignItems:'center', gap:22, padding:30 }}>
          <Symbol light />
          <div>
            <div style={{ fontFamily:D.display, fontWeight:800, fontSize:60, color:'#fff', letterSpacing:'.04em', lineHeight:1 }}>{ok ? (overridden?'LET IN':'GO') : 'STOP'}</div>
            <div style={{ fontSize:17, color:'rgba(255,255,255,.85)', fontWeight:600, marginTop:6, letterSpacing:'.02em' }}>{ok ? (overridden?'Override approved':'Bon appétit · '+meal.label) : ev.code}</div>
          </div>
          <div style={{ background:'rgba(255,255,255,.13)', borderRadius:18, padding:'18px 26px', backdropFilter:'blur(4px)' }} onClick={e=>e.stopPropagation()}>
            <Identity light />
            <Reason light />
          </div>
          {!ok && ev.override && !overridden && (
            <button onClick={(e)=>{ e.stopPropagation(); onOverride(); }} className="btn" style={{ background:'#fff', color:accent, fontWeight:700, padding:'13px 28px' }}>
              <Icon name="shield-check" size={17} /> Staff override · let in
            </button>
          )}
          <div style={{ fontSize:12.5, color:'rgba(255,255,255,.6)' }}>Tap anywhere to continue</div>
        </div>
      </div>
    );
  }

  // CARD — focused card on dim
  if (style === 'card'){
    return (
      <div onClick={onDismiss} style={{ position:'absolute', inset:0, zIndex:30, display:'grid', placeItems:'center', cursor:'pointer', background:'rgba(12,21,34,.55)', backdropFilter:'blur(6px)', animation:'fadeIn .16s ease' }}>
        <div onClick={e=>e.stopPropagation()} style={{ width:480, maxWidth:'88%', background:'#fff', borderRadius:24, overflow:'hidden', boxShadow:D.navy && '0 30px 80px rgba(0,0,0,.4)', animation: ok?'popIn .38s ease':'shakeX .5s ease', cursor:'default' }}>
          <div style={{ background:accent, padding:'30px 0 26px', display:'flex', flexDirection:'column', alignItems:'center', gap:14 }}>
            <Symbol light size={104} />
            <div style={{ fontFamily:D.display, fontWeight:800, fontSize:40, color:'#fff', letterSpacing:'.05em' }}>{ok ? (overridden?'LET IN':'CLEAR TO EAT') : 'DENIED'}</div>
          </div>
          <div style={{ padding:'24px 28px 26px', display:'flex', flexDirection:'column', gap:16 }}>
            <Identity />
            <div style={{ height:1, background:D.border }} />
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:11, letterSpacing:'.08em', textTransform:'uppercase', color:D.fg3, fontWeight:600 }}>Status</div>
                <Reason />
              </div>
              <Pill tone={ok?'success':'danger'}>{ok?'Eligible':ev.code}</Pill>
            </div>
            {!ok && ev.override && !overridden && (
              <button onClick={onOverride} className="btn btn-navy" style={{ width:'100%', padding:'13px' }}><Icon name="shield-check" size={17} /> Staff override · let in</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // BANNER — top slide-in, keeps camera visible
  return (
    <div onClick={onDismiss} style={{ position:'absolute', inset:0, zIndex:30, cursor:'pointer' }}>
      <div onClick={e=>e.stopPropagation()} style={{ position:'absolute', top:90, left:'50%', transform:'translateX(-50%)', width:'min(640px,88%)', background:'#fff', borderRadius:18, boxShadow:'0 24px 60px rgba(0,0,0,.35)', overflow:'hidden', animation:'fadeUp .26s ease', cursor:'default', borderTop:`5px solid ${accent}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:18, padding:'18px 22px' }}>
          <div style={{ width:64, height:64, borderRadius:16, background:ok?D.successBg:D.dangerBg, display:'grid', placeItems:'center', flexShrink:0, color:accent }}>
            <Icon name={ok?'check':'x'} size={34} strokeWidth={2.6} />
          </div>
          <Avatar name={stu.name} size={56} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:D.display, fontWeight:700, fontSize:22, color:D.fg1 }}>{stu.name}</div>
            <div style={{ fontSize:13.5, color:ok?D.success:D.danger, fontWeight:600 }}>{ok?(overridden?'Override approved':'Clear to eat · '+meal.label):ev.reason}</div>
          </div>
          {!ok && ev.override && !overridden
            ? <button onClick={onOverride} className="btn btn-navy" style={{ padding:'11px 18px' }}><Icon name="shield-check" size={15} /> Override</button>
            : <div style={{ fontFamily:D.display, fontWeight:800, fontSize:30, color:accent, letterSpacing:'.04em' }}>{ok?'GO':'STOP'}</div>}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ScannerStation });
