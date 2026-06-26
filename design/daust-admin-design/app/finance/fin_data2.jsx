// ============================================================
// DAUST Admin — Finance data layer 2 (comprehensive)
// Treasury, grants, endowment, procurement, assets, fees,
// forecasting, petty cash, expense claims, refunds, tax (SYSCOHADA).
// Lazy-built to avoid script-order issues under in-browser Babel.
// ============================================================
window.buildFinanceData2 = function () {
  if (window.__finBuilt2) return;
  window.__finBuilt2 = true;
  function seeded(seed) { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
  const r = seeded(7).valueOf();
  const rng = (() => { let s = 7; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; })();
  const pick = a => a[Math.floor(rng() * a.length)];

  // ---------- TREASURY: bank accounts ----------
  const BANK_ACCOUNTS = [
    { id: 'BK-01', bank: 'CBAO Attijariwafa', label: 'Operating Account', number: 'SN012 01001 0042318745 21', currency: 'XOF', balance: 2_310_000_000, type: 'Current', glCode: '521000' },
    { id: 'BK-02', bank: 'Société Générale (SGBS)', label: 'Payroll Account', number: 'SN087 03220 0098112340 06', currency: 'XOF', balance: 486_200_000, type: 'Current', glCode: '521100' },
    { id: 'BK-03', bank: 'Bank of Africa (BOA)', label: 'Tuition Collections', number: 'SN045 02110 0073459901 88', currency: 'XOF', balance: 642_800_000, type: 'Current', glCode: '521200' },
    { id: 'BK-04', bank: 'Ecobank Senegal', label: 'Grants & Restricted', number: 'SN099 04550 0011223344 12', currency: 'XOF', balance: 1_284_500_000, type: 'Restricted', glCode: '521300' },
    { id: 'BK-05', bank: 'Citibank (USD)', label: 'Endowment / FX', number: 'US channel · USD', currency: 'USD', balance: 4_120_000_000, type: 'Investment', glCode: '521400' },
    { id: 'BK-06', bank: 'Orange Money', label: 'Mobile Money Wallet', number: 'Merchant 22107', currency: 'XOF', balance: 124_300_000, type: 'Wallet', glCode: '531000' },
    { id: 'BK-07', bank: 'Wave Business', label: 'Mobile Money Wallet', number: 'Merchant WV-8841', currency: 'XOF', balance: 60_200_000, type: 'Wallet', glCode: '531100' },
  ];
  // 30-day cash position projection (inflows/outflows)
  const CASH_POSITION = (() => {
    let bal = 3_700_000_000;
    return Array.from({ length: 30 }, (_, i) => {
      const inflow = 30_000_000 + Math.round(rng() * 120_000_000) + (i % 7 === 0 ? 180_000_000 : 0);
      const outflow = 40_000_000 + Math.round(rng() * 70_000_000) + (i === 2 ? 412_000_000 : 0); // payroll spike
      bal += inflow - outflow;
      return { day: i + 1, inflow, outflow, balance: bal };
    });
  })();
  const BANK_TRANSFERS = [
    { id: 'TRF-2041', from: 'CBAO Operating', to: 'SGBS Payroll', amount: 420_000_000, date: '2026-05-29', status: 'Pending', memo: 'May payroll funding', initiator: 'A. Faye' },
    { id: 'TRF-2040', from: 'BOA Collections', to: 'CBAO Operating', amount: 600_000_000, date: '2026-05-28', status: 'Cleared', memo: 'Sweep tuition collections', initiator: 'A. Faye' },
    { id: 'TRF-2039', from: 'Orange Money', to: 'CBAO Operating', amount: 96_000_000, date: '2026-05-27', status: 'Cleared', memo: 'Mobile money settlement', initiator: 'System' },
    { id: 'TRF-2038', from: 'CBAO Operating', to: 'Ecobank Restricted', amount: 140_000_000, date: '2026-05-24', status: 'Cleared', memo: 'Grant cost-share transfer', initiator: 'L. Senghor' },
    { id: 'TRF-2037', from: 'Wave Business', to: 'CBAO Operating', amount: 54_000_000, date: '2026-05-22', status: 'Cleared', memo: 'Wave settlement', initiator: 'System' },
  ];

  // ---------- GRANTS & RESTRICTED FUNDS ----------
  const GRANTS = [
    { id: 'GR-101', title: 'Smart Grid Research for West Africa', sponsor: 'World Bank', pi: 'Dr. M. Sow', award: 680_000_000, spent: 410_000_000, start: '2024-09', end: '2027-08', status: 'Active', school: 'Electrical Eng.', overhead: 15 },
    { id: 'GR-102', title: 'AI for Agriculture in the Sahel', sponsor: 'Mastercard Foundation', pi: 'Dr. K. Fall', award: 425_000_000, spent: 298_000_000, start: '2024-01', end: '2026-12', status: 'Active', school: 'Computer Science', overhead: 12 },
    { id: 'GR-103', title: 'Solar Desalination Pilot', sponsor: 'African Development Bank', pi: 'Dr. F. Sarr', award: 510_000_000, spent: 121_000_000, start: '2025-06', end: '2028-05', status: 'Active', school: 'Chemical Eng.', overhead: 18 },
    { id: 'GR-104', title: 'STEM Teacher Training Initiative', sponsor: 'USAID', pi: 'Dr. A. Diop', award: 240_000_000, spent: 240_000_000, start: '2023-09', end: '2025-12', status: 'Closing', school: 'Foundation', overhead: 10 },
    { id: 'GR-105', title: 'Petroleum Reservoir Modelling', sponsor: 'Petrosen (National)', pi: 'Dr. I. Bâ', award: 360_000_000, spent: 54_000_000, start: '2026-01', end: '2028-12', status: 'Active', school: 'Petroleum Eng.', overhead: 20 },
    { id: 'GR-106', title: 'Women in Engineering Fellowship', sponsor: 'EU Delegation', pi: 'Dr. B. Ndiaye', award: 180_000_000, spent: 96_000_000, start: '2025-01', end: '2026-12', status: 'Active', school: 'Engineering', overhead: 8 },
  ];

  // ---------- ENDOWMENT ----------
  const ENDOWMENT = {
    corpus: 8_650_000_000,
    marketValue: 9_240_000_000,
    ytdReturn: 6.8,
    spendingRate: 4.5,
    payoutYTD: 389_250_000,
    allocation: [
      { label: 'Global Equities', value: 42, color: '#153B6A' },
      { label: 'Fixed Income (UEMOA)', value: 28, color: '#ED8425' },
      { label: 'Real Assets', value: 16, color: '#2E7D52' },
      { label: 'Private / VC', value: 9, color: '#5B89C0' },
      { label: 'Cash', value: 5, color: '#9DA6AE' },
    ],
    history: [7_100, 7_400, 7_950, 8_200, 8_650, 9_240].map(v => v * 1e6),
    funds: [
      { name: 'General Endowment', value: 4_820_000_000, donor: 'Pooled', purpose: 'Unrestricted operations' },
      { name: 'Ndao Innovation Fund', value: 1_640_000_000, donor: 'Founder gift', purpose: 'Startup incubator' },
      { name: 'Diaspora Scholarship Corpus', value: 1_280_000_000, donor: 'Alumni network', purpose: 'Need-based aid' },
      { name: 'Sonatel Chair in CS', value: 910_000_000, donor: 'Sonatel Foundation', purpose: 'Endowed professorship' },
    ],
  };

  // ---------- PROCUREMENT: vendors, RFQs, contracts ----------
  const VENDORS = [
    { id: 'V-2001', name: 'Senelec', category: 'Utilities', contact: 'pro@senelec.sn', rating: 4.2, status: 'Approved', ytdSpend: 84_600_000, terms: 'Net 30' },
    { id: 'V-2002', name: 'Dell Technologies', category: 'IT & Equipment', contact: 'edu@dell.com', rating: 4.6, status: 'Approved', ytdSpend: 142_000_000, terms: 'Net 45' },
    { id: 'V-2003', name: 'Campus Catering SARL', category: 'Food Services', contact: 'ops@catering.sn', rating: 3.8, status: 'Approved', ytdSpend: 96_400_000, terms: 'Net 15' },
    { id: 'V-2004', name: 'BTP Construction', category: 'Construction', contact: 'devis@btp.sn', rating: 4.0, status: 'Review', ytdSpend: 218_000_000, terms: 'Milestone' },
    { id: 'V-2005', name: 'Elsevier', category: 'Library', contact: 'sales@elsevier.com', rating: 4.4, status: 'Approved', ytdSpend: 54_000_000, terms: 'Annual' },
    { id: 'V-2006', name: 'SafeGuard Security', category: 'Services', contact: 'contracts@safeguard.sn', rating: 4.1, status: 'Approved', ytdSpend: 72_300_000, terms: 'Net 30' },
    { id: 'V-2007', name: 'Sonatel Business', category: 'Telecom', contact: 'b2b@sonatel.sn', rating: 4.3, status: 'Approved', ytdSpend: 38_900_000, terms: 'Net 30' },
    { id: 'V-2008', name: 'Aqua Sen', category: 'Utilities', contact: 'compte@aquasen.sn', rating: 3.9, status: 'Suspended', ytdSpend: 12_400_000, terms: 'Net 15' },
  ];
  const RFQS = [
    { id: 'RFQ-340', title: 'Chemistry lab fume hoods (x6)', dept: 'Engineering Labs', bids: 4, lowest: 18_600_000, status: 'Evaluating', due: '2026-06-10' },
    { id: 'RFQ-339', title: 'Campus CCTV expansion', dept: 'Facilities', bids: 3, lowest: 31_200_000, status: 'Awarded', due: '2026-05-20' },
    { id: 'RFQ-338', title: 'Library e-resource bundle 2026/27', dept: 'Library', bids: 2, lowest: 47_500_000, status: 'Evaluating', due: '2026-06-05' },
    { id: 'RFQ-337', title: 'Shuttle bus (2x 30-seat)', dept: 'Operations', bids: 5, lowest: 64_000_000, status: 'Draft', due: '2026-06-18' },
  ];
  const CONTRACTS = [
    { id: 'CTR-88', vendor: 'SafeGuard Security', title: 'Campus security services', value: 144_000_000, start: '2025-01-01', end: '2026-12-31', status: 'Active', renewal: 'Auto' },
    { id: 'CTR-87', vendor: 'Campus Catering SARL', title: 'Dining hall operations', value: 192_000_000, start: '2024-09-01', end: '2026-08-31', status: 'Active', renewal: 'Tender' },
    { id: 'CTR-86', vendor: 'Sonatel Business', title: 'Internet & connectivity', value: 78_000_000, start: '2025-06-01', end: '2027-05-31', status: 'Active', renewal: 'Auto' },
    { id: 'CTR-85', vendor: 'Elsevier', title: 'ScienceDirect subscription', value: 54_000_000, start: '2026-01-01', end: '2026-12-31', status: 'Expiring', renewal: 'Review' },
  ];

  // ---------- EXPENSE CLAIMS & PETTY CASH ----------
  const EXPENSE_CLAIMS = [
    { id: 'EXP-512', staff: 'Dr. A. Diop', dept: 'Computer Science', purpose: 'IEEE conference — Lagos', amount: 1_240_000, date: '2026-05-21', status: 'Pending', stage: 'Dept Head' },
    { id: 'EXP-511', staff: 'K. Mbaye', dept: 'Admissions', purpose: 'Recruitment fair (Abidjan)', amount: 685_000, date: '2026-05-19', status: 'Pending', stage: 'Finance' },
    { id: 'EXP-510', staff: 'Dr. M. Sow', dept: 'Electrical Eng.', purpose: 'Lab consumables', amount: 420_000, date: '2026-05-18', status: 'Approved', stage: 'Paid' },
    { id: 'EXP-509', staff: 'P. Sarr', dept: 'Academics', purpose: 'Student field trip', amount: 940_000, date: '2026-05-16', status: 'Pending', stage: 'Director' },
    { id: 'EXP-508', staff: 'A. Ndiaye', dept: 'Facilities', purpose: 'Emergency plumbing parts', amount: 215_000, date: '2026-05-14', status: 'Rejected', stage: 'Dept Head' },
  ];
  const PETTY_CASH = {
    float: 2_000_000, balance: 642_500, custodian: 'M. Diouf (Front Office)',
    transactions: [
      { id: 'PC-1180', date: '2026-05-28', desc: 'Office supplies — printer toner', amount: 48_000, category: 'Supplies' },
      { id: 'PC-1179', date: '2026-05-27', desc: 'Guest refreshments — board visit', amount: 65_000, category: 'Hospitality' },
      { id: 'PC-1178', date: '2026-05-26', desc: 'Taxi — bank deposit run', amount: 12_000, category: 'Transport' },
      { id: 'PC-1177', date: '2026-05-24', desc: 'Postage & courier', amount: 34_500, category: 'Postage' },
      { id: 'PC-1176', date: '2026-05-23', desc: 'First-aid kit refill', amount: 28_000, category: 'Supplies' },
      { id: 'PC-1175', date: '2026-05-22', desc: 'Cleaning materials', amount: 41_000, category: 'Facilities' },
    ],
  };

  // ---------- REFUNDS & CREDIT NOTES ----------
  const REFUNDS = (() => {
    const S = window.STUDENTS;
    return [
      { id: 'CN-2026-118', student: S[2].name, studentId: S[2].id, type: 'Credit Note', reason: 'Course withdrawal — pro-rata', amount: 642_000, date: '2026-05-26', status: 'Approved', stage: 'Finance' },
      { id: 'CN-2026-117', student: S[5].name, studentId: S[5].id, type: 'Refund', reason: 'Overpayment (duplicate)', amount: 1_925_000, date: '2026-05-24', status: 'Pending', stage: 'Director' },
      { id: 'CN-2026-116', student: S[8].name, studentId: S[8].id, type: 'Refund', reason: 'Scholarship applied after payment', amount: 770_000, date: '2026-05-21', status: 'Paid', stage: 'Paid' },
      { id: 'CN-2026-115', student: S[11].name, studentId: S[11].id, type: 'Credit Note', reason: 'Housing not taken up', amount: 480_000, date: '2026-05-18', status: 'Pending', stage: 'Finance' },
    ];
  })();

  // ---------- FEE STRUCTURE ----------
  const FEE_ITEMS = [
    { id: 'FEE-TUI', name: 'Tuition (base, per year)', category: 'Tuition', amount: null, perProgram: true, mandatory: true, gl: '706100' },
    { id: 'FEE-APP', name: 'Application fee', category: 'Admissions', amount: 25_000, perProgram: false, mandatory: true, gl: '706200' },
    { id: 'FEE-REG', name: 'Registration fee (per term)', category: 'Registration', amount: 75_000, perProgram: false, mandatory: true, gl: '706300' },
    { id: 'FEE-LAB', name: 'Lab & technology fee', category: 'Academic', amount: 180_000, perProgram: false, mandatory: true, gl: '706400' },
    { id: 'FEE-LIB', name: 'Library & resources', category: 'Academic', amount: 45_000, perProgram: false, mandatory: true, gl: '706500' },
    { id: 'FEE-HOU', name: 'Housing (per term)', category: 'Auxiliary', amount: 420_000, perProgram: false, mandatory: false, gl: '706600' },
    { id: 'FEE-INS', name: 'Student insurance', category: 'Services', amount: 60_000, perProgram: false, mandatory: true, gl: '706700' },
    { id: 'FEE-GRAD', name: 'Graduation fee', category: 'Services', amount: 90_000, perProgram: false, mandatory: false, gl: '706800' },
  ];

  // ---------- FORECASTING / SCENARIOS ----------
  const FORECAST_YEARS = ['FY24', 'FY25', 'FY26', 'FY27e', 'FY28e', 'FY29e'];
  const FORECAST = {
    revenue: [4_980, 5_640, 6_292, 7_010, 7_820, 8_640].map(v => v * 1e6),
    expense: [4_410, 4_980, 5_540, 6_120, 6_720, 7_280].map(v => v * 1e6),
    enrollment: [1180, 1320, 1486, 1640, 1820, 2010],
  };
  const SCENARIOS = [
    { id: 'base', name: 'Base case', enrollGrowth: 10, tuitionGrowth: 4, fy29Surplus: 1_360_000_000, color: '#153B6A', active: true },
    { id: 'optimistic', name: 'Growth (new programs)', enrollGrowth: 16, tuitionGrowth: 5, fy29Surplus: 2_240_000_000, color: '#2E7D52', active: false },
    { id: 'conservative', name: 'Conservative', enrollGrowth: 5, tuitionGrowth: 3, fy29Surplus: 680_000_000, color: '#ED8425', active: false },
    { id: 'stress', name: 'Stress (FX + aid shock)', enrollGrowth: 2, tuitionGrowth: 2, fy29Surplus: -180_000_000, color: '#C0392B', active: false },
  ];

  // ---------- FIXED ASSETS (SYSCOHADA class 2) ----------
  const ASSET_CATEGORIES = [
    { cat: 'Buildings & Structures', gl: '231000', life: 25, color: '#153B6A' },
    { cat: 'Lab Equipment', gl: '241100', life: 8, color: '#ED8425' },
    { cat: 'IT & Computers', gl: '244100', life: 4, color: '#5B89C0' },
    { cat: 'Furniture & Fixtures', gl: '244400', life: 10, color: '#2E7D52' },
    { cat: 'Vehicles', gl: '245000', life: 6, color: '#9DA6AE' },
  ];
  const ASSETS = [
    { id: 'FA-0001', name: 'Academic Block C', cat: 'Buildings & Structures', acquired: '2019-03', cost: 3_200_000_000, accumDep: 921_600_000, status: 'In service' },
    { id: 'FA-0042', name: 'HPC Cluster (Engineering)', cat: 'IT & Computers', acquired: '2024-01', cost: 142_000_000, accumDep: 88_750_000, status: 'In service' },
    { id: 'FA-0058', name: 'Fume Hoods — Chem Lab', cat: 'Lab Equipment', acquired: '2023-09', cost: 64_000_000, accumDep: 21_333_000, status: 'In service' },
    { id: 'FA-0061', name: 'Lecture Hall A/V System', cat: 'IT & Computers', acquired: '2025-02', cost: 38_000_000, accumDep: 11_875_000, status: 'In service' },
    { id: 'FA-0070', name: 'Campus Shuttle Bus #1', cat: 'Vehicles', acquired: '2022-06', cost: 42_000_000, accumDep: 27_300_000, status: 'In service' },
    { id: 'FA-0084', name: 'Library Furniture Set', cat: 'Furniture & Fixtures', acquired: '2021-08', cost: 28_000_000, accumDep: 13_300_000, status: 'In service' },
    { id: 'FA-0091', name: 'Standby Generator 500kVA', cat: 'Lab Equipment', acquired: '2020-11', cost: 86_000_000, accumDep: 59_125_000, status: 'In service' },
    { id: 'FA-0103', name: 'Server Storage Array', cat: 'IT & Computers', acquired: '2026-04', cost: 24_000_000, accumDep: 1_000_000, status: 'New' },
  ];

  // ---------- TAX & STATUTORY (Senegal) ----------
  const TAX_FILINGS = [
    { id: 'TVA-2026-05', name: 'TVA (VAT) — May 2026', authority: 'DGID', base: 84_200_000, rate: '18%', amount: 15_156_000, due: '2026-06-15', status: 'Pending' },
    { id: 'IR-2026-05', name: 'IR salaries (PAYE) — May', authority: 'DGID', base: 412_800_000, rate: 'Barème', amount: 78_432_000, due: '2026-06-15', status: 'Pending' },
    { id: 'IPRES-2026-05', name: 'IPRES pension — May', authority: 'IPRES', base: 412_800_000, rate: '14% (8.4+5.6)', amount: 57_792_000, due: '2026-06-10', status: 'Pending' },
    { id: 'CSS-2026-05', name: 'CSS social security — May', authority: 'CSS', base: 412_800_000, rate: '7%', amount: 28_896_000, due: '2026-06-10', status: 'Pending' },
    { id: 'TVA-2026-04', name: 'TVA (VAT) — April 2026', authority: 'DGID', base: 78_900_000, rate: '18%', amount: 14_202_000, due: '2026-05-15', status: 'Filed' },
    { id: 'IR-2026-04', name: 'IR salaries (PAYE) — April', authority: 'DGID', base: 408_900_000, rate: 'Barème', amount: 77_691_000, due: '2026-05-15', status: 'Filed' },
  ];

  // ---------- PERIOD CLOSE CHECKLIST ----------
  const CLOSE_TASKS = [
    { id: 1, task: 'Reconcile all bank accounts', owner: 'A. Faye', done: true },
    { id: 2, task: 'Post & sweep mobile money clearing', owner: 'System', done: true },
    { id: 3, task: 'Accrue May payroll & deductions', owner: 'K. Mbaye', done: true },
    { id: 4, task: 'Record depreciation (monthly)', owner: 'A. Faye', done: true },
    { id: 5, task: 'Match & approve vendor bills', owner: 'A. Faye', done: false },
    { id: 6, task: 'Review grant cost allocations', owner: 'Grants Office', done: false },
    { id: 7, task: 'Recognise deferred tuition revenue', owner: 'A. Faye', done: false },
    { id: 8, task: 'Prepare TVA & IR filings', owner: 'Tax Desk', done: false },
    { id: 9, task: 'Director review & sign-off', owner: 'L. Senghor', done: false },
  ];

  // ---------- RECURRING JOURNALS ----------
  const RECURRING = [
    { id: 'REC-01', desc: 'Monthly depreciation', schedule: 'Monthly · 28th', amount: 41_200_000, debit: '681000 Dep. expense', credit: '281000 Accum. dep.', next: '2026-06-28', active: true },
    { id: 'REC-02', desc: 'Rent — admin annex', schedule: 'Monthly · 1st', amount: 3_800_000, debit: '622000 Rent', credit: '401000 A/P', next: '2026-06-01', active: true },
    { id: 'REC-03', desc: 'Insurance amortization', schedule: 'Monthly · 1st', amount: 1_650_000, debit: '625000 Insurance', credit: '486000 Prepaid', next: '2026-06-01', active: true },
    { id: 'REC-04', desc: 'Deferred tuition recognition', schedule: 'Monthly · 30th', amount: 123_400_000, debit: '419000 Deferred rev.', credit: '706100 Tuition', next: '2026-05-30', active: true },
    { id: 'REC-05', desc: 'Internet & connectivity', schedule: 'Monthly · 5th', amount: 6_500_000, debit: '626000 Telecom', credit: '401000 A/P', next: '2026-06-05', active: false },
  ];

  // ---------- BANK RECONCILIATION (matching) ----------
  const RECON = {
    account: 'CBAO Operating (521000)', statementBal: 2_318_400_000, bookBal: 2_310_000_000,
    items: [
      { id: 'RC-1', date: '2026-05-28', desc: 'Tuition batch — Orange Money', bank: 38_400_000, book: 38_400_000, matched: true },
      { id: 'RC-2', date: '2026-05-28', desc: 'Salary advance — Dr. Sow', bank: -420_000, book: -420_000, matched: true },
      { id: 'RC-3', date: '2026-05-27', desc: 'Bank charges', bank: -185_000, book: 0, matched: false },
      { id: 'RC-4', date: '2026-05-27', desc: 'Interest income', bank: 642_000, book: 0, matched: false },
      { id: 'RC-5', date: '2026-05-26', desc: 'Vendor cheque #4471 (uncleared)', bank: 0, book: -7_580_000, matched: false },
      { id: 'RC-6', date: '2026-05-26', desc: 'Senelec direct debit', bank: -8_600_000, book: -8_600_000, matched: true },
    ],
  };

  // ---------- BUDGET versions & encumbrances ----------
  const BUDGET_VERSIONS = [
    { id: 'v3', name: 'FY26 — Revised (Q3)', date: '2026-04-01', total: 5_580_000_000, status: 'Active', author: 'L. Senghor' },
    { id: 'v2', name: 'FY26 — Mid-year revision', date: '2026-01-15', total: 5_420_000_000, status: 'Superseded', author: 'A. Faye' },
    { id: 'v1', name: 'FY26 — Original approved', date: '2025-08-20', total: 5_240_000_000, status: 'Superseded', author: 'Board' },
  ];
  const ENCUMBRANCES = [
    { id: 'ENC-301', desc: 'PO-9102 Dell lab workstations', category: 'IT & Systems', amount: 12_400_000, po: 'PO-9102', status: 'Committed' },
    { id: 'ENC-302', desc: 'CTR-88 Security services (remaining)', category: 'Operations', amount: 72_000_000, po: 'CTR-88', status: 'Committed' },
    { id: 'ENC-303', desc: 'RFQ-339 CCTV expansion', category: 'Facilities & Labs', amount: 31_200_000, po: 'RFQ-339', status: 'Pending' },
    { id: 'ENC-304', desc: 'PO-9107 Chemistry reagents', category: 'Research Grants', amount: 7_650_000, po: 'PO-9107', status: 'Committed' },
  ];

  Object.assign(window, {
    BANK_ACCOUNTS, CASH_POSITION, BANK_TRANSFERS, GRANTS, ENDOWMENT, VENDORS, RFQS, CONTRACTS,
    EXPENSE_CLAIMS, PETTY_CASH, REFUNDS, FEE_ITEMS, FORECAST_YEARS, FORECAST, SCENARIOS,
    ASSET_CATEGORIES, ASSETS, TAX_FILINGS, CLOSE_TASKS, RECURRING, RECON, BUDGET_VERSIONS, ENCUMBRANCES,
  });
};
