import React, { useState, useEffect } from "react";

export default function AnalystConsole({ refreshTrigger }) {
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [filterType, setFilterType] = useState("ALL"); // ALL, ALERTS, APPROVED
  const [searchAccount, setSearchAccount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState({ total: 0, alerts: 0, rate: 100 });

  useEffect(() => {
    fetchTransactions();
  }, [refreshTrigger]);

  useEffect(() => {
    let list = [...transactions];

    if (filterType === "ALERTS") {
      list = list.filter(t => t.decision === "DENIED" || t.decision === "CHALLENGE" || t.decision === "FAILED");
    } else if (filterType === "APPROVED") {
      list = list.filter(t => t.decision === "APPROVED" || t.decision === "VERIFIED");
    }

    if (searchAccount.trim() !== "") {
      const q = searchAccount.toLowerCase();
      list = list.filter(t => t.sender_account.toLowerCase().includes(q) || t.receiver_account.toLowerCase().includes(q));
    }

    setFilteredTransactions(list);
  }, [transactions, filterType, searchAccount]);

  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/transactions");
      if (!res.ok) throw new Error("HTTP error " + res.status);
      const data = await res.json();
      setTransactions(data);
      
      const total = data.length;
      const alerts = data.filter(t => t.decision === "DENIED" || t.decision === "CHALLENGE" || t.decision === "FAILED").length;
      const approvedCount = data.filter(t => t.decision === "APPROVED" || t.decision === "VERIFIED").length;
      const rate = total > 0 ? (approvedCount / total) * 100 : 100;
      
      setStats({ total, alerts, rate });
    } catch (e) {
      console.error("Failed to fetch transactions:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const getDecisionBadge = (decision) => {
    const cls = `badge-decision ${decision.toLowerCase()}`;
    return <span className={cls}>{decision}</span>;
  };

  const formatDate = (isoStr) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      return isoStr;
    }
  };

  // Render a visual SVG map showing active threat lines based on recent transactions
  const renderThreatMap = () => {
    // Standard map nodes
    const nodes = [
      { name: "New York", x: 80, y: 55, color: "var(--color-primary)" },
      { name: "Los Angeles", x: 45, y: 70, color: "var(--color-primary)" },
      { name: "London", x: 190, y: 40, color: "var(--color-primary)" },
      { name: "Berlin", x: 210, y: 42, color: "var(--color-primary)" },
      { name: "Tokyo", x: 340, y: 65, color: "var(--color-primary)" }
    ];

    // Find active alarms
    const activeAlarms = transactions.slice(0, 5).map(tx => {
      let matchingNode = nodes.find(n => n.name.toLowerCase() === tx.location.toLowerCase());
      if (!matchingNode) {
        // custom random coordinates for unknown locations
        matchingNode = { name: tx.location, x: 260, y: 80 };
      }
      return {
        ...matchingNode,
        score: tx.consensus_score,
        decision: tx.decision,
        amount: tx.amount
      };
    });

    return (
      <div className="glass-panel" style={{ padding: "1.75rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <h3 style={{ fontSize: "1.1rem", fontWeight: 800 }}>Global Transaction Heatmap</h3>
        <div style={{ position: "relative", width: "100%", height: "200px", background: "rgba(0, 0, 0, 0.4)", borderRadius: "14px", border: "1px solid var(--panel-border)", overflow: "hidden" }}>
          
          {/* Mock World Map Background Grid lines */}
          <svg style={{ position: "absolute", width: "100%", height: "100%", opacity: 0.15 }}>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#fff" strokeWidth="0.5" />
            </pattern>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>

          {/* Draw connections */}
          <svg style={{ position: "absolute", width: "100%", height: "100%" }}>
            {activeAlarms.map((alarm, idx) => {
              if (alarm.decision === "DENIED" || alarm.decision === "FAILED") {
                // NY coord as center home
                return (
                  <line 
                    key={idx} 
                    x1="80" y1="55" 
                    x2={alarm.x} y2={alarm.y} 
                    stroke="var(--color-danger)" 
                    strokeWidth="1.5" 
                    strokeDasharray="5,5" 
                  />
                );
              }
              return null;
            })}
          </svg>

          {/* Draw map location circles */}
          {nodes.map((node, idx) => (
            <div 
              key={idx} 
              style={{ 
                position: "absolute", 
                left: `${node.x}px`, 
                top: `${node.y}px`, 
                transform: "translate(-50%, -50%)" 
              }}
            >
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#4b5563" }}></div>
              <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)", marginTop: "2px", whiteSpace: "nowrap" }}>{node.name}</div>
            </div>
          ))}

          {/* Draw active pulsing alarms */}
          {activeAlarms.map((alarm, idx) => {
            const isAlert = alarm.decision === "DENIED" || alarm.decision === "CHALLENGE" || alarm.decision === "FAILED";
            const color = alarm.decision === "DENIED" || alarm.decision === "FAILED" ? "var(--color-danger)" : alarm.decision === "CHALLENGE" ? "var(--color-warning)" : "var(--color-success)";
            
            return (
              <div 
                key={idx} 
                style={{ 
                  position: "absolute", 
                  left: `${alarm.x}px`, 
                  top: `${alarm.y}px`, 
                  transform: "translate(-50%, -50%)" 
                }}
              >
                <div style={{ 
                  width: "14px", 
                  height: "14px", 
                  borderRadius: "50%", 
                  background: color, 
                  boxShadow: `0 0 15px ${color}`,
                  position: "relative"
                }}>
                  {isAlert && (
                    <div style={{ 
                      position: "absolute", 
                      top: "-3px", left: "-3px", right: "-3px", bottom: "-3px", 
                      border: `1.5px solid ${color}`, 
                      borderRadius: "50%",
                      animation: "pulse 1.5s infinite" 
                    }}></div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      
      {/* Stats Cards */}
      <div className="grid-3">
        <div className="glass-panel metric-card" style={{ borderLeft: "4px solid var(--color-primary)" }}>
          <div className="metric-title">Total Ledger Entries</div>
          <div className="metric-value" style={{ color: "#fff" }}>{stats.total}</div>
        </div>
        <div className="glass-panel metric-card" style={{ borderLeft: "4px solid var(--color-danger)" }}>
          <div className="metric-title">Active Threat Blocks</div>
          <div className="metric-value" style={{ color: "var(--color-danger)" }}>{stats.alerts}</div>
        </div>
        <div className="glass-panel metric-card" style={{ borderLeft: "4px solid var(--color-success)" }}>
          <div className="metric-title">Consensus Accuracy Rate</div>
          <div className="metric-value" style={{ color: "var(--color-success)" }}>{stats.rate.toFixed(1)}%</div>
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: "1.7fr 1fr" }}>
        
        {/* Left: Control Panel Filter & Logs */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          
          <div className="glass-panel" style={{ padding: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            {/* Search */}
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", width: "250px" }}>
              <svg style={{ width: "20px", height: "20px", color: "var(--text-muted)" }} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"></path>
              </svg>
              <input 
                type="text" 
                placeholder="Search Account..." 
                className="form-control" 
                style={{ padding: "0.6rem 1rem", fontSize: "0.85rem" }}
                value={searchAccount}
                onChange={(e) => setSearchAccount(e.target.value)}
              />
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className={`btn btn-secondary ${filterType === "ALL" ? "active" : ""}`} style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem" }} onClick={() => setFilterType("ALL")}>All</button>
              <button className={`btn btn-secondary ${filterType === "ALERTS" ? "active" : ""}`} style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", borderColor: filterType === "ALERTS" ? "var(--color-danger)" : "transparent" }} onClick={() => setFilterType("ALERTS")}>Threats</button>
              <button className={`btn btn-secondary ${filterType === "APPROVED" ? "active" : ""}`} style={{ padding: "0.5rem 0.75rem", fontSize: "0.8rem", borderColor: filterType === "APPROVED" ? "var(--color-success)" : "transparent" }} onClick={() => setFilterType("APPROVED")}>Safe</button>
              <button className="btn btn-secondary" style={{ padding: "0.5rem", borderRadius: "8px" }} onClick={fetchTransactions}><svg style={{ width: "16px", height: "16px" }} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"></path></svg></button>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: "1.5rem" }}>
            {isLoading ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>Loading secure ledger records...</div>
            ) : filteredTransactions.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>No transactions logs found.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="tx-table">
                  <thead>
                    <tr>
                      <th>Sender</th>
                      <th>Amount</th>
                      <th>Risk</th>
                      <th>Verdict</th>
                      <th>Location</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((tx) => (
                      <React.Fragment key={tx.id}>
                        <tr className="tx-row">
                          <td style={{ fontWeight: 700 }}>
                            {tx.sender_account}
                            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 400 }}>{formatDate(tx.timestamp).split(' ')[1]}</div>
                          </td>
                          <td style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>${tx.amount.toFixed(2)}</td>
                          <td>
                            <span style={{ fontSize: "0.85rem", fontFamily: "var(--font-mono)", fontWeight: 700, color: tx.consensus_score > 0.75 ? "var(--color-danger)" : tx.consensus_score > 0.35 ? "var(--color-warning)" : "var(--color-success)" }}>
                              {(tx.consensus_score * 100).toFixed(0)}%
                            </span>
                          </td>
                          <td>{getDecisionBadge(tx.decision)}</td>
                          <td style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{tx.location}</td>
                        </tr>
                        {tx.explanations && tx.explanations.length > 0 && (
                          <tr>
                            <td colSpan="5" style={{ padding: "0 1.25rem 1.25rem 1.25rem" }}>
                              <div className="xai-panel">
                                <div className="xai-title">⚠️ Explainable AI Threat Insight</div>
                                <ul className="xai-list">
                                  {tx.explanations.map((exp, idx) => (
                                    <li key={idx} className="xai-item">{exp}</li>
                                  ))}
                                </ul>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        {/* Right: Threat Map & Insights */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {renderThreatMap()}
          
          <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 800 }}>Analyst Threat Directives</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: "1.5" }}>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <span>🛡️</span>
                <span>All payload structures decrypted in secure RAM sandboxes only. No plaintext is written to storage.</span>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <span>🎯</span>
                <span><strong>Consensus:</strong> If risk is above 35%, clients automatically trigger step-up biometric challenges to prevent false alerts.</span>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <span>🧪</span>
                <span>The Random Forest supervised model operates alongside Isolation Forest anomaly engine for high-end consensus scoring.</span>
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
