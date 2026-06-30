import React, { useState, useEffect } from "react";

export default function SecurityConsole({ refreshTrigger }) {
  const [dbRecords, setDbRecords] = useState([]);
  const [modelStats, setModelStats] = useState(null);
  const [rsaKeyPem, setRsaKeyPem] = useState("");
  const [keyFingerprint, setKeyFingerprint] = useState("");
  const [isLoadingDb, setIsLoadingDb] = useState(false);
  const [isRotating, setIsRotating] = useState(false);

  useEffect(() => {
    fetchDbRecords();
    fetchModelStats();
    fetchKeys();
  }, [refreshTrigger]);

  const fetchDbRecords = async () => {
    setIsLoadingDb(true);
    try {
      const res = await fetch("http://localhost:8000/api/database-view");
      if (!res.ok) throw new Error("HTTP error " + res.status);
      const data = await res.json();
      setDbRecords(data);
    } catch (e) {
      console.error("Failed to fetch database view:", e);
    } finally {
      setIsLoadingDb(false);
    }
  };

  const fetchModelStats = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/model-stats");
      if (!res.ok) throw new Error("HTTP error " + res.status);
      const data = await res.json();
      setModelStats(data);
    } catch (e) {
      console.error("Failed to fetch model stats:", e);
    }
  };

  const fetchKeys = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/keys");
      if (!res.ok) throw new Error("HTTP error " + res.status);
      const data = await res.json();
      setRsaKeyPem(data.public_key);
      setKeyFingerprint(data.fingerprint);
    } catch (e) {
      console.error("Failed to fetch server keys:", e);
    }
  };

  const rotateKeysSimulated = () => {
    setIsRotating(true);
    setTimeout(() => {
      fetchKeys();
      setIsRotating(false);
    }, 1500);
  };

  // Render a beautiful SVG gauge for accuracy and FPR metrics
  const renderStatsGauges = () => {
    if (!modelStats) return null;
    const acc = modelStats.metrics.accuracy;
    const fpr = modelStats.metrics.fpr;

    // SVG parameters
    const size = 120;
    const strokeWidth = 10;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;

    // Stroke offsets
    const accOffset = circumference - acc * circumference;
    // Map FPR to gauge (let's exaggerate a bit for visibility, e.g. scale up, or invert)
    const fprOffset = circumference - (1 - fpr) * circumference;

    return (
      <div style={{ display: "flex", gap: "2rem", justifyContent: "space-around", marginTop: "1rem", flexWrap: "wrap" }}>
        
        {/* Accuracy Gauge */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ position: "relative", width: size, height: size }}>
            <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
              {/* Background circle */}
              <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={strokeWidth} />
              {/* Progress circle */}
              <circle 
                cx={size/2} cy={size/2} r={radius} 
                fill="none" 
                stroke="var(--color-success)" 
                strokeWidth={strokeWidth} 
                strokeDasharray={circumference} 
                strokeDashoffset={accOffset}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 1s ease" }}
              />
            </svg>
            <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyCenter: "center", flexDirection: "column", justifyContent: "center", fontFamily: "var(--font-mono)", fontWeight: 800 }}>
              <span style={{ fontSize: "1.1rem", color: "#fff" }}>{(acc * 100).toFixed(1)}%</span>
              <span style={{ fontSize: "0.6rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Accuracy</span>
            </div>
          </div>
        </div>

        {/* FPR Gauge */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ position: "relative", width: size, height: size }}>
            <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
              {/* Background circle */}
              <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={strokeWidth} />
              {/* Progress circle */}
              <circle 
                cx={size/2} cy={size/2} r={radius} 
                fill="none" 
                stroke="var(--color-accent)" 
                strokeWidth={strokeWidth} 
                strokeDasharray={circumference} 
                strokeDashoffset={fprOffset}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 1s ease" }}
              />
            </svg>
            <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", alignItems: "center", justifyCenter: "center", flexDirection: "column", justifyContent: "center", fontFamily: "var(--font-mono)", fontWeight: 800 }}>
              <span style={{ fontSize: "1.1rem", color: "#fff" }}>{(fpr * 100).toFixed(3)}%</span>
              <span style={{ fontSize: "0.6rem", color: "var(--text-muted)", textTransform: "uppercase" }}>False Alarm</span>
            </div>
          </div>
        </div>

      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      
      {/* 1. Cryptographic System Overview */}
      <div className="grid-2">
        
        {/* RSA Keypair */}
        <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 800 }}>Secure Key Vault</h3>
            <button 
              className="btn btn-secondary" 
              style={{ padding: "0.4rem 0.8rem", fontSize: "0.75rem", borderRadius: "8px" }} 
              onClick={rotateKeysSimulated}
              disabled={isRotating}
            >
              {isRotating ? "Rotating..." : "Rotate RSA Keys"}
            </button>
          </div>
          <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
            RSA key wrappers ensure secure single-use AES key negotiation between browser WebCrypto and RAM enclaves.
          </div>
          <div>
            <div className="console-title">Server Public Key (RSA-OAEP-2048)</div>
            <pre style={{ 
              fontFamily: "var(--font-mono)", 
              fontSize: "0.7rem", 
              background: "#020204", 
              padding: "1rem", 
              borderRadius: "10px", 
              color: "var(--text-secondary)", 
              overflowY: "auto", 
              maxHeight: "130px" 
            }}>
              {rsaKeyPem}
            </pre>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", fontSize: "0.85rem", alignItems: "center" }}>
            <span style={{ color: "var(--text-secondary)" }}>Fingerprint:</span>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--color-accent)" }}>{keyFingerprint}</span>
          </div>
        </div>

        {/* AI/ML Consensus Stats */}
        <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 800 }}>Consensus Classifier Audit</h3>
          <div style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
            ShieldFlow uses a dual-engine architecture: supervised classification targets patterns while Isolation Forest isolates outliers.
          </div>
          {modelStats ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {renderStatsGauges()}
              
              <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "0.35rem", background: "rgba(0,0,0,0.2)", padding: "1rem", borderRadius: "10px", border: "1px solid var(--panel-border)" }}>
                <div><strong>Supervised Engine:</strong> RandomForest (MaxDepth: 8)</div>
                <div><strong>Anomaly Engine:</strong> IsolationForest (Contamination: 3%)</div>
                <div><strong>Test Dataset Size:</strong> {modelStats.metrics.total_test_samples} transaction instances</div>
              </div>
            </div>
          ) : (
            <div style={{ color: "var(--text-secondary)" }}>Loading consensus metrics...</div>
          )}
        </div>

      </div>

      {/* 2. Raw Database Inspector */}
      <div className="glass-panel" style={{ padding: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h3 style={{ fontSize: "1.3rem", fontWeight: 800 }}>SQLite Envelope Storage (At-Rest Ciphertext Inspector)</h3>
            <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", marginTop: "0.25rem", lineHeight: "1.4" }}>
              This panel shows the physical database representation. Fields like card numbers and locations are envelope encrypted (AES-256-GCM). 
              Searchable indices are stored as HMAC-SHA256 blind hashes to preserve indexes without compromising data.
            </p>
          </div>
          <button className="btn btn-secondary" style={{ padding: "0.5rem 1.1rem", fontSize: "0.85rem" }} onClick={fetchDbRecords}>
            Sync Ledger
          </button>
        </div>

        {isLoadingDb ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>Reading ciphertexts from DB...</div>
        ) : dbRecords.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>No transactions stored. Execute a payment to inspect SQLite storage.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tx-table" style={{ fontSize: "0.8rem" }}>
              <thead>
                <tr>
                  <th style={{ width: "40px" }}>ID</th>
                  <th>Sender Index (HMAC)</th>
                  <th>Receiver Index (HMAC)</th>
                  <th>Sender Account (AES-256-GCM)</th>
                  <th>Amount (AES)</th>
                  <th>IP Address (AES)</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {dbRecords.map((rec) => (
                  <tr key={rec.id} className="tx-row">
                    <td style={{ fontFamily: "var(--font-mono)", fontWeight: 800 }}>{rec.id}</td>
                    <td style={{ fontFamily: "var(--font-mono)", color: "var(--color-primary)" }}>{rec.sender_account_hash}</td>
                    <td style={{ fontFamily: "var(--font-mono)", color: "var(--color-primary)" }}>{rec.receiver_account_hash}</td>
                    <td style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{rec.sender_account_encrypted}</td>
                    <td style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{rec.amount_encrypted}</td>
                    <td style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{rec.ip_encrypted}</td>
                    <td>
                      <span className={`badge-decision ${rec.decision.toLowerCase()}`} style={{ fontSize: "0.65rem", padding: "0.15rem 0.5rem" }}>
                        {rec.decision}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
