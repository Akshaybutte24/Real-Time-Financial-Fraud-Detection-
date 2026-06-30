from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import json
import hashlib
from datetime import datetime

import crypto_helper
import ml_model
import database

app = FastAPI(title="ShieldFlow End-to-End Encrypted Fraud Detection API")

# Configure CORS so React app can talk to FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for request bodies
class EncryptedTransactionRequest(BaseModel):
    encrypted_payload: str
    encrypted_key: str
    iv: str
    tag: str

class VerifyMfaRequest(BaseModel):
    transaction_id: int
    success: bool

@app.get("/api/keys")
def get_public_key():
    try:
        pem = crypto_helper.get_rsa_public_key_pem()
        # Compute SHA-256 fingerprint of the public key for display/verification
        fingerprint = hashlib.sha256(pem.encode("utf-8")).hexdigest()
        return {
            "public_key": pem,
            "fingerprint": f"SHA256:{fingerprint[:16]}...{fingerprint[-16:]}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve keys: {str(e)}")

@app.post("/api/transaction")
async def process_transaction(req: EncryptedTransactionRequest):
    try:
        # 1. Decrypt client payload using RSA Private Key + AES-GCM
        decrypted_json_str = crypto_helper.decrypt_client_payload(
            encrypted_payload_b64=req.encrypted_payload,
            encrypted_key_b64=req.encrypted_key,
            iv_b64=req.iv,
            tag_b64=req.tag
        )
        
        # Parse decrypted payload
        tx_data = json.loads(decrypted_json_str)
        
        # 2. Fetch sender's last transaction for velocity check
        sender = tx_data.get("sender_account")
        if not sender:
            raise ValueError("Missing 'sender_account' in decrypted payload")
            
        last_tx = database.get_last_transaction_for_account(sender)
        
        # 3. Evaluate risk using the Consensus Fraud Engine
        risk_result = ml_model.evaluate_transaction_risk(tx_data, last_tx)
        
        # Add timestamp and outcomes
        full_tx = {
            "sender_account": sender,
            "receiver_account": tx_data.get("receiver_account", "Unknown"),
            "amount": float(tx_data.get("amount", 0.0)),
            "location": tx_data.get("location", "Unknown"),
            "ip_address": tx_data.get("ip_address", "Unknown"),
            "device_info": tx_data.get("device_info", "Unknown"),
            "timestamp": datetime.now().isoformat(),
            "consensus_score": risk_result["consensus_score"],
            "decision": risk_result["decision"],
            "explanations": risk_result["explanations"]
        }
        
        # 4. Insert encrypted record to database
        tx_id = database.insert_transaction(full_tx)
        full_tx["id"] = tx_id
        
        # Return result to client (we omit sensitive data like full account number if needed, 
        # but here we return standard status and evaluation metrics)
        return {
            "status": "success",
            "transaction_id": tx_id,
            "decision": risk_result["decision"],
            "consensus_score": risk_result["consensus_score"],
            "ml_probability": risk_result["ml_probability"],
            "anomaly_score": risk_result["anomaly_score"],
            "rule_score": risk_result["rule_score"],
            "explanations": risk_result["explanations"],
            "velocity_kmh": risk_result["velocity_kmh"],
            "distance_km": risk_result["distance_km"],
            "profile": risk_result["profile"]
        }
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Decrypted payload is not valid JSON")
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Decryption or Processing failed: {str(e)}")

@app.post("/api/verify-mfa")
def verify_mfa(req: VerifyMfaRequest):
    try:
        new_decision = "VERIFIED" if req.success else "FAILED"
        database.update_transaction_decision(req.transaction_id, new_decision)
        return {
            "status": "success",
            "transaction_id": req.transaction_id,
            "decision": new_decision
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update transaction: {str(e)}")

@app.get("/api/transactions")
def get_transactions():
    try:
        # Decrypts on the fly for Authorized Analyst dashboard
        return database.get_transactions_decrypted(limit=50)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query database: {str(e)}")

@app.get("/api/database-view")
def get_database_ciphertext():
    try:
        # Shows raw SQLite contents (encrypted hashes/ciphertexts)
        return database.get_raw_database_records(limit=20)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query raw DB: {str(e)}")

@app.get("/api/model-stats")
def get_model_stats():
    return {
        "model_name": "ShieldFlow Multi-layered Consensus Engine",
        "supervised_classifier": "Random Forest (Scikit-Learn)",
        "unsupervised_anomaly": "Isolation Forest (Scikit-Learn)",
        "metrics": ml_model.train_metrics
    }
