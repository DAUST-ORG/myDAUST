/* ============================================================
   DAUST Dining — App shell: hub, device frames, scaling, tweaks
   ============================================================ */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "scanResult": "flood",
  "scanSound": true,
  "hubAccent": "#ed8425"
}/*EDITMODE-END*/;

/* fit a fixed-size frame into available space */
function useFit(w, h, pad = 0.96){
  const [scale, setScale] = React.useState(1);
  React.useLayoutEffect(()=>{
    function fit(){
      const aw = window.innerWidth * pad, ah = (window.innerHeight - 16) * pad;
      setScale(Math.min(aw/w, ah/h, 1));
    }
    fit(); window.addEventListener('resize', fit); return ()=>window.removeEventListener('resize', fit);
  }, [w, h, pad]);
  return scale;
}

function FitFrame({ w, h, children }){
  const scale = useFit(w, h);
  return (
    <div className="fit-host">
      <div style={{ width:w*scale, height:h*scale, position:'relative', transition:'width .2s ease, height .2s ease' }}>
        <div style={{ width:w, height:h, transform:`scale(${scale})`, transformOrigin:'top left', position:'absolute', top:0, left:0 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ---- device frames ---- */
function TabletFrame({ children }){
  return (
    <div style={{ width:1180, height:800, background:'#0c1118', borderRadius:34, padding:'20px 24px', boxShadow:'0 50px 120px rgba(0,0,0,.55), inset 0 0 0 2px rgba(255,255,255,.04)', position:'relative' }}>
      <div style={{ position:'absolute', top:'50%', right:9, transform:'translateY(-50%)', width:6, height:6, borderRadius:'50%', background:'rgba(255,255,255,.18)' }} />
      <div style={{ width:'100%', height:'100%', borderRadius:16, overflow:'hidden', background:'#fff', position:'relative' }}>{children}</div>
    </div>
  );
}
function DesktopFrame({ children }){
  return (
    <div style={{ width:1340, height:858, background:'#fff', borderRadius:14, overflow:'hidden', boxShadow:'0 50px 120px rgba(0,0,0,.5)', display:'flex', flexDirection:'column' }}>
      <div style={{ height:42, background:'#eef1f5', borderBottom:`1px solid ${D.border}`, display:'flex', alignItems:'center', padding:'0 16px', gap:8, flexShrink:0 }}>
        <span style={{ width:12, height:12, borderRadius:'50%', background:'#ff5f57' }} /><span style={{ width:12, height:12, borderRadius:'50%', background:'#febc2e' }} /><span style={{ width:12, height:12, borderRadius:'50%', background:'#28c840' }} />
        <div style={{ margin:'0 auto', background:'#fff', borderRadius:8, padding:'5px 18px', fontSize:12.5, color:D.fg3, fontFamily:D.body, display:'flex', alignItems:'center', gap:7, minWidth:280, justifyContent:'center' }}>
          <Icon name="lock" size={12} /> dining.daust.org/admin
        </div>
        <span style={{ width:60 }} />
      </div>
      <div style={{ flex:1, minHeight:0 }}>{children}</div>
    </div>
  );
}
function PhoneFrame({ children }){
  return (
    <div style={{ width:392, height:812, background:'#0c1118', borderRadius:46, padding:11, boxShadow:'0 50px 110px rgba(0,0,0,.55), inset 0 0 0 2px rgba(255,255,255,.05)', position:'relative' }}>
      <div style={{ width:'100%', height:'100%', borderRadius:36, overflow:'hidden', background:'#fff', position:'relative' }}>
        <div style={{ position:'absolute', top:0, left:'50%', transform:'translateX(-50%)', width:124, height:30, background:'#0c1118', borderRadius:'0 0 18px 18px', zIndex:50 }} />
        {children}
      </div>
    </div>
  );
}

/* ---- Hub ---- */
function Hub({ onPick }){
  const roles = [
    { key:'scanner', tag:'Entrance · Tablet', title:'Scanner Station', desc:'Staff scan student QR codes — instant green or red to enter the dining hall.', icon:'scan-line', accent:D.orange },
    { key:'admin', tag:'Back office · Desktop', title:'Admin Console', desc:'Track attendance, manage students, confirm weekend payments, publish menus.', icon:'layout-dashboard', accent:D.navy700 },
    { key:'student', tag:'Student · Mobile', title:'Student App', desc:'Carry a dining pass, browse weekend menus, pay with Wave or Orange Money.', icon:'smartphone', accent:D.steel },
  ];
  return (
    <div className="scroll" style={{ position:'relative', zIndex:2, width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px 24px', color:'#fff' }}>
      <img src="assets/logo-daust-white.png" alt="DAUST" style={{ height:36, marginBottom:26, opacity:.96 }} />
      <div className="eyebrow" style={{ color:D.orange }}>Dining Platform</div>
      <h1 style={{ fontFamily:D.display, fontWeight:800, fontSize:'min(8vw,56px)', letterSpacing:'.01em', margin:'10px 0 8px', textAlign:'center', lineHeight:1.02 }}>One pass. Three meals. Every day.</h1>
      <p style={{ fontFamily:D.body, fontSize:16, color:D.onNavyMuted, maxWidth:580, textAlign:'center', lineHeight:1.6, margin:'0 0 14px' }}>
        From the weekday entrance scan to weekend orders paid by mobile money — the complete dining system for DAUST.
      </p>
      <TriDash w={34} style={{ marginBottom:34 }} />
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0,300px))', gap:18, width:'100%', maxWidth:960 }}>
        {roles.map(r=>(
          <button key={r.key} onClick={()=>onPick(r.key)} style={{ textAlign:'left', cursor:'pointer', border:'1px solid rgba(255,255,255,.12)', borderRadius:18, padding:'24px 22px', background:'rgba(255,255,255,.05)', color:'#fff', backdropFilter:'blur(8px)', transition:'.18s', display:'flex', flexDirection:'column', gap:14 }}
            onMouseEnter={e=>{ e.currentTarget.style.background='rgba(255,255,255,.1)'; e.currentTarget.style.transform='translateY(-4px)'; e.currentTarget.style.borderColor=r.accent; }}
            onMouseLeave={e=>{ e.currentTarget.style.background='rgba(255,255,255,.05)'; e.currentTarget.style.transform='none'; e.currentTarget.style.borderColor='rgba(255,255,255,.12)'; }}>
            <div style={{ width:52, height:52, borderRadius:14, background:r.accent, display:'grid', placeItems:'center', boxShadow:`0 8px 24px ${r.accent}66` }}><Icon name={r.icon} size={26} color="#fff" /></div>
            <div>
              <div style={{ fontSize:11, letterSpacing:'.1em', textTransform:'uppercase', color:D.onNavyMuted, fontWeight:600 }}>{r.tag}</div>
              <div style={{ fontFamily:D.display, fontWeight:700, fontSize:21, marginTop:5 }}>{r.title}</div>
            </div>
            <p style={{ fontSize:13.5, color:D.onNavyMuted, lineHeight:1.55, margin:0, flex:1 }}>{r.desc}</p>
            <div style={{ display:'flex', alignItems:'center', gap:7, color:r.accent===D.steel?'#cdd5dd':r.accent, fontWeight:700, fontSize:14 }}>Open <Icon name="arrow-right" size={16} /></div>
          </button>
        ))}
      </div>
      <div style={{ marginTop:30, fontSize:12.5, color:'rgba(255,255,255,.45)', display:'flex', alignItems:'center', gap:8 }}>
        <Icon name="info" size={14} /> Interactive prototype · sample data · Dakar American University of Science &amp; Technology
      </div>
    </div>
  );
}

/* ---- App ---- */
function App(){
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [surface, setSurface] = React.useState(null);

  React.useEffect(()=>{
    function onKey(e){ if (e.key === 'Escape' && surface) setSurface(null); }
    window.addEventListener('keydown', onKey); return ()=>window.removeEventListener('keydown', onKey);
  }, [surface]);

  return (
    <div className="stage">
      <div className="stage-bg" style={{ opacity: surface?0.55:1, transition:'opacity .3s' }} />
      {!surface && <Hub onPick={setSurface} />}

      {surface && (
        <>
          <button onClick={()=>setSurface(null)} title="Back to all surfaces (Esc)" style={{ position:'fixed', bottom:16, left:16, zIndex:100, display:'flex', alignItems:'center', gap:8, background:'rgba(20,26,33,.62)', backdropFilter:'blur(10px)', border:'1px solid rgba(255,255,255,.18)', color:'#fff', borderRadius:999, padding:'10px 18px', cursor:'pointer', fontFamily:D.body, fontWeight:600, fontSize:13, boxShadow:'0 8px 24px rgba(0,0,0,.3)' }}>
            <Icon name="grid-3x3" size={15} /> All surfaces
          </button>
          {surface==='scanner' && <FitFrame w={1228} h={840}><TabletFrame><ScannerStation onExit={()=>setSurface(null)} resultStyle={t.scanResult} sound={t.scanSound} /></TabletFrame></FitFrame>}
          {surface==='admin' && <FitFrame w={1340} h={858}><DesktopFrame><AdminApp onExit={()=>setSurface(null)} /></DesktopFrame></FitFrame>}
          {surface==='student' && <FitFrame w={392} h={812}><PhoneFrame><StudentApp onExit={()=>setSurface(null)} /></PhoneFrame></FitFrame>}
        </>
      )}

      <TweaksPanel>
        <TweakSection label="Scanner result" />
        <TweakRadio label="Result style" value={t.scanResult} options={['flood','card','banner']} onChange={v=>setTweak('scanResult', v)} />
        <TweakToggle label="Scan sound" value={t.scanSound} onChange={v=>setTweak('scanSound', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
