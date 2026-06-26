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
