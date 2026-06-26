// ============================================================
// DAUST Student Affairs — root App + router + mount
// ============================================================
(function () {
  const { useState } = React;

  function App() {
    const [view, setView] = useState('dashboard');
    const labels = {
      dashboard: 'Dashboard', housing: 'Housing', roommate: 'Roommate Matching', intl: 'International Support',
      conduct: 'Conduct & Disputes', clubs: 'Clubs & Orgs', events: 'Events & Programs',
      budget: 'Co-curricular Budget', abroad: 'Study Abroad & Internships',
    };
    const Views = {
      dashboard: <Dashboard setView={setView} />,
      housing: <Housing />,
      roommate: <Roommate />,
      intl: <Intl />,
      conduct: <Conduct />,
      clubs: <Clubs />,
      events: <Events />,
      budget: <Budget />,
      abroad: <Abroad />,
    };
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#f5f7f9' }}>
        <Sidebar view={view} setView={setView} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Topbar title={labels[view]} />
          <main style={{ flex: 1, padding: '28px 32px 48px', maxWidth: 1320, width: '100%', margin: '0 auto' }}>
            <div className="daust-view" key={view}>{Views[view]}</div>
          </main>
        </div>
      </div>
    );
  }

  window.App = App;

  function mount() {
    const need = ['Dashboard', 'Housing', 'Roommate', 'Intl', 'Conduct', 'Clubs', 'Events', 'Budget', 'Abroad', 'Sidebar', 'Topbar'];
    if (need.some(n => !window[n])) { setTimeout(mount, 50); return; }
    ReactDOM.createRoot(document.getElementById('root')).render(<App />);
    if (window.lucide) window.lucide.createIcons();
  }
  mount();
})();
