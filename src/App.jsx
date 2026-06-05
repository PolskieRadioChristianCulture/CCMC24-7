import React, { useState, useEffect } from 'react';
import './App.css';
import logo from '../public/logo.jpg';

const AI_SUGGESTIONS = [
  "Sugestia AI: Połącz projekt #ImChristian z platformą Holistyczny Coaching by zwiększyć retencję o 14%.",
  "Sugestia AI: Skieruj ruch z TikTok 'Dobrze, że jesteś' prosto na CC Lite.",
  "Sugestia AI: Agent 'Strateg Wojenny' rekomenduje uruchomienie powiadomień Push w niedzielę o 20:00.",
  "Sugestia AI: Zbyt mała integracja bazy mailowej pomiędzy Lumina a Radiem CC. Proponuję most danych."
];

const AGENTS_CLUB = [
  { id: 1, name: "Strateg Wojenia Ewangelicznego", type: "Super-Agent", desc: "Zarządza taktyką długofalową i powiązaniami projektów." },
  { id: 2, name: "Inżynier Wirusowości", type: "Taktyk", desc: "Maksymalizuje zasięgi na Tiktoku, FB i Instagramie." },
  { id: 3, name: "Analityk Psychiki i Bólu", type: "Kognitywista", desc: "Bada potrzeby duchowe społeczeństwa i lęki." },
  { id: 4, name: "Strażnik Ognia Ducha", type: "Ochroniarz Doktryny", desc: "Dba o wierność prawdzie i radykalizm ewangeliczny." },
  { id: 5, name: "Główny Archiwista CC", type: "Baza Danych", desc: "Pamięta wszystko, dokumentuje historię i plany." },
  { id: 6, name: "Audytor i Weryfikator Kodów", type: "QA", desc: "Sprawdza repozytoria, czyści błędy i luki." },
  { id: 7, name: "Inżynier Backendu", type: "Wektor 1", desc: "Projektuje API, integruje bazy danych, systemy wideo." },
  { id: 8, name: "Analityk Taktyczny", type: "Taktyk", desc: "Rozwiązuje mikrozadania tu i teraz." },
  { id: 9, name: "Biznesmen", type: "Finanse", desc: "Zarabianie na infrastrukturę misyjną." },
  { id: 10, name: "Ewangelizacja", type: "Działacz", desc: "Bezpośrednie komunikaty ewangelizacyjne." },
  { id: 11, name: "Integrator", type: "System", desc: "Skleja wszystkie klocki ze sobą." },
  { id: 12, name: "Komunikacja", type: "PR", desc: "Dba o spójny głos i komunikację wizualną." },
  { id: 13, name: "Multimedia", type: "Media", desc: "Wideo, podcasty, design." },
  { id: 14, name: "Prawnik", type: "Legal", desc: "Regulaminy, RODO, bezpieczeństwo danych." },
  { id: 15, name: "Psycholog", type: "Pomoc", desc: "Konsultacje, wsparcie dla społeczności." }
];

function App() {
  const [status, setStatus] = useState("AWAITING_COMMANDS");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [error, setError] = useState(false);
  const [activeTab, setActiveTab] = useState("CANVAS");
  const [showJoshuaBubble, setShowJoshuaBubble] = useState(true);

  const [suggestionIndex, setSuggestionIndex] = useState(0);

  const [terminalInput, setTerminalInput] = useState("");
  const [attachmentData, setAttachmentData] = useState(null);
  const [attachmentName, setAttachmentName] = useState("");

  const [terminalLogs, setTerminalLogs] = useState([
    { type: 'system', text: '[SYSTEM] Bezpieczne połączenie nawiązane.' },
    { type: 'system', text: '[SYSTEM] Płótno operacyjne załadowane.' },
    { type: 'ai', text: '[JOSHUA CC] Oczekuję na dyspozycje, Dowódco.' }
  ]);

  // Prosty polling API, byś mógł otrzymywać moje wiadomości na żywo w przeglądarce
  useEffect(() => {
    if (activeTab === 'CANVAS') {
      let lastTime = new Date().toISOString();
      const pollMessages = async () => {
        try {
          // Używamy obejścia, by nie instalować całego SDK w React - po prostu odpytujemy REST API
          const res = await fetch(`https://firestore.googleapis.com/v1/projects/cc-mission-control/databases/(default)/documents/CommandQueue`);
          const json = await res.json();
          if (json.documents) {
            const newLogs = [];
            json.documents.forEach(doc => {
              const data = doc.fields;
              const timestamp = data.timestamp?.timestampValue || "";
              const sender = data.sender?.stringValue || "user";
              const text = data.command?.stringValue || "";
              
              if (sender === "joshua" && timestamp > lastTime) {
                newLogs.push({ type: 'ai', text: `[JOSHUA CC] ${text}` });
                lastTime = timestamp;
              }
            });
            if (newLogs.length > 0) {
              setTerminalLogs(prev => [...prev, ...newLogs]);
            }
          }
        } catch (e) {
          // ignoruj błędy sieciowe w tle
        }
      };
      const intervalId = setInterval(pollMessages, 3000);
      return () => clearInterval(intervalId);
    }
  }, [activeTab]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAttachmentName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachmentData(reader.result); // Base64
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTerminalSubmit = async () => {
    if (!terminalInput.trim()) return;
    
    const cmd = terminalInput.trim();
    setTerminalLogs(prev => [...prev, { type: 'user', text: `root@mission-control:~# ${cmd}` }]);
    setTerminalInput("");

    // Wysyłka komendy przez REST API do darmowej bazy Firestore Dowódcy
    try {
      const payloadFields = {
        command: { stringValue: cmd },
        status: { stringValue: 'pending' },
        timestamp: { timestampValue: new Date().toISOString() }
      };

      if (attachmentData) {
        payloadFields.attachment_base64 = { stringValue: attachmentData };
        payloadFields.attachment_name = { stringValue: attachmentName };
        setTerminalLogs(prev => [...prev, { type: 'system', text: `[ZAŁĄCZNIK] Dołączono plik: ${attachmentName}` }]);
        setAttachmentData(null);
        setAttachmentName("");
      }

      await fetch('https://firestore.googleapis.com/v1/projects/cc-mission-control/databases/(default)/documents/CommandQueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: payloadFields })
      });
      setTerminalLogs(prev => [...prev, { type: 'system', text: `[WYSŁANO] Oczekuję na Wektor 1...` }]);
    } catch (e) {
      setTerminalLogs(prev => [...prev, { type: 'system', text: `[BŁĄD] Utracono połączenie z satelitą chmurową.` }]);
    }
  };

  useEffect(() => {
    if (activeTab === 'CANVAS') {
      const interval = setInterval(() => {
        setSuggestionIndex(prev => (prev + 1) % AI_SUGGESTIONS.length);
      }, 10000); // Zmiana sugestii co 10 sekund
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  const handleLogin = (e) => {
    e.preventDefault();
    // Banalne szyfrowanie wizualne w kodzie. Wersja produkcyjna na Githabie
    // odczyta ten token i odblokuje dostęp.
    if (tokenInput === "5550455") {
      setIsAuthenticated(true);
      setError(false);
    } else {
      setError(true);
      setTokenInput("");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="login-container">
        <div className="login-box">
          <img src={logo} alt="Mission Control" className="login-logo" />
          <h2>RESTRICTED AREA</h2>
          <p>ENTER ENCRYPTED TOKEN</p>
          <form onSubmit={handleLogin}>
            <input 
              type="password" 
              value={tokenInput} 
              onChange={(e) => setTokenInput(e.target.value)}
              className={error ? "token-input error-shake" : "token-input"}
              placeholder="•••••••"
              autoFocus
            />
            <button type="submit" className="login-button">AUTHORIZE</button>
          </form>
          {error && <p className="error-text">ACCESS DENIED</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <div className="logo-container">
          <img src={logo} alt="Mission Control" className="logo" />
        </div>
        <nav className="nav-menu">
          <button className={`nav-item ${activeTab === 'CANVAS' ? 'active' : ''}`} onClick={() => setActiveTab('CANVAS')}>CANVAS</button>
          <button className={`nav-item ${activeTab === 'OVERVIEW' ? 'active' : ''}`} onClick={() => setActiveTab('OVERVIEW')}>OVERVIEW</button>
          <button className={`nav-item ${activeTab === 'ECOSYSTEM' ? 'active' : ''}`} onClick={() => setActiveTab('ECOSYSTEM')}>ECOSYSTEM BASE</button>
          <button className={`nav-item ${activeTab === 'AGENTS' ? 'active' : ''}`} onClick={() => setActiveTab('AGENTS')}>AGENTS</button>
          <button className={`nav-item ${activeTab === 'DEPLOYMENTS' ? 'active' : ''}`} onClick={() => setActiveTab('DEPLOYMENTS')}>DEPLOYMENTS</button>
          <button className={`nav-item ${activeTab === 'LOGS' ? 'active' : ''}`} onClick={() => setActiveTab('LOGS')}>LOGS</button>
        </nav>
      </aside>

      <main className="main-content">
        <header className="top-bar">
          <h1>CHRISTIAN CULTURE 24/7</h1>
          <span className="status-badge">SECURE CONNECTION</span>
        </header>

        {activeTab === 'CANVAS' && (
          <section className="canvas-section">
            <h2>STRATEGIC CANVAS</h2>
            <div className="canvas-placeholder">
              <div className="communicator-terminal">
                <div className="terminal-header">
                  <span>TERMINAL DOWODZENIA (KOMUNIKATOR)</span>
                  <span className="status-pulse">● ONLINE</span>
                </div>
                <div className="terminal-body">
                  {terminalLogs.map((log, idx) => (
                    <div key={idx} className={`log-entry ${log.type}`}>{log.text}</div>
                  ))}
                </div>
                <div className="terminal-input-wrapper">
                  <span className="prompt-symbol">root@mission-control:~#</span>
                  
                  <input type="file" id="file-upload" style={{display: 'none'}} onChange={handleFileChange} />
                  <label htmlFor="file-upload" className="attachment-btn" title="Dodaj plik" style={{cursor: 'pointer', marginRight: '10px', fontSize: '18px'}}>
                    📎
                  </label>

                  <input 
                    type="text" 
                    className="terminal-input" 
                    placeholder={attachmentName ? `Wpisz komendę dla pliku ${attachmentName}...` : "Wpisz rozkaz (np. /ping, deploy, skan)..."}
                    value={terminalInput}
                    onChange={(e) => setTerminalInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleTerminalSubmit()}
                  />
                  <button className="terminal-send-btn" onClick={handleTerminalSubmit}>WYŚLIJ</button>
                </div>
              </div>
              
              {showJoshuaBubble && (
                <div className="ai-suggestion-bubble">
                  <div className="ai-bubble-header">
                    <span className="ai-icon">✨</span>
                    <strong>JOSHUA CC</strong>
                    <button className="close-bubble-btn" onClick={() => setShowJoshuaBubble(false)}>✕</button>
                  </div>
                  <p>{AI_SUGGESTIONS[suggestionIndex]}</p>
                  <div className="ai-bubble-actions">
                    <button className="ai-action-btn">Rozwiń temat</button>
                    <button className="ai-action-btn primary">Wprowadź sugestię</button>
                  </div>
                </div>
              )}

              <div className="canvas-hud">
                <button className="hud-icon-btn">💬</button>
                <button className="hud-icon-btn active-gold" onClick={() => setShowJoshuaBubble(!showJoshuaBubble)}>✨</button>
              </div>

            </div>
          </section>
        )}

        {activeTab === 'OVERVIEW' && (
          <section className="overview-section">
            <div className="metrics-grid">
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
            </div>
            <div className="terminal-section">
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
            </div>
          </section>
        )}

        {activeTab === 'ECOSYSTEM' && (
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
        )}
        {activeTab === 'AGENTS' && (
          <section className="agents-section">
            <h2>KLUB DOBRYCH DORADCÓW (AGENTS)</h2>
            <div className="agents-grid">
              {AGENTS_CLUB.map(agent => (
                <div className="eco-card agent-card" key={agent.id}>
                  <h4>{agent.name}</h4>
                  <span className="agent-type">{agent.type}</span>
                  <p className="agent-desc">{agent.desc}</p>
                </div>
              ))}
            </div>
          </section>
        )}

      </main>
    </div>
  );
}

export default App;
