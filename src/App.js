import { useEffect } from 'react';
import './App.css';
import './UI/script.js';

function App() {
  useEffect(() => {
    if (typeof window.initBahgoApp === 'function') {
      window.initBahgoApp();
    }
  }, []);

  return (
    <>
      <section id="loginScreen" className="screen active">
        <div className="login-layout">
          <div className="login-wave-side">
            <div className="brand-center">
              <p style={{ fontSize: '1.2rem', marginBottom: '18px' }}>Welcome to</p>
              <img src="/Image/BahgoIcon.png" alt="Bahgo Logo" className="logo-large" />
              <h1 className="brand-title">Bahgo</h1>
              <p className="brand-desc">
                Flood Detection Monitoring System. Real-time Intelligence, Instant Response.
              </p>
            </div>
          </div>
          <div className="login-form-side">
            <div className="login-box">
              <h2>Sign in</h2>
              <p className="sub">Login to access Admin Dashboard</p>
              <div>
                <div className="field">
                  <label>Email address</label>
                  <input type="email" id="loginEmail" placeholder="Enter your email" />
                  <div id="emailError" className="error-bubble" style={{ display: 'none' }} />
                </div>
                <div className="field">
                  <label>Password</label>
                  <input type="password" id="loginPass" placeholder="Enter your password" />
                  <div id="passwordError" className="error-bubble" style={{ display: 'none' }} />
                </div>
                <button type="button" id="loginBtn" className="btn-login">Log in</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="dashboardScreen" className="screen">
        <div className="dashboard-wrapper">
          <aside className="sidebar">
            <div className="user-profile">
              <div className="avatar-circle"><img src="/logo192.png" alt="User" /></div>
              <div className="user-text">
                <p style={{ fontWeight: 700, margin: 0 }} id="userName">Admin</p>
                <p style={{ fontSize: '0.75rem', color: '#888', margin: 0 }}>developer</p>
              </div>
            </div>
            <nav className="side-nav">
              <button className="nav-btn active" data-page="overview">Overview</button>
              <button className="nav-btn" data-page="detailed">Detailed List</button>
            </nav>
            <div style={{ marginTop: 'auto', paddingBottom: '20px' }}>
              <button className="nav-btn" data-page="settings">Settings</button>
              <button className="nav-btn" id="logoutBtn">Logout</button>
            </div>
          </aside>

          <main className="content-area">
            <header className="dash-header">
              <div className="dash-header-left">
                <img src="/Image/BahgoIcon.png" alt="Logo" />
                <div>
                  <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Flood Detection System</h1>
                  <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>Monitoring Dashboard</p>
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '0.85rem', fontWeight: 600 }}>
                <span id="currentDate">November 31, 2025</span><br />
                <span id="currentTime">08:00:00 am</span>
              </div>
            </header>

            <div id="overview" className="page-content active">
              <div className="status-grid">
                <div className="card critical">
                  <div className="card-left">
                    <span className="card-label">Critical</span>
                    <span className="card-value" id="criticalCount">0</span>
                  </div>
                  <div className="card-icon"><img src="/Image/critical.png" alt="Critical" style={{ width: '80%', height: '80%', objectFit: 'contain', margin: 'auto' }} /></div>
                </div>
                <div className="card warning">
                  <div className="card-left">
                    <span className="card-label">Warning</span>
                    <span className="card-value" id="warningCount">0</span>
                  </div>
                  <div className="card-icon"><img src="/Image/warning.png" alt="Warning" style={{ width: '80%', height: '80%', objectFit: 'contain', margin: 'auto' }} /></div>
                </div>
                <div className="card normal">
                  <div className="card-left">
                    <span className="card-label">Normal</span>
                    <span className="card-value" id="normalCount">0</span>
                  </div>
                  <div className="card-icon"><img src="/Image/normal.png" alt="Normal" style={{ width: '80%', height: '80%', objectFit: 'contain', margin: 'auto' }} /></div>
                </div>
                <div className="card device-status">
                  <div style={{ width: '100%' }}>
                    <p className="card-label" style={{ marginBottom: '10px' }}>Device Status</p>
                    <div className="device-row" style={{ marginBottom: '8px' }}>
                      <span>☑ Active</span>
                      <span id="activeCount">0</span>
                    </div>
                    <div className="device-row">
                      <span>☒ Offline</span>
                      <span id="offlineCount">0</span>
                    </div>
                  </div>
                </div>
              </div>
              <h3 style={{ marginBottom: '20px', fontWeight: 700 }}>All Monitoring Stations</h3>
              <div className="station-grid" id="stationGrid" />
            </div>

            <div id="detailed" className="page-content">
              <h2 style={{ marginBottom: '25px', fontWeight: 700 }}>Detailed Station List</h2>
              <div className="search-bar"><input type="text" id="searchInput" placeholder="Search by station name..." /></div>
              <div className="data-table"><table><thead><tr><th>Station Name</th><th>Water Level</th><th>Precipitation</th><th>Rise Rate</th><th>Last Updated</th><th>Status</th></tr></thead><tbody id="stationTableBody" /></table></div>
            </div>

            <div id="settings" className="page-content">
              <h2 style={{ marginBottom: '25px', fontWeight: 700 }}>Settings</h2>
              <div className="settings-section">
                <h3>User Profile</h3>
                <div className="field"><label>Display Name</label><input type="text" id="settingsName" defaultValue="Admin" /></div>
                <div className="field"><label>Email</label><input type="email" id="settingsEmail" defaultValue="admin@bahgo.com" /></div>
                <div className="field"><label>Role</label><input type="text" defaultValue="Developer" disabled /></div>
                <button className="btn-login" style={{ width: 'auto', padding: '12px 30px' }} id="saveProfile">Save Profile</button>
              </div>
              <div className="settings-section">
                <h3>Notification Preferences</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}><input type="checkbox" id="crit" /><label htmlFor="crit" style={{ cursor: 'pointer' }}>Enable Critical Alerts</label></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}><input type="checkbox" id="email" /><label htmlFor="email" style={{ cursor: 'pointer' }}>Send Email Notifications</label></div>
                <button className="btn-login" style={{ width: 'auto', padding: '12px 30px' }} id="saveNotif">Update Preferences</button>
              </div>
            </div>
          </main>
        </div>
      </section>

      <div className="modal" id="stationModal">
        <div className="modal-content">
          <div className="modal-header"><h2 id="modalTitle">Station Details</h2><button className="modal-close" id="closeModal">&times;</button></div>
          <div id="modalBody" />
          <div className="chart-container"><canvas id="stationChart" /></div>
        </div>
      </div>
    </>
  );
}
export default App;