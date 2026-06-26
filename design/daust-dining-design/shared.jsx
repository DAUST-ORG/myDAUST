/* ============================================================
   DAUST Dining — shared primitives, helpers & mock data
   Exposes everything on window for cross-file Babel scope.
   ============================================================ */

const D = {
  navy: '#153b6a', navyDeep: '#0f2c50', navy700: '#1d4a82',
  orange: '#ed8425', orange600: '#d6731a', steel: '#9da6ae',
  white: '#ffffff', subtle: '#f5f7f9',
  border: '#d7dee6', borderStrong: '#bcc6d1',
  fg1: '#141a21', fg2: '#4d5965', fg3: '#6c7884',
  onNavyMuted: '#b9c4d4',
  g50:'#f5f7f9', g100:'#e9edf2', g200:'#d7dee6', g300:'#bcc6d1', g400:'#9da6ae', g500:'#6c7884',
  success: '#2e7d52', successBg:'#eaf3ee', danger: '#c0392b', dangerBg:'#fbecea', warning:'#ed8425',
  display: "'Saira', system-ui, sans-serif",
  body: "'Montserrat', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
};

/* ---------- helpers ---------- */
function hashStr(s) { let h = 2166136261; for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h>>>0); }
function mulberry(seed){ return function(){ let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t>>>15, t|1); t ^= t + Math.imul(t ^ t>>>7, t|61); return ((t ^ t>>>14)>>>0)/4294967296; }; }
function fcfa(n){ return n.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g,' ') + ' FCFA'; }
function fcfaShort(n){ const a=Math.abs(n); const s=n<0?'-':''; if(a>=1e6) return s+(a/1e6).toFixed(a>=1e7?0:1).replace('.0','')+'M'; if(a>=1e3) return s+Math.round(a/1e3)+'k'; return s+a; }
function initials(name){ const p = name.trim().split(/\s+/); return ((p[0]?.[0]||'') + (p[1]?.[0]||'')).toUpperCase(); }
function cx(...a){ return a.filter(Boolean).join(' '); }

const AVATAR_BG = ['#1d4a82','#153b6a','#36414d','#4d5965','#0f2c50','#2e5a8f'];

/* ---------- icon (lucide) — batched render to avoid per-icon full-doc scans ---------- */
let _lucidePending = false;
function scheduleLucide(){
  if (_lucidePending) return;
  _lucidePending = true;
  setTimeout(()=>{ _lucidePending = false; if (window.lucide && window.lucide.createIcons) window.lucide.createIcons(); }, 0);
}
function Icon({ name, size = 18, color, strokeWidth = 2, style }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const host = ref.current; if (!host) return;
    host.innerHTML = '';
    const el = document.createElement('i');
    el.setAttribute('data-lucide', name);
    el.setAttribute('width', size); el.setAttribute('height', size);
    el.setAttribute('stroke-width', strokeWidth);
    host.appendChild(el);
    scheduleLucide();
  }, [name, size, strokeWidth]);
  return <span ref={ref} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:size, height:size, color: color||'currentColor', flexShrink:0, ...style }} />;
}

/* ---------- TriDash ---------- */
function TriDash({ w = 28, h = 4, gap = 6, style }) {
  const bar = (c) => <span style={{ display:'block', width:w, height:h, borderRadius:999, background:c }} />;
  return <div style={{ display:'flex', gap, alignItems:'center', ...style }}>{bar(D.navy)}{bar(D.orange)}{bar(D.steel)}</div>;
}

/* ---------- Avatar ---------- */
function Avatar({ name, size = 44, ring }) {
  const bg = AVATAR_BG[hashStr(name) % AVATAR_BG.length];
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:bg, color:'#fff', display:'grid', placeItems:'center',
      fontFamily:D.display, fontWeight:700, fontSize:size*0.38, letterSpacing:'.02em', flexShrink:0,
      boxShadow: ring ? `0 0 0 3px ${ring}` : 'none' }}>{initials(name)}</div>
  );
}

/* ---------- QR code (decorative, deterministic) ---------- */
function QRCode({ value = 'DAUST', size = 180, fg = '#0f2c50', bg = '#ffffff', quiet = true, logo = true }) {
  const N = 29;
  const cells = React.useMemo(() => {
    const rnd = mulberry(hashStr(value) || 1);
    const g = Array.from({length:N}, () => Array.from({length:N}, () => rnd() > 0.5));
    const isFinder = (r,c) => (r<8&&c<8)||(r<8&&c>=N-8)||(r>=N-8&&c<8);
    for (let r=0;r<N;r++) for (let c=0;c<N;c++) if (isFinder(r,c)) g[r][c]=false;
    // clear center for logo
    if (logo) for (let r=11;r<18;r++) for (let c=11;c<18;c++) g[r][c]=false;
    return g;
  }, [value]);
  const pad = quiet ? 2 : 0;
  const total = N + pad*2;
  const unit = size/total;
  const finder = (r,c) => (
    <g key={`f${r}${c}`}>
      <rect x={(c+pad)*unit} y={(r+pad)*unit} width={unit*7} height={unit*7} rx={unit*1.6} fill={fg} />
      <rect x={(c+pad+1)*unit} y={(r+pad+1)*unit} width={unit*5} height={unit*5} rx={unit*1.1} fill={bg} />
      <rect x={(c+pad+2)*unit} y={(r+pad+2)*unit} width={unit*3} height={unit*3} rx={unit*0.7} fill={fg} />
    </g>
  );
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display:'block', borderRadius: size*0.06 }}>
      <rect width={size} height={size} fill={bg} />
      {cells.map((row,r)=>row.map((on,c)=> on ? <rect key={`${r}-${c}`} x={(c+pad)*unit+unit*0.08} y={(r+pad)*unit+unit*0.08} width={unit*0.84} height={unit*0.84} rx={unit*0.22} fill={fg} /> : null))}
      {finder(0,0)}{finder(0,N-7)}{finder(N-7,0)}
      {logo && <g>
        <rect x={size*0.5-unit*3.4} y={size*0.5-unit*3.4} width={unit*6.8} height={unit*6.8} rx={unit*1.6} fill={bg} />
        <rect x={size*0.5-unit*2.7} y={size*0.5-unit*2.7} width={unit*5.4} height={unit*5.4} rx={unit*1.2} fill={D.navy} />
        <text x={size*0.5} y={size*0.5} dy={unit*1.1} textAnchor="middle" fontFamily={D.display} fontWeight="800" fontSize={unit*2.6} fill="#fff">D</text>
      </g>}
    </svg>
  );
}

/* ---------- small UI bits ---------- */
function Pill({ children, tone = 'neutral', style }) {
  const tones = {
    neutral:{ bg:D.g100, fg:D.fg2 }, navy:{ bg:D.navy, fg:'#fff' }, orange:{ bg:D.orange, fg:'#fff' },
    success:{ bg:D.successBg, fg:D.success }, danger:{ bg:D.dangerBg, fg:D.danger }, warn:{ bg:'#fdf0e3', fg:D.orange600 },
    outline:{ bg:'transparent', fg:D.fg2, box:`inset 0 0 0 1.5px ${D.border}` },
  };
  const t = tones[tone]||tones.neutral;
  return <span style={{ fontFamily:D.body, fontWeight:600, fontSize:11, letterSpacing:'.06em', textTransform:'uppercase',
    padding:'4px 11px', borderRadius:999, background:t.bg, color:t.fg, boxShadow:t.box, display:'inline-flex', alignItems:'center', gap:6, whiteSpace:'nowrap', ...style }}>{children}</span>;
}

function Dot({ color, size=8, pulse }) {
  return <span style={{ position:'relative', display:'inline-block', width:size, height:size }}>
    <span style={{ position:'absolute', inset:0, borderRadius:'50%', background:color }} />
    {pulse && <span style={{ position:'absolute', inset:0, borderRadius:'50%', background:color, animation:'ringPulse 1.8s ease-out infinite' }} />}
  </span>;
}

/* ---------- mock data ---------- */
const PROGRAMS = ['Computer Engineering','Electrical Engineering','Intensive English','Technology Ventures'];
const YEARS = ['Freshman','Sophomore','Junior','Senior','Graduate'];
const FIRST = ['Aïssatou','Mamadou','Fatou','Ousmane','Awa','Cheikh','Mariama','Ibrahima','Khady','Moussa','Ndèye','Abdoulaye','Sokhna','Pape','Bineta','Modou','Rokhaya','Lamine','Astou','Babacar','Coumba','Serigne','Adama','Penda','Saliou','Dieynaba','Malick','Yacine','Souleymane','Mame'];
const LAST = ['Diop','Ndiaye','Fall','Sow','Ba','Sarr','Gueye','Diallo','Faye','Mbaye','Cissé','Sy','Niang','Diouf','Kane','Thiam','Sène','Camara','Touré','Seck','Dieng','Wade','Ndoye','Bâ','Gaye','Diagne'];

function makeStudents(n){
  const rnd = mulberry(20260529);
  const out = [];
  const used = new Set();
  for (let i=0;i<n;i++){
    let name;
    do { name = FIRST[Math.floor(rnd()*FIRST.length)] + ' ' + LAST[Math.floor(rnd()*LAST.length)]; } while (used.has(name) && used.size < FIRST.length*LAST.length);
    used.add(name);
    const id = 'DA' + (240000 + i*7 + Math.floor(rnd()*6)).toString();
    const plan = rnd() > 0.5 ? 'Annual' : 'Semester';
    const r = rnd();
    let status = 'active';
    if (r > 0.92) status = 'expired'; else if (r > 0.86) status = 'pending';
    out.push({
      id, name, program: PROGRAMS[Math.floor(rnd()*PROGRAMS.length)], year: YEARS[Math.floor(rnd()*YEARS.length)],
      plan, status,
      validUntil: plan==='Annual' ? '31 Aug 2026' : '15 Jun 2026',
      mealsToday: { breakfast: rnd()>0.4, lunch: rnd()>0.55, dinner: false },
      room: 'Block ' + 'ABCD'[Math.floor(rnd()*4)] + '-' + (100 + Math.floor(rnd()*120)),
    });
  }
  return out;
}
const STUDENTS = makeStudents(412);

/* curated demo cards for the scanner — explicit scenarios */
const SCAN_DEMO = [
  { ...STUDENTS[3],  name:'Aïssatou Diop',    id:'DA240021', plan:'Annual',   status:'active',  scenario:'ok' },
  { ...STUDENTS[7],  name:'Mamadou Ndiaye',   id:'DA240056', plan:'Semester', status:'active',  scenario:'ok' },
  { ...STUDENTS[12], name:'Fatou Sow',        id:'DA240088', plan:'Annual',   status:'active',  scenario:'already', mealsToday:{breakfast:true,lunch:true,dinner:false} },
  { ...STUDENTS[19], name:'Ousmane Fall',     id:'DA240103', plan:'Semester', status:'expired', validUntil:'15 Jan 2026', scenario:'expired' },
  { ...STUDENTS[24], name:'Awa Guèye',        id:'DA240147', plan:'Semester', status:'pending', scenario:'pending' },
  { ...STUDENTS[31], name:'Cheikh Ba',        id:'DA240199', plan:'Annual',   status:'active',  scenario:'ok' },
];

const MEALS = [
  { key:'breakfast', label:'Breakfast', fr:'Petit-déjeuner', window:'07:00 – 09:00', icon:'coffee' },
  { key:'lunch',     label:'Lunch',     fr:'Déjeuner',       window:'12:00 – 14:30', icon:'utensils' },
  { key:'dinner',    label:'Dinner',    fr:'Dîner',          window:'19:00 – 21:00', icon:'moon' },
];

/* weekend menu — a few dishes per meal */
const WEEKEND_MENU = {
  date: 'Saturday, 31 May 2026',
  meals: [
    { key:'lunch', label:'Lunch', window:'12:00 – 14:30', dishes:[
      { id:'thieb', name:'Thiéboudienne', fr:'Riz au poisson', price:2500, desc:'Senegal’s national dish — jollof-style fish & rice with vegetables.', tag:'Signature' },
      { id:'yassa', name:'Yassa Poulet', fr:'Poulet yassa', price:2000, desc:'Grilled chicken in caramelised onion & lemon sauce, white rice.', tag:'Popular' },
      { id:'maafe', name:'Mafé Bœuf', fr:'Mafé de bœuf', price:2200, desc:'Slow-cooked beef in groundnut (peanut) sauce, served with rice.', tag:'' },
      { id:'veg',   name:'Vegetable Bowl', fr:'Bol végétarien', price:1800, desc:'Seasonal vegetables, couscous & a citrus dressing.', tag:'Veg' },
    ]},
    { key:'dinner', label:'Dinner', window:'19:00 – 21:00', dishes:[
      { id:'dibi', name:'Dibi Agneau', fr:'Agneau grillé', price:3000, desc:'Char-grilled lamb with onions, mustard & attieke.', tag:'Signature' },
      { id:'cebu', name:'Soupou Kandia', fr:'Soupe gombo', price:2400, desc:'Okra & seafood stew over white rice.', tag:'' },
      { id:'pastel', name:'Pastels + Salade', fr:'Pastels & salade', price:1500, desc:'Fried fish pastries with house salad & sauce.', tag:'Light' },
    ]},
  ],
};

const ORDER_STATUS = {
  pending:   { label:'Awaiting payment', tone:'warn',    color:D.orange },
  paid:      { label:'Paid',             tone:'success',  color:D.success },
  preparing: { label:'Preparing',        tone:'navy',     color:D.navy },
  ready:     { label:'Ready for pickup', tone:'orange',   color:D.orange },
  collected: { label:'Collected',        tone:'neutral',  color:D.g500 },
};

function makeOrders(){
  const rnd = mulberry(77);
  const dishes = WEEKEND_MENU.meals.flatMap(m=>m.dishes);
  const statuses = ['paid','preparing','ready','collected','pending','paid','ready','preparing'];
  const out = [];
  for (let i=0;i<14;i++){
    const s = STUDENTS[Math.floor(rnd()*60)+5];
    const d = dishes[Math.floor(rnd()*dishes.length)];
    const qty = 1 + Math.floor(rnd()*2);
    out.push({
      code:'WK-' + (4200 + i*3),
      student:s, item:d, qty, total:d.price*qty,
      method: rnd()>0.5 ? 'Wave' : 'Orange Money',
      status: statuses[i % statuses.length],
      time: ['09:14','09:42','10:03','10:21','10:55','11:08','11:30','08:50','09:01','10:40','11:12','11:45','08:33','09:58'][i],
      meal: d.id==='dibi'||d.id==='cebu'||d.id==='pastel' ? 'Dinner' : 'Lunch',
    });
  }
  return out;
}
const ORDERS = makeOrders();

/* recent scans feed for scanner + admin live */
const RECENT_SCANS = [
  { name:'Bineta Sarr', id:'DA240208', ok:true, t:'12:48' },
  { name:'Modou Sy', id:'DA240231', ok:true, t:'12:47' },
  { name:'Rokhaya Niang', id:'DA240177', ok:false, t:'12:47', reason:'Already served' },
  { name:'Lamine Diouf', id:'DA240290', ok:true, t:'12:46' },
  { name:'Astou Kane', id:'DA240115', ok:true, t:'12:46' },
  { name:'Babacar Thiam', id:'DA240302', ok:true, t:'12:45' },
];

function currentMealKey(){
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 17) return 'lunch';
  return 'dinner';
}

/* ---------- finances ---------- */
const PLAN_PRICES = { Annual: 360000, Semester: 200000 };
const COST_PER_MEAL = 720;          // FCFA — food + operating cost per served meal
const FEES = { 'Wave': 0.01, 'Orange Money': 0.012, 'Bank transfer': 0, 'Cash': 0 };

/* aggregate term finances derived from STUDENTS */
function termFinances(){
  let planRevenue = 0, outstanding = 0;
  STUDENTS.forEach(s=>{
    const price = PLAN_PRICES[s.plan];
    if (s.status === 'active') planRevenue += price;
    else outstanding += price;
  });
  const weekendRevenue = 1860000;   // accumulated this term
  const mealsServedTerm = 84120;
  const foodCost = mealsServedTerm * COST_PER_MEAL;
  const revenue = planRevenue + weekendRevenue;
  return { planRevenue, weekendRevenue, outstanding, revenue, mealsServedTerm, foodCost, margin: revenue - foodCost };
}

/* monthly revenue trend (term: Jan–May 2026) */
const REV_TREND = [
  { m:'Jan', plan:38600000, weekend:280000 },
  { m:'Feb', plan:4200000,  weekend:412000 },
  { m:'Mar', plan:2100000,  weekend:388000 },
  { m:'Apr', plan:1600000,  weekend:421000 },
  { m:'May', plan:2800000,  weekend:359000 },
];

/* mobile-money settlement (uncollected balances awaiting payout) */
const SETTLEMENT = [
  { provider:'Wave',         color:'#1dc3ff', balance:642000, fee:6420,  account:'DAUST Dining · 77 488 25 15' },
  { provider:'Orange Money', color:'#ff7900', balance:418500, fee:5022,  account:'DAUST Dining · 78 120 44 90' },
];

const TXN_TYPES = {
  plan:    { label:'Meal plan', tone:'navy',    color:D.navy700, icon:'badge-check' },
  weekend: { label:'Weekend order', tone:'orange', color:D.orange, icon:'utensils' },
  refund:  { label:'Refund', tone:'danger',  color:D.danger, icon:'corner-up-left' },
};

function makeTransactions(){
  const rnd = mulberry(909);
  const methods = ['Wave','Orange Money','Bank transfer','Cash'];
  const out = [];
  const days = ['Today, 11:42','Today, 10:18','Today, 09:05','Yesterday, 19:22','Yesterday, 14:50','Yesterday, 12:08','27 May, 20:15','27 May, 13:30','27 May, 08:44','26 May, 19:51','26 May, 12:40','26 May, 09:12','25 May, 18:33','25 May, 13:02','24 May, 12:21','24 May, 09:48','23 May, 19:07','23 May, 12:55','22 May, 14:10','22 May, 08:39'];
  for (let i=0;i<days.length;i++){
    const s = STUDENTS[Math.floor(rnd()*120)+3];
    const roll = rnd();
    let type = 'weekend', amount, method, status='completed';
    if (roll > 0.8){ type='plan'; amount = rnd()>0.5?PLAN_PRICES.Semester:PLAN_PRICES.Annual; method = rnd()>0.5?'Bank transfer':(rnd()>0.5?'Wave':'Orange Money'); }
    else if (roll > 0.74){ type='refund'; amount = -[1500,2000,2500][Math.floor(rnd()*3)]; method='Wave'; status='refunded'; }
    else { type='weekend'; amount = [1500,1800,2000,2200,2400,2500,3000][Math.floor(rnd()*7)]; method = rnd()>0.5?'Wave':'Orange Money'; if (rnd()>0.9) status='pending'; }
    out.push({ id:'TXN-'+(90400+i*3), student:s, type, amount, method, status, when:days[i] });
  }
  return out;
}
const TRANSACTIONS = makeTransactions();

Object.assign(window, { PLAN_PRICES, COST_PER_MEAL, FEES, termFinances, REV_TREND, SETTLEMENT, TXN_TYPES, TRANSACTIONS });

Object.assign(window, {
  D, hashStr, mulberry, fcfa, fcfaShort, initials, cx, AVATAR_BG,
  Icon, TriDash, Avatar, QRCode, Pill, Dot,
  PROGRAMS, YEARS, STUDENTS, SCAN_DEMO, MEALS, WEEKEND_MENU, ORDER_STATUS, ORDERS, RECENT_SCANS, currentMealKey,
});
