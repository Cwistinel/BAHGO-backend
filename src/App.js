import { useEffect } from 'react';
import './style.css';
import './script.js';

function App() {
  useEffect(() => {
    if (typeof window.initBahgoApp === 'function') {
      window.initBahgoApp();
    }
    // Leaflet for map - does not change cwistinel colors
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    if (!window.L) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => {
        if (window.initTaguigMaps) window.initTaguigMaps();
      };
      document.head.appendChild(script);
    } else if (window.initTaguigMaps) {
      window.initTaguigMaps();
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

 
      <div className="modal" id="firstLoginModal" style={{ zIndex: 10000 }}>
        <div className="modal-content" style={{ maxWidth: '420px' }}>
          <div className="modal-header">
            <h2>Set Up New Password</h2>
            <button type="button" className="modal-close" id="closeFirstLoginModal" aria-label="Close password setup">&times;</button>
          </div>
          <div style={{ padding: '20px 0' }}>
            <p style={{ fontSize: '0.9rem', color: '#6B7280', marginBottom: '16px' }}>Welcome! This is your first login. Please set a new password that only you know.</p>
            <div className="field"><label>New Password</label><input type="password" id="newPass1" placeholder="Enter new password (min 6 chars)" /></div>
            <div className="field"><label>Confirm New Password</label><input type="password" id="newPass2" placeholder="Confirm new password" /></div>
            <div id="newPassError" className="error-bubble" style={{ display: 'none', background: '#EF4444', color: '#fff', padding: '8px', borderRadius: '6px', marginTop: '8px' }} />
            <button className="btn-login" id="setNewPassBtn" style={{ marginTop: '16px' }}>Set New Password & Continue</button>
          </div>
        </div>
      </div>

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
              <button className="nav-btn" data-page="mapView">Map - Taguig</button>
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

            <div id="mapView" className="page-content">
              <h2 style={{ marginBottom: '25px', fontWeight: 700 }}>Taguig City - Flood Monitoring Map</h2>
              <div className="settings-section">
                <h3>Live Map</h3>
                <div id="taguigMap" style={{ height: '500px', width: '100%', borderRadius: '16px', border: '1px solid #E2E8F0', zIndex: 1 }}></div>
              </div>
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
              {/*
              <div className="settings-section">
                <h3>Notification Preferences</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}><input type="checkbox" id="crit" /><label htmlFor="crit" style={{ cursor: 'pointer' }}>Enable Critical Alerts</label></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}><input type="checkbox" id="email" /><label htmlFor="email" style={{ cursor: 'pointer' }}>Send Email Notifications</label></div>
                <button className="btn-login" style={{ width: 'auto', padding: '12px 30px' }} id="saveNotif">Update Preferences</button>
              </div>
              */}
            </div>
          </main>
        </div>
      </section>

      <section id="superUserScreen" className="screen">
        <div className="dashboard-wrapper">
          <aside className="sidebar">
            <div className="user-profile">
              <div className="avatar-circle"><img src="/logo192.png" alt="User" /></div>
              <div className="user-text">
                <p style={{ fontWeight: 700, margin: 0 }} id="superUserName">Kayekaye</p>
                <p style={{ fontSize: '0.75rem', color: '#888', margin: 0 }}>developer</p>
              </div>
            </div>
            <nav className="side-nav">
              <button className="nav-btn active" data-page="superOverview">Overview</button>
              <button className="nav-btn" data-page="superStations">Detailed List</button>
              <button className="nav-btn" data-page="superMapView">Map - Taguig</button>
              <button className="nav-btn" data-page="superUsers">User Management</button>
            </nav>
            <div style={{ marginTop: 'auto', paddingBottom: '20px' }}>
              <button className="nav-btn" data-page="superDeploy">Settings</button>
              <button className="nav-btn" id="superLogoutBtn">Logout</button>
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
                <span id="superCurrentDate">November 31, 2025</span><br />
                <span id="superCurrentTime">08:00:00 am</span>
              </div>
            </header>
            <div id="superOverview" className="page-content active">
              <div className="status-grid">
                <div className="card critical"><div className="card-left"><span className="card-label">Critical</span><span className="card-value" id="superCriticalCount">0</span></div><div className="card-icon"><img src="/Image/critical.png" alt="Critical" style={{ width: '80%', height: '80%', objectFit: 'contain', margin: 'auto' }} /></div></div>
                <div className="card warning"><div className="card-left"><span className="card-label">Warning</span><span className="card-value" id="superWarningCount">0</span></div><div className="card-icon"><img src="/Image/warning.png" alt="Warning" style={{ width: '80%', height: '80%', objectFit: 'contain', margin: 'auto' }} /></div></div>
                <div className="card normal"><div className="card-left"><span className="card-label">Normal</span><span className="card-value" id="superNormalCount">0</span></div><div className="card-icon"><img src="/Image/normal.png" alt="Normal" style={{ width: '80%', height: '80%', objectFit: 'contain', margin: 'auto' }} /></div></div>
                <div className="card device-status"><div style={{ width: '100%' }}><p className="card-label" style={{ marginBottom: '10px' }}>Device Status</p><div className="device-row" style={{ marginBottom: '8px' }}><span>☑ Active</span><span id="superActiveCount">0</span></div><div className="device-row"><span>☒ Offline</span><span id="superOfflineCount">0</span></div></div></div>
              </div>
              <h3 style={{ marginBottom: '20px', fontWeight: 700 }}>All Monitoring Stations</h3>
              <div className="station-grid" id="superStationGrid" />
            </div>
            <div id="superStations" className="page-content">
              <h2 style={{ marginBottom: '25px', fontWeight: 700 }}>Detailed Station List</h2>
              <div className="search-bar"><input type="text" id="superSearchInput" placeholder="Search by station name..." /></div>
              <div className="data-table"><table><thead><tr><th>Station Name</th><th>Water Level</th><th>Precipitation</th><th>Rise Rate</th><th>Last Updated</th><th>Status</th></tr></thead><tbody id="superStationTableBody" /></table></div>
            </div>
            <div id="superMapView" className="page-content">
              <h2 style={{ marginBottom: '25px', fontWeight: 700 }}>Taguig City - Flood Monitoring Map</h2>
              <div className="settings-section">
                <h3>Live Map</h3>
                <div id="superTaguigMap" style={{ height: '500px', width: '100%', borderRadius: '16px', border: '1px solid #E2E8F0', zIndex: 1 }}></div>
              </div>
            </div>
            <div id="superUsers" className="page-content">
              <h2 style={{ marginBottom: '25px', fontWeight: 700 }}>User Management</h2>
              <div className="settings-section">
                <h3>Add New Admin</h3>
                <p style={{ fontSize: '0.85rem', color: '#6B7280', marginBottom: '14px' }}>Create admin with temp password. On first login, admin will set new password only he/she knows.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
                  <div className="field" style={{ margin: 0 }}><label>Admin Email</label><input type="email" id="newAdminEmail" placeholder="newadmin@bahgo.com" /></div>
                  <div className="field" style={{ margin: 0 }}><label>Temp Password</label><input type="text" id="newAdminTempPass" placeholder="TempPass123" /></div>
                  <button className="btn-login" id="addAdminBtn" style={{ width: 'auto', padding: '12px 20px' }}>Add Admin</button>
                </div>
                <div id="addAdminError" className="error-bubble" style={{ display: 'none', background: '#EF4444', color: '#fff', padding: '8px', borderRadius: '6px', marginTop: '10px' }} />
              </div>
              <div className="settings-section">
                <h3>System Users</h3>
                <div className="data-table" style={{ marginTop: '0' }}>
                  <table><thead><tr><th>Email</th><th>Role</th><th>Last Login</th><th>Status</th><th>Action</th></tr></thead><tbody id="adminUsersTableBody"></tbody></table>
                </div>
              </div>
            </div>
            <div id="superDeploy" className="page-content">
              <h2 style={{ marginBottom: '25px', fontWeight: 700 }}>Settings</h2>
              <div className="settings-section">
                <h3>User Profile</h3>
                <div className="field"><label>Display Name</label><input type="text" id="superSettingsName" defaultValue="Admin" /></div>
                <div className="field"><label>Email</label><input type="email" id="superSettingsEmail" defaultValue="admin@bahgo.com" /></div>
                <div className="field"><label>Role</label><input type="text" defaultValue="Developer" disabled /></div>
                <button className="btn-login" style={{ width: 'auto', padding: '12px 30px' }} id="saveSuperProfile">Save Profile</button>
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