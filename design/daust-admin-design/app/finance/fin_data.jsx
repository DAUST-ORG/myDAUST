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
