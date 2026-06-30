import React, { useState, useEffect } from "react";
import { importRsaPublicKey, encryptTransaction } from "../utils/crypto";

// Mock profiles
const PROFILES = [
  { id: "acc_123456", name: "Alice Smith (NY)", city: "New York", lat: 40.7128, lon: -74.0060, amount: 80 },
  { id: "acc_789012", name: "Bob Jones (LA)", city: "Los Angeles", lat: 34.0522, lon: -118.2437, amount: 120 },
  { id: "acc_345678", name: "Charlie Brown (London)", city: "London", lat: 51.5074, lon: -0.1278, amount: 50 },
  { id: "new_user", name: "Custom User Profile", city: "Chicago", lat: 41.8781, lon: -87.6298, amount: 100 }
];

export default function Simulator({ onTransactionComplete }) {
  // Form variables
  const [profileId, setProfileId] = useState(PROFILES[0].id);
  const [receiverAccount, setReceiverAccount] = useState("acc_888888");
  const [amount, setAmount] = useState(PROFILES[0].amount);
  const [locationName, setLocationName] = useState(PROFILES[0].city);
  const [lat, setLat] = useState(PROFILES[0].lat);
  const [lon, setLon] = useState(PROFILES[0].lon);
  const [timeDiffHours, setTimeDiffHours] = useState(2.0);
  const [ipAddress, setIpAddress] = useState("192.168.1.50");
  const [isVpn, setIsVpn] = useState(false);
  const [isRooted, setIsRooted] = useState(false);
  const [biometricMatch, setBiometricMatch] = useState(true);
  const [hour, setHour] = useState(14);

  // States
  const [logs, setLogs] = useState([]);
  const [rsaPubKeyPem, setRsaPubKeyPem] = useState(null);
  const [rsaPubKeyObj, setRsaPubKeyObj] = useState(null);
  const [keyFingerprint, setKeyFingerprint] = useState("");
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [encryptedPackage, setEncryptedPackage] = useState(null);
  const [decryptedResponse, setDecryptedResponse] = useState(null);
  
  // MFA
  const [showMfaModal, setShowMfaModal] = useState(false);
  const [mfaStatus, setMfaStatus] = useState("idle");
  const [challengeTxId, setChallengeTxId] = useState(null);

  // Sync profile options
  useEffect(() => {
    const prof = PROFILES.find(p => p.id === profileId);
    if (prof && profileId !== "new_user") {
      setAmount(prof.amount);
      setLocationName(prof.city);
      setLat(prof.lat);
      setLon(prof.lon);
    }
  }, [profileId]);

  // Load server key
  useEffect(() => {
    addLog("Tunnel: Establishing cryptographic connection with server...");
    fetchRsaKey();
  }, []);

  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [`[${time}] ${msg}`, ...prev]);
  };

  const fetchRsaKey = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/keys");
      if (!res.ok) throw new Error("Server not responding");
      const data = await res.json();
      
      setRsaPubKeyPem(data.public_key);
      setKeyFingerprint(data.fingerprint);
      addLog(`Security: Server RSA public key loaded (${data.fingerprint})`);
      
      const keyObj = await importRsaPublicKey(data.public_key);
      setRsaPubKeyObj(keyObj);
      addLog("Subsystem: WebCrypto RSA-OAEP engine active.");
    } catch (e) {
      addLog(`ERROR: Connection offline: ${e.message}`);
    }
  };

  // Quick Populator templates
  const loadPreset = (type) => {
    addLog(`Preset: Loading templates for "${type}"...`);
    const alice = PROFILES[0];
    const bob = PROFILES[1];

    if (type === "NORMAL") {
      setProfileId(alice.id);
      setReceiverAccount("acc_888888");
      setAmount(45.00);
      setLocationName(alice.city);
      setLat(alice.lat);
      setLon(alice.lon);
      setTimeDiffHours(12.0);
      setIpAddress("192.168.1.50");
      setIsVpn(false);
      setIsRooted(false);
      setBiometricMatch(true);
      setHour(14);
      addLog("Preset: Configured normal low-risk transaction.");
    } else if (type === "VELOCITY") {
      setProfileId(alice.id);
      setReceiverAccount("acc_999222");
      setAmount(90.00);
      setLocationName("Tokyo");
      setLat(35.6762); // Tokyo
      setLon(139.6503);
      setTimeDiffHours(0.1); // 6 mins travel to Tokyo!
      setIpAddress("103.4.12.89");
      setIsVpn(false);
      setIsRooted(false);
      setBiometricMatch(true);
      setHour(2); // late night Tokyo
      addLog("Preset: Configured impossible velocity alert (NY to Tokyo in 6 mins).");
    } else if (type === "VPN") {
      setProfileId(bob.id);
      setReceiverAccount("acc_555333");
      setAmount(120.00);
      setLocationName("Los Angeles");
      setLat(bob.lat);
      setLon(bob.lon);
      setTimeDiffHours(4.5);
      setIpAddress("185.220.101.4"); // Tor exit/VPN IP
      setIsVpn(true);
      setIsRooted(true);
      setBiometricMatch(false); // bypass bio
      setHour(23);
      addLog("Preset: Configured identity risk alert (VPN + Rooted Device + Failed Biometric).");
    } else if (type === "SPIKE") {
      setProfileId(alice.id);
      setReceiverAccount("acc_999999");
      setAmount(4800.00); // 60x typical Alice amount
      setLocationName(alice.city);
      setLat(alice.lat);
      setLon(alice.lon);
      setTimeDiffHours(24.0);
      setIpAddress("192.168.1.50");
      setIsVpn(false);
      setIsRooted(false);
      setBiometricMatch(true);
      setHour(15);
      addLog("Preset: Configured extreme amount spike alert ($4,800).");
    }
  };

  const handleTransactionSubmit = async (e) => {
    e.preventDefault();
    if (!rsaPubKeyObj) {
      addLog("ERROR: Server key is missing. Re-fetching...");
      await fetchRsaKey();
      if (!rsaPubKeyObj) return;
    }

    setIsEncrypting(true);
    setDecryptedResponse(null);
    setEncryptedPackage(null);
    addLog("Security: Packing client payload parameters...");

    try {
      const txPayload = {
        sender_account: profileId === "new_user" ? "acc_custom" : profileId,
        receiver_account: receiverAccount,
        amount: parseFloat(amount),
        location: locationName,
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        time_diff_hours: parseFloat(timeDiffHours),
        ip_address: ipAddress,
        device_risk: isRooted ? 0.95 : 0.05,
        location_risk: isVpn ? 0.90 : 0.05,
        hour: parseInt(hour),
        biometric_match: biometricMatch ? 1 : 0,
        device_info: isRooted ? "Rooted Android Emulator 2.2 / Frida Injector" : "iOS 17.5 iPhone 15 Pro WebKit"
      };

      addLog("Pipeline: Executing Hybrid wrapping...");
      
      const pkg = await encryptTransaction(txPayload, rsaPubKeyObj);
      setEncryptedPackage(pkg);
      
      addLog(`Wrap: Ephemeral AES-256 session key exported.`);
      addLog(`Tunnel: Transporting encrypted frame...`);

      const res = await fetch("http://localhost:8000/api/transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encrypted_payload: pkg.encrypted_payload,
          encrypted_key: pkg.encrypted_key,
          iv: pkg.iv,
          tag: pkg.tag
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Server failed payload verification");
      }

      const response = await res.json();
      setDecryptedResponse(response);
      
      addLog(`Server: RSA Private Key unwrap verified. Decrypted frame validated.`);
      addLog(`Verdict: Decision: ${response.decision} | Consensus Score: ${(response.consensus_score * 100).toFixed(1)}%`);

      if (response.decision === "CHALLENGE") {
        addLog("Server: Risk holds. Requiring step-up device verification.");
        setChallengeTxId(response.transaction_id);
        setMfaStatus("idle");
        setShowMfaModal(true);
      } else {
        if (onTransactionComplete) onTransactionComplete();
      }

    } catch (err) {
      addLog(`Pipeline ERROR: Tunnel crashed: ${err.message}`);
    } finally {
      setIsEncrypting(false);
    }
  };

  const runSimulatedMfa = () => {
    setMfaStatus("scanning");
    addLog("Biometrics: Scanning biometric identity record...");
    
    setTimeout(async () => {
      setMfaStatus("verified");
      addLog("Biometrics: Signature match confirmed!");
      
      try {
        await fetch("http://localhost:8000/api/verify-mfa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transaction_id: challengeTxId,
            success: true
          })
        });
        addLog(`Server: Transaction ${challengeTxId} successfully VERIFIED.`);
        setTimeout(() => {
          setShowMfaModal(false);
          if (onTransactionComplete) onTransactionComplete();
        }, 1200);
      } catch (err) {
        addLog(`ERROR: MFA response error: ${err.message}`);
      }
    }, 2000);
  };

  const skipMfa = async () => {
    addLog("Biometrics: Scan cancelled/bypassed.");
    try {
      await fetch("http://localhost:8000/api/verify-mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction_id: challengeTxId,
          success: false
        })
      });
      addLog("Server: Step-up failed. Transaction status set to FAILED.");
      setShowMfaModal(false);
      if (onTransactionComplete) onTransactionComplete();
    } catch (e) {
      setShowMfaModal(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      
      {/* Quick Template Presets Panel */}
      <div className="glass-panel" style={{ padding: "1.5rem" }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "1.5px", marginBottom: "0.85rem" }}>
          Quick Simulator Scenarios (Pre-populate Fields)
        </div>
        <div className="preset-container">
          <button className="btn-preset success" onClick={() => loadPreset("NORMAL")}>🟢 Normal Safe Transaction</button>
          <button className="btn-preset danger" onClick={() => loadPreset("VELOCITY")}>🔴 Impossible Velocity Fraud</button>
          <button className="btn-preset warning" onClick={() => loadPreset("VPN")}>🟡 VPN & Device Identity Spoof</button>
          <button className="btn-preset danger" onClick={() => loadPreset("SPIKE")}>🔴 Extreme Amount Spike</button>
        </div>
      </div>

      <div className="grid-2">
        {/* 1. Transaction Form Panel */}
        <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.5px" }}>Transaction Parameter Console</h2>
          
          <form onSubmit={handleTransactionSubmit}>
            <div className="form-group">
              <label>Select Card Profile</label>
              <select className="form-control" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                {PROFILES.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="grid-2" style={{ gap: "1.5rem" }}>
              <div className="form-group">
                <label>Receiver ID</label>
                <input type="text" className="form-control" value={receiverAccount} onChange={(e) => setReceiverAccount(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Amount ($)</label>
                <input type="number" step="0.01" className="form-control" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </div>
            </div>

            <div className="grid-2" style={{ gap: "1.5rem" }}>
              <div className="form-group">
                <label>Merchant City</label>
                <input type="text" className="form-control" value={locationName} onChange={(e) => setLocationName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Time Since Last Tx (Hours)</label>
                <input type="number" step="0.01" className="form-control" value={timeDiffHours} onChange={(e) => setTimeDiffHours(e.target.value)} required />
              </div>
            </div>

            <div className="grid-2" style={{ gap: "1.5rem" }}>
              <div className="form-group">
                <label>Latitude</label>
                <input type="number" step="0.0001" className="form-control" value={lat} onChange={(e) => setLat(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Longitude</label>
                <input type="number" step="0.0001" className="form-control" value={lon} onChange={(e) => setLon(e.target.value)} required />
              </div>
            </div>

            <div className="grid-2" style={{ gap: "1.5rem" }}>
              <div className="form-group">
                <label>IP Address</label>
                <input type="text" className="form-control" value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Hour (0-23)</label>
                <input type="range" min="0" max="23" className="form-control" value={hour} onChange={(e) => setHour(parseInt(e.target.value))} />
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", textAlign: "right" }}>{hour}:00</div>
              </div>
            </div>

            {/* Anomaly triggers */}
            <div style={{ background: "rgba(0, 0, 0, 0.4)", border: "1px solid var(--panel-border)", padding: "1.25rem", borderRadius: "14px", margin: "1.5rem 0" }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 800, color: "var(--text-secondary)", marginBottom: "1rem", textTransform: "uppercase", letterSpacing: "1px" }}>Simulator Anomaly Injectors</label>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.95rem", cursor: "pointer", fontWeight: 500 }}>
                  <input type="checkbox" checked={isVpn} onChange={(e) => setIsVpn(e.target.checked)} style={{ width: "16px", height: "16px" }} />
                  Route via Anonymous VPN hosting (Flags location risk)
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.95rem", cursor: "pointer", fontWeight: 500 }}>
                  <input type="checkbox" checked={isRooted} onChange={(e) => setIsRooted(e.target.checked)} style={{ width: "16px", height: "16px" }} />
                  Simulate Rooted OS/Debugger attachments (Flags device risk)
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.95rem", cursor: "pointer", fontWeight: 500 }}>
                  <input type="checkbox" checked={biometricMatch} onChange={(e) => setBiometricMatch(e.target.checked)} style={{ width: "16px", height: "16px" }} />
                  Simulate verified biometric token on device
                </label>
              </div>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: "1rem" }} disabled={isEncrypting}>
              {isEncrypting ? "Wrapping Cryptographic Envelopes..." : "🔒 Transmit Encrypted Transaction"}
            </button>
          </form>
        </div>

        {/* 2. Cryptographic Sandbox Visualization Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          
          {/* Key Vault info */}
          <div className="glass-panel" style={{ padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 800 }}>Key Sync Status</h3>
              <button className="btn btn-secondary" style={{ padding: "0.4rem 0.8rem", fontSize: "0.75rem", borderRadius: "8px" }} onClick={fetchRsaKey}>Sync Keys</button>
            </div>
            {rsaPubKeyPem ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div style={{ display: "flex", gap: "0.5rem", fontSize: "0.85rem", alignItems: "center" }}>
                  <span style={{ color: "var(--text-secondary)" }}>RSA Key Fingerprint:</span>
                  <span className="key-tag" style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>{keyFingerprint}</span>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", fontSize: "0.85rem", alignItems: "center" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Subsystem Status:</span>
                  <span style={{ color: "var(--color-success)", fontWeight: 700 }}>🟢 E2E Encrypted Connection Active</span>
                </div>
              </div>
            ) : (
              <div style={{ color: "var(--color-danger)", fontSize: "0.85rem", fontWeight: 700 }}>
                ⚠️ RSA Private key loading failed. Start backend server.
              </div>
            )}
          </div>

          {/* Interactive Flow Tunnel */}
          <div className="glass-panel" style={{ padding: "1.75rem" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 800, marginBottom: "1rem" }}>WebCrypto Tunnel Visualizer</h3>
            
            <div className="flow-visualizer">
              <div className={`flow-node ${isEncrypting || encryptedPackage ? "" : "active"}`}>
                <span className="flow-node-icon">💳</span>
                <span className="flow-node-label">Plaintext</span>
              </div>
              
              <div className={`flow-arrow ${isEncrypting ? "active" : ""}`}></div>
              
              <div className={`flow-node encrypted ${encryptedPackage ? "active" : ""}`}>
                <span className="flow-node-icon">🔒</span>
                <span className="flow-node-label">AES+RSA Pack</span>
              </div>
              
              <div className={`flow-arrow ${decryptedResponse ? "active" : ""}`}></div>
              
              <div className={`flow-node ${decryptedResponse ? "active" : ""}`}>
                <span className="flow-node-icon">🤖</span>
                <span className="flow-node-label">Consensus AI</span>
              </div>
            </div>
            
            {/* Visual key details */}
            {encryptedPackage && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", marginTop: "1rem" }}>
                <div>
                  <div className="console-title">
                    <span>Generated Ephemeral AES-GCM Key (256-bit)</span>
                    <span className="key-tag">WebCrypto API</span>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", background: "#020204", padding: "0.75rem 1rem", borderRadius: "8px", color: "var(--color-accent)", overflowX: "auto" }}>
                    {encryptedPackage.raw_session_key_hex}
                  </div>
                </div>
                
                <div>
                  <div className="console-title">
                    <span>RSA-OAEP Wrapped Key (Sent to Server)</span>
                    <span className="key-tag">RSA-2048</span>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", background: "#020204", padding: "0.75rem 1rem", borderRadius: "8px", color: "var(--color-primary)", overflowX: "auto", maxHeight: "60px", overflowY: "auto" }}>
                    {encryptedPackage.encrypted_key}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Cryptographic log */}
          <div className="glass-panel" style={{ flexGrow: 1, padding: "1.75rem" }}>
            <div className="console-title">
              <span>Cryptographic Debug Logs</span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{logs.length} entries</span>
            </div>
            <div className="console-box" style={{ height: "180px" }}>
              {logs.map((log, idx) => (
                <div key={idx} style={{ marginBottom: "0.35rem" }}>{log}</div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* DEVICE MFA CHALLENGE DIALOG */}
      {showMfaModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ fontSize: "1.6rem", fontWeight: 900, color: "var(--color-warning)" }}>Biometric verification required</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", marginTop: "0.5rem", lineHeight: "1.5" }}>
              The consensus model flagged elevated threat vectors. Verify fingerprint identity to authorize release.
            </p>
            
            <div className={`biometric-scanner ${mfaStatus === "scanning" ? "scanning" : ""}`} onClick={mfaStatus === "idle" ? runSimulatedMfa : null}>
              {mfaStatus === "idle" && (
                <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 009 11a13.916 13.916 0 00-3.44-9.57m0 19.14a14.032 14.032 0 00-6.12-3.21m9.56 3.21a14.025 14.025 0 0111.48 0m-11.48 0L9.25 12M2.25 12h4.5m10.5 0h4.5M16.5 12L12 11m0 0L7.5 12M12 11V3m0 0a14.03 14.03 0 016.12 3.21M12 3a14.03 14.03 0 00-6.12 3.21M12 3a14.025 14.025 0 016.12 3.21m-6.12-3.21V3m0 0l2.753 9.571"></path>
                </svg>
              )}
              {mfaStatus === "scanning" && (
                <svg className="scanning" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"></path>
                </svg>
              )}
              {mfaStatus === "verified" && (
                <svg fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{ color: "var(--color-success)" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              )}
            </div>
            
            <div style={{ fontWeight: 700, fontSize: "1.05rem", color: mfaStatus === "scanning" ? "var(--color-accent)" : mfaStatus === "verified" ? "var(--color-success)" : "var(--color-warning)" }}>
              {mfaStatus === "idle" && "Place Finger on scanner"}
              {mfaStatus === "scanning" && "Scanning fingerprint ridge patterns..."}
              {mfaStatus === "verified" && "Hardware biometrics accepted!"}
            </div>
            
            <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "2.5rem" }}>
              <button className="btn btn-secondary" onClick={skipMfa}>Bypass / Deny</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
