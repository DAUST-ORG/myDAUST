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
