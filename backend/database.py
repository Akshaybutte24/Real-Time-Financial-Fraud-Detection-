import sqlite3
import os
import json
from datetime import datetime
import crypto_helper

DB_PATH = os.path.join(os.path.dirname(__file__), "transactions.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def initialize_database():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create transactions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_account_hash TEXT NOT NULL,
            receiver_account_hash TEXT NOT NULL,
            sender_account_encrypted TEXT NOT NULL,
            receiver_account_encrypted TEXT NOT NULL,
            amount_encrypted TEXT NOT NULL,
            location_encrypted TEXT NOT NULL,
            ip_encrypted TEXT NOT NULL,
            device_encrypted TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            consensus_score REAL NOT NULL,
            decision TEXT NOT NULL,
            explanations_json_encrypted TEXT NOT NULL
        )
    """)
    
    # Create indexes on HMAC blind indices for O(1) encrypted searches
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sender_hash ON transactions(sender_account_hash)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_receiver_hash ON transactions(receiver_account_hash)")
    
    conn.commit()
    conn.close()

# Initialize DB on import
initialize_database()

def insert_transaction(tx: dict) -> int:
    """
    Encrypts and inserts a transaction.
    tx keys: sender_account, receiver_account, amount, location, ip_address, device_info, consensus_score, decision, explanations
    """
    # 1. Compute Blind Indices
    sender_hash = crypto_helper.generate_blind_index(tx["sender_account"])
    receiver_hash = crypto_helper.generate_blind_index(tx["receiver_account"])
    
    # 2. Encrypt Sensitive Fields
    sender_enc = crypto_helper.encrypt_db_field(tx["sender_account"])
    receiver_enc = crypto_helper.encrypt_db_field(tx["receiver_account"])
    amount_enc = crypto_helper.encrypt_db_field(str(tx["amount"]))
    location_enc = crypto_helper.encrypt_db_field(tx["location"])
    ip_enc = crypto_helper.encrypt_db_field(tx["ip_address"])
    device_enc = crypto_helper.encrypt_db_field(tx["device_info"])
    
    explanations_str = json.dumps(tx.get("explanations", []))
    explanations_enc = crypto_helper.encrypt_db_field(explanations_str)
    
    timestamp = tx.get("timestamp", datetime.now().isoformat())
    consensus_score = float(tx.get("consensus_score", 0.0))
    decision = tx.get("decision", "APPROVED")
    
    # 3. Write to DB
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO transactions (
            sender_account_hash, receiver_account_hash, 
            sender_account_encrypted, receiver_account_encrypted,
            amount_encrypted, location_encrypted, 
            ip_encrypted, device_encrypted, 
            timestamp, consensus_score, decision, 
            explanations_json_encrypted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        sender_hash, receiver_hash,
        sender_enc, receiver_enc,
        amount_enc, location_enc,
        ip_enc, device_enc,
        timestamp, consensus_score, decision,
        explanations_enc
    ))
    
    tx_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return tx_id

def decrypt_row(row) -> dict:
    """Helper to decrypt database row back to plaintext."""
    try:
        sender_account = crypto_helper.decrypt_db_field(row["sender_account_encrypted"])
        receiver_account = crypto_helper.decrypt_db_field(row["receiver_account_encrypted"])
        amount = float(crypto_helper.decrypt_db_field(row["amount_encrypted"]))
        location = crypto_helper.decrypt_db_field(row["location_encrypted"])
        ip_address = crypto_helper.decrypt_db_field(row["ip_encrypted"])
        device_info = crypto_helper.decrypt_db_field(row["device_encrypted"])
        
        explanations_str = crypto_helper.decrypt_db_field(row["explanations_json_encrypted"])
        explanations = json.loads(explanations_str)
    except Exception as e:
        # Fallback/Error handle
        sender_account = "DECRYPTION_ERROR"
        receiver_account = "DECRYPTION_ERROR"
        amount = 0.0
        location = "DECRYPTION_ERROR"
        ip_address = "DECRYPTION_ERROR"
        device_info = "DECRYPTION_ERROR"
        explanations = [f"Decryption failed: {str(e)}"]
        
    return {
        "id": row["id"],
        "sender_account": sender_account,
        "receiver_account": receiver_account,
        "amount": amount,
        "location": location,
        "ip_address": ip_address,
        "device_info": device_info,
        "timestamp": row["timestamp"],
        "consensus_score": row["consensus_score"],
        "decision": row["decision"],
        "explanations": explanations
    }

def get_transactions_decrypted(limit=50) -> list:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM transactions 
        ORDER BY datetime(timestamp) DESC 
        LIMIT ?
    """, (limit,))
    
    rows = cursor.fetchall()
    conn.close()
    
    return [decrypt_row(r) for r in rows]

def get_raw_database_records(limit=20) -> list:
    """Returns database contents exactly as stored in SQLite (ciphertexts & hashes)."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM transactions 
        ORDER BY datetime(timestamp) DESC 
        LIMIT ?
    """, (limit,))
    
    rows = cursor.fetchall()
    conn.close()
    
    records = []
    for r in rows:
        records.append({
            "id": r["id"],
            "sender_account_hash": r["sender_account_hash"][:16] + "...",
            "receiver_account_hash": r["receiver_account_hash"][:16] + "...",
            "sender_account_encrypted": r["sender_account_encrypted"][:20] + "...",
            "receiver_account_encrypted": r["receiver_account_encrypted"][:20] + "...",
            "amount_encrypted": r["amount_encrypted"][:20] + "...",
            "location_encrypted": r["location_encrypted"][:20] + "...",
            "ip_encrypted": r["ip_encrypted"][:20] + "...",
            "device_encrypted": r["device_encrypted"][:20] + "...",
            "timestamp": r["timestamp"],
            "consensus_score": r["consensus_score"],
            "decision": r["decision"],
            "explanations_json_encrypted": r["explanations_json_encrypted"][:20] + "..."
        })
    return records

def find_transactions_by_sender_account(sender_account_plaintext: str) -> list:
    """Queries SQLite using HMAC blind index search (No full decryption needed!)."""
    sender_hash = crypto_helper.generate_blind_index(sender_account_plaintext)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM transactions 
        WHERE sender_account_hash = ?
        ORDER BY datetime(timestamp) DESC
    """, (sender_hash,))
    
    rows = cursor.fetchall()
    conn.close()
    
    return [decrypt_row(r) for r in rows]

def update_transaction_decision(tx_id: int, new_decision: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE transactions 
        SET decision = ? 
        WHERE id = ?
    """, (new_decision, tx_id))
    conn.commit()
    conn.close()

def get_last_transaction_for_account(sender_account_plaintext: str) -> dict:
    """Fetches latest transaction to calculate location displacement and velocity."""
    sender_hash = crypto_helper.generate_blind_index(sender_account_plaintext)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM transactions 
        WHERE sender_account_hash = ?
        ORDER BY datetime(timestamp) DESC
        LIMIT 1
    """, (sender_hash,))
    
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return decrypt_row(row)
    return None
