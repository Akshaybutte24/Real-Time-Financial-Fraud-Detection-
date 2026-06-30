import React, { useState, useEffect } from "react";
import Simulator from "./components/Simulator";
import AnalystConsole from "./components/AnalystConsole";
import SecurityConsole from "./components/SecurityConsole";
import "./App.css";

export default function App() {
  const [activeView, setActiveView] = useState("simulator");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [ledgerCount, setLedgerCount] = useState(0);
  const [threatLevel, setThreatLevel] = useState("LOW"); // LOW, ELEVATED, HIGH

  useEffect(() => {
    fetchLedgerCount();
  }, [refreshTrigger]);

  const fetchLedgerCount = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/transactions");
      if (res.ok) {
        const data = await res.json();
        setLedgerCount(data.length);
        
        // Compute threat level based on alerts ratio
        const alerts = data.filter(t => t.decision === "DENIED" || t.decision === "FAILED").length;
        if (alerts > 3) {
          setThreatLevel("HIGH");
        } else if (alerts > 0) {
          setThreatLevel("ELEVATED");
        } else {
          setThreatLevel("LOW");
        }
      }
    } catch (e) {
      console.error("Failed to fetch count:", e);
    }
  };

  const handleTransactionComplete = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="app-container">
      {/* Background ambient orbs */}
      <div className="orb orb-1"></div>
      <div className="orb orb-2"></div>

      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">🛡️</div>
          <span className="brand-name">ShieldFlow</span>
        </div>

        <nav className="nav-menu">
          <li className="nav-item">
            <button 
              className={`nav-link ${activeView === "simulator" ? "active" : ""}`}
              onClick={() => setActiveView("simulator")}
            >
              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"></path>
              </svg>
              Transaction Portal
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-link ${activeView === "analyst" ? "active" : ""}`}
              onClick={() => setActiveView("analyst")}
            >
              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.375c1.88 0 3.42-1.59 3.42-3.56c0-1.96-1.54-3.56-3.42-3.56H9v7.12zm9.375-9.375a9 9 0 11-12.75 12.75a9 9 0 0112.75-12.75z"></path>
              </svg>
              Analyst Console
            </button>
          </li>
          <li className="nav-item">
            <button 
              className={`nav-link ${activeView === "security" ? "active" : ""}`}
              onClick={() => setActiveView("security")}
            >
              <svg fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.751A11.956 11.956 0 0112 2.715z"></path>
              </svg>
              Security Center
            </button>
          </li>
        </nav>

        <div className="sidebar-footer">
          <div className="status-badge">
            <div className="status-dot"></div>
            <span>E2E Channel Engaged</span>
          </div>
        </div>
      </aside>

      {/* Main View Container */}
      <main className="main-content">
        
        {/* Global Dashboard Header Status Bar */}
        <div className="top-header-bar">
          <div className="header-status-item">
            <span className="header-status-label">Network Threat Status</span>
            <span className="header-status-value" style={{ 
              color: threatLevel === "HIGH" ? "var(--color-danger)" : threatLevel === "ELEVATED" ? "var(--color-warning)" : "var(--color-success)",
              textShadow: threatLevel === "HIGH" ? "0 0 10px rgba(255, 71, 126, 0.4)" : "none",
              fontWeight: 800
            }}>
              ● {threatLevel}
            </span>
          </div>
          
          <div className="header-status-item">
            <span className="header-status-label">E2E Cryptography</span>
            <span className="header-status-value" style={{ color: "var(--color-accent)" }}>AES-256 / RSA-2048</span>
          </div>
          
          <div className="header-status-item">
            <span className="header-status-label">API Tunnel Latency</span>
            <span className="header-status-value" style={{ fontFamily: "var(--font-mono)" }}>14ms</span>
          </div>
          
          <div className="header-status-item">
            <span className="header-status-label">SQLite Ledger size</span>
            <span className="header-status-value" style={{ fontFamily: "var(--font-mono)" }}>{ledgerCount} entries</span>
          </div>
        </div>

        {/* View Router */}
        {activeView === "simulator" && (
          <div>
            <header className="view-header">
              <h1 className="view-title">Secure Payment Portal</h1>
              <p className="view-subtitle">Simulate real-time transactions protected by WebCrypto AES wrappers and RSA envelopes.</p>
            </header>
            <Simulator onTransactionComplete={handleTransactionComplete} />
          </div>
        )}

        {activeView === "analyst" && (
          <div>
            <header className="view-header">
              <h1 className="view-title">Analyst Threat Console</h1>
              <p className="view-subtitle">Audit decrypted records, inspect anomalies, and review Explainable AI (XAI) risk factors.</p>
            </header>
            <AnalystConsole refreshTrigger={refreshTrigger} />
          </div>
        )}

        {activeView === "security" && (
          <div>
            <header className="view-header">
              <h1 className="view-title">Cryptographic Crypt & ML Performance</h1>
              <p className="view-subtitle">Monitor model parameters, rotate keys, and inspect envelope ciphertext storage.</p>
            </header>
            <SecurityConsole refreshTrigger={refreshTrigger} />
          </div>
        )}

      </main>
    </div>
  );
}
