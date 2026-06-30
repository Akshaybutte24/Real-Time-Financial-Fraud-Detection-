import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, IsolationForest
from sklearn.model_selection import train_test_split
import math
import os

# Globals for models
_rf_model = None
_iso_forest = None
_average_normal_features = {}

# Mock home coordinates for users to compute distances
USER_PROFILES = {
    "acc_123456": {"home_lat": 40.7128, "home_lon": -74.0060, "home_city": "New York", "typical_amount": 80.0},
    "acc_789012": {"home_lat": 34.0522, "home_lon": -118.2437, "home_city": "Los Angeles", "typical_amount": 120.0},
    "acc_345678": {"home_lat": 51.5074, "home_lon": -0.1278, "home_city": "London", "typical_amount": 50.0},
    "acc_default": {"home_lat": 0.0, "home_lon": 0.0, "home_city": "Unknown", "typical_amount": 100.0}
}

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance in km between two lat/lon coordinates."""
    R = 6371.0 # Earth radius in km
    
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c

def generate_synthetic_data(n_samples=5000):
    np.random.seed(42)
    
    # Features:
    # 0: amount
    # 1: distance_from_home (km)
    # 2: velocity (km/h)
    # 3: device_risk (0 to 1)
    # 4: location_risk (0 to 1)
    # 5: unusual_hour (0 or 1)
    # 6: biometric_match (1 = yes, 0 = no)
    
    # 97% normal transactions
    n_normal = int(n_samples * 0.97)
    n_fraud = n_samples - n_normal
    
    # Normal data
    normal_amounts = np.random.exponential(scale=60, size=n_normal) + 5
    normal_dist = np.random.exponential(scale=15, size=n_normal) # mostly close to home
    normal_time_diff = np.random.exponential(scale=24, size=n_normal) + 0.1 # hours since last tx
    normal_vel = normal_dist / (normal_time_diff + 0.01)
    normal_device_risk = np.random.beta(a=1, b=9, size=n_normal) # mostly low risk
    normal_location_risk = np.random.beta(a=1, b=9, size=n_normal)
    normal_hour = np.random.choice([0, 1], size=n_normal, p=[0.85, 0.15]) # 15% unusual hours (late night)
    normal_biometric = np.random.choice([1, 0], size=n_normal, p=[0.98, 0.02]) # 2% failure rate
    
    df_normal = pd.DataFrame({
        "amount": normal_amounts,
        "distance": normal_dist,
        "velocity": normal_vel,
        "device_risk": normal_device_risk,
        "location_risk": normal_location_risk,
        "unusual_hour": normal_hour,
        "biometric_match": normal_biometric,
        "label": 0
    })
    
    # Fraud data
    fraud_amounts = np.random.exponential(scale=500, size=n_fraud) + 200 # high amount
    fraud_dist = np.random.exponential(scale=250, size=n_fraud) + 50 # far from home
    fraud_time_diff = np.random.exponential(scale=2, size=n_fraud) + 0.01 # rapid successive txs
    fraud_vel = fraud_dist / (fraud_time_diff + 0.01) # high velocity
    fraud_device_risk = np.random.beta(a=7, b=2, size=n_fraud) # high device risk (rooted, unknown)
    fraud_location_risk = np.random.beta(a=8, b=2, size=n_fraud) # high location risk (VPN, new country)
    fraud_hour = np.random.choice([0, 1], size=n_fraud, p=[0.4, 0.6]) # more unusual hours
    fraud_biometric = np.random.choice([1, 0], size=n_fraud, p=[0.2, 0.8]) # high rate of mismatch/skipped
    
    df_fraud = pd.DataFrame({
        "amount": fraud_amounts,
        "distance": fraud_dist,
        "velocity": fraud_vel,
        "device_risk": fraud_device_risk,
        "location_risk": fraud_location_risk,
        "unusual_hour": fraud_hour,
        "biometric_match": fraud_biometric,
        "label": 1
    })
    
    df = pd.concat([df_normal, df_fraud], ignore_index=True)
    # Shuffle
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)
    return df

def train_models():
    global _rf_model, _iso_forest, _average_normal_features
    
    df = generate_synthetic_data(5000)
    
    X = df.drop(columns=["label"])
    y = df["label"]
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    # 1. Supervised Random Forest
    rf = RandomForestClassifier(n_estimators=100, max_depth=8, random_state=42)
    rf.fit(X_train, y_train)
    _rf_model = rf
    
    # 2. Isolation Forest for behavioral anomaly
    # Train on normal transactions only
    X_normal_train = X_train[y_train == 0]
    iso = IsolationForest(contamination=0.03, random_state=42)
    iso.fit(X_normal_train)
    _iso_forest = iso
    
    # 3. Calculate baseline normal values for XAI comparisons
    _average_normal_features = X_normal_train.mean().to_dict()
    
    # Calculate performance metrics on test set
    preds = rf.predict(X_test)
    probs = rf.predict_proba(X_test)[:, 1]
    
    # TPR, FPR calculations
    tp = np.sum((y_test == 1) & (preds == 1))
    fn = np.sum((y_test == 1) & (preds == 0))
    fp = np.sum((y_test == 0) & (preds == 1))
    tn = np.sum((y_test == 0) & (preds == 0))
    
    tpr = tp / (tp + fn) if (tp + fn) > 0 else 1.0
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
    
    return {
        "accuracy": float(np.mean(preds == y_test)),
        "tpr": float(tpr),
        "fpr": float(fpr),
        "total_test_samples": int(len(y_test))
    }

# Train models on import
train_metrics = train_models()

def evaluate_transaction_risk(tx_data: dict, last_tx: dict = None) -> dict:
    """
    Computes risk score and explanations using consensus model.
    tx_data keys: sender_account, amount, lat, lon, device_risk, location_risk, hour, biometric_match
    """
    global _rf_model, _iso_forest, _average_normal_features
    
    # Extract details
    sender = tx_data.get("sender_account", "acc_default")
    amount = float(tx_data.get("amount", 0.0))
    lat = float(tx_data.get("lat", 0.0))
    lon = float(tx_data.get("lon", 0.0))
    device_risk = float(tx_data.get("device_risk", 0.0))
    location_risk = float(tx_data.get("location_risk", 0.0))
    hour = int(tx_data.get("hour", 12))
    biometric_match = int(tx_data.get("biometric_match", 1)) # 1 = Pass, 0 = Fail
    
    # Compute profile-based metrics
    profile = USER_PROFILES.get(sender, USER_PROFILES["acc_default"])
    distance = haversine_distance(profile["home_lat"], profile["home_lon"], lat, lon)
    
    # Compute time diff and velocity
    if last_tx:
        # last_tx should contain 'timestamp', 'lat', 'lon'
        # let's assume a simulated hours difference
        time_diff = float(tx_data.get("time_diff_hours", 2.0)) # default 2 hours
        prev_lat = float(last_tx.get("lat", profile["home_lat"]))
        prev_lon = float(last_tx.get("lon", profile["home_lon"]))
        travel_distance = haversine_distance(prev_lat, prev_lon, lat, lon)
        velocity = travel_distance / (time_diff + 0.01)
    else:
        # default first transaction
        velocity = 0.0
    
    # Unusual hour flag: late night between 11 PM and 5 AM
    unusual_hour = 1 if (hour >= 23 or hour <= 5) else 0
    
    # Compile features in exact order: amount, distance, velocity, device_risk, location_risk, unusual_hour, biometric_match
    features = np.array([[amount, distance, velocity, device_risk, location_risk, unusual_hour, biometric_match]])
    features_df = pd.DataFrame(features, columns=["amount", "distance", "velocity", "device_risk", "location_risk", "unusual_hour", "biometric_match"])
    
    # 1. Supervised Random Forest Probability
    ml_prob = float(_rf_model.predict_proba(features_df)[0, 1])
    
    # 2. Unsupervised Anomaly Score
    # isolation forest returns anomaly score where lower is more anomalous. 
    # decision_function yields values in [-0.5, 0.5] where negative means outlier.
    # Convert it to [0, 1] risk score where 1 is highly anomalous.
    raw_anomaly = float(_iso_forest.decision_function(features_df)[0])
    # Map [-0.4, 0.2] to [1.0, 0.0]
    anomaly_score = np.clip((0.2 - raw_anomaly) / 0.6, 0.0, 1.0)
    
    # 3. Rule Engine
    rule_score = 0.0
    rule_violations = []
    
    # Velocity rule: if velocity is physically impossible (e.g., > 1000 km/h)
    if velocity > 1000:
        rule_score = max(rule_score, 0.95)
        rule_violations.append(f"Impossible Velocity: {velocity:.1f} km/h (exceeds commercial jet travel)")
    elif velocity > 300:
        rule_score = max(rule_score, 0.70)
        rule_violations.append(f"Suspicious Travel Speed: {velocity:.1f} km/h")
        
    # High-risk profile amount rule
    typical = profile["typical_amount"]
    if amount > typical * 10:
        rule_score = max(rule_score, 0.75)
        rule_violations.append(f"Extreme Amount Spike: ${amount:.2f} (Typical average: ${typical:.2f})")
    elif amount > typical * 4:
        rule_score = max(rule_score, 0.40)
        rule_violations.append(f"Significant Amount Spike: ${amount:.2f} (Typical: ${typical:.2f})")
        
    # Biometric fail rule
    if biometric_match == 0:
        rule_score = max(rule_score, 0.85)
        rule_violations.append("Biometric Authentication Failure / Bypassed")
        
    # 4. Consensus scoring
    # Weights: Supervised (50%), Anomaly (30%), Rule Violations (20%)
    consensus_score = (0.5 * ml_prob) + (0.3 * anomaly_score) + (0.2 * rule_score)
    consensus_score = float(np.clip(consensus_score, 0.0, 1.0))
    
    # 5. Explanations (XAI)
    explanations = []
    
    # Compare with typical normal transactions to explain why it's flagged
    if consensus_score > 0.35:
        # Amount explanation
        if amount > _average_normal_features["amount"] * 2.5:
            explanations.append(f"Transaction amount (${amount:.2f}) is significantly higher than normal average (${_average_normal_features['amount']:.2f})")
        # Distance explanation
        if distance > 100:
            explanations.append(f"Transaction originated {distance:.1f} km away from registered home city ({profile['home_city']})")
        # Device risk explanation
        if device_risk > 0.5:
            explanations.append(f"Suspicious device indicators detected (Risk score: {device_risk:.2f})")
        # Location risk explanation
        if location_risk > 0.5:
            explanations.append(f"Transaction IP/Network matches known anonymous VPN hosting or high-risk location (Risk score: {location_risk:.2f})")
        # Hour explanation
        if unusual_hour == 1:
            explanations.append("Transaction executed during unusual local hours (late night/early morning)")
        # Biometrics explanation
        if biometric_match == 0:
            explanations.append("Local biometric identity verification could not be validated")
            
        # Add rule violations as key points
        for violation in rule_violations:
            explanations.append(violation)
            
        # If no specific explanations are generated but score is high, mention ML model consensus
        if not explanations:
            explanations.append("Complex multi-layered statistical anomalies flagged by the ML consensus engines")
            
    # Decision categories
    # Risk < 0.35: APPROVED
    # 0.35 <= Risk < 0.75: CHALLENGE (MFA required)
    # Risk >= 0.75: DENIED
    if consensus_score < 0.35:
        decision = "APPROVED"
    elif consensus_score < 0.75:
        decision = "CHALLENGE"
    else:
        decision = "DENIED"
        
    return {
        "ml_probability": ml_prob,
        "anomaly_score": anomaly_score,
        "rule_score": rule_score,
        "consensus_score": consensus_score,
        "decision": decision,
        "explanations": explanations,
        "distance_km": distance,
        "velocity_kmh": velocity,
        "profile": {
            "home_city": profile["home_city"],
            "typical_amount": profile["typical_amount"]
        }
    }
