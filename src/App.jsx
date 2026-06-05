import React, { useState } from 'react';
import './App.css';

function App() {
  const [status, setStatus] = useState("AWAITING_COMMANDS");

  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <div className="logo-container">
          <img src="/logo.jpg" alt="Mission Control" className="logo" />
        </div>
        <nav className="nav-menu">
          <button className="nav-item active">OVERVIEW</button>
          <button className="nav-item">AGENTS</button>
          <button className="nav-item">DEPLOYMENTS</button>
          <button className="nav-item">LOGS</button>
        </nav>
      </aside>

      <main className="main-content">
        <header className="top-bar">
          <h1>CHRISTIAN CULTURE 24/7</h1>
          <span className="status-badge">SECURE CONNECTION</span>
        </header>

        <section className="metrics-grid">
          <div className="metric-card">
            <h3>ACTIVE AGENTS</h3>
            <p className="metric-value">15</p>
          </div>
          <div className="metric-card">
            <h3>TASKS IN QUEUE</h3>
            <p className="metric-value">3</p>
          </div>
          <div className="metric-card">
            <h3>SYSTEM STATUS</h3>
            <p className="metric-value status-online">ONLINE</p>
          </div>
        </section>

        <section className="terminal-section">
          <h2>TERMINAL / COMMAND CENTER</h2>
          <div className="terminal-window">
            <p className="terminal-line">[SYSTEM] Welcome to Mission Control.</p>
            <p className="terminal-line">[SYSTEM] Authentication successful. Access level: COMMANDER.</p>
            <p className="terminal-line">[AI] Awaiting your orders...</p>
            <div className="terminal-input-row">
              <span>&gt;</span>
              <input type="text" className="terminal-input" placeholder="Enter command..." />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
