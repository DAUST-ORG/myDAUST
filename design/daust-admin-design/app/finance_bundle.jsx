// ===== DAUST Finance bundle (concatenated IIFE modules) =====

// ---------- fin_data ----------
// ============================================================
// DAUST Admin — extended Finance data
// Builds on window.STUDENTS / STAFF / PROGRAMS / FINANCE from data.jsx
// Senegal context: FCFA, IPRES pension, IR income tax, mobile money
// ============================================================
// Lazy builder: runs at first Finance render (after data.jsx has executed),
// so it never depends on script execution order under in-browser Babel.
window.buildFinanceData = function () {
  if (window.__finBuilt) return;
  window.__finBuilt = true;
  function seeded(seed) { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
  const r = seeded(1337);
  const pick = a => a[Math.floor(r() * a.length)];
  const S = window.STUDENTS, STAFF = window.STAFF, PROGRAMS = window.PROGRAMS;

  // ---- Incoming payment transactions (cash receipts) ----
  const METHODS = ['Orange Money', 'Wave', 'Bank Transfer', 'Card', 'Cash'];
  const TRANSACTIONS = Array.from({ length: 26 }, (_, i) => {
    const st = S[Math.floor(r() * S.length)];
    const amt = pick([1925000, 962500, 481250, 2125000, 1450000, 725000, 1925000]);
    const status = pick(['Cleared', 'Cleared', 'Cleared', 'Pending', 'Failed']);
    const method = pick(METHODS);
    const day = 1 + Math.floor(r() * 28);
    return {
      id: 'TXN-' + (88200 + i),
      date: '2026-05-' + String(day).padStart(2, '0'),
      student: st.name, studentId: st.id,
      amount: amt, method, status,
      ref: method === 'Orange Money' ? 'OM' + (700000 + Math.floor(r() * 99999)) : method === 'Wave' ? 'WV' + (500000 + Math.floor(r() * 99999)) : method === 'Bank Transfer' ? 'CBAO-' + (40000 + Math.floor(r() * 9999)) : 'VISA-' + (1000 + Math.floor(r() * 8999)),
      reconciled: status === 'Cleared' ? r() > 0.25 : false,
      type: pick(['Tuition', 'Tuition', 'Tuition', 'Housing', 'Lab fee', 'Application fee']),
    };
  }).sort((a, b) => b.date.localeCompare(a.date));

  // ---- AR aging ----
  const AR_AGING = [
    { bucket: 'Current', amount: 412_000_000, count: 286, color: '#10B981' },
    { bucket: '1–30 days', amount: 318_500_000, count: 142, color: '#153B6A' },
    { bucket: '31–60 days', amount: 184_900_000, count: 73, color: '#F59E0B' },
    { bucket: '61–90 days', amount: 96_000_000, count: 38, color: '#F97316' },
    { bucket: '90+ days', amount: 43_000_000, count: 19, color: '#EF4444' },
  ];

  // ---- Payment plans ----
  const PAYMENT_PLANS = Array.from({ length: 8 }, (_, i) => {
    const st = S[(i * 3) % S.length];
    const total = pick([3850000, 4250000, 3950000]);
    const inst = pick([3, 4, 6]);
    const paid = Math.floor(r() * inst);
    return {
      id: 'PLAN-' + (220 + i), student: st.name, studentId: st.id, program: st.program,
      total, installments: inst, paid, perInstallment: Math.round(total / inst),
      nextDue: '2026-06-' + String(5 + i).padStart(2, '0'),
      status: paid === 0 ? 'Behind' : paid >= inst - 1 ? 'On track' : 'Active',
    };
  });

  // ---- Holds ----
  const HOLDS = S.filter(s => s.balance > 1_000_000).slice(0, 6).map(s => ({
    student: s.name, studentId: s.id, program: s.program, balance: s.balance,
    reason: 'Outstanding tuition', placed: '2026-0' + (3 + (s.id.charCodeAt(4) % 2)) + '-15', blocks: pick(['Registration', 'Transcript', 'Registration + Transcript']),
  }));

  // ---- Vendors / Payables (bills) ----
  const VENDOR_NAMES = ['Senelec (Utilities)', 'Sonatel Business', 'Campus Catering SARL', 'Dell Technologies', 'Elsevier Journals', 'BTP Construction', 'Aqua Sen Water', 'SafeGuard Security', 'Office Plus Dakar', 'CleanCo Services'];
  const BILLS = Array.from({ length: 14 }, (_, i) => {
    const vendor = VENDOR_NAMES[i % VENDOR_NAMES.length];
    const amt = pick([2_400_000, 8_600_000, 1_250_000, 14_800_000, 4_300_000, 920_000, 6_750_000]);
    const status = pick(['Paid', 'Approved', 'Pending', 'Pending', 'Overdue']);
    return {
      id: 'BILL-' + (3400 + i), vendor,
      category: pick(['Utilities', 'IT & Equipment', 'Facilities', 'Services', 'Library', 'Construction']),
      amount: amt, status, po: 'PO-' + (9100 + i),
      due: '2026-06-' + String(2 + i).padStart(2, '0'),
      approver: status === 'Pending' ? '—' : pick(['A. Faye', 'L. Senghor']),
    };
  });

  // ---- Purchase orders ----
  const PURCHASE_ORDERS = Array.from({ length: 8 }, (_, i) => ({
    id: 'PO-' + (9100 + i), vendor: VENDOR_NAMES[(i + 2) % VENDOR_NAMES.length],
    desc: pick(['Lab workstations', 'Lecture hall A/V upgrade', 'Library subscriptions renewal', 'Generator maintenance', 'Network switches', 'Furniture — Block C', 'Chemistry reagents', 'Server storage expansion']),
    amount: pick([5_200_000, 12_400_000, 3_100_000, 22_800_000, 7_650_000]),
    status: pick(['Open', 'Approved', 'Received', 'Pending']),
    dept: pick(['IT & Systems', 'Facilities', 'Library', 'Engineering Labs']),
    raised: '2026-05-' + String(4 + i).padStart(2, '0'),
  }));

  // ---- Reimbursements ----
  const REIMBURSEMENTS = [
    { id: 'REI-411', staff: 'Dr. A. Diop', desc: 'Conference travel — IEEE Lagos', amount: 1_240_000, status: 'Pending', date: '2026-05-21' },
    { id: 'REI-412', staff: 'K. Mbaye', desc: 'Recruitment fair materials', amount: 385_000, status: 'Approved', date: '2026-05-19' },
    { id: 'REI-413', staff: 'Dr. M. Sow', desc: 'Lab consumables (advance)', amount: 620_000, status: 'Paid', date: '2026-05-12' },
    { id: 'REI-414', staff: 'P. Sarr', desc: 'Student field trip transport', amount: 940_000, status: 'Pending', date: '2026-05-24' },
  ];

  // ---- Payslip deductions for a staff member (Senegal) ----
  function payslip(emp) {
    const gross = emp.salary;
    const ipres = Math.round(gross * 0.056);      // employee pension
    const css = Math.round(gross * 0.07);          // social security (employer side shown for info)
    const taxable = gross - ipres;
    const ir = Math.round(taxable * (gross > 1_200_000 ? 0.23 : gross > 800_000 ? 0.18 : 0.12)); // simplified IR
    const net = gross - ipres - ir;
    return { gross, ipres, css, ir, net };
  }
  const PAYROLL_TOTALS = (() => {
    let gross = 0, ipres = 0, ir = 0, net = 0;
    STAFF.forEach(e => { const p = payslip(e); gross += p.gross; ipres += p.ipres; ir += p.ir; net += p.net; });
    // scale to full 142 employees
    const factor = 142 / STAFF.length;
    return { gross: gross * factor, ipres: ipres * factor, ir: ir * factor, net: net * factor, count: 142 };
  })();

  // ---- Financial aid / scholarships ----
  const SCHOLARSHIPS = [
    { id: 'SCH-01', name: 'Presidential Merit Scholarship', type: 'Merit', recipients: 42, perAward: 1_925_000, total: 80_850_000, coverage: '50% tuition', color: '#153B6A' },
    { id: 'SCH-02', name: 'STEM Excellence Grant', type: 'Merit', recipients: 28, perAward: 1_540_000, total: 43_120_000, coverage: '40% tuition', color: '#0EA5E9' },
    { id: 'SCH-03', name: 'Need-Based Aid Fund', type: 'Need', recipients: 96, perAward: 962_500, total: 92_400_000, coverage: '25% tuition', color: '#8B5CF6' },
    { id: 'SCH-04', name: 'Women in Engineering', type: 'Targeted', recipients: 34, perAward: 1_925_000, total: 65_450_000, coverage: '50% tuition', color: '#EC4899' },
    { id: 'SCH-05', name: 'Regional Access Waiver', type: 'Waiver', recipients: 51, perAward: 770_000, total: 39_270_000, coverage: '20% tuition', color: '#F97316' },
  ];
  const AID_DISBURSEMENTS = [
    { term: 'Fall 2025', budgeted: 460_000_000, disbursed: 460_000_000, status: 'Closed' },
    { term: 'Spring 2026', budgeted: 520_000_000, disbursed: 321_090_000, status: 'In progress' },
    { term: 'Summer 2026', budgeted: 80_000_000, disbursed: 0, status: 'Scheduled' },
  ];

  // ---- Chart of accounts ----
  const ACCOUNTS = [
    { code: '1000', name: 'Cash — CBAO Operating', type: 'Asset', balance: 2_310_000_000 },
    { code: '1010', name: 'Cash — Mobile Money Clearing', type: 'Asset', balance: 184_500_000 },
    { code: '1200', name: 'Accounts Receivable — Tuition', type: 'Asset', balance: 1_054_400_000 },
    { code: '1500', name: 'Property & Equipment', type: 'Asset', balance: 6_240_000_000 },
    { code: '1600', name: 'Endowment Investments', type: 'Asset', balance: 8_650_000_000 },
    { code: '2000', name: 'Accounts Payable', type: 'Liability', balance: 286_400_000 },
    { code: '2100', name: 'Payroll Liabilities (IPRES/IR)', type: 'Liability', balance: 96_800_000 },
    { code: '2300', name: 'Deferred Tuition Revenue', type: 'Liability', balance: 740_000_000 },
    { code: '3000', name: 'Net Assets — Unrestricted', type: 'Equity', balance: 9_120_000_000 },
    { code: '3100', name: 'Net Assets — Restricted', type: 'Equity', balance: 8_650_000_000 },
    { code: '4000', name: 'Tuition & Fees Revenue', type: 'Revenue', balance: 5_240_000_000 },
    { code: '4200', name: 'Grants & Contracts', type: 'Revenue', balance: 640_000_000 },
    { code: '4300', name: 'Auxiliary (Housing) Revenue', type: 'Revenue', balance: 412_000_000 },
    { code: '5000', name: 'Salaries & Benefits', type: 'Expense', balance: 2_640_000_000 },
    { code: '5200', name: 'Facilities & Utilities', type: 'Expense', balance: 1_120_000_000 },
    { code: '5400', name: 'Financial Aid', type: 'Expense', balance: 980_000_000 },
    { code: '5600', name: 'Supplies & Services', type: 'Expense', balance: 520_000_000 },
  ];

  // ---- Journal entries ----
  const JOURNAL = [
    { id: 'JE-2026-0512', date: '2026-05-28', desc: 'Tuition receipts — batch settlement', debit: '1000 Cash', credit: '1200 A/R Tuition', amount: 38_400_000, posted: true },
    { id: 'JE-2026-0511', date: '2026-05-28', desc: 'Orange Money clearing sweep', debit: '1000 Cash', credit: '1010 Mobile Money', amount: 12_600_000, posted: true },
    { id: 'JE-2026-0510', date: '2026-05-27', desc: 'May payroll accrual', debit: '5000 Salaries', credit: '2100 Payroll Liab.', amount: 412_800_000, posted: true },
    { id: 'JE-2026-0509', date: '2026-05-26', desc: 'Senelec electricity — May', debit: '5200 Facilities', credit: '2000 A/P', amount: 8_600_000, posted: true },
    { id: 'JE-2026-0508', date: '2026-05-25', desc: 'Merit scholarship disbursement', debit: '5400 Financial Aid', credit: '1000 Cash', amount: 24_000_000, posted: true },
    { id: 'JE-2026-0507', date: '2026-05-24', desc: 'Lab equipment — Dell PO-9102', debit: '1500 Equipment', credit: '2000 A/P', amount: 14_800_000, posted: false },
    { id: 'JE-2026-0506', date: '2026-05-23', desc: 'Housing fees — Block A', debit: '1000 Cash', credit: '4300 Auxiliary Rev.', amount: 6_200_000, posted: true },
  ];

  Object.assign(window, {
    TRANSACTIONS, AR_AGING, PAYMENT_PLANS, HOLDS, BILLS, PURCHASE_ORDERS, REIMBURSEMENTS,
    payslip, PAYROLL_TOTALS, SCHOLARSHIPS, AID_DISBURSEMENTS, ACCOUNTS, JOURNAL,
  });
};


// ---------- fin_data2 ----------
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


// ---------- fin_shared ----------
// ============================================================
// DAUST Admin — Finance shared helpers
// ============================================================
(function () {
  const { useState } = React;

  // status -> tone for finance everywhere
  const FIN_TONE = {
    Paid: 'success', Cleared: 'success', Approved: 'info', 'On track': 'success', Active: 'teal',
    Pending: 'warning', 'In progress': 'info', Scheduled: 'neutral', Received: 'success', Open: 'info',
    Overdue: 'error', Failed: 'error', Behind: 'error', 'On Hold': 'error', Closed: 'neutral', Partial: 'info', Posted: 'success', Draft: 'neutral',
  };
  function FinStatus({ status }) {
    return <window.Badge tone={FIN_TONE[status] || 'neutral'} size="sm">{status}</window.Badge>;
  }

  const METHOD_ICON = { 'Orange Money': 'smartphone', 'Wave': 'smartphone', 'Bank Transfer': 'building-2', 'Card': 'credit-card', 'Cash': 'banknote' };
  const METHOD_COLOR = { 'Orange Money': '#F97316', 'Wave': '#0EA5E9', 'Bank Transfer': '#153B6A', 'Card': '#8B5CF6', 'Cash': '#64748B' };
  function MethodTag({ method }) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--fg-muted)' }}>
        <span style={{ width: 22, height: 22, borderRadius: 6, background: `color-mix(in srgb, ${METHOD_COLOR[method]} 14%, var(--surface))`, color: METHOD_COLOR[method], display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <window.Icon name={METHOD_ICON[method] || 'circle'} size={13} />
        </span>{method}
      </span>
    );
  }

  // Stacked horizontal aging bar
  function AgingBar({ data, height = 14 }) {
    const total = data.reduce((a, d) => a + d.amount, 0) || 1;
    return (
      <div style={{ display: 'flex', width: '100%', height, borderRadius: 999, overflow: 'hidden', gap: 2 }}>
        {data.map(d => (
          <div key={d.bucket} title={`${d.bucket}: ${window.fmtFCFA(d.amount)} FCFA`} style={{ width: (d.amount / total * 100) + '%', background: d.color }} />
        ))}
      </div>
    );
  }

  // Section panel with title
  function Panel({ title, action, children, pad = 22, style }) {
    return (
      <window.Card padding={pad} style={style}>
        {(title || action) && <window.SectionTitle action={action}>{title}</window.SectionTitle>}
        {children}
      </window.Card>
    );
  }

  // KV row for drawers
  function KV({ label, value, mono, strong }) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--divider)', fontSize: 13.5 }}>
        <span style={{ color: 'var(--fg-subtle)' }}>{label}</span>
        <span style={{ color: 'var(--fg)', fontWeight: strong ? 700 : 600, fontFamily: mono ? 'var(--font-mono)' : 'inherit' }}>{value}</span>
      </div>
    );
  }

  // Toolbar (search + filters + actions)
  function Toolbar({ children }) {
    return <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>{children}</div>;
  }

  Object.assign(window, { FinStatus, MethodTag, AgingBar, Panel, KV, Toolbar, FIN_TONE, METHOD_COLOR });
})();


// ---------- fin_shared2 ----------
// ============================================================
// DAUST Admin — Finance shared helpers 2
// Multi-level approval chain, FX, mini components used across clusters.
// ============================================================
(function () {
  const { useState } = React;

  // Multi-level approval chain visual: Initiator → Dept Head → Finance → Director
  // `stage` is the CURRENT pending stage label, or 'Paid'/'Approved'/'Rejected' when finished.
  const CHAIN = ['Initiator', 'Dept Head', 'Finance', 'Director'];
  function ApprovalChain({ stage, rejected, compact }) {
    // determine index reached
    const done = rejected ? -1 : (stage === 'Paid' || stage === 'Approved' || stage === 'Complete') ? CHAIN.length : CHAIN.indexOf(stage);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 4 : 8, flexWrap: 'wrap' }}>
        {CHAIN.map((s, i) => {
          const complete = i < done;
          const current = i === done;
          const bad = rejected && i === CHAIN.length - 1;
          const color = bad ? 'var(--error-500)' : complete ? 'var(--success-500)' : current ? 'var(--cta)' : 'var(--border-strong)';
          return (
            <React.Fragment key={s}>
              <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 5 : 7 }}>
                <span style={{ width: compact ? 18 : 22, height: compact ? 18 : 22, borderRadius: '50%', flexShrink: 0,
                  background: complete ? 'var(--success-500)' : current ? 'var(--cta)' : 'transparent',
                  border: complete || current ? 'none' : '1.5px solid var(--border-strong)',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {complete ? <window.Icon name="check" size={compact ? 11 : 13} />
                    : current ? <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />
                    : <span style={{ fontSize: 10, color: 'var(--fg-faint)', fontWeight: 700 }}>{i + 1}</span>}
                </span>
                {!compact && <span style={{ fontSize: 12, fontWeight: current ? 700 : 500, color: current ? 'var(--fg)' : 'var(--fg-subtle)', whiteSpace: 'nowrap' }}>{s}</span>}
              </div>
              {i < CHAIN.length - 1 && <span style={{ width: compact ? 12 : 22, height: 2, background: i < done ? 'var(--success-500)' : 'var(--divider)', borderRadius: 2 }} />}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  // Threshold note for spend approvals
  function ThresholdNote({ amount }) {
    const lvl = amount >= 20_000_000 ? 'Director + Board' : amount >= 5_000_000 ? 'Director sign-off' : amount >= 1_000_000 ? 'Finance approval' : 'Dept Head only';
    const tone = amount >= 20_000_000 ? 'error' : amount >= 5_000_000 ? 'warning' : 'info';
    return <window.Badge tone={tone} dot={false} size="sm">{lvl}</window.Badge>;
  }

  // Big number tile (SYSCOHADA-style metric)
  function Metric({ label, value, sub, tone, icon }) {
    const c = { up: 'var(--success-500)', down: 'var(--error-500)', cta: 'var(--cta)', accent: 'var(--accent)' }[tone] || 'var(--fg)';
    return (
      <window.Card padding={18} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--fg-subtle)', fontWeight: 600 }}>{label}</span>
          {icon && <window.Icon name={icon} size={16} style={{ color: 'var(--fg-faint)' }} />}
        </div>
        <div style={{ fontSize: 23, fontWeight: 800, fontFamily: 'var(--font-display)', letterSpacing: '0.01em', color: c }}>{value}</div>
        {sub && <div style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>{sub}</div>}
      </window.Card>
    );
  }

  // USD→FCFA helper for endowment FX line
  const USD_XOF = 605;
  function fxNote(usdEquivXof) { return '≈ $' + window.fmtFCFA(Math.round(usdEquivXof / USD_XOF)); }

  // Donut legend list
  function LegendList({ items, fmt }) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
        {items.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--fg-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
            <b style={{ color: 'var(--fg)' }}>{fmt ? fmt(s.value) : s.value + '%'}</b>
          </div>
        ))}
      </div>
    );
  }

  Object.assign(window, { ApprovalChain, ThresholdNote, Metric, fxNote, LegendList, USD_XOF });
})();


// ---------- fin_overview ----------
// ============================================================
// DAUST Admin — Finance › Overview
// ============================================================
(function () {

  function FinOverview({ go, goFin }) {
    const F = window.FINANCE;
    const arTotal = window.AR_AGING.reduce((a, d) => a + d.amount, 0);
    const net = F.revenue.reduce((a, b) => a + b, 0) - F.expense.reduce((a, b) => a + b, 0);
    const topOutstanding = window.STUDENTS.filter(s => s.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 5);
    const recent = window.TRANSACTIONS.slice(0, 6);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px,1fr))', gap: 16 }}>
          <Stat label="Cash on hand" value={<FCFA value={F.cashOnHand} short />} delta="CBAO + mobile" deltaTone="flat" icon="landmark" />
          <Stat label="Net position (term)" value={<FCFA value={net} short />} delta="+12.4%" deltaTone="up" icon="trending-up" />
          <Stat label="Collected YTD" value={<FCFA value={F.tuitionCollected} short />} delta="80% of billed" deltaTone="up" icon="check-circle-2" />
          <Stat label="A/R outstanding" value={<FCFA value={arTotal} short />} delta="558 accounts" deltaTone="down" icon="alert-circle" />
          <Stat label="Payables due" value={<FCFA value={286_400_000} short />} delta="9 bills" deltaTone="flat" icon="file-text" />
        </div>

        {/* Cash flow + AR aging */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.55fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
          <Panel title="Revenue vs. expenditure" action={<Button variant="ghost" size="sm" iconRight="arrow-right" onClick={() => goFin('reports')}>Statements</Button>}>
            <div style={{ display: 'flex', gap: 22, marginBottom: 10 }}>
              <Legend color="var(--accent)" label="Revenue" />
              <Legend color="var(--slate-400)" label="Expenditure" dashed />
            </div>
            <AreaChart labels={window.MONTHS} series={[{ name: 'Revenue', data: F.revenue }, { name: 'Expenditure', data: F.expense, dashed: true }]} colors={['var(--accent)', 'var(--slate-400)']} format={v => fmtFCFA(v, { short: true })} height={232} />
          </Panel>

          <Panel title="Accounts receivable aging" action={<Button variant="ghost" size="sm" iconRight="arrow-right" onClick={() => goFin('receivables')}>Manage</Button>}>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 4 }}><FCFA value={arTotal} /></div>
            <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginBottom: 14 }}>across 558 student accounts</div>
            <AgingBar data={window.AR_AGING} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 16 }}>
              {window.AR_AGING.map(d => (
                <div key={d.bucket} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: d.color, flexShrink: 0 }} />
                  <span style={{ color: 'var(--fg-muted)', flex: 1 }}>{d.bucket}</span>
                  <span style={{ color: 'var(--fg-faint)', fontSize: 12 }}>{d.count}</span>
                  <b style={{ color: 'var(--fg)', minWidth: 64, textAlign: 'right' }}>{fmtFCFA(d.amount, { short: true })}</b>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* Top outstanding + recent transactions */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)', gap: 20, alignItems: 'start' }}>
          <Panel title="Top outstanding accounts" action={<Button variant="ghost" size="sm" iconRight="arrow-right" onClick={() => goFin('receivables')}>All</Button>}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {topOutstanding.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 0', borderBottom: i < 4 ? '1px solid var(--divider)' : 'none' }}>
                  <window.Avatar name={s.name} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg)' }}>{s.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', fontFamily: 'var(--font-mono)' }}>{s.id} · {s.program}</div>
                  </div>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--error-500)' }}><FCFA value={s.balance} /></span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Recent payments" action={<Button variant="ghost" size="sm" iconRight="arrow-right" onClick={() => goFin('payments')}>Ledger</Button>}>
            <div style={{ overflowX: 'auto', margin: '-4px -4px 0' }}>
              <table className="dt">
                <tbody>
                  {recent.map(t => (
                    <tr key={t.id}>
                      <td style={{ paddingLeft: 4 }}><div style={{ fontWeight: 600, color: 'var(--fg)' }}>{t.student}</div><div style={{ fontSize: 11.5, color: 'var(--fg-faint)', fontFamily: 'var(--font-mono)' }}>{t.id}</div></td>
                      <td><MethodTag method={t.method} /></td>
                      <td style={{ fontWeight: 700, color: 'var(--fg)' }}><FCFA value={t.amount} /></td>
                      <td style={{ paddingRight: 4 }}><FinStatus status={t.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  function Legend({ color, label, dashed }) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--fg-subtle)' }}>
      <span style={{ width: 18, height: 0, borderTop: `2.5px ${dashed ? 'dashed' : 'solid'} ${color}` }} />{label}</span>;
  }

  Object.assign(window, { FinOverview });
})();


// ---------- fin_receivables ----------
// ============================================================
// DAUST Admin — Finance › Receivables (invoices, plans, holds)
// ============================================================
(function () {
  const { useState, useEffect, useRef } = React;

  function Receivables({ goFin }) {
    const [tab, setTab] = useState('invoices');
    return (
      <div>
        <Tabs tabs={[{ value: 'invoices', label: 'Invoices' }, { value: 'plans', label: 'Payment plans' }, { value: 'holds', label: 'Holds' }, { value: 'aging', label: 'Aging report' }]} active={tab} onChange={setTab} />
        {tab === 'invoices' && <InvoicesView />}
        {tab === 'plans' && <PlansView />}
        {tab === 'holds' && <HoldsView />}
        {tab === 'aging' && <AgingView />}
      </div>
    );
  }

  function InvoicesView() {
    const [q, setQ] = useState('');
    const [filter, setFilter] = useState('All');
    const [sel, setSel] = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    const [payOpen, setPayOpen] = useState(false);
    const rows = window.INVOICES.filter(inv => (filter === 'All' || inv.status === filter) && (inv.student.toLowerCase().includes(q.toLowerCase()) || inv.id.toLowerCase().includes(q.toLowerCase())));
    const totals = window.INVOICES.reduce((a, i) => { a[i.status] = (a[i.status] || 0) + i.amount; return a; }, {});

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 12 }}>
          <MiniTile label="Billed" value={window.FINANCE.tuitionBilled} tone="neutral" icon="file-text" />
          <MiniTile label="Collected" value={window.FINANCE.tuitionCollected} tone="success" icon="check-circle-2" />
          <MiniTile label="Pending" value={totals.Pending || 0} tone="warning" icon="clock" />
          <MiniTile label="Overdue" value={totals.Overdue || 0} tone="error" icon="alert-triangle" />
        </div>

        <Toolbar>
          <SearchInput placeholder="Search invoice or student…" value={q} onChange={setQ} width={280} />
          <Segmented size="sm" options={['All', 'Paid', 'Pending', 'Overdue', 'Partial']} value={filter} onChange={setFilter} />
          <div style={{ flex: 1 }} />
          <Button variant="outline" icon="download" size="md">Export CSV</Button>
          <Button variant="primary" icon="plus" size="md" onClick={() => setShowCreate(true)}>New invoice</Button>
        </Toolbar>

        <Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Invoice</th><th>Student</th><th>Program</th><th>Amount</th><th>Method</th><th>Due</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.map(inv => (
                  <tr key={inv.id} style={{ cursor: 'pointer' }} onClick={() => setSel(inv)}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--fg)' }}>{inv.id}</td>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Avatar name={inv.student} size={28} /><span style={{ color: 'var(--fg)', fontWeight: 600 }}>{inv.student}</span></div></td>
                    <td><Badge tone="neutral" dot={false} size="sm">{inv.program}</Badge></td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}><FCFA value={inv.amount} /></td>
                    <td>{inv.method === '—' ? <span style={{ color: 'var(--fg-faint)' }}>—</span> : <MethodTag method={inv.method} />}</td>
                    <td>{inv.due}</td>
                    <td><FinStatus status={inv.status} /></td>
                    <td style={{ textAlign: 'right' }}><Icon name="chevron-right" size={16} style={{ color: 'var(--fg-faint)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <EmptyState icon="receipt" title="No invoices found" sub="Try a different search or filter." />}
        </Card>

        {/* Invoice detail drawer */}
        <Drawer open={!!sel} onClose={() => setSel(null)} title={sel ? sel.id : ''} width={500}
          footer={sel && <><Button variant="outline" icon="printer">Print</Button><Button variant="outline" icon="send">Reminder</Button><Button variant="primary" icon="banknote" onClick={() => setPayOpen(true)}>Record payment</Button></>}>
          {sel && <InvoiceDetail inv={sel} />}
        </Drawer>

        {/* Record payment modal */}
        <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Record payment" width={440}
          footer={<><Button variant="ghost" onClick={() => setPayOpen(false)}>Cancel</Button><Button variant="primary" icon="check" onClick={() => setPayOpen(false)}>Post payment</Button></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {sel && <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', padding: '12px 14px', fontSize: 13 }}>Invoice <b style={{ fontFamily: 'var(--font-mono)' }}>{sel.id}</b> · {sel.student}</div>}
            <Field label="Amount received (FCFA)"><Input type="number" defaultValue={sel ? sel.amount : ''} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Method"><Select options={['Orange Money', 'Wave', 'Bank Transfer', 'Card', 'Cash']} /></Field>
              <Field label="Date"><Input type="date" defaultValue="2026-05-29" /></Field>
            </div>
            <Field label="Reference / receipt no."><Input placeholder="e.g. OM-748210" /></Field>
          </div>
        </Modal>

        {/* Create invoice */}
        <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New invoice" width={480}
          footer={<><Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button><Button variant="primary" icon="check" onClick={() => setShowCreate(false)}>Create invoice</Button></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Student"><Input placeholder="Search by name or ID…" /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Term"><Select options={['Spring 2026', 'Fall 2026']} /></Field>
              <Field label="Fee type"><Select options={['Tuition', 'Housing', 'Lab fee', 'Application']} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Amount (FCFA)"><Input type="number" placeholder="1 925 000" /></Field>
              <Field label="Due date"><Input type="date" defaultValue="2026-06-15" /></Field>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  function InvoiceDetail({ inv }) {
    const paid = inv.status === 'Paid' ? inv.amount : inv.status === 'Partial' ? Math.round(inv.amount * 0.5) : 0;
    const bal = inv.amount - paid;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar name={inv.student} size={46} />
            <div><div style={{ fontWeight: 700, fontSize: 16 }}>{inv.student}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)' }}>{inv.studentId}</div></div>
          </div>
          <FinStatus status={inv.status} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)', padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>Invoice total</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}><FCFA value={inv.amount} /></div>
          </div>
          <div style={{ background: bal > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.10)', borderRadius: 'var(--radius-lg)', padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>Balance due</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: bal > 0 ? 'var(--error-500)' : 'var(--success-500)' }}>{bal > 0 ? <FCFA value={bal} /> : 'Paid'}</div>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 8 }}>Line items</div>
          <LineItem label="Tuition — base" value={inv.amount * 0.82} />
          <LineItem label="Lab & technology fee" value={inv.amount * 0.12} />
          <LineItem label="Student services" value={inv.amount * 0.06} />
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 0', fontSize: 14, fontWeight: 700, borderTop: '1px solid var(--border)', marginTop: 4 }}>
            <span>Total</span><span><FCFA value={inv.amount} /></span>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 8 }}>Payment history</div>
          {paid > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--divider)' }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(16,185,129,0.12)', color: 'var(--success-500)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={15} /></span>
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{inv.method !== '—' ? inv.method : 'Bank Transfer'}</div><div style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>2026-02-14</div></div>
              <span style={{ fontWeight: 700, color: 'var(--fg)' }}><FCFA value={paid} /></span>
            </div>
          ) : <div style={{ fontSize: 13, color: 'var(--fg-faint)', padding: '8px 0' }}>No payments recorded yet.</div>}
        </div>

        <div>
          <KV label="Program" value={inv.program} />
          <KV label="Due date" value={inv.due} />
          <KV label="Term" value="Spring 2026" />
        </div>
      </div>
    );
  }

  function LineItem({ label, value }) {
    return <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 13.5, color: 'var(--fg-muted)' }}><span>{label}</span><span style={{ fontFamily: 'var(--font-mono)' }}>{fmtFCFA(value)}</span></div>;
  }

  function MiniTile({ label, value, tone, icon }) {
    const c = { success: 'var(--success-500)', warning: 'var(--warning-500)', error: 'var(--error-500)', neutral: 'var(--fg-subtle)' }[tone];
    return (
      <Card padding={16} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 38, height: 38, borderRadius: 'var(--radius-md)', background: 'var(--bg-subtle)', color: c, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={icon} size={18} /></span>
        <div style={{ minWidth: 0 }}><div style={{ fontSize: 17, fontWeight: 800, color: 'var(--fg)' }}>{fmtFCFA(value, { short: true })} <span style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>FCFA</span></div><div style={{ fontSize: 12, color: 'var(--fg-subtle)' }}>{label}</div></div>
      </Card>
    );
  }

  // ---- Payment plans ----
  function PlansView() {
    return (
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="dt">
            <thead><tr><th>Plan</th><th>Student</th><th>Total</th><th>Per installment</th><th>Progress</th><th>Next due</th><th>Status</th></tr></thead>
            <tbody>
              {window.PAYMENT_PLANS.map(p => (
                <tr key={p.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--fg)' }}>{p.id}</td>
                  <td><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Avatar name={p.student} size={28} /><span style={{ color: 'var(--fg)', fontWeight: 600 }}>{p.student}</span></div></td>
                  <td style={{ fontWeight: 600, color: 'var(--fg)' }}><FCFA value={p.total} /></td>
                  <td><FCFA value={p.perInstallment} /></td>
                  <td style={{ minWidth: 150 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Progress value={p.paid} max={p.installments} tone={p.status === 'Behind' ? 'error' : 'teal'} height={6} />
                      <span style={{ fontSize: 12, color: 'var(--fg-subtle)', whiteSpace: 'nowrap' }}>{p.paid}/{p.installments}</span>
                    </div>
                  </td>
                  <td>{p.nextDue}</td>
                  <td><FinStatus status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  // ---- Holds ----
  function HoldsView() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-lg)', padding: '12px 16px' }}>
          <Icon name="lock" size={18} style={{ color: 'var(--error-500)' }} />
          <span style={{ fontSize: 13.5, color: 'var(--fg-muted)' }}><b style={{ color: 'var(--fg)' }}>{window.HOLDS.length} active holds</b> — accounts over 1M FCFA outstanding are auto-flagged and blocked from registration & transcripts.</span>
        </div>
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Student</th><th>Program</th><th>Balance</th><th>Reason</th><th>Blocks</th><th>Placed</th><th></th></tr></thead>
              <tbody>
                {window.HOLDS.map(h => (
                  <tr key={h.studentId}>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Avatar name={h.student} size={28} /><div><div style={{ color: 'var(--fg)', fontWeight: 600 }}>{h.student}</div><div style={{ fontSize: 11.5, color: 'var(--fg-faint)', fontFamily: 'var(--font-mono)' }}>{h.studentId}</div></div></div></td>
                    <td><Badge tone="neutral" dot={false} size="sm">{h.program}</Badge></td>
                    <td style={{ fontWeight: 700, color: 'var(--error-500)' }}><FCFA value={h.balance} /></td>
                    <td>{h.reason}</td>
                    <td><Badge tone="error" dot={false} size="sm">{h.blocks}</Badge></td>
                    <td>{h.placed}</td>
                    <td style={{ textAlign: 'right' }}><Button variant="outline" size="sm" icon="unlock">Release</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  // ---- Aging report ----
  function AgingView() {
    const total = window.AR_AGING.reduce((a, d) => a + d.amount, 0);
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.3fr)', gap: 20, alignItems: 'start' }}>
        <Panel title="Aging summary">
          <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}><FCFA value={total} /></div>
          <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginBottom: 16 }}>total receivable · 558 accounts</div>
          <AgingBar data={window.AR_AGING} height={16} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
            {window.AR_AGING.map(d => (
              <div key={d.bucket} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color }} />
                <span style={{ flex: 1, fontSize: 13.5, color: 'var(--fg-muted)' }}>{d.bucket}</span>
                <span style={{ fontSize: 12, color: 'var(--fg-faint)' }}>{d.count} accts</span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--fg)', minWidth: 90, textAlign: 'right' }}><FCFA value={d.amount} /></span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="By program">
          <table className="dt" style={{ margin: '-4px 0' }}>
            <thead><tr><th>Program</th><th>Students owing</th><th>Outstanding</th></tr></thead>
            <tbody>
              {window.PROGRAMS.slice(0, 7).map((p, i) => {
                const owing = 12 + (i * 9) % 40;
                const amt = (window.AR_AGING[i % 5].amount) * (0.6 + (i % 3) * 0.2) / 3;
                return <tr key={p.code}><td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: p.color }} />{p.name}</span></td><td>{owing}</td><td style={{ fontWeight: 600, color: 'var(--fg)' }}><FCFA value={amt} /></td></tr>;
              })}
            </tbody>
          </table>
        </Panel>
      </div>
    );
  }

  Object.assign(window, { Receivables });
})();


// ---------- fin_receivables2 ----------
// ============================================================
// DAUST Admin — Finance › Receivables 2
// Fee structure, refunds & credit notes, collections, student statements
// ============================================================
(function () {
  const { useState } = React;

  // ---- Fee Structure ----
  function FeeStructure({ goFin }) {
    const [edit, setEdit] = useState(null);
    const FEE = window.FEE_ITEMS;
    const catTone = { Tuition: 'teal', Admissions: 'info', Registration: 'info', Academic: 'neutral', Auxiliary: 'warning', Services: 'neutral' };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <window.Panel title="Per-program tuition (annual)" action={<window.Button variant="outline" size="sm" icon="pencil">Edit pricing</window.Button>}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Program</th><th>Degree</th><th>School</th><th style={{ textAlign: 'right' }}>Annual tuition</th><th style={{ textAlign: 'right' }}>With fees*</th></tr></thead>
              <tbody>
                {window.PROGRAMS.map(p => (
                  <tr key={p.code}>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><span style={{ width: 30, height: 30, borderRadius: 7, background: p.color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{p.code}</span><b style={{ color: 'var(--fg)' }}>{p.name}</b></span></td>
                    <td><window.Badge tone="neutral" dot={false} size="sm">{p.degree}</window.Badge></td>
                    <td>{p.school}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={p.tuition} /></td>
                    <td style={{ textAlign: 'right', color: 'var(--fg-subtle)' }}><window.FCFA value={p.tuition + 360000} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 8 }}>*Includes mandatory registration, lab, library and insurance fees.</div>
        </window.Panel>

        <window.Panel title="Fee items catalog" action={<window.Button variant="primary" size="sm" icon="plus">Add fee item</window.Button>}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Fee item</th><th>Category</th><th>GL account</th><th>Mandatory</th><th style={{ textAlign: 'right' }}>Amount</th><th></th></tr></thead>
              <tbody>
                {FEE.map(f => (
                  <tr key={f.id} style={{ cursor: 'pointer' }} onClick={() => setEdit(f)}>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{f.name}</td>
                    <td><window.Badge tone={catTone[f.category] || 'neutral'} dot={false} size="sm">{f.category}</window.Badge></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-subtle)' }}>{f.gl}</td>
                    <td>{f.mandatory ? <window.Badge tone="success" size="sm">Required</window.Badge> : <window.Badge tone="neutral" dot={false} size="sm">Optional</window.Badge>}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}>{f.perProgram ? <span style={{ color: 'var(--fg-subtle)', fontWeight: 500, fontStyle: 'italic' }}>per program</span> : <window.FCFA value={f.amount} />}</td>
                    <td style={{ textAlign: 'right' }}><window.Icon name="pencil" size={14} style={{ color: 'var(--fg-faint)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Panel>

        <window.Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? 'Edit · ' + edit.name : ''} width={440}
          footer={<><window.Button variant="ghost" onClick={() => setEdit(null)}>Cancel</window.Button><window.Button variant="primary" icon="check" onClick={() => setEdit(null)}>Save</window.Button></>}>
          {edit && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <window.Field label="Fee name"><window.Input defaultValue={edit.name} /></window.Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <window.Field label="Amount (FCFA)"><window.Input type="number" defaultValue={edit.amount || ''} placeholder="per program" /></window.Field>
                <window.Field label="GL account"><window.Input defaultValue={edit.gl} /></window.Field>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><window.Toggle checked={edit.mandatory} onChange={() => {}} /><span style={{ fontSize: 13.5, color: 'var(--fg-muted)' }}>Mandatory for all students</span></div>
            </div>
          )}
        </window.Modal>
      </div>
    );
  }

  // ---- Refunds & Credit Notes ----
  function Refunds({ goFin }) {
    const [sel, setSel] = useState(null);
    const [create, setCreate] = useState(false);
    const R = window.REFUNDS;
    const pending = R.filter(x => x.status === 'Pending');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
          <window.Metric label="Pending refunds" value={pending.length} sub={window.fmtFCFA(pending.reduce((a, x) => a + x.amount, 0), { short: true }) + ' FCFA'} tone="down" icon="undo-2" />
          <window.Metric label="Issued (term)" value={R.filter(x => x.status === 'Paid').length} sub="this term" icon="check-circle-2" />
          <window.Metric label="Credit notes" value={R.filter(x => x.type === 'Credit Note').length} sub="applied to accounts" icon="file-minus" />
        </div>
        <window.Toolbar>
          <window.SearchInput placeholder="Search student or note…" value="" onChange={() => {}} width={280} />
          <div style={{ flex: 1 }} />
          <window.Button variant="primary" icon="plus" onClick={() => setCreate(true)}>New refund / credit</window.Button>
        </window.Toolbar>
        <window.Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Reference</th><th>Student</th><th>Type</th><th>Reason</th><th style={{ textAlign: 'right' }}>Amount</th><th>Date</th><th>Approval</th><th>Status</th></tr></thead>
              <tbody>
                {R.map(x => (
                  <tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => setSel(x)}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{x.id}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{x.student}</td>
                    <td><window.Badge tone={x.type === 'Refund' ? 'warning' : 'info'} dot={false} size="sm">{x.type}</window.Badge></td>
                    <td style={{ color: 'var(--fg-subtle)' }}>{x.reason}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={x.amount} /></td>
                    <td>{x.date}</td>
                    <td><window.ApprovalChain stage={x.stage} compact /></td>
                    <td><window.FinStatus status={x.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Card>

        <window.Drawer open={!!sel} onClose={() => setSel(null)} title={sel ? sel.id : ''} width={440}
          footer={sel && (sel.status === 'Pending' ? <><window.Button variant="danger" icon="x">Reject</window.Button><window.Button variant="primary" icon="check">Approve</window.Button></> : <window.Button variant="outline" icon="printer">Print note</window.Button>)}>
          {sel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)', padding: 18, textAlign: 'center' }}>
                <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{sel.type}</div>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-display)', margin: '6px 0' }}><window.FCFA value={sel.amount} /></div>
                <window.FinStatus status={sel.status} />
              </div>
              <window.KV label="Student" value={sel.student} />
              <window.KV label="Account" value={sel.studentId} mono />
              <window.KV label="Reason" value={sel.reason} />
              <window.KV label="Requested" value={sel.date} />
              <div style={{ marginTop: 4 }}><div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg-muted)', marginBottom: 10 }}>Approval workflow</div><window.ApprovalChain stage={sel.stage} /></div>
            </div>
          )}
        </window.Drawer>
        <window.Modal open={create} onClose={() => setCreate(false)} title="New refund / credit note" width={460}
          footer={<><window.Button variant="ghost" onClick={() => setCreate(false)}>Cancel</window.Button><window.Button variant="primary" icon="send" onClick={() => setCreate(false)}>Submit</window.Button></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <window.Field label="Student"><window.Input placeholder="Search name or ID…" /></window.Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <window.Field label="Type"><window.Select options={['Refund (cash out)', 'Credit Note (to account)']} /></window.Field>
              <window.Field label="Amount (FCFA)"><window.Input type="number" placeholder="0" /></window.Field>
            </div>
            <window.Field label="Reason"><window.Select options={['Course withdrawal — pro-rata', 'Overpayment (duplicate)', 'Scholarship applied after payment', 'Housing not taken up', 'Other']} /></window.Field>
          </div>
        </window.Modal>
      </div>
    );
  }

  // ---- Collections / Dunning ----
  function Collections({ goFin }) {
    const [sel, setSel] = useState(null);
    const HOLDS = window.HOLDS;
    const stageOf = b => b > 1_800_000 ? 'Final notice' : b > 1_200_000 ? '2nd reminder' : '1st reminder';
    const stageTone = { '1st reminder': 'info', '2nd reminder': 'warning', 'Final notice': 'error' };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="In collections" value={window.fmtFCFA(window.FINANCE.outstanding, { short: true }) + ' FCFA'} sub="118 accounts" tone="down" icon="alert-circle" />
          <window.Metric label="Active holds" value={HOLDS.length} sub="registration / transcript" tone="down" icon="lock" />
          <window.Metric label="90+ days overdue" value={<window.FCFA value={43_000_000} short />} sub="19 accounts" tone="down" icon="clock-alert" />
          <window.Metric label="Recovered (month)" value={<window.FCFA value={186_000_000} short />} sub="241 payments" tone="up" icon="trending-up" />
        </div>
        <window.Panel title="Dunning queue — accounts on hold" action={<window.Button variant="primary" size="sm" icon="send">Send batch reminders</window.Button>}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Student</th><th>Program</th><th>Blocks</th><th>Placed</th><th>Dunning stage</th><th style={{ textAlign: 'right' }}>Balance</th><th></th></tr></thead>
              <tbody>
                {HOLDS.map(h => (
                  <tr key={h.studentId} style={{ cursor: 'pointer' }} onClick={() => setSel(h)}>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><window.Avatar name={h.student} size={28} /><div><div style={{ color: 'var(--fg)', fontWeight: 600 }}>{h.student}</div><div style={{ fontSize: 11.5, color: 'var(--fg-faint)', fontFamily: 'var(--font-mono)' }}>{h.studentId}</div></div></span></td>
                    <td><window.Badge tone="neutral" dot={false} size="sm">{h.program}</window.Badge></td>
                    <td style={{ fontSize: 12.5, color: 'var(--fg-muted)' }}>{h.blocks}</td>
                    <td>{h.placed}</td>
                    <td><window.Badge tone={stageTone[stageOf(h.balance)]} size="sm">{stageOf(h.balance)}</window.Badge></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--error-500)' }}><window.FCFA value={h.balance} /></td>
                    <td style={{ textAlign: 'right' }}><window.Icon name="chevron-right" size={16} style={{ color: 'var(--fg-faint)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Panel>

        <window.Drawer open={!!sel} onClose={() => setSel(null)} title="Collections case" width={460}
          footer={sel && <><window.Button variant="outline" icon="unlock">Lift hold</window.Button><window.Button variant="primary" icon="send">Send reminder</window.Button></>}>
          {sel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <window.Avatar name={sel.student} size={48} />
                <div><div style={{ fontWeight: 700, fontSize: 16 }}>{sel.student}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)' }}>{sel.studentId} · {sel.program}</div></div>
              </div>
              <div style={{ background: 'rgba(192,57,43,0.08)', borderRadius: 'var(--radius-lg)', padding: 18, textAlign: 'center' }}>
                <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>Outstanding balance</div>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--error-500)' }}><window.FCFA value={sel.balance} /></div>
              </div>
              <window.KV label="Reason" value={sel.reason} />
              <window.KV label="Hold placed" value={sel.placed} />
              <window.KV label="Services blocked" value={sel.blocks} />
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg-muted)', marginTop: 4 }}>Dunning history</div>
              {[['1st reminder', '2026-04-20', 'Email'], ['2nd reminder', '2026-05-08', 'Email + SMS'], ['Phone follow-up', '2026-05-20', 'No answer']].map((h, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '7px 0', borderBottom: '1px solid var(--divider)' }}>
                  <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{h[0]}</span><span style={{ color: 'var(--fg-subtle)' }}>{h[1]} · {h[2]}</span>
                </div>
              ))}
            </div>
          )}
        </window.Drawer>
      </div>
    );
  }

  Object.assign(window, { FeeStructure, Refunds, Collections });
})();


// ---------- fin_payments ----------
// ============================================================
// DAUST Admin — Finance › Payments (transaction ledger + reconciliation)
// ============================================================
(function () {
  const { useState, useEffect, useRef } = React;

  function Payments({ goFin }) {
    const [q, setQ] = useState('');
    const [method, setMethod] = useState('All');
    const [status, setStatus] = useState('All');
    const [sel, setSel] = useState(null);
    const T = window.TRANSACTIONS;
    const rows = T.filter(t =>
      (method === 'All' || t.method === method) &&
      (status === 'All' || t.status === status) &&
      (t.student.toLowerCase().includes(q.toLowerCase()) || t.id.toLowerCase().includes(q.toLowerCase()) || t.ref.toLowerCase().includes(q.toLowerCase())));

    const cleared = T.filter(t => t.status === 'Cleared');
    const totalCleared = cleared.reduce((a, t) => a + t.amount, 0);
    const unreconciled = cleared.filter(t => !t.reconciled);
    const pending = T.filter(t => t.status === 'Pending');
    const byMethod = ['Orange Money', 'Wave', 'Bank Transfer', 'Card', 'Cash'].map(m => ({
      label: m, value: cleared.filter(t => t.method === m).reduce((a, t) => a + t.amount, 0), color: window.METHOD_COLOR[m],
    })).filter(s => s.value > 0);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1.4fr)', gap: 16, alignItems: 'stretch' }}>
          <Card padding={18} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', fontWeight: 600 }}>Cleared today</div>
            <div style={{ fontSize: 24, fontWeight: 800, margin: '8px 0' }}><FCFA value={totalCleared} short /></div>
            <div style={{ fontSize: 12.5, color: 'var(--success-500)', fontWeight: 600 }}>{cleared.length} transactions</div>
          </Card>
          <Card padding={18} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', fontWeight: 600 }}>Awaiting reconciliation</div>
            <div style={{ fontSize: 24, fontWeight: 800, margin: '8px 0', color: 'var(--warning-500)' }}>{unreconciled.length}</div>
            <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{pending.length} pending · {T.filter(t => t.status === 'Failed').length} failed</div>
          </Card>
          <Panel title="Cleared by channel" pad={18}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Donut size={104} thickness={16} segments={byMethod} centerLabel={byMethod.length} centerSub="channels" />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {byMethod.map(s => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                    <span style={{ flex: 1, color: 'var(--fg-muted)' }}>{s.label}</span>
                    <b style={{ color: 'var(--fg)' }}>{fmtFCFA(s.value, { short: true })}</b>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        </div>

        <div>
          <Toolbar>
            <SearchInput placeholder="Search student, txn ID or reference…" value={q} onChange={setQ} width={300} />
            <Select options={['All', 'Orange Money', 'Wave', 'Bank Transfer', 'Card', 'Cash'].map(v => ({ value: v, label: v === 'All' ? 'All methods' : v }))} value={method} onChange={setMethod} />
            <Segmented size="sm" options={['All', 'Cleared', 'Pending', 'Failed']} value={status} onChange={setStatus} />
            <div style={{ flex: 1 }} />
            <Button variant="outline" icon="refresh-cw" size="md">Sync bank feed</Button>
            <Button variant="primary" icon="check-check" size="md">Reconcile all</Button>
          </Toolbar>

          <Card padding={0} style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="dt">
                <thead><tr><th>Date</th><th>Transaction</th><th>Student</th><th>Type</th><th>Method</th><th>Reference</th><th>Amount</th><th>Status</th><th>Recon.</th></tr></thead>
                <tbody>
                  {rows.map(t => (
                    <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setSel(t)}>
                      <td style={{ whiteSpace: 'nowrap' }}>{t.date}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{t.id}</td>
                      <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{t.student}</td>
                      <td><Badge tone="neutral" dot={false} size="sm">{t.type}</Badge></td>
                      <td><MethodTag method={t.method} /></td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-subtle)' }}>{t.ref}</td>
                      <td style={{ fontWeight: 700, color: t.status === 'Failed' ? 'var(--fg-faint)' : 'var(--fg)', textDecoration: t.status === 'Failed' ? 'line-through' : 'none' }}><FCFA value={t.amount} /></td>
                      <td><FinStatus status={t.status} /></td>
                      <td>{t.status === 'Cleared' ? (t.reconciled ? <Icon name="check-circle-2" size={17} style={{ color: 'var(--success-500)' }} /> : <Icon name="circle-dashed" size={17} style={{ color: 'var(--warning-500)' }} />) : <span style={{ color: 'var(--fg-faint)' }}>—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length === 0 && <EmptyState icon="arrow-left-right" title="No transactions" sub="Adjust your filters." />}
          </Card>
        </div>

        <Drawer open={!!sel} onClose={() => setSel(null)} title="Transaction" width={440}
          footer={sel && (sel.status === 'Cleared' && !sel.reconciled ? <Button variant="primary" icon="check" onClick={() => setSel(null)}>Mark reconciled</Button> : sel.status === 'Pending' ? <><Button variant="danger" icon="x">Void</Button><Button variant="primary" icon="check">Clear</Button></> : <Button variant="outline" icon="printer">Receipt</Button>)}>
          {sel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em' }}><FCFA value={sel.amount} /></div>
                <div style={{ marginTop: 8 }}><FinStatus status={sel.status} /></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}><MethodTag method={sel.method} /></div>
              <div>
                <KV label="Transaction ID" value={sel.id} mono />
                <KV label="Reference" value={sel.ref} mono />
                <KV label="Student" value={sel.student} />
                <KV label="Account" value={sel.studentId} mono />
                <KV label="Fee type" value={sel.type} />
                <KV label="Date" value={sel.date} />
                <KV label="Reconciled" value={sel.reconciled ? 'Yes' : 'No'} />
              </div>
            </div>
          )}
        </Drawer>
      </div>
    );
  }

  Object.assign(window, { Payments });
})();


// ---------- fin_payables ----------
// ============================================================
// DAUST Admin — Finance › Payables (bills, POs, reimbursements)
// ============================================================
(function () {
  const { useState, useEffect, useRef } = React;

  function Payables({ goFin }) {
    const [tab, setTab] = useState('bills');
    const bills = window.BILLS;
    const due = bills.filter(b => b.status !== 'Paid').reduce((a, b) => a + b.amount, 0);
    const pendingApproval = bills.filter(b => b.status === 'Pending').length;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 16 }}>
          <window.Stat label="Outstanding payables" value={<FCFA value={due} short />} delta={bills.filter(b => b.status !== 'Paid').length + ' open bills'} deltaTone="flat" icon="file-text" />
          <window.Stat label="Pending approval" value={pendingApproval} delta="needs sign-off" deltaTone="down" icon="clock" />
          <window.Stat label="Open POs" value={window.PURCHASE_ORDERS.filter(p => p.status !== 'Received').length} delta="this term" deltaTone="flat" icon="shopping-cart" />
          <window.Stat label="Reimbursements" value={window.REIMBURSEMENTS.filter(r => r.status === 'Pending').length} delta="awaiting" deltaTone="flat" icon="undo-2" />
        </div>

        <div>
          <Tabs tabs={[{ value: 'bills', label: 'Vendor bills' }, { value: 'po', label: 'Purchase orders' }, { value: 'reimb', label: 'Reimbursements' }]} active={tab} onChange={setTab} />
          {tab === 'bills' && <BillsView />}
          {tab === 'po' && <POView />}
          {tab === 'reimb' && <ReimbView />}
        </div>
      </div>
    );
  }

  function BillsView() {
    const [filter, setFilter] = useState('All');
    const [sel, setSel] = useState(null);
    const rows = window.BILLS.filter(b => filter === 'All' || b.status === filter);
    return (
      <div>
        <Toolbar>
          <Segmented size="sm" options={['All', 'Pending', 'Approved', 'Paid', 'Overdue']} value={filter} onChange={setFilter} />
          <div style={{ flex: 1 }} />
          <Button variant="primary" icon="plus" size="md">New bill</Button>
        </Toolbar>
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Bill</th><th>Vendor</th><th>Category</th><th>PO</th><th>Amount</th><th>Due</th><th>Approver</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.map(b => (
                  <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => setSel(b)}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{b.id}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{b.vendor}</td>
                    <td><Badge tone="neutral" dot={false} size="sm">{b.category}</Badge></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-subtle)' }}>{b.po}</td>
                    <td style={{ fontWeight: 700, color: 'var(--fg)' }}><FCFA value={b.amount} /></td>
                    <td>{b.due}</td>
                    <td>{b.approver}</td>
                    <td><FinStatus status={b.status} /></td>
                    <td style={{ textAlign: 'right' }}><Icon name="chevron-right" size={16} style={{ color: 'var(--fg-faint)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Drawer open={!!sel} onClose={() => setSel(null)} title={sel ? sel.id : ''} width={440}
          footer={sel && (sel.status === 'Pending' ? <><Button variant="danger" icon="x">Reject</Button><Button variant="primary" icon="check">Approve</Button></> : sel.status === 'Approved' ? <Button variant="primary" icon="banknote">Schedule payment</Button> : <Button variant="outline" icon="printer">Receipt</Button>)}>
          {sel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)', padding: 18, textAlign: 'center' }}>
                <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{sel.vendor}</div>
                <div style={{ fontSize: 28, fontWeight: 800, margin: '6px 0' }}><FCFA value={sel.amount} /></div>
                <FinStatus status={sel.status} />
              </div>
              <div>
                <KV label="Category" value={sel.category} />
                <KV label="Purchase order" value={sel.po} mono />
                <KV label="Due date" value={sel.due} />
                <KV label="Approver" value={sel.approver} />
                <KV label="GL account" value="5200 Facilities & Utilities" />
              </div>
              {sel.status === 'Pending' && <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'rgba(245,158,11,0.1)', borderRadius: 'var(--radius-md)', padding: '11px 14px', fontSize: 13, color: 'var(--fg-muted)' }}><Icon name="alert-triangle" size={16} style={{ color: 'var(--warning-500)' }} />Requires approval before payment can be scheduled.</div>}
            </div>
          )}
        </Drawer>
      </div>
    );
  }

  function POView() {
    return (
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="dt">
            <thead><tr><th>PO</th><th>Description</th><th>Vendor</th><th>Department</th><th>Amount</th><th>Raised</th><th>Status</th></tr></thead>
            <tbody>
              {window.PURCHASE_ORDERS.map(p => (
                <tr key={p.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{p.id}</td>
                  <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{p.desc}</td>
                  <td>{p.vendor}</td>
                  <td><Badge tone="neutral" dot={false} size="sm">{p.dept}</Badge></td>
                  <td style={{ fontWeight: 700, color: 'var(--fg)' }}><FCFA value={p.amount} /></td>
                  <td>{p.raised}</td>
                  <td><FinStatus status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  function ReimbView() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {window.REIMBURSEMENTS.map(rb => (
          <Card key={rb.id} padding={16} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Avatar name={rb.staff} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--fg)' }}>{rb.desc}</div>
              <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{rb.staff} · {rb.id} · {rb.date}</div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--fg)' }}><FCFA value={rb.amount} /></div>
            <div style={{ width: 92, display: 'flex', justifyContent: 'flex-end' }}><FinStatus status={rb.status} /></div>
            {rb.status === 'Pending' ? <Button variant="primary" size="sm" icon="check">Approve</Button> : <span style={{ width: 96 }} />}
          </Card>
        ))}
      </div>
    );
  }

  Object.assign(window, { Payables });
})();


// ---------- fin_procurement ----------
// ============================================================
// DAUST Admin — Finance › Procurement, Expense Claims, Petty Cash
// (Payables cluster — bills/PO already exist in fin_payables.jsx)
// ============================================================
(function () {
  const { useState } = React;

  // ---- Procurement (vendors / RFQs / contracts) ----
  function Procurement({ goFin }) {
    const [tab, setTab] = useState('vendors');
    return (
      <div>
        <window.Tabs tabs={[{ value: 'vendors', label: 'Vendor registry' }, { value: 'rfq', label: 'RFQs / tenders' }, { value: 'contracts', label: 'Contracts' }]} active={tab} onChange={setTab} />
        {tab === 'vendors' && <Vendors />}
        {tab === 'rfq' && <RFQs />}
        {tab === 'contracts' && <Contracts />}
      </div>
    );
  }

  function Vendors() {
    const [sel, setSel] = useState(null);
    const [q, setQ] = useState('');
    const V = window.VENDORS.filter(v => v.name.toLowerCase().includes(q.toLowerCase()));
    const tone = { Approved: 'success', Review: 'warning', Suspended: 'error' };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <window.Toolbar>
          <window.SearchInput placeholder="Search vendors…" value={q} onChange={setQ} width={260} />
          <div style={{ flex: 1 }} />
          <window.Button variant="primary" icon="plus">Register vendor</window.Button>
        </window.Toolbar>
        <window.Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Vendor</th><th>Category</th><th>Terms</th><th>Rating</th><th style={{ textAlign: 'right' }}>YTD spend</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {V.map(v => (
                  <tr key={v.id} style={{ cursor: 'pointer' }} onClick={() => setSel(v)}>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><span style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--bg-tint)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>{v.name[0]}</span><b style={{ color: 'var(--fg)' }}>{v.name}</b></span></td>
                    <td><window.Badge tone="neutral" dot={false} size="sm">{v.category}</window.Badge></td>
                    <td style={{ fontSize: 12.5 }}>{v.terms}</td>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, color: v.rating >= 4.2 ? 'var(--success-500)' : 'var(--fg)' }}><window.Icon name="star" size={13} style={{ color: 'var(--cta)' }} />{v.rating.toFixed(1)}</span></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={v.ytdSpend} /></td>
                    <td><window.Badge tone={tone[v.status]} size="sm">{v.status}</window.Badge></td>
                    <td style={{ textAlign: 'right' }}><window.Icon name="chevron-right" size={16} style={{ color: 'var(--fg-faint)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Card>
        <window.Drawer open={!!sel} onClose={() => setSel(null)} title="Vendor" width={440}
          footer={sel && <><window.Button variant="outline" icon="file-text">Bills</window.Button><window.Button variant="primary" icon="shopping-cart">New PO</window.Button></>}>
          {sel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'var(--bg-tint)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20 }}>{sel.name[0]}</span>
                <div><div style={{ fontWeight: 700, fontSize: 16 }}>{sel.name}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{sel.category} · {sel.id}</div></div>
              </div>
              <window.KV label="Contact" value={sel.contact} />
              <window.KV label="Payment terms" value={sel.terms} />
              <window.KV label="Rating" value={sel.rating.toFixed(1) + ' / 5'} />
              <window.KV label="YTD spend" value={<window.FCFA value={sel.ytdSpend} />} />
              <window.KV label="Status" value={sel.status} />
            </div>
          )}
        </window.Drawer>
      </div>
    );
  }

  function RFQs() {
    const tone = { Draft: 'neutral', Evaluating: 'warning', Awarded: 'success' };
    return (
      <window.Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>Requests for quotation</h3>
          <window.Button variant="primary" size="sm" icon="plus">New RFQ</window.Button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dt">
            <thead><tr><th>RFQ</th><th>Title</th><th>Department</th><th>Bids</th><th style={{ textAlign: 'right' }}>Lowest bid</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>
              {window.RFQS.map(rq => (
                <tr key={rq.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{rq.id}</td>
                  <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{rq.title}</td>
                  <td><window.Badge tone="neutral" dot={false} size="sm">{rq.dept}</window.Badge></td>
                  <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><window.Icon name="users" size={13} style={{ color: 'var(--fg-faint)' }} />{rq.bids}</span></td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={rq.lowest} /></td>
                  <td>{rq.due}</td>
                  <td><window.Badge tone={tone[rq.status]} size="sm">{rq.status}</window.Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </window.Card>
    );
  }

  function Contracts() {
    const tone = { Active: 'success', Expiring: 'warning', Expired: 'error' };
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(330px,1fr))', gap: 16 }}>
        {window.CONTRACTS.map(c => (
          <window.Card key={c.id} padding={20}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div><div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>{c.title}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{c.vendor} · {c.id}</div></div>
              <window.Badge tone={tone[c.status]} size="sm">{c.status}</window.Badge>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--fg)', marginBottom: 12 }}><window.FCFA value={c.value} /></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--fg-subtle)', paddingTop: 12, borderTop: '1px solid var(--divider)' }}>
              <span>{c.start} → {c.end}</span><span>Renewal: <b style={{ color: 'var(--fg-muted)' }}>{c.renewal}</b></span>
            </div>
          </window.Card>
        ))}
      </div>
    );
  }

  // ---- Expense Claims (multi-level approval) ----
  function ExpenseClaims({ goFin }) {
    const [sel, setSel] = useState(null);
    const [create, setCreate] = useState(false);
    const E = window.EXPENSE_CLAIMS;
    const pending = E.filter(x => x.status === 'Pending');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
          <window.Metric label="Awaiting approval" value={pending.length} sub={window.fmtFCFA(pending.reduce((a, x) => a + x.amount, 0), { short: true }) + ' FCFA'} tone="down" icon="clock" />
          <window.Metric label="Approved (month)" value={E.filter(x => x.status === 'Approved').length} sub="ready to pay" tone="up" icon="check-circle-2" />
          <window.Metric label="Rejected" value={E.filter(x => x.status === 'Rejected').length} sub="this month" icon="x-circle" />
        </div>
        <window.Toolbar>
          <window.SearchInput placeholder="Search claims…" value="" onChange={() => {}} width={260} />
          <div style={{ flex: 1 }} />
          <window.Button variant="primary" icon="plus" onClick={() => setCreate(true)}>New claim</window.Button>
        </window.Toolbar>
        <window.Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Claim</th><th>Staff</th><th>Department</th><th>Purpose</th><th style={{ textAlign: 'right' }}>Amount</th><th>Approval</th><th>Status</th></tr></thead>
              <tbody>
                {E.map(x => (
                  <tr key={x.id} style={{ cursor: 'pointer' }} onClick={() => setSel(x)}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{x.id}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{x.staff}</td>
                    <td>{x.dept}</td>
                    <td style={{ color: 'var(--fg-subtle)' }}>{x.purpose}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={x.amount} /></td>
                    <td><window.ApprovalChain stage={x.status === 'Rejected' ? null : x.stage} rejected={x.status === 'Rejected'} compact /></td>
                    <td><window.FinStatus status={x.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Card>

        <window.Drawer open={!!sel} onClose={() => setSel(null)} title={sel ? sel.id : ''} width={460}
          footer={sel && (sel.status === 'Pending' ? <><window.Button variant="danger" icon="x">Reject</window.Button><window.Button variant="primary" icon="check">Approve & advance</window.Button></> : <window.Button variant="outline" icon="printer">Print</window.Button>)}>
          {sel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)', padding: 18, textAlign: 'center' }}>
                <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{sel.purpose}</div>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-display)', margin: '6px 0' }}><window.FCFA value={sel.amount} /></div>
                <window.ThresholdNote amount={sel.amount} />
              </div>
              <window.KV label="Claimant" value={sel.staff} />
              <window.KV label="Department" value={sel.dept} />
              <window.KV label="Date" value={sel.date} />
              <div style={{ marginTop: 4 }}><div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg-muted)', marginBottom: 12 }}>Approval workflow</div><window.ApprovalChain stage={sel.status === 'Rejected' ? null : sel.stage} rejected={sel.status === 'Rejected'} /></div>
            </div>
          )}
        </window.Drawer>
        <window.Modal open={create} onClose={() => setCreate(false)} title="New expense claim" width={460}
          footer={<><window.Button variant="ghost" onClick={() => setCreate(false)}>Cancel</window.Button><window.Button variant="primary" icon="send" onClick={() => setCreate(false)}>Submit claim</window.Button></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <window.Field label="Purpose"><window.Input placeholder="e.g. Conference travel" /></window.Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <window.Field label="Amount (FCFA)"><window.Input type="number" placeholder="0" /></window.Field>
              <window.Field label="Date"><window.Input type="date" defaultValue="2026-05-29" /></window.Field>
            </div>
            <window.Field label="Attach receipt" hint="PDF or image"><window.Input type="file" /></window.Field>
          </div>
        </window.Modal>
      </div>
    );
  }

  // ---- Petty Cash ----
  function PettyCash({ goFin }) {
    const P = window.PETTY_CASH;
    const used = P.float - P.balance;
    const catColor = { Supplies: '#153B6A', Hospitality: '#ED8425', Transport: '#5B89C0', Postage: '#9DA6AE', Facilities: '#2E7D52' };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1.4fr)', gap: 16 }}>
          <window.Metric label="Float" value={<window.FCFA value={P.float} short />} sub="imprest amount" icon="wallet" />
          <window.Metric label="Balance on hand" value={<window.FCFA value={P.balance} short />} sub={'replenish at 400k'} tone={P.balance < 700000 ? 'down' : 'up'} icon="banknote" />
          <window.Card padding={18}>
            <div style={{ fontSize: 12, color: 'var(--fg-subtle)', fontWeight: 600, marginBottom: 8 }}>Float utilisation</div>
            <window.Progress value={used} max={P.float} tone={used > P.float * 0.7 ? 'warning' : 'teal'} height={10} showLabel />
            <div style={{ fontSize: 11.5, color: 'var(--fg-subtle)', marginTop: 8 }}>Custodian: <b style={{ color: 'var(--fg-muted)' }}>{P.custodian}</b></div>
          </window.Card>
        </div>
        <window.Panel title="Petty cash log" action={<div style={{ display: 'flex', gap: 8 }}><window.Button variant="outline" size="sm" icon="rotate-ccw">Replenish</window.Button><window.Button variant="primary" size="sm" icon="plus">Record expense</window.Button></div>}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Voucher</th><th>Date</th><th>Description</th><th>Category</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
              <tbody>
                {P.transactions.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{t.id}</td>
                    <td>{t.date}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{t.desc}</td>
                    <td><window.Badge tone="neutral" dot={false} size="sm"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: catColor[t.category] }} />{t.category}</span></window.Badge></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>{window.fmtFCFA(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Panel>
      </div>
    );
  }

  Object.assign(window, { Procurement, ExpenseClaims, PettyCash });
})();


// ---------- fin_treasury ----------
// ============================================================
// DAUST Admin — Finance › Treasury (bank accounts, cash position, transfers)
// ============================================================
(function () {
  const { useState } = React;

  function fmtAcctBal(a) {
    if (a.currency === 'USD') return '$' + window.fmtFCFA(Math.round(a.balance / window.USD_XOF));
    return window.fmtFCFA(a.balance) + ' FCFA';
  }

  // ---- Bank Accounts ----
  function TreasuryBanks({ goFin }) {
    const [sel, setSel] = useState(null);
    const [xfer, setXfer] = useState(false);
    const BA = window.BANK_ACCOUNTS;
    const totalXOF = BA.reduce((a, b) => a + b.balance, 0);
    const typeTone = { Current: 'info', Restricted: 'warning', Investment: 'teal', Wallet: 'neutral' };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="Total cash (all accounts)" value={<window.FCFA value={totalXOF} short />} sub={BA.length + ' accounts · 2 currencies'} tone="accent" icon="landmark" />
          <window.Metric label="Operating liquidity" value={<window.FCFA value={BA.filter(b => b.type === 'Current').reduce((a, b) => a + b.balance, 0)} short />} sub="immediately available" tone="up" icon="wallet" />
          <window.Metric label="Restricted" value={<window.FCFA value={BA.filter(b => b.type === 'Restricted').reduce((a, b) => a + b.balance, 0)} short />} sub="grant-locked" icon="lock" />
          <window.Metric label="Days cash on hand" value="142" sub="target ≥ 90" tone="up" icon="calendar-check" />
        </div>

        <window.Panel title="Bank & wallet accounts" action={<window.Button variant="primary" size="sm" icon="arrow-left-right" onClick={() => setXfer(true)}>New transfer</window.Button>}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Account</th><th>Bank</th><th>Number</th><th>Type</th><th>GL</th><th style={{ textAlign: 'right' }}>Balance</th><th></th></tr></thead>
              <tbody>
                {BA.map(a => (
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => setSel(a)}>
                    <td style={{ color: 'var(--fg)', fontWeight: 700 }}>{a.label}</td>
                    <td>{a.bank}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-subtle)' }}>{a.number}</td>
                    <td><window.Badge tone={typeTone[a.type]} dot={false} size="sm">{a.type}</window.Badge></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-subtle)' }}>{a.glCode}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>{fmtAcctBal(a)}{a.currency === 'USD' && <span style={{ color: 'var(--fg-faint)', fontWeight: 400 }}> USD</span>}</td>
                    <td style={{ textAlign: 'right' }}><window.Icon name="chevron-right" size={16} style={{ color: 'var(--fg-faint)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Panel>

        <window.Drawer open={!!sel} onClose={() => setSel(null)} title={sel ? sel.label : ''} width={460}
          footer={sel && <><window.Button variant="outline" icon="file-text">Statement</window.Button><window.Button variant="primary" icon="arrow-left-right" onClick={() => { setSel(null); setXfer(true); }}>Transfer</window.Button></>}>
          {sel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ background: 'var(--grad-dark-surface)', borderRadius: 'var(--radius-lg)', padding: 20, color: '#fff' }}>
                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)' }}>{sel.bank}</div>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-display)', margin: '8px 0' }}>{fmtAcctBal(sel)}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.04em' }}>{sel.number}</div>
              </div>
              <window.KV label="Account type" value={sel.type} />
              <window.KV label="Currency" value={sel.currency} />
              <window.KV label="GL mapping" value={sel.glCode} mono />
              <window.KV label="Last reconciled" value="2026-05-28" />
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg-muted)', marginTop: 4 }}>Recent movement</div>
              {window.BANK_TRANSFERS.filter(t => t.from.includes(sel.bank.split(' ')[0]) || t.to.includes(sel.bank.split(' ')[0])).slice(0, 3).map(t => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--divider)' }}>
                  <span style={{ color: 'var(--fg-muted)' }}>{t.memo}</span><span style={{ fontFamily: 'var(--font-mono)' }}>{window.fmtFCFA(t.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </window.Drawer>
        <TransferModal open={xfer} onClose={() => setXfer(false)} />
      </div>
    );
  }

  function TransferModal({ open, onClose }) {
    const opts = window.BANK_ACCOUNTS.map(a => a.label);
    return (
      <window.Modal open={open} onClose={onClose} title="New bank transfer" width={460}
        footer={<><window.Button variant="ghost" onClick={onClose}>Cancel</window.Button><window.Button variant="primary" icon="send" onClick={onClose}>Submit for approval</window.Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <window.Field label="From account"><window.Select options={opts} /></window.Field>
          <window.Field label="To account"><window.Select options={opts} /></window.Field>
          <window.Field label="Amount (FCFA)"><window.Input type="number" placeholder="420 000 000" /></window.Field>
          <window.Field label="Memo"><window.Input placeholder="e.g. May payroll funding" /></window.Field>
          <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', padding: '11px 14px', fontSize: 12.5, color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <window.Icon name="info" size={15} style={{ color: 'var(--accent)' }} />Transfers over 100M FCFA require Director approval.
          </div>
        </div>
      </window.Modal>
    );
  }

  // ---- Cash Position ----
  function TreasuryPosition({ goFin }) {
    const CP = window.CASH_POSITION;
    const labels = CP.filter((_, i) => i % 3 === 0).map(d => 'D' + d.day);
    const balances = CP.filter((_, i) => i % 3 === 0).map(d => d.balance);
    const minBal = Math.min(...CP.map(d => d.balance));
    const minDay = CP.find(d => d.balance === minBal).day;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="Opening balance" value={<window.FCFA value={3_700_000_000} short />} sub="today" icon="play" />
          <window.Metric label="Projected (30d)" value={<window.FCFA value={CP[CP.length - 1].balance} short />} sub="end of horizon" tone="up" icon="trending-up" />
          <window.Metric label="Lowest point" value={<window.FCFA value={minBal} short />} sub={'day ' + minDay + ' (post-payroll)'} tone={minBal < 2e9 ? 'down' : 'accent'} icon="trending-down" />
          <window.Metric label="Net 30-day flow" value={<window.FCFA value={CP[CP.length - 1].balance - 3_700_000_000} short />} sub="inflow − outflow" tone="up" icon="activity" />
        </div>
        <window.Panel title="30-day cash position projection" action={<window.Segmented size="sm" options={['30 days', '60 days', '90 days']} value="30 days" onChange={() => {}} />}>
          <window.AreaChart labels={labels} series={[{ name: 'Projected balance', data: balances }]} colors={['var(--accent)']} format={v => window.fmtFCFA(v, { short: true })} height={240} />
        </window.Panel>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 20 }}>
          <window.Panel title="Daily flow — next 7 days">
            <table className="dt" style={{ margin: '-4px 0' }}>
              <thead><tr><th>Day</th><th style={{ textAlign: 'right' }}>Inflow</th><th style={{ textAlign: 'right' }}>Outflow</th><th style={{ textAlign: 'right' }}>Balance</th></tr></thead>
              <tbody>
                {CP.slice(0, 7).map(d => (
                  <tr key={d.day}>
                    <td style={{ fontWeight: 600, color: 'var(--fg)' }}>Day {d.day}</td>
                    <td style={{ textAlign: 'right', color: 'var(--success-500)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>+{window.fmtFCFA(d.inflow, { short: true })}</td>
                    <td style={{ textAlign: 'right', color: 'var(--error-500)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>−{window.fmtFCFA(d.outflow, { short: true })}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{window.fmtFCFA(d.balance, { short: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </window.Panel>
          <window.Panel title="Liquidity guidance">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Guidance icon="alert-triangle" tone="warning" title="Payroll funding (Day 3)" body="Fund SGBS payroll account with 420M FCFA before the May run." />
              <Guidance icon="trending-up" tone="success" title="Tuition inflow steady" body="Weekly settlement cycles keep operating liquidity above 2.0B FCFA." />
              <Guidance icon="lock" tone="info" title="Restricted balance" body="1.28B FCFA in Ecobank is grant-locked — exclude from operating planning." />
            </div>
          </window.Panel>
        </div>
      </div>
    );
  }
  function Guidance({ icon, tone, title, body }) {
    const c = { warning: 'var(--warning-500)', success: 'var(--success-500)', info: 'var(--info-500)' }[tone];
    return (
      <div style={{ display: 'flex', gap: 12 }}>
        <span style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: `color-mix(in srgb, ${c} 12%, var(--surface))`, color: c, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><window.Icon name={icon} size={16} /></span>
        <div><div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--fg)' }}>{title}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginTop: 2 }}>{body}</div></div>
      </div>
    );
  }

  // ---- Transfers ----
  function TreasuryTransfers({ goFin }) {
    const [xfer, setXfer] = useState(false);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <window.Toolbar>
          <window.SearchInput placeholder="Search transfers…" value="" onChange={() => {}} width={260} />
          <div style={{ flex: 1 }} />
          <window.Button variant="primary" icon="plus" onClick={() => setXfer(true)}>New transfer</window.Button>
        </window.Toolbar>
        <window.Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Transfer</th><th>From</th><th>To</th><th>Memo</th><th>Initiator</th><th style={{ textAlign: 'right' }}>Amount</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {window.BANK_TRANSFERS.map(t => (
                  <tr key={t.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{t.id}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{t.from}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><window.Icon name="arrow-right" size={13} style={{ color: 'var(--fg-faint)' }} />{t.to}</span></td>
                    <td style={{ color: 'var(--fg-subtle)' }}>{t.memo}</td>
                    <td>{t.initiator}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={t.amount} /></td>
                    <td>{t.date}</td>
                    <td><window.FinStatus status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Card>
        <TransferModal open={xfer} onClose={() => setXfer(false)} />
      </div>
    );
  }

  Object.assign(window, { TreasuryBanks, TreasuryPosition, TreasuryTransfers });
})();


// ---------- fin_payroll ----------
// ============================================================
// DAUST Admin — Finance › Payroll (runs, payslips, deductions)
// ============================================================
(function () {
  const { useState, useEffect, useRef } = React;

  function Payroll({ goFin }) {
    const [q, setQ] = useState('');
    const [dept, setDept] = useState('All');
    const [sel, setSel] = useState(null);
    const [runOpen, setRunOpen] = useState(false);
    const PT = window.PAYROLL_TOTALS;
    const depts = ['All', ...Array.from(new Set(window.STAFF.map(s => s.dept)))];
    const rows = window.STAFF.filter(s => (dept === 'All' || s.dept === dept) && s.name.toLowerCase().includes(q.toLowerCase()));

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Run summary */}
        <Card padding={22}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 18 }}>
            <div>
              <div className="label" style={{ marginBottom: 4 }}>Current run</div>
              <h3 style={{ fontSize: 19, fontWeight: 700 }}>May 2026 · {PT.count} employees</h3>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Badge tone="warning">Draft · not yet processed</Badge>
              <Button variant="outline" icon="file-down">Export bank file</Button>
              <Button variant="primary" icon="play" onClick={() => setRunOpen(true)}>Process run</Button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px,1fr))', gap: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <RunCell label="Gross payroll" value={PT.gross} tone="fg" />
            <RunCell label="IPRES pension (5.6%)" value={PT.ipres} tone="muted" prefix="−" />
            <RunCell label="Income tax (IR)" value={PT.ir} tone="muted" prefix="−" />
            <RunCell label="Net disbursement" value={PT.net} tone="accent" last />
          </div>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.6fr)', gap: 20, alignItems: 'start' }}>
          <Panel title="Payroll trend">
            <BarChart data={[396, 401, 405, 408, 410, 412].map(v => v * 1e6)} labels={['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May']} color="var(--accent)" format={v => fmtFCFA(v, { short: true })} height={196} />
          </Panel>
          <Panel title="Run history">
            <table className="dt" style={{ margin: '-4px 0' }}>
              <thead><tr><th>Period</th><th>Employees</th><th>Net paid</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {[['April 2026', 141, 408_900_000, '2026-05-01'], ['March 2026', 140, 405_200_000, '2026-04-01'], ['February 2026', 139, 401_600_000, '2026-03-01'], ['January 2026', 138, 397_400_000, '2026-02-01']].map((r, i) => (
                  <tr key={i}><td style={{ color: 'var(--fg)', fontWeight: 600 }}>{r[0]}</td><td>{r[1]}</td><td style={{ fontWeight: 600, color: 'var(--fg)' }}><FCFA value={r[2]} /></td><td>{r[3]}</td><td><FinStatus status="Paid" /></td></tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>

        {/* Employee payslips */}
        <div>
          <Toolbar>
            <SearchInput placeholder="Search employee…" value={q} onChange={setQ} width={260} />
            <Select options={depts.map(d => ({ value: d, label: d === 'All' ? 'All departments' : d }))} value={dept} onChange={setDept} />
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 13, color: 'var(--fg-subtle)' }}>Click a row for the payslip</span>
          </Toolbar>
          <Card padding={0} style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="dt">
                <thead><tr><th>Employee</th><th>Department</th><th>Role</th><th>Gross</th><th>IPRES</th><th>IR</th><th>Net pay</th><th></th></tr></thead>
                <tbody>
                  {rows.map(s => {
                    const p = window.payslip(s);
                    return (
                      <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setSel(s)}>
                        <td><div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Avatar name={s.name} size={28} /><span style={{ color: 'var(--fg)', fontWeight: 600 }}>{s.name}</span></div></td>
                        <td>{s.dept}</td><td>{s.role}</td>
                        <td style={{ color: 'var(--fg)', fontWeight: 600 }}><FCFA value={p.gross} /></td>
                        <td style={{ color: 'var(--fg-subtle)' }}>−<FCFA value={p.ipres} /></td>
                        <td style={{ color: 'var(--fg-subtle)' }}>−<FCFA value={p.ir} /></td>
                        <td style={{ color: 'var(--accent)', fontWeight: 700 }}><FCFA value={p.net} /></td>
                        <td style={{ textAlign: 'right' }}><Icon name="chevron-right" size={16} style={{ color: 'var(--fg-faint)' }} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Payslip drawer */}
        <Drawer open={!!sel} onClose={() => setSel(null)} title="Payslip · May 2026" width={440}
          footer={sel && <><Button variant="outline" icon="printer">Print</Button><Button variant="primary" icon="send">Send to employee</Button></>}>
          {sel && <Payslip emp={sel} />}
        </Drawer>

        {/* Process run modal */}
        <Modal open={runOpen} onClose={() => setRunOpen(false)} title="Process May 2026 payroll" width={440}
          footer={<><Button variant="ghost" onClick={() => setRunOpen(false)}>Cancel</Button><Button variant="primary" icon="play" onClick={() => setRunOpen(false)}>Confirm & process</Button></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13.5 }}>You're about to process payroll for <b>{PT.count} employees</b>. This generates payslips, posts the journal entry, and queues the bank disbursement file.</p>
            <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)', padding: 16 }}>
              <KV label="Gross" value={<FCFA value={PT.gross} />} />
              <KV label="Total deductions" value={<FCFA value={PT.ipres + PT.ir} />} />
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, fontSize: 15, fontWeight: 800 }}><span>Net to disburse</span><span style={{ color: 'var(--accent)' }}><FCFA value={PT.net} /></span></div>
            </div>
            <Select options={['Pay date: 2026-06-01', 'Pay date: 2026-05-31']} />
          </div>
        </Modal>
      </div>
    );
  }

  function RunCell({ label, value, tone, prefix = '', last }) {
    const color = tone === 'accent' ? 'var(--accent)' : tone === 'muted' ? 'var(--fg-subtle)' : 'var(--fg)';
    return (
      <div style={{ padding: '16px 18px', borderRight: last ? 'none' : '1px solid var(--border)', background: last ? 'var(--bg-tint)' : 'transparent' }}>
        <div style={{ fontSize: 12, color: 'var(--fg-subtle)', marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 19, fontWeight: 800, color, letterSpacing: '-0.01em' }}>{prefix}{fmtFCFA(value, { short: true })} <span style={{ fontSize: 11, color: 'var(--fg-faint)' }}>FCFA</span></div>
      </div>
    );
  }

  function Payslip({ emp }) {
    const p = window.payslip(emp);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar name={emp.name} size={48} />
          <div><div style={{ fontWeight: 700, fontSize: 16 }}>{emp.name}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{emp.role} · {emp.dept}</div><div style={{ fontSize: 11.5, color: 'var(--fg-faint)', fontFamily: 'var(--font-mono)' }}>{emp.id} · {emp.type}</div></div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--success-500)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Earnings</div>
          <Row label="Base salary" value={p.gross * 0.86} />
          <Row label="Responsibility allowance" value={p.gross * 0.09} />
          <Row label="Transport allowance" value={p.gross * 0.05} />
          <Row label="Gross pay" value={p.gross} strong />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--error-500)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Deductions</div>
          <Row label="IPRES pension (5.6%)" value={-p.ipres} />
          <Row label="Income tax — IR" value={-p.ir} />
          <Row label="Total deductions" value={-(p.ipres + p.ir)} strong />
        </div>
        <div style={{ background: 'var(--bg-tint)', borderRadius: 'var(--radius-lg)', padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>Net pay</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)' }}><FCFA value={p.net} /></span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--fg-faint)' }}>Employer also contributes <b>{fmtFCFA(p.css)} FCFA</b> to CSS (social security). Paid monthly via CBAO on the 1st.</div>
      </div>
    );
  }
  function Row({ label, value, strong }) {
    const neg = value < 0;
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--divider)', fontSize: 13.5 }}>
        <span style={{ color: strong ? 'var(--fg)' : 'var(--fg-muted)', fontWeight: strong ? 700 : 400 }}>{label}</span>
        <span style={{ color: strong ? 'var(--fg)' : neg ? 'var(--error-500)' : 'var(--fg)', fontWeight: strong ? 700 : 600, fontFamily: 'var(--font-mono)' }}>{neg ? '−' : ''}{fmtFCFA(Math.abs(value))}</span>
      </div>
    );
  }

  Object.assign(window, { Payroll });
})();


// ---------- fin_payroll2 ----------
// ============================================================
// DAUST Admin — Finance › Payroll extras + Report Library
// Employees & contracts · Leave & accruals · Scheduled reports
// (Pay run + payslips live in fin_payroll.jsx as Payroll())
// ============================================================
(function () {
  const { useState } = React;

  // ---- Employees & contracts ----
  function PayrollEmployees({ goFin }) {
    const [sel, setSel] = useState(null);
    const [q, setQ] = useState('');
    const STAFF = window.STAFF;
    const rows = STAFF.filter(s => s.name.toLowerCase().includes(q.toLowerCase()));
    const contractTone = { 'Full-time': 'teal', Adjunct: 'info', Contract: 'warning' };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
          <window.Metric label="Headcount" value="142" sub="all contracts" tone="accent" icon="users" />
          <window.Metric label="Full-time" value={STAFF.filter(s => s.type === 'Full-time').length * 9} sub="permanent" icon="user-check" />
          <window.Metric label="Contracts expiring" value="6" sub="next 90 days" tone="down" icon="calendar-clock" />
          <window.Metric label="Avg. tenure" value="3.4 yr" sub="across faculty" icon="history" />
        </div>
        <window.Toolbar>
          <window.SearchInput placeholder="Search employee…" value={q} onChange={setQ} width={260} />
          <div style={{ flex: 1 }} />
          <window.Button variant="primary" icon="user-plus">Add employee</window.Button>
        </window.Toolbar>
        <window.Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Employee</th><th>Department</th><th>Role</th><th>Contract</th><th style={{ textAlign: 'right' }}>Gross salary</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {rows.map(s => (
                  <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setSel(s)}>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><window.Avatar name={s.name} size={30} /><div><div style={{ color: 'var(--fg)', fontWeight: 600 }}>{s.name}</div><div style={{ fontSize: 11.5, color: 'var(--fg-faint)', fontFamily: 'var(--font-mono)' }}>{s.id}</div></div></span></td>
                    <td>{s.dept}</td><td>{s.role}</td>
                    <td><window.Badge tone={contractTone[s.type]} dot={false} size="sm">{s.type}</window.Badge></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={s.salary} /></td>
                    <td><window.Badge tone={s.status === 'Active' ? 'success' : 'warning'} size="sm">{s.status}</window.Badge></td>
                    <td style={{ textAlign: 'right' }}><window.Icon name="chevron-right" size={16} style={{ color: 'var(--fg-faint)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Card>

        <window.Drawer open={!!sel} onClose={() => setSel(null)} title="Employee · contract" width={460}
          footer={sel && <><window.Button variant="outline" icon="file-text">Payslip history</window.Button><window.Button variant="primary" icon="pencil">Edit contract</window.Button></>}>
          {sel && (() => {
            const p = window.payslip(sel);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <window.Avatar name={sel.name} size={52} />
                  <div><div style={{ fontWeight: 700, fontSize: 17 }}>{sel.name}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{sel.role} · {sel.dept}</div><div style={{ marginTop: 5 }}><window.Badge tone={contractTone[sel.type]} dot={false} size="sm">{sel.type}</window.Badge></div></div>
                </div>
                <window.KV label="Employee ID" value={sel.id} mono />
                <window.KV label="Gross salary (monthly)" value={<window.FCFA value={sel.salary} />} />
                <window.KV label="Net pay (monthly)" value={<window.FCFA value={p.net} />} strong />
                <window.KV label="Contract type" value={sel.type} />
                <window.KV label="Contract end" value={sel.type === 'Full-time' ? 'Permanent' : '2026-12-31'} />
                <window.KV label="IPRES number" value={'SN-' + (3000000 + sel.id.charCodeAt(3) * 137)} mono />
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg-muted)', marginTop: 4 }}>Recent payslips</div>
                {['May 2026', 'April 2026', 'March 2026'].map((m, i) => (
                  <div key={m} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '7px 0', borderBottom: '1px solid var(--divider)' }}>
                    <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{m}</span><span style={{ fontFamily: 'var(--font-mono)' }}>{window.fmtFCFA(p.net)} FCFA</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </window.Drawer>
      </div>
    );
  }

  // ---- Leave & accruals ----
  function LeaveAccruals({ goFin }) {
    const STAFF = window.STAFF.slice(0, 10);
    const acc = (s, i) => ({ annual: 30, taken: 4 + (i % 14), eos: Math.round(s.salary * (2 + i % 4) / 12 * (3 + i % 5)) });
    const pendingReqs = [
      { staff: 'Dr. A. Diop', type: 'Annual leave', days: 5, from: '2026-06-09', status: 'Pending' },
      { staff: 'K. Mbaye', type: 'Sick leave', days: 2, from: '2026-05-30', status: 'Approved' },
      { staff: 'Dr. M. Sow', type: 'Conference', days: 3, from: '2026-06-16', status: 'Pending' },
    ];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="Leave liability" value={<window.FCFA value={184_500_000} short />} sub="accrued, unused" tone="down" icon="calendar" />
          <window.Metric label="End-of-service liability" value={<window.FCFA value={612_000_000} short />} sub="gratuity provision" tone="down" icon="briefcase" />
          <window.Metric label="Pending requests" value={pendingReqs.filter(r => r.status === 'Pending').length} sub="need approval" icon="clock" />
          <window.Metric label="Avg. leave balance" value="22 days" sub="of 30 annual" icon="sun" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
          <window.Panel title="Leave & end-of-service accruals">
            <div style={{ overflowX: 'auto' }}>
              <table className="dt" style={{ margin: '-4px 0' }}>
                <thead><tr><th>Employee</th><th>Annual</th><th>Taken</th><th>Balance</th><th style={{ textAlign: 'right' }}>EOS provision</th></tr></thead>
                <tbody>
                  {STAFF.map((s, i) => { const a = acc(s, i); return (
                    <tr key={s.id}>
                      <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}><window.Avatar name={s.name} size={26} /><span style={{ color: 'var(--fg)', fontWeight: 600 }}>{s.name}</span></span></td>
                      <td>{a.annual}d</td><td>{a.taken}d</td>
                      <td><b style={{ color: a.annual - a.taken < 8 ? 'var(--warning-500)' : 'var(--fg)' }}>{a.annual - a.taken}d</b></td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--fg)' }}>{window.fmtFCFA(a.eos)}</td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          </window.Panel>
          <window.Panel title="Leave requests" action={<window.Button variant="ghost" size="sm" icon="plus" /> }>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pendingReqs.map((r, i) => (
                <div key={i} style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--fg)' }}>{r.staff}</span><window.FinStatus status={r.status} />
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{r.type} · {r.days} days · from {r.from}</div>
                  {r.status === 'Pending' && <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><window.Button variant="primary" size="sm" icon="check">Approve</window.Button><window.Button variant="ghost" size="sm">Decline</window.Button></div>}
                </div>
              ))}
            </div>
          </window.Panel>
        </div>
      </div>
    );
  }

  // ---- Report Library (scheduled / on-demand) ----
  function ReportLibrary({ goFin }) {
    const reports = [
      { icon: 'wallet', title: 'Tuition collection report', desc: 'Billed vs collected by program & term', cat: 'Receivables', sched: 'Weekly · Mon 06:00' },
      { icon: 'trending-up', title: 'Management accounts pack', desc: 'Full P&L, balance sheet, cash flow + commentary', cat: 'Statements', sched: 'Monthly · close+2' },
      { icon: 'users', title: 'Payroll summary', desc: 'Gross-to-net, deductions, by department', cat: 'Payroll', sched: 'Monthly · run day' },
      { icon: 'award', title: 'Grant burn & compliance', desc: 'Spend vs award, sponsor reporting', cat: 'Funds', sched: 'Quarterly' },
      { icon: 'landmark', title: 'Treasury & cash position', desc: 'Bank balances, 30-day projection', cat: 'Treasury', sched: 'Daily · 07:00' },
      { icon: 'pie-chart', title: 'Budget variance', desc: 'Allocated vs actual vs encumbered', cat: 'Budget', sched: 'Monthly' },
      { icon: 'shield-check', title: 'Tax & statutory pack', desc: 'TVA, IR, IPRES, CSS filing summary', cat: 'Compliance', sched: 'Monthly · pre-deadline' },
      { icon: 'package', title: 'Fixed asset register', desc: 'NBV, depreciation, additions/disposals', cat: 'Assets', sched: 'On demand' },
      { icon: 'file-bar-chart', title: 'Board finance dashboard', desc: 'KPIs, scenarios, ratios — board-ready', cat: 'Executive', sched: 'Quarterly' },
    ];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <window.Toolbar>
          <window.SearchInput placeholder="Search reports…" value="" onChange={() => {}} width={260} />
          <div style={{ flex: 1 }} />
          <window.Button variant="outline" icon="calendar-clock">Scheduled</window.Button>
          <window.Button variant="primary" icon="plus">Custom report</window.Button>
        </window.Toolbar>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
          {reports.map(r => (
            <window.Card key={r.title} hover padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ width: 42, height: 42, borderRadius: 'var(--radius-md)', background: 'var(--bg-tint)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><window.Icon name={r.icon} size={20} /></span>
                <window.Badge tone="neutral" dot={false} size="sm">{r.cat}</window.Badge>
              </div>
              <div><div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--fg)' }}>{r.title}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginTop: 3 }}>{r.desc}</div></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--fg-faint)' }}><window.Icon name="clock" size={12} />{r.sched}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 6 }}>
                <window.Button variant="outline" size="sm" icon="eye">Preview</window.Button>
                <window.Button variant="ghost" size="sm" icon="download">Export</window.Button>
              </div>
            </window.Card>
          ))}
        </div>
      </div>
    );
  }

  Object.assign(window, { PayrollEmployees, LeaveAccruals, ReportLibrary });
})();


// ---------- fin_funds ----------
// ============================================================
// DAUST Admin — Finance › Funds (grants & endowment)
// ============================================================
(function () {
  const { useState } = React;

  // ---- Grants & restricted funds ----
  function Grants({ goFin }) {
    const [sel, setSel] = useState(null);
    const G = window.GRANTS;
    const totalAward = G.reduce((a, g) => a + g.award, 0);
    const totalSpent = G.reduce((a, g) => a + g.spent, 0);
    const active = G.filter(g => g.status === 'Active').length;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="Total awarded" value={<window.FCFA value={totalAward} short />} sub={G.length + ' grants'} tone="accent" icon="award" />
          <window.Metric label="Spent to date" value={<window.FCFA value={totalSpent} short />} sub={Math.round(totalSpent / totalAward * 100) + '% burn'} icon="activity" />
          <window.Metric label="Remaining" value={<window.FCFA value={totalAward - totalSpent} short />} sub="available" tone="up" icon="wallet" />
          <window.Metric label="Active awards" value={active} sub={(G.length - active) + ' closing'} icon="folder-open" />
        </div>

        <window.Panel title="Grant portfolio" action={<window.Button variant="primary" size="sm" icon="plus">Add award</window.Button>}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Grant</th><th>Sponsor</th><th>PI</th><th>Period</th><th style={{ textAlign: 'right' }}>Award</th><th style={{ width: 150 }}>Burn</th><th>Status</th></tr></thead>
              <tbody>
                {G.map(g => {
                  const pct = Math.round(g.spent / g.award * 100);
                  return (
                    <tr key={g.id} style={{ cursor: 'pointer' }} onClick={() => setSel(g)}>
                      <td style={{ maxWidth: 240 }}><div style={{ color: 'var(--fg)', fontWeight: 600 }}>{g.title}</div><div style={{ fontSize: 11.5, color: 'var(--fg-faint)', fontFamily: 'var(--font-mono)' }}>{g.id} · {g.school}</div></td>
                      <td>{g.sponsor}</td>
                      <td>{g.pi}</td>
                      <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{g.start} → {g.end}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={g.award} /></td>
                      <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><window.Progress value={g.spent} max={g.award} tone={pct > 90 ? 'warning' : 'teal'} height={6} /><span style={{ fontSize: 11.5, color: 'var(--fg-subtle)', minWidth: 30 }}>{pct}%</span></div></td>
                      <td><window.FinStatus status={g.status === 'Closing' ? 'In progress' : 'Active'} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </window.Panel>

        <window.Drawer open={!!sel} onClose={() => setSel(null)} title="Grant detail" width={500}
          footer={sel && <><window.Button variant="outline" icon="file-text">Sponsor report</window.Button><window.Button variant="primary" icon="receipt">Post expense</window.Button></>}>
          {sel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div><div className="label" style={{ marginBottom: 6 }}>{sel.sponsor}</div><div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-display)', lineHeight: 1.2 }}>{sel.title}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginTop: 4 }}>{sel.id} · PI: {sel.pi}</div></div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', padding: 14, textAlign: 'center' }}><div style={{ fontSize: 19, fontWeight: 800, fontFamily: 'var(--font-display)' }}><window.FCFA value={sel.award} short /></div><div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>Award</div></div>
                <div style={{ flex: 1, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', padding: 14, textAlign: 'center' }}><div style={{ fontSize: 19, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--accent)' }}><window.FCFA value={sel.spent} short /></div><div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>Spent</div></div>
                <div style={{ flex: 1, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', padding: 14, textAlign: 'center' }}><div style={{ fontSize: 19, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--success-500)' }}><window.FCFA value={sel.award - sel.spent} short /></div><div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>Remaining</div></div>
              </div>
              <div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginBottom: 7 }}>Budget utilisation</div><window.Progress value={sel.spent} max={sel.award} tone="teal" height={10} showLabel /></div>
              <window.KV label="Period" value={sel.start + ' → ' + sel.end} />
              <window.KV label="School / dept" value={sel.school} />
              <window.KV label="Indirect cost (overhead)" value={sel.overhead + '%'} />
              <window.KV label="Restricted fund" value="Yes — Ecobank (521300)" />
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg-muted)', marginTop: 4 }}>Spend by category</div>
              {[['Personnel & stipends', 0.52], ['Equipment', 0.24], ['Travel & dissemination', 0.13], ['Indirect / overhead', 0.11]].map((c, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid var(--divider)' }}>
                  <span style={{ color: 'var(--fg-muted)' }}>{c[0]}</span><span style={{ fontFamily: 'var(--font-mono)' }}>{window.fmtFCFA(Math.round(sel.spent * c[1]))}</span>
                </div>
              ))}
            </div>
          )}
        </window.Drawer>
      </div>
    );
  }

  // ---- Endowment ----
  function Endowment({ goFin }) {
    const E = window.ENDOWMENT;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="Market value" value={<window.FCFA value={E.marketValue} short />} sub="as of May 2026" tone="accent" icon="landmark" />
          <window.Metric label="Corpus" value={<window.FCFA value={E.corpus} short />} sub="permanently restricted" icon="lock" />
          <window.Metric label="YTD return" value={'+' + E.ytdReturn + '%'} sub="net of fees" tone="up" icon="trending-up" />
          <window.Metric label="Payout (YTD)" value={<window.FCFA value={E.payoutYTD} short />} sub={E.spendingRate + '% spending rate'} icon="hand-coins" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
          <window.Panel title="Endowment value — 6-year history" action={<window.Segmented size="sm" options={['Value', 'Return']} value="Value" onChange={() => {}} />}>
            <window.AreaChart labels={['FY21', 'FY22', 'FY23', 'FY24', 'FY25', 'FY26']} series={[{ name: 'Market value', data: E.history }]} colors={['var(--accent)']} format={v => window.fmtFCFA(v, { short: true })} height={236} />
          </window.Panel>
          <window.Panel title="Asset allocation">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <window.Donut size={150} thickness={20} segments={E.allocation} centerLabel={E.ytdReturn + '%'} centerSub="YTD" />
              <window.LegendList items={E.allocation} />
            </div>
          </window.Panel>
        </div>

        <window.Panel title="Named funds within the endowment" action={<window.Button variant="primary" size="sm" icon="plus">Add fund</window.Button>}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Fund</th><th>Donor</th><th>Purpose</th><th style={{ textAlign: 'right' }}>Value</th><th style={{ textAlign: 'right' }}>Annual payout*</th></tr></thead>
              <tbody>
                {E.funds.map(f => (
                  <tr key={f.name}>
                    <td style={{ color: 'var(--fg)', fontWeight: 700 }}>{f.name}</td>
                    <td>{f.donor}</td>
                    <td style={{ color: 'var(--fg-subtle)' }}>{f.purpose}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={f.value} /></td>
                    <td style={{ textAlign: 'right', color: 'var(--accent)', fontWeight: 600 }}><window.FCFA value={Math.round(f.value * E.spendingRate / 100)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 8 }}>*Based on {E.spendingRate}% spending policy applied to trailing average value.</div>
        </window.Panel>
      </div>
    );
  }

  Object.assign(window, { Grants, Endowment });
})();


// ---------- fin_assets ----------
// ============================================================
// DAUST Admin — Finance › Assets (fixed asset register + depreciation)
// ============================================================
(function () {
  const { useState } = React;

  function nbv(a) { return a.cost - a.accumDep; }

  function AssetRegister({ goFin }) {
    const [sel, setSel] = useState(null);
    const [q, setQ] = useState('');
    const A = window.ASSETS;
    const totalCost = A.reduce((s, a) => s + a.cost, 0);
    const totalDep = A.reduce((s, a) => s + a.accumDep, 0);
    const catColor = c => (window.ASSET_CATEGORIES.find(x => x.cat === c) || {}).color || 'var(--accent)';
    const rows = A.filter(a => a.name.toLowerCase().includes(q.toLowerCase()) || a.id.toLowerCase().includes(q.toLowerCase()));
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="Gross book value" value={<window.FCFA value={totalCost} short />} sub={A.length + ' assets'} tone="accent" icon="package" />
          <window.Metric label="Accumulated dep." value={<window.FCFA value={totalDep} short />} sub={Math.round(totalDep / totalCost * 100) + '% depreciated'} icon="trending-down" />
          <window.Metric label="Net book value" value={<window.FCFA value={totalCost - totalDep} short />} sub="carrying amount" tone="up" icon="landmark" />
          <window.Metric label="Monthly dep." value={<window.FCFA value={41_200_000} short />} sub="straight-line" icon="calendar" />
        </div>
        <window.Toolbar>
          <window.SearchInput placeholder="Search assets…" value={q} onChange={setQ} width={260} />
          <div style={{ flex: 1 }} />
          <window.Button variant="outline" icon="download">Export register</window.Button>
          <window.Button variant="primary" icon="plus">Add asset</window.Button>
        </window.Toolbar>
        <window.Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Tag</th><th>Asset</th><th>Category</th><th>Acquired</th><th style={{ textAlign: 'right' }}>Cost</th><th style={{ textAlign: 'right' }}>Accum. dep.</th><th style={{ textAlign: 'right' }}>NBV</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map(a => (
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => setSel(a)}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{a.id}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{a.name}</td>
                    <td><window.Badge tone="neutral" dot={false} size="sm"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: catColor(a.cat) }} />{a.cat}</span></window.Badge></td>
                    <td>{a.acquired}</td>
                    <td style={{ textAlign: 'right', color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{window.fmtFCFA(a.cost)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--fg-subtle)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{window.fmtFCFA(a.accumDep)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{window.fmtFCFA(nbv(a))}</td>
                    <td><window.Badge tone={a.status === 'New' ? 'info' : 'success'} size="sm">{a.status}</window.Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Card>

        <window.Drawer open={!!sel} onClose={() => setSel(null)} title="Asset detail" width={460}
          footer={sel && <><window.Button variant="danger" icon="archive">Dispose</window.Button><window.Button variant="primary" icon="pencil">Edit</window.Button></>}>
          {sel && (() => {
            const cat = window.ASSET_CATEGORIES.find(c => c.cat === sel.cat) || { life: 10 };
            const pct = Math.round(sel.accumDep / sel.cost * 100);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div><div className="label" style={{ marginBottom: 6 }}>{sel.id}</div><div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-display)' }}>{sel.name}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{sel.cat}</div></div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', padding: 14, textAlign: 'center' }}><div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-display)' }}><window.FCFA value={sel.cost} short /></div><div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>Cost</div></div>
                  <div style={{ flex: 1, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', padding: 14, textAlign: 'center' }}><div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--success-500)' }}><window.FCFA value={nbv(sel)} short /></div><div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>Net book value</div></div>
                </div>
                <div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginBottom: 7 }}>Depreciation progress</div><window.Progress value={sel.accumDep} max={sel.cost} tone={pct > 85 ? 'warning' : 'teal'} height={10} showLabel /></div>
                <window.KV label="GL account" value={cat.gl} mono />
                <window.KV label="Acquired" value={sel.acquired} />
                <window.KV label="Useful life" value={cat.life + ' years (straight-line)'} />
                <window.KV label="Annual depreciation" value={<window.FCFA value={Math.round(sel.cost / cat.life)} />} />
                <window.KV label="Status" value={sel.status} />
              </div>
            );
          })()}
        </window.Drawer>
      </div>
    );
  }

  function Depreciation({ goFin }) {
    const CATS = window.ASSET_CATEGORIES;
    const A = window.ASSETS;
    const byCat = CATS.map(c => {
      const items = A.filter(a => a.cat === c.cat);
      const cost = items.reduce((s, a) => s + a.cost, 0);
      const dep = items.reduce((s, a) => s + a.accumDep, 0);
      const annual = items.reduce((s, a) => s + Math.round(a.cost / c.life), 0);
      return { ...c, cost, dep, annual, count: items.length };
    }).filter(c => c.count > 0);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.4fr)', gap: 20, alignItems: 'start' }}>
          <window.Panel title="Net book value by class">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <window.Donut size={150} thickness={20} segments={byCat.map(c => ({ label: c.cat, value: c.cost - c.dep, color: c.color }))}
                centerLabel={window.fmtFCFA(byCat.reduce((s, c) => s + (c.cost - c.dep), 0), { short: true })} centerSub="NBV" />
              <window.LegendList items={byCat.map(c => ({ label: c.cat, value: c.cost - c.dep, color: c.color }))} fmt={v => window.fmtFCFA(v, { short: true })} />
            </div>
          </window.Panel>
          <window.Panel title="Depreciation schedule — by asset class" action={<window.Button variant="outline" size="sm" icon="play">Run monthly</window.Button>}>
            <div style={{ overflowX: 'auto' }}>
              <table className="dt" style={{ margin: '-4px 0' }}>
                <thead><tr><th>Class</th><th>Life</th><th>Assets</th><th style={{ textAlign: 'right' }}>Cost</th><th style={{ textAlign: 'right' }}>Annual dep.</th><th style={{ textAlign: 'right' }}>NBV</th></tr></thead>
                <tbody>
                  {byCat.map(c => (
                    <tr key={c.cat}>
                      <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--fg)' }}><span style={{ width: 9, height: 9, borderRadius: 3, background: c.color }} />{c.cat}</span></td>
                      <td>{c.life}y</td>
                      <td>{c.count}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{window.fmtFCFA(c.cost)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--cta)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{window.fmtFCFA(c.annual)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{window.fmtFCFA(c.cost - c.dep)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                    <td colSpan={3} style={{ fontWeight: 700, color: 'var(--fg)', padding: '13px 16px' }}>Total</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{window.fmtFCFA(byCat.reduce((s, c) => s + c.cost, 0))}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--cta)' }}>{window.fmtFCFA(byCat.reduce((s, c) => s + c.annual, 0))}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{window.fmtFCFA(byCat.reduce((s, c) => s + (c.cost - c.dep), 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </window.Panel>
        </div>
        <window.Panel title="5-year depreciation forecast">
          <window.BarChart data={[494, 458, 412, 366, 318].map(v => v * 1e6)} labels={['FY26', 'FY27', 'FY28', 'FY29', 'FY30']} color="var(--cta)" format={v => window.fmtFCFA(v, { short: true })} height={200} />
        </window.Panel>
      </div>
    );
  }

  Object.assign(window, { AssetRegister, Depreciation });
})();


// ---------- fin_accounting ----------
// ============================================================
// DAUST Admin — Finance › Accounting extras
// Recurring journals · Bank reconciliation · Period close · Tax & compliance
// (CoA / Journal / Trial balance live in fin_ledger.jsx)
// ============================================================
(function () {
  const { useState } = React;

  // ---- Recurring journals ----
  function RecurringJournals({ goFin }) {
    const [items, setItems] = useState(window.RECURRING.map(r => ({ ...r })));
    const toggle = id => setItems(items.map(r => r.id === id ? { ...r, active: !r.active } : r));
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="Active templates" value={items.filter(r => r.active).length} sub={'of ' + items.length} tone="up" icon="repeat" />
          <window.Metric label="Monthly auto-post" value={<window.FCFA value={items.filter(r => r.active).reduce((a, r) => a + r.amount, 0)} short />} sub="total recurring" icon="calendar-clock" />
          <window.Metric label="Next run" value="May 28" sub="depreciation + deferred rev." icon="clock" />
        </div>
        <window.Panel title="Recurring journal templates" action={<window.Button variant="primary" size="sm" icon="plus">New template</window.Button>}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Template</th><th>Schedule</th><th>Debit</th><th>Credit</th><th style={{ textAlign: 'right' }}>Amount</th><th>Next run</th><th>Active</th></tr></thead>
              <tbody>
                {items.map(r => (
                  <tr key={r.id}>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{r.desc}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{r.schedule}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.debit}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.credit}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={r.amount} /></td>
                    <td>{r.next}</td>
                    <td><window.Toggle checked={r.active} onChange={() => toggle(r.id)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Panel>
      </div>
    );
  }

  // ---- Bank reconciliation (matching) ----
  function Reconciliation({ goFin }) {
    const R = window.RECON;
    const [items, setItems] = useState(R.items.map(i => ({ ...i })));
    const matchedCount = items.filter(i => i.matched).length;
    const unmatched = items.filter(i => !i.matched);
    const diff = R.statementBal - R.bookBal;
    const toggle = id => setItems(items.map(i => i.id === id ? { ...i, matched: !i.matched } : i));
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="Statement balance" value={<window.FCFA value={R.statementBal} short />} sub={R.account} icon="building-2" />
          <window.Metric label="Book balance" value={<window.FCFA value={R.bookBal} short />} sub="general ledger" icon="book-open" />
          <window.Metric label="Difference" value={<window.FCFA value={diff} short />} sub={unmatched.length + ' unreconciled items'} tone={diff === 0 ? 'up' : 'down'} icon="git-compare" />
          <window.Metric label="Matched" value={matchedCount + '/' + items.length} sub="auto + manual" tone="up" icon="check-check" />
        </div>
        <window.Panel title="Reconciliation items" action={<window.Button variant="primary" size="sm" icon="check-check">Auto-match</window.Button>}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Date</th><th>Description</th><th style={{ textAlign: 'right' }}>Bank</th><th style={{ textAlign: 'right' }}>Book</th><th>Match</th></tr></thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id} style={{ background: i.matched ? 'transparent' : 'rgba(237,132,37,0.05)' }}>
                    <td>{i.date}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{i.desc}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: i.bank < 0 ? 'var(--error-500)' : 'var(--fg)' }}>{i.bank ? window.fmtFCFA(i.bank) : '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: i.book < 0 ? 'var(--error-500)' : 'var(--fg)' }}>{i.book ? window.fmtFCFA(i.book) : '—'}</td>
                    <td>{i.matched ? <window.Badge tone="success" size="sm">Matched</window.Badge> : <window.Button variant="outline" size="sm" icon="link" onClick={() => toggle(i.id)}>Match</window.Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {unmatched.length > 0 && (
            <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', background: 'rgba(237,132,37,0.1)', borderRadius: 'var(--radius-md)', padding: '11px 14px', fontSize: 13, color: 'var(--fg-muted)' }}>
              <window.Icon name="alert-triangle" size={16} style={{ color: 'var(--warning-500)' }} />
              {unmatched.length} items need attention — bank charges & interest must be posted to the ledger; uncleared cheque is timing only.
            </div>
          )}
        </window.Panel>
      </div>
    );
  }

  // ---- Period close ----
  function PeriodClose({ goFin }) {
    const [tasks, setTasks] = useState(window.CLOSE_TASKS.map(t => ({ ...t })));
    const done = tasks.filter(t => t.done).length;
    const pct = Math.round(done / tasks.length * 100);
    const toggle = id => setTasks(tasks.map(t => t.id === id ? { ...t, done: !t.done } : t));
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <window.Card padding={22}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
            <div>
              <div className="label" style={{ marginBottom: 4 }}>Accounting period</div>
              <h3 style={{ fontSize: 20, fontFamily: 'var(--font-display)' }}>May 2026 — Month-end close</h3>
              <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginTop: 2 }}>{done} of {tasks.length} tasks complete · target lock 2026-06-05</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 34, fontWeight: 800, fontFamily: 'var(--font-display)', color: pct === 100 ? 'var(--success-500)' : 'var(--cta)' }}>{pct}%</div>
              <window.Button variant={pct === 100 ? 'primary' : 'outline'} size="sm" icon="lock" style={{ marginTop: 6 }}>{pct === 100 ? 'Lock period' : 'Lock (pending)'}</window.Button>
            </div>
          </div>
          <div style={{ marginTop: 16 }}><window.Progress value={done} max={tasks.length} tone={pct === 100 ? 'success' : 'teal'} height={10} /></div>
        </window.Card>
        <window.Panel title="Close checklist">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {tasks.map((t, i) => (
              <div key={t.id} onClick={() => toggle(t.id)} className="row-hover" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 6px', borderBottom: i < tasks.length - 1 ? '1px solid var(--divider)' : 'none', cursor: 'pointer' }}>
                <span style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, background: t.done ? 'var(--success-500)' : 'transparent', border: t.done ? 'none' : '1.5px solid var(--border-strong)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t.done && <window.Icon name="check" size={14} style={{ color: '#fff' }} />}</span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: t.done ? 'var(--fg-subtle)' : 'var(--fg)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.task}</span>
                <window.Badge tone="neutral" dot={false} size="sm">{t.owner}</window.Badge>
              </div>
            ))}
          </div>
        </window.Panel>
      </div>
    );
  }

  // ---- Tax & statutory compliance ----
  function TaxCompliance({ goFin }) {
    const [sel, setSel] = useState(null);
    const T = window.TAX_FILINGS;
    const pending = T.filter(t => t.status === 'Pending');
    const dueTotal = pending.reduce((a, t) => a + t.amount, 0);
    const authTone = { DGID: 'info', IPRES: 'teal', CSS: 'warning' };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="Due this period" value={<window.FCFA value={dueTotal} short />} sub={pending.length + ' filings'} tone="down" icon="alert-circle" />
          <window.Metric label="Next deadline" value="Jun 10" sub="IPRES + CSS" tone="down" icon="calendar-clock" />
          <window.Metric label="Filed (YTD)" value={T.filter(t => t.status === 'Filed').length} sub="on time" tone="up" icon="check-circle-2" />
          <window.Metric label="Compliance" value="100%" sub="no penalties" tone="up" icon="shield-check" />
        </div>
        <window.Panel title="Statutory filings — Senegal" action={<window.Button variant="primary" size="sm" icon="upload">File return</window.Button>}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Filing</th><th>Authority</th><th>Base</th><th>Rate</th><th style={{ textAlign: 'right' }}>Amount due</th><th>Due date</th><th>Status</th></tr></thead>
              <tbody>
                {T.map(t => (
                  <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setSel(t)}>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{t.name}</td>
                    <td><window.Badge tone={authTone[t.authority]} dot={false} size="sm">{t.authority}</window.Badge></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--fg-subtle)' }}>{window.fmtFCFA(t.base)}</td>
                    <td style={{ fontSize: 12.5 }}>{t.rate}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={t.amount} /></td>
                    <td>{t.due}</td>
                    <td><window.FinStatus status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Panel>
        <window.Drawer open={!!sel} onClose={() => setSel(null)} title={sel ? sel.name : ''} width={420}
          footer={sel && (sel.status === 'Pending' ? <window.Button variant="primary" icon="upload">Mark as filed</window.Button> : <window.Button variant="outline" icon="download">Receipt</window.Button>)}>
          {sel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-lg)', padding: 18, textAlign: 'center' }}>
                <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>Amount due to {sel.authority}</div>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'var(--font-display)', margin: '6px 0' }}><window.FCFA value={sel.amount} /></div>
                <window.FinStatus status={sel.status} />
              </div>
              <window.KV label="Taxable base" value={<window.FCFA value={sel.base} />} />
              <window.KV label="Rate" value={sel.rate} />
              <window.KV label="Authority" value={sel.authority} />
              <window.KV label="Due date" value={sel.due} />
            </div>
          )}
        </window.Drawer>
      </div>
    );
  }

  Object.assign(window, { RecurringJournals, Reconciliation, PeriodClose, TaxCompliance });
})();


// ---------- fin_ledger ----------
// ============================================================
// DAUST Admin — Finance › Ledger (CoA, journal, trial balance)
// ============================================================
(function () {
  const { useState, useEffect, useRef } = React;

  const TYPE_TONE = { Asset: 'info', Liability: 'warning', Equity: 'teal', Revenue: 'success', Expense: 'error' };
  const TYPE_ORDER = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];

  function Ledger({ goFin }) {
    const [tab, setTab] = useState('coa');
    return (
      <div>
        <Tabs tabs={[{ value: 'coa', label: 'Chart of accounts' }, { value: 'journal', label: 'Journal entries' }, { value: 'trial', label: 'Trial balance' }]} active={tab} onChange={setTab} />
        {tab === 'coa' && <ChartOfAccounts />}
        {tab === 'journal' && <Journal />}
        {tab === 'trial' && <TrialBalance />}
      </div>
    );
  }

  function ChartOfAccounts() {
    const A = window.ACCOUNTS;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {TYPE_ORDER.map(type => {
          const accts = A.filter(a => a.type === type);
          const subtotal = accts.reduce((s, a) => s + a.balance, 0);
          return (
            <Card key={type} padding={0} style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 18px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}><Badge tone={TYPE_TONE[type]} dot={false} size="sm">{type}</Badge></span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--fg)' }}><FCFA value={subtotal} /></span>
              </div>
              <table className="dt">
                <tbody>
                  {accts.map(a => (
                    <tr key={a.code}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--fg-subtle)', width: 80 }}>{a.code}</td>
                      <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{a.name}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--fg)', fontFamily: 'var(--font-mono)', fontSize: 13 }}><FCFA value={a.balance} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          );
        })}
      </div>
    );
  }

  function Journal() {
    const [sel, setSel] = useState(null);
    return (
      <div>
        <Toolbar>
          <SearchInput placeholder="Search entries…" value="" onChange={() => {}} width={260} />
          <div style={{ flex: 1 }} />
          <Button variant="outline" icon="download" size="md">Export</Button>
          <Button variant="primary" icon="plus" size="md">New entry</Button>
        </Toolbar>
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Entry</th><th>Date</th><th>Description</th><th>Debit</th><th>Credit</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {window.JOURNAL.map(j => (
                  <tr key={j.id} style={{ cursor: 'pointer' }} onClick={() => setSel(j)}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{j.id}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{j.date}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{j.desc}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{j.debit}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{j.credit}</td>
                    <td style={{ fontWeight: 700, color: 'var(--fg)' }}><FCFA value={j.amount} /></td>
                    <td><FinStatus status={j.posted ? 'Posted' : 'Draft'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Drawer open={!!sel} onClose={() => setSel(null)} title={sel ? sel.id : ''} width={440}
          footer={sel && (!sel.posted ? <><Button variant="outline">Edit</Button><Button variant="primary" icon="check">Post entry</Button></> : <Button variant="outline" icon="printer">Print</Button>)}>
          {sel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div><div style={{ fontSize: 15, fontWeight: 700 }}>{sel.desc}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{sel.date} · {sel.posted ? 'Posted' : 'Draft'}</div></div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 14px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md) var(--radius-md) 0 0', fontSize: 11.5, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <span>Account</span><span>Debit</span><span>Credit</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', border: '1px solid var(--border)', borderTop: 'none', fontSize: 13.5 }}>
                  <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{sel.debit}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg)' }}>{fmtFCFA(sel.amount)}</span>
                  <span style={{ color: 'var(--fg-faint)' }}>—</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 var(--radius-md) var(--radius-md)', fontSize: 13.5 }}>
                  <span style={{ color: 'var(--fg)', fontWeight: 600, paddingLeft: 16 }}>{sel.credit}</span>
                  <span style={{ color: 'var(--fg-faint)' }}>—</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg)' }}>{fmtFCFA(sel.amount)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 700, padding: '0 14px' }}>
                <span>Balanced</span><span style={{ color: 'var(--success-500)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="check-circle-2" size={16} />Dr = Cr</span>
              </div>
            </div>
          )}
        </Drawer>
      </div>
    );
  }

  function TrialBalance() {
    const A = window.ACCOUNTS;
    // Debit-normal: Asset, Expense. Credit-normal: Liability, Equity, Revenue.
    const isDebit = t => t === 'Asset' || t === 'Expense';
    const totalDr = A.filter(a => isDebit(a.type)).reduce((s, a) => s + a.balance, 0);
    const totalCr = A.filter(a => !isDebit(a.type)).reduce((s, a) => s + a.balance, 0);
    return (
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>Trial balance · as of 28 May 2026</h3>
          <Button variant="outline" size="sm" icon="download">Export</Button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="dt">
            <thead><tr><th>Code</th><th>Account</th><th>Type</th><th style={{ textAlign: 'right' }}>Debit</th><th style={{ textAlign: 'right' }}>Credit</th></tr></thead>
            <tbody>
              {A.map(a => {
                const dr = isDebit(a.type);
                return (
                  <tr key={a.code}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--fg-subtle)' }}>{a.code}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{a.name}</td>
                    <td><Badge tone={TYPE_TONE[a.type]} dot={false} size="sm">{a.type}</Badge></td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: dr ? 'var(--fg)' : 'var(--fg-faint)' }}>{dr ? fmtFCFA(a.balance) : '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13, color: !dr ? 'var(--fg)' : 'var(--fg-faint)' }}>{!dr ? fmtFCFA(a.balance) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                <td colSpan={3} style={{ fontWeight: 700, color: 'var(--fg)', padding: '14px 16px' }}>Totals</td>
                <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--fg)' }}>{fmtFCFA(totalDr)}</td>
                <td style={{ textAlign: 'right', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--fg)' }}>{fmtFCFA(totalCr)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div style={{ padding: '12px 18px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--success-500)', fontWeight: 600 }}>
          <Icon name="check-circle-2" size={16} /> Balanced — debits equal credits
        </div>
      </Card>
    );
  }

  Object.assign(window, { Ledger });
})();


// ---------- fin_budget_aid ----------
// ============================================================
// DAUST Admin — Finance › Budget & Financial Aid
// ============================================================
(function () {

  // ---------- BUDGET ----------
  function Budget({ goFin }) {
    const B = window.BUDGET;
    const allocated = B.reduce((a, b) => a + b.allocated, 0);
    const spent = B.reduce((a, b) => a + b.spent, 0);
    const pct = Math.round(spent / allocated * 100);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.7fr)', gap: 20, alignItems: 'start' }}>
          <Panel title="FY 2025–26 budget">
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <Donut size={150} thickness={20} centerLabel={pct + '%'} centerSub="utilised" segments={[{ value: spent, color: 'var(--accent)' }, { value: allocated - spent, color: 'var(--slate-200)' }]} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div><div style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>Allocated</div><div style={{ fontSize: 18, fontWeight: 800 }}><FCFA value={allocated} short /></div></div>
                <div><div style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>Spent</div><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)' }}><FCFA value={spent} short /></div></div>
                <div><div style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>Remaining</div><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--success-500)' }}><FCFA value={allocated - spent} short /></div></div>
              </div>
            </div>
          </Panel>
          <Panel title="By category" action={<Button variant="outline" size="sm" icon="sliders-horizontal">Adjust allocations</Button>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {B.map(b => {
                const p = Math.round(b.spent / b.allocated * 100);
                const over = p > 92;
                return (
                  <div key={b.category}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, color: 'var(--fg)' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: b.color }} />{b.category}</span>
                      <span style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}><b style={{ color: 'var(--fg)' }}><FCFA value={b.spent} short /></b> / <FCFA value={b.allocated} short /> · <span style={{ color: over ? 'var(--error-500)' : 'var(--success-500)', fontWeight: 600 }}>{p}%</span></span>
                    </div>
                    <Progress value={b.spent} max={b.allocated} tone={over ? 'error' : 'teal'} height={9} />
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>

        <Panel title="Variance — budget vs. actual">
          <table className="dt" style={{ margin: '-4px 0' }}>
            <thead><tr><th>Category</th><th>Allocated</th><th>Spent</th><th>Remaining</th><th>Utilisation</th><th>Variance</th></tr></thead>
            <tbody>
              {B.map(b => {
                const rem = b.allocated - b.spent;
                const p = Math.round(b.spent / b.allocated * 100);
                return (
                  <tr key={b.category}>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: b.color }} />{b.category}</span></td>
                    <td><FCFA value={b.allocated} /></td>
                    <td><FCFA value={b.spent} /></td>
                    <td style={{ color: rem < b.allocated * 0.08 ? 'var(--error-500)' : 'var(--fg)', fontWeight: 600 }}><FCFA value={rem} /></td>
                    <td style={{ width: 130 }}><Progress value={b.spent} max={b.allocated} tone={p > 92 ? 'error' : 'teal'} height={6} /></td>
                    <td><Badge tone={p > 92 ? 'error' : p > 80 ? 'warning' : 'success'} dot={false} size="sm">{p > 92 ? 'At risk' : p > 80 ? 'Watch' : 'On budget'}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>
    );
  }

  // ---------- FINANCIAL AID ----------
  function FinancialAid({ goFin }) {
    const SCH = window.SCHOLARSHIPS;
    const totalAid = SCH.reduce((a, s) => a + s.total, 0);
    const recipients = SCH.reduce((a, s) => a + s.recipients, 0);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px,1fr))', gap: 16 }}>
          <window.Stat label="Total aid awarded" value={<FCFA value={totalAid} short />} delta="this year" deltaTone="flat" icon="gift" />
          <window.Stat label="Students supported" value={recipients} delta={Math.round(recipients / window.TOTAL_STUDENTS * 100) + '% of body'} deltaTone="up" icon="users" />
          <window.Stat label="Programs" value={SCH.length} delta="active funds" deltaTone="flat" icon="award" />
          <window.Stat label="Avg. award" value={fmtFCFA(totalAid / recipients, { short: true }) + ' FCFA'} delta="per student" deltaTone="flat" icon="banknote" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
          <Panel title="Scholarship & waiver programs" action={<Button variant="primary" size="sm" icon="plus">New fund</Button>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {SCH.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
                  <span style={{ width: 42, height: 42, borderRadius: 'var(--radius-md)', background: `color-mix(in srgb, ${s.color} 14%, var(--surface))`, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="award" size={20} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--fg)' }}>{s.name}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}><Badge tone="neutral" dot={false} size="sm">{s.type}</Badge> &nbsp;{s.coverage} · {s.recipients} recipients</div>
                  </div>
                  <div style={{ textAlign: 'right' }}><div style={{ fontSize: 15, fontWeight: 800, color: 'var(--fg)' }}><FCFA value={s.total} short /></div><div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>{fmtFCFA(s.perAward, { short: true })} / award</div></div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Disbursement schedule">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {window.AID_DISBURSEMENTS.map(d => {
                const p = Math.round(d.disbursed / d.budgeted * 100);
                return (
                  <div key={d.term}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg)' }}>{d.term}</span>
                      <FinStatus status={d.status} />
                    </div>
                    <Progress value={d.disbursed} max={d.budgeted} tone={d.status === 'Closed' ? 'success' : 'teal'} height={8} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11.5, color: 'var(--fg-subtle)' }}>
                      <span><FCFA value={d.disbursed} short /> disbursed</span><span>of <FCFA value={d.budgeted} short /></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  Object.assign(window, { Budget, FinancialAid });
})();


// ---------- fin_planning ----------
// ============================================================
// DAUST Admin — Finance › Budget extras + Planning
// Budget versions · Encumbrances · Forecast · Scenarios
// (Allocations + variance live in fin_budget_aid.jsx as Budget())
// ============================================================
(function () {
  const { useState } = React;

  // ---- Budget versions ----
  function BudgetVersions({ goFin }) {
    const V = window.BUDGET_VERSIONS;
    const tone = { Active: 'success', Superseded: 'neutral', Draft: 'warning' };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <window.Panel title="Budget versions & revisions" action={<window.Button variant="primary" size="sm" icon="copy">New revision</window.Button>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {V.map((v, i) => (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 6px', borderBottom: i < V.length - 1 ? '1px solid var(--divider)' : 'none' }}>
                <span style={{ width: 38, height: 38, borderRadius: '50%', background: v.status === 'Active' ? 'var(--accent)' : 'var(--bg-subtle)', color: v.status === 'Active' ? '#fff' : 'var(--fg-faint)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontFamily: 'var(--font-display)', flexShrink: 0 }}>{v.id.toUpperCase()}</span>
                <div style={{ flex: 1 }}><div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--fg)' }}>{v.name}</div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)' }}>{v.date} · {v.author}</div></div>
                <div style={{ textAlign: 'right' }}><div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--fg)' }}><window.FCFA value={v.total} short /></div></div>
                <div style={{ width: 110, display: 'flex', justifyContent: 'flex-end' }}><window.Badge tone={tone[v.status]} size="sm">{v.status}</window.Badge></div>
                <window.Button variant="ghost" size="sm" icon="eye">View</window.Button>
              </div>
            ))}
          </div>
        </window.Panel>
        <window.Panel title="Revision history — what changed">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[['Q3 revision', '+160M FCFA', 'Added Petroleum research cost-share; raised facilities for generator overhaul', 'up'], ['Mid-year revision', '+180M FCFA', 'Enrollment up 6% → tuition revenue revised; financial aid pool increased', 'up'], ['Original approved', '5.24B FCFA', 'Board-approved FY26 operating budget', 'flat']].map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{ marginTop: 2, width: 30, height: 30, borderRadius: '50%', background: 'var(--bg-tint)', color: r[3] === 'up' ? 'var(--success-500)' : 'var(--fg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><window.Icon name={r[3] === 'up' ? 'trending-up' : 'flag'} size={15} /></span>
                <div style={{ flex: 1 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>{r[0]}</span><b style={{ color: r[3] === 'up' ? 'var(--success-500)' : 'var(--fg)' }}>{r[1]}</b></div><div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginTop: 2 }}>{r[2]}</div></div>
              </div>
            ))}
          </div>
        </window.Panel>
      </div>
    );
  }

  // ---- Encumbrances ----
  function Encumbrances({ goFin }) {
    const E = window.ENCUMBRANCES;
    const total = E.reduce((a, e) => a + e.amount, 0);
    const committed = E.filter(e => e.status === 'Committed').reduce((a, e) => a + e.amount, 0);
    const tone = { Committed: 'info', Pending: 'warning', Released: 'neutral' };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="Total encumbered" value={<window.FCFA value={total} short />} sub={E.length + ' commitments'} tone="accent" icon="bookmark" />
          <window.Metric label="Committed (PO-backed)" value={<window.FCFA value={committed} short />} sub="firm obligations" icon="lock" />
          <window.Metric label="Pending" value={<window.FCFA value={total - committed} short />} sub="awaiting PO" tone="down" icon="clock" />
        </div>
        <window.Panel title="Open encumbrances" action={<window.Button variant="outline" size="sm" icon="info">How encumbrances work</window.Button>}>
          <div style={{ overflowX: 'auto' }}>
            <table className="dt">
              <thead><tr><th>Reference</th><th>Description</th><th>Budget category</th><th>Source</th><th style={{ textAlign: 'right' }}>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {E.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{e.id}</td>
                    <td style={{ color: 'var(--fg)', fontWeight: 600 }}>{e.desc}</td>
                    <td><window.Badge tone="neutral" dot={false} size="sm">{e.category}</window.Badge></td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-subtle)' }}>{e.po}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--fg)' }}><window.FCFA value={e.amount} /></td>
                    <td><window.Badge tone={tone[e.status]} size="sm">{e.status}</window.Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', padding: '11px 14px', fontSize: 12.5, color: 'var(--fg-muted)' }}>
            <window.Icon name="info" size={15} style={{ color: 'var(--accent)' }} />Encumbrances reserve budget against open POs/contracts so funds can't be double-spent. Available budget = allocated − actual − encumbered.
          </div>
        </window.Panel>
      </div>
    );
  }

  // ---- Forecast ----
  function Forecast({ goFin }) {
    const F = window.FORECAST;
    const surplus = F.revenue.map((r, i) => r - F.expense[i]);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 16 }}>
          <window.Metric label="FY29 revenue (proj.)" value={<window.FCFA value={F.revenue[5]} short />} sub="+37% vs FY26" tone="up" icon="trending-up" />
          <window.Metric label="FY29 surplus (proj.)" value={<window.FCFA value={surplus[5]} short />} sub="operating" tone="up" icon="circle-dollar-sign" />
          <window.Metric label="Enrollment FY29" value={F.enrollment[5].toLocaleString()} sub="+35% vs FY26" tone="up" icon="users" />
          <window.Metric label="Avg. revenue / student" value={window.fmtFCFA(Math.round(F.revenue[5] / F.enrollment[5]), { short: true }) + ' FCFA'} sub="FY29 projected" icon="user" />
        </div>
        <window.Panel title="6-year financial projection" action={<window.Segmented size="sm" options={['Rev/Exp', 'Surplus', 'Enrollment']} value="Rev/Exp" onChange={() => {}} />}>
          <div style={{ display: 'flex', gap: 22, marginBottom: 10 }}>
            <Leg color="var(--accent)" label="Revenue" />
            <Leg color="var(--daust-steel)" label="Expense" dashed />
          </div>
          <window.AreaChart labels={window.FORECAST_YEARS} series={[{ name: 'Revenue', data: F.revenue }, { name: 'Expense', data: F.expense, dashed: true }]} colors={['var(--accent)', 'var(--daust-steel)']} format={v => window.fmtFCFA(v, { short: true })} height={250} />
          <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 8 }}>Dashed line = projected (FY27 onward). Assumes base-case scenario.</div>
        </window.Panel>
        <window.Panel title="Projection detail">
          <div style={{ overflowX: 'auto' }}>
            <table className="dt" style={{ margin: '-4px 0' }}>
              <thead><tr><th>Year</th><th style={{ textAlign: 'right' }}>Revenue</th><th style={{ textAlign: 'right' }}>Expense</th><th style={{ textAlign: 'right' }}>Surplus</th><th style={{ textAlign: 'right' }}>Margin</th><th style={{ textAlign: 'right' }}>Enrollment</th></tr></thead>
              <tbody>
                {window.FORECAST_YEARS.map((y, i) => (
                  <tr key={y}>
                    <td style={{ fontWeight: 700, color: 'var(--fg)' }}>{y}{i >= 3 && <span style={{ color: 'var(--fg-faint)', fontWeight: 400, fontSize: 11 }}> proj.</span>}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{window.fmtFCFA(F.revenue[i], { short: true })}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{window.fmtFCFA(F.expense[i], { short: true })}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success-500)', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{window.fmtFCFA(surplus[i], { short: true })}</td>
                    <td style={{ textAlign: 'right', color: 'var(--fg-subtle)' }}>{Math.round(surplus[i] / F.revenue[i] * 100)}%</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--fg)' }}>{F.enrollment[i].toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </window.Panel>
      </div>
    );
  }
  function Leg({ color, label, dashed }) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: 'var(--fg-subtle)' }}><span style={{ width: 18, height: 0, borderTop: `2.5px ${dashed ? 'dashed' : 'solid'} ${color}` }} />{label}</span>;
  }

  // ---- Scenarios ----
  function Scenarios({ goFin }) {
    const [active, setActive] = useState('base');
    const S = window.SCENARIOS;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 16 }}>
          {S.map(s => {
            const on = s.id === active;
            return (
              <window.Card key={s.id} onClick={() => setActive(s.id)} padding={20}
                style={{ cursor: 'pointer', border: on ? `2px solid ${s.color}` : '1px solid var(--border)', position: 'relative' }}>
                {on && <span style={{ position: 'absolute', top: 14, right: 14, color: s.color }}><window.Icon name="check-circle-2" size={18} /></span>}
                <span style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: `color-mix(in srgb, ${s.color} 14%, var(--surface))`, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><window.Icon name="git-branch" size={18} /></span>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>{s.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--fg-subtle)', marginTop: 2 }}>Enroll +{s.enrollGrowth}%/yr · Tuition +{s.tuitionGrowth}%/yr</div>
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--divider)' }}>
                  <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>FY29 surplus</div>
                  <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-display)', color: s.fy29Surplus < 0 ? 'var(--error-500)' : 'var(--fg)' }}><window.FCFA value={s.fy29Surplus} short /></div>
                </div>
              </window.Card>
            );
          })}
        </div>
        <window.Panel title="Scenario comparison — FY29 outlook">
          <window.BarChart data={S.map(s => s.fy29Surplus)} labels={S.map(s => s.name.split(' ')[0])} color="var(--accent)" format={v => window.fmtFCFA(v, { short: true })} height={210} />
          <div style={{ fontSize: 11.5, color: 'var(--fg-faint)', marginTop: 8 }}>Stress scenario (FX depreciation + financial-aid shock) turns the operating surplus negative — flagged for board review.</div>
        </window.Panel>
      </div>
    );
  }

  Object.assign(window, { BudgetVersions, Encumbrances, Forecast, Scenarios });
})();


// ---------- fin_reports ----------
// ============================================================
// DAUST Admin — Finance › Reports (financial statements)
// ============================================================
(function () {
  const { useState, useEffect, useRef } = React;

  function Reports({ goFin }) {
    const [stmt, setStmt] = useState('pl');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <Segmented options={[{ value: 'pl', label: 'Income statement' }, { value: 'bs', label: 'Balance sheet' }, { value: 'cf', label: 'Cash flow' }]} value={stmt} onChange={setStmt} />
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="outline" icon="calendar">FY 2025–26</Button>
            <Button variant="outline" icon="printer">Print</Button>
            <Button variant="primary" icon="download">Export PDF</Button>
          </div>
        </div>
        {stmt === 'pl' && <IncomeStatement />}
        {stmt === 'bs' && <BalanceSheet />}
        {stmt === 'cf' && <CashFlow />}
      </div>
    );
  }

  function StatementShell({ title, sub, children, right }) {
    return (
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '22px 26px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><window.Icon name="graduation-cap" size={18} style={{ color: 'var(--accent)' }} /><span style={{ fontWeight: 700, fontSize: 14 }}>DAUST</span></div>
            <h2 style={{ fontSize: 22, marginTop: 12 }}>{title}</h2>
            <div style={{ fontSize: 13, color: 'var(--fg-subtle)', marginTop: 2 }}>{sub}</div>
          </div>
          {right}
        </div>
        <div style={{ padding: '8px 26px 24px', maxWidth: 760 }}>{children}</div>
      </Card>
    );
  }

  function Line({ label, value, indent, strong, top, color, pct }) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: strong ? '12px 0' : '7px 0',
        paddingLeft: indent ? 22 : 0, borderTop: top ? '1px solid var(--border-strong)' : 'none', marginTop: top ? 4 : 0 }}>
        <span style={{ fontSize: strong ? 14.5 : 13.5, fontWeight: strong ? 700 : 400, color: strong ? 'var(--fg)' : 'var(--fg-muted)' }}>{label}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          {pct != null && <span style={{ fontSize: 11.5, color: 'var(--fg-faint)', minWidth: 40, textAlign: 'right' }}>{pct}</span>}
          <span style={{ fontSize: strong ? 15 : 13.5, fontWeight: strong ? 800 : 600, color: color || 'var(--fg)', fontFamily: 'var(--font-mono)', minWidth: 130, textAlign: 'right' }}>{typeof value === 'number' ? fmtFCFA(value) : value}</span>
        </span>
      </div>
    );
  }
  function GroupHead({ children }) {
    return <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 18, marginBottom: 2 }}>{children}</div>;
  }

  function IncomeStatement() {
    const tuition = 5_240_000_000, grants = 640_000_000, aux = 412_000_000;
    const totalRev = tuition + grants + aux;
    const salaries = 2_640_000_000, facilities = 1_120_000_000, aid = 980_000_000, supplies = 520_000_000;
    const totalExp = salaries + facilities + aid + supplies;
    const net = totalRev - totalExp;
    const pc = v => Math.round(v / totalRev * 100) + '%';
    return (
      <StatementShell title="Income Statement" sub="For the fiscal year ending 31 August 2026 · FCFA" right={<Badge tone="info" dot={false}>Unaudited</Badge>}>
        <GroupHead>Revenue</GroupHead>
        <Line label="Tuition & fees" value={tuition} indent pct={pc(tuition)} />
        <Line label="Grants & contracts" value={grants} indent pct={pc(grants)} />
        <Line label="Auxiliary (housing)" value={aux} indent pct={pc(aux)} />
        <Line label="Total revenue" value={totalRev} strong top />
        <GroupHead>Operating expenses</GroupHead>
        <Line label="Salaries & benefits" value={salaries} indent pct={pc(salaries)} />
        <Line label="Facilities & utilities" value={facilities} indent pct={pc(facilities)} />
        <Line label="Financial aid" value={aid} indent pct={pc(aid)} />
        <Line label="Supplies & services" value={supplies} indent pct={pc(supplies)} />
        <Line label="Total expenses" value={totalExp} strong top />
        <Line label="Net operating surplus" value={net} strong top color="var(--success-500)" />
        <div style={{ marginTop: 22 }}>
          <div style={{ fontSize: 12, color: 'var(--fg-subtle)', marginBottom: 8 }}>Monthly net trend</div>
          <AreaChart labels={window.MONTHS} series={[{ name: 'Net', data: window.FINANCE.revenue.map((r, i) => r - window.FINANCE.expense[i]) }]} colors={['var(--accent)']} format={v => fmtFCFA(v, { short: true })} height={150} />
        </div>
      </StatementShell>
    );
  }

  function BalanceSheet() {
    const A = window.ACCOUNTS;
    const sum = t => A.filter(a => a.type === t).reduce((s, a) => s + a.balance, 0);
    const assets = sum('Asset'), liab = sum('Liability'), equity = sum('Equity');
    return (
      <StatementShell title="Balance Sheet" sub="As of 28 May 2026 · FCFA" right={<Badge tone="info" dot={false}>Unaudited</Badge>}>
        <GroupHead>Assets</GroupHead>
        {A.filter(a => a.type === 'Asset').map(a => <Line key={a.code} label={a.name} value={a.balance} indent />)}
        <Line label="Total assets" value={assets} strong top />
        <GroupHead>Liabilities</GroupHead>
        {A.filter(a => a.type === 'Liability').map(a => <Line key={a.code} label={a.name} value={a.balance} indent />)}
        <Line label="Total liabilities" value={liab} strong top />
        <GroupHead>Net assets (equity)</GroupHead>
        {A.filter(a => a.type === 'Equity').map(a => <Line key={a.code} label={a.name} value={a.balance} indent />)}
        <Line label="Total net assets" value={equity} strong top />
        <Line label="Liabilities + net assets" value={liab + equity} strong top color="var(--accent)" />
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--success-500)', fontWeight: 600 }}>
          <Icon name="check-circle-2" size={16} /> Balances ({fmtFCFA(assets)} = {fmtFCFA(liab + equity)})
        </div>
      </StatementShell>
    );
  }

  function CashFlow() {
    const ops = 1_640_000_000, inv = -820_000_000, fin = 210_000_000;
    const open = 1_080_000_000;
    const net = ops + inv + fin;
    return (
      <StatementShell title="Statement of Cash Flows" sub="For the period ending 28 May 2026 · FCFA" right={<Badge tone="info" dot={false}>Unaudited</Badge>}>
        <GroupHead>Operating activities</GroupHead>
        <Line label="Tuition & fees collected" value={4_185_600_000} indent />
        <Line label="Grants received" value={420_000_000} indent />
        <Line label="Salaries & benefits paid" value={-2_180_000_000} indent color="var(--fg-muted)" />
        <Line label="Suppliers & utilities paid" value={-785_600_000} indent color="var(--fg-muted)" />
        <Line label="Net cash from operations" value={ops} strong top color="var(--success-500)" />
        <GroupHead>Investing activities</GroupHead>
        <Line label="Equipment & facilities" value={-620_000_000} indent color="var(--fg-muted)" />
        <Line label="Endowment contributions" value={-200_000_000} indent color="var(--fg-muted)" />
        <Line label="Net cash used in investing" value={inv} strong top color="var(--error-500)" />
        <GroupHead>Financing activities</GroupHead>
        <Line label="Restricted gifts" value={fin} indent />
        <Line label="Net cash from financing" value={fin} strong top />
        <Line label="Net change in cash" value={net} strong top />
        <Line label="Opening cash" value={open} indent />
        <Line label="Closing cash" value={open + net} strong top color="var(--accent)" />
      </StatementShell>
    );
  }

  Object.assign(window, { FinReports: Reports });
})();


// ---------- finance ----------
// ============================================================
// DAUST Admin — Finance shell (clustered 2-level navigation)
// Comprehensive: 12 clusters, ~35 sections. Overrides simple Finance.
// ============================================================
(function () {
  const { useState, useEffect } = React;

  // cluster -> { label, icon, view (single) | sections:[{id,label,view}] }
  const CLUSTERS = [
    { id: 'overview', label: 'Overview', icon: 'layout-dashboard', view: 'FinOverview',
      blurb: 'Financial health, cash position and receivables at a glance.' },
    { id: 'receivables', label: 'Receivables', icon: 'receipt', blurb: 'Student billing, collections, fee setup and refunds.', sections: [
      { id: 'accounts', label: 'Student Accounts', view: 'Receivables' },
      { id: 'collections', label: 'Collections', view: 'Collections' },
      { id: 'fees', label: 'Fee Structure', view: 'FeeStructure' },
      { id: 'refunds', label: 'Refunds & Credits', view: 'Refunds' },
    ] },
    { id: 'payments', label: 'Payments', icon: 'arrow-left-right', view: 'Payments',
      blurb: 'Incoming payment ledger and bank reconciliation.' },
    { id: 'payables', label: 'Payables', icon: 'file-text', blurb: 'Vendor bills, procurement, expense claims and petty cash.', sections: [
      { id: 'bills', label: 'Bills & POs', view: 'Payables' },
      { id: 'procurement', label: 'Procurement', view: 'Procurement' },
      { id: 'claims', label: 'Expense Claims', view: 'ExpenseClaims' },
      { id: 'petty', label: 'Petty Cash', view: 'PettyCash' },
    ] },
    { id: 'treasury', label: 'Treasury', icon: 'landmark', blurb: 'Bank accounts, cash positioning and inter-account transfers.', sections: [
      { id: 'banks', label: 'Bank Accounts', view: 'TreasuryBanks' },
      { id: 'position', label: 'Cash Position', view: 'TreasuryPosition' },
      { id: 'transfers', label: 'Transfers', view: 'TreasuryTransfers' },
    ] },
    { id: 'payroll', label: 'Payroll', icon: 'users', blurb: 'Pay runs, payslips, contracts, leave and accruals.', sections: [
      { id: 'run', label: 'Pay Run', view: 'Payroll' },
      { id: 'employees', label: 'Employees', view: 'PayrollEmployees' },
      { id: 'leave', label: 'Leave & Accruals', view: 'LeaveAccruals' },
    ] },
    { id: 'funds', label: 'Funds & Aid', icon: 'award', blurb: 'Research grants, endowment and student financial aid.', sections: [
      { id: 'grants', label: 'Grants', view: 'Grants' },
      { id: 'endowment', label: 'Endowment', view: 'Endowment' },
      { id: 'aid', label: 'Financial Aid', view: 'FinancialAid' },
    ] },
    { id: 'assets', label: 'Assets', icon: 'package', blurb: 'Fixed asset register and depreciation schedules.', sections: [
      { id: 'register', label: 'Register', view: 'AssetRegister' },
      { id: 'depreciation', label: 'Depreciation', view: 'Depreciation' },
    ] },
    { id: 'accounting', label: 'Accounting', icon: 'book-open-check', blurb: 'SYSCOHADA ledger, journals, reconciliation, close and tax.', sections: [
      { id: 'ledger', label: 'Ledger', view: 'Ledger' },
      { id: 'recurring', label: 'Recurring', view: 'RecurringJournals' },
      { id: 'reconcile', label: 'Reconciliation', view: 'Reconciliation' },
      { id: 'close', label: 'Period Close', view: 'PeriodClose' },
      { id: 'tax', label: 'Tax & Compliance', view: 'TaxCompliance' },
    ] },
    { id: 'budget', label: 'Budget', icon: 'pie-chart', blurb: 'Allocations, variance, revisions and encumbrances.', sections: [
      { id: 'allocations', label: 'Allocations', view: 'Budget' },
      { id: 'versions', label: 'Versions', view: 'BudgetVersions' },
      { id: 'encumbrances', label: 'Encumbrances', view: 'Encumbrances' },
    ] },
    { id: 'planning', label: 'Planning', icon: 'trending-up', blurb: 'Multi-year projections and scenario modelling.', sections: [
      { id: 'forecast', label: 'Forecast', view: 'Forecast' },
      { id: 'scenarios', label: 'Scenarios', view: 'Scenarios' },
    ] },
    { id: 'reports', label: 'Reports', icon: 'bar-chart-3', blurb: 'Financial statements and the scheduled report library.', sections: [
      { id: 'statements', label: 'Statements', view: 'FinReports' },
      { id: 'library', label: 'Report Library', view: 'ReportLibrary' },
    ] },
  ];

  function resolveView(name) {
    const V = window[name];
    return typeof V === 'function' ? V : (() => <window.EmptyState icon="construction" title="Coming soon" sub={'View "' + name + '" is not available.'} />);
  }

  function Finance({ go }) {
    const [cluster, setCluster] = useState('overview');
    const [section, setSection] = useState(null);
    if (window.buildFinanceData) window.buildFinanceData();
    if (window.buildFinanceData2) window.buildFinanceData2();

    const cl = CLUSTERS.find(c => c.id === cluster) || CLUSTERS[0];
    const sections = cl.sections || null;
    const activeSection = sections ? (sections.find(s => s.id === section) || sections[0]) : null;

    const goCluster = (cid) => {
      const c = CLUSTERS.find(x => x.id === cid);
      setCluster(cid);
      setSection(c.sections ? c.sections[0].id : null);
      window.scrollTo(0, 0);
    };
    const goSection = (sid) => { setSection(sid); window.scrollTo(0, 0); };

    const viewName = activeSection ? activeSection.view : cl.view;
    const View = resolveView(viewName);
    const title = 'Finance · ' + cl.label + (activeSection ? ' · ' + activeSection.label : '');

    return (
      <div className="fade-in">
        <window.PageHeader eyebrow="Finance & Accounting" title={title} subtitle={cl.blurb}
          actions={<>
            <window.Button variant="outline" icon="calendar">FY 2025–26</window.Button>
            <window.Button variant="primary" icon="download">Export</window.Button>
          </>} />

        {/* Row 1 — cluster pills */}
        <div style={{ display: 'flex', gap: 7, overflowX: 'auto', padding: '2px 2px 14px', marginBottom: sections ? 4 : 10, borderBottom: '1px solid var(--border)' }}>
          {CLUSTERS.map(c => {
            const on = c.id === cluster;
            return (
              <button key={c.id} onClick={() => goCluster(c.id)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 15px', borderRadius: 'var(--radius-pill)',
                border: '1px solid ' + (on ? 'transparent' : 'var(--border)'), background: on ? 'var(--accent)' : 'var(--surface)',
                color: on ? 'var(--accent-fg-on)' : 'var(--fg-muted)', fontWeight: 600, fontSize: 13.5, fontFamily: 'var(--font-sans)',
                cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all var(--dur-base) var(--ease-standard)',
              }}>
                <window.Icon name={c.icon} size={16} />{c.label}
              </button>
            );
          })}
        </div>

        {/* Row 2 — section tabs */}
        {sections && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 22, flexWrap: 'wrap' }}>
            {sections.map(s => {
              const on = s.id === activeSection.id;
              return (
                <button key={s.id} onClick={() => goSection(s.id)} style={{
                  padding: '7px 13px', borderRadius: 'var(--radius-md)', border: 'none',
                  background: on ? 'var(--bg-tint)' : 'transparent', color: on ? 'var(--accent)' : 'var(--fg-subtle)',
                  fontWeight: on ? 700 : 500, fontSize: 13, fontFamily: 'var(--font-sans)', cursor: 'pointer',
                  transition: 'all var(--dur-base) var(--ease-standard)', whiteSpace: 'nowrap',
                }}>{s.label}</button>
              );
            })}
          </div>
        )}

        <div key={cluster + ':' + (activeSection ? activeSection.id : '')} className="fade-in">
          <View go={go} goFin={() => {}} />
        </div>
      </div>
    );
  }

  Object.assign(window, { Finance });
})();

