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
          <button className="nav-item">ECOSYSTEM BASE</button>
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

        <section className="ecosystem-section">
          <h2>MISSION BASE: THE ECOSYSTEM</h2>
          <div className="ecosystem-grid">
            <div className="eco-card app-card">
              <h4>Dobrze, że jesteś</h4>
              <span className="pkg-id">com.christianculture.cudakazdegodnia</span>
            </div>
            <div className="eco-card app-card">
              <h4>#ImChristian</h4>
              <span className="pkg-id">com.aistudio.imchristian.hzpkvq</span>
            </div>
            <div className="eco-card app-card">
              <h4>Ambient Sleep</h4>
              <span className="pkg-id">com.aistudio.ambientsleep.yzkcjw</span>
            </div>
            <div className="eco-card app-card">
              <h4>Biblia #zaDARMO</h4>
              <span className="pkg-id">com.aistudio.darmowabiblia.vxtpzl</span>
            </div>
            <div className="eco-card app-card">
              <h4>Biblia Audio Christian Culture</h4>
              <span className="pkg-id">com.bibliaaudio.cc</span>
            </div>
            <div className="eco-card app-card">
              <h4>CC Lite</h4>
              <span className="pkg-id">com.aistudio.cclight.fkcjxp</span>
            </div>
            <div className="eco-card app-card">
              <h4>Christian Culture</h4>
              <span className="pkg-id">pl.cclite.app</span>
            </div>
            <div className="eco-card app-card">
              <h4>Holistyczny Coaching</h4>
              <span className="pkg-id">com.cc.holistyczny</span>
            </div>
            <div className="eco-card app-card">
              <h4>Koncept</h4>
              <span className="pkg-id">com.aistudio.konceptstudio.hamra</span>
            </div>
            <div className="eco-card app-card">
              <h4>Lumina</h4>
              <span className="pkg-id">com.lumina.cc</span>
            </div>
            <div className="eco-card web-card">
              <h4>CC Lite (WEB)</h4>
              <a href="https://www.cclite.pl" target="_blank" rel="noreferrer">www.cclite.pl</a>
            </div>
            <div className="eco-card web-card">
              <h4>Polskie Radio CC (WEB)</h4>
              <a href="https://www.polskieradio.cc" target="_blank" rel="noreferrer">www.polskieradio.cc</a>
            </div>
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
