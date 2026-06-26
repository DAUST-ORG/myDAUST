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
