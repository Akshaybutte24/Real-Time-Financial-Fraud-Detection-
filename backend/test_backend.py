import unittest
import json
import base64
import os
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

import crypto_helper
import ml_model
import database

class TestShieldFlowBackend(unittest.TestCase):
    
    def test_keys_initialization(self):
        """Verify RSA keys are generated and loaded correctly."""
        self.assertTrue(os.path.exists(crypto_helper.RSA_PRIVATE_KEY_PATH))
        self.assertTrue(os.path.exists(crypto_helper.RSA_PUBLIC_KEY_PATH))
        
        pub_key_pem = crypto_helper.get_rsa_public_key_pem()
        self.assertIn("BEGIN PUBLIC KEY", pub_key_pem)
        
    def test_database_encryption_and_blind_indexing(self):
        """Test columns are encrypted and blind indices are searchable."""
        test_account = "acc_999999"
        
        # Blind Index
        blind_idx = crypto_helper.generate_blind_index(test_account)
        self.assertNotEqual(blind_idx, test_account)
        
        # Test case-insensitivity of blind index
        self.assertEqual(
            crypto_helper.generate_blind_index("ACC_999999"), 
            crypto_helper.generate_blind_index("acc_999999 ")
        )
        
        # AES-GCM Column Encryption
        encrypted = crypto_helper.encrypt_db_field(test_account)
        self.assertNotEqual(encrypted, test_account)
        
        decrypted = crypto_helper.decrypt_db_field(encrypted)
        self.assertEqual(decrypted, test_account)
        
    def test_hybrid_decryption(self):
        """Simulate client-side hybrid encryption and test server decryption."""
        # 1. Generate payload
        payload_data = {"sender_account": "acc_123456", "amount": 100.0}
        plaintext = json.dumps(payload_data).encode("utf-8")
        
        # 2. Simulate client encryption
        # Generate session AES key
        session_key = AESGCM.generate_key(bit_length=256)
        aesgcm = AESGCM(session_key)
        iv = os.urandom(12)
        
        # WebCrypto AES-GCM returns ciphertext + tag appended at the end
        # In python, aesgcm.encrypt returns ciphertext + tag appended too!
        ciphertext_with_tag = aesgcm.encrypt(iv, plaintext, None)
        
        # Separate ciphertext and tag (tag is last 16 bytes)
        ciphertext = ciphertext_with_tag[:-16]
        tag = ciphertext_with_tag[-16:]
        
        # Encrypt AES session key with Server Public RSA key
        server_pub_key = crypto_helper.get_rsa_private_key().public_key()
        encrypted_key = server_pub_key.encrypt(
            session_key,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        )
        
        # Encode as base64 (what client sends)
        encrypted_payload_b64 = base64.b64encode(ciphertext).decode("utf-8")
        encrypted_key_b64 = base64.b64encode(encrypted_key).decode("utf-8")
        iv_b64 = base64.b64encode(iv).decode("utf-8")
        tag_b64 = base64.b64encode(tag).decode("utf-8")
        
        # 3. Decrypt in backend
        decrypted_str = crypto_helper.decrypt_client_payload(
            encrypted_payload_b64,
            encrypted_key_b64,
            iv_b64,
            tag_b64
        )
        
        decrypted_data = json.loads(decrypted_str)
        self.assertEqual(decrypted_data["sender_account"], "acc_123456")
        self.assertEqual(decrypted_data["amount"], 100.0)

    def test_database_insert_and_retrieval(self):
        """Verify transaction records insert and search correctly."""
        tx_data = {
            "sender_account": "acc_345678",
            "receiver_account": "acc_111111",
            "amount": 250.0,
            "location": "Berlin",
            "ip_address": "192.168.1.5",
            "device_info": "Firefox on Windows",
            "consensus_score": 0.12,
            "decision": "APPROVED",
            "explanations": []
        }
        
        tx_id = database.insert_transaction(tx_data)
        self.assertGreater(tx_id, 0)
        
        # Verify decrypted retrieval
        txs = database.get_transactions_decrypted()
        found_tx = None
        for t in txs:
            if t["id"] == tx_id:
                found_tx = t
                break
                
        self.assertIsNotNone(found_tx)
        self.assertEqual(found_tx["sender_account"], "acc_345678")
        self.assertEqual(found_tx["receiver_account"], "acc_111111")
        self.assertEqual(found_tx["amount"], 250.0)
        self.assertEqual(found_tx["location"], "Berlin")
        
        # Verify blind index search
        matches = database.find_transactions_by_sender_account("acc_345678")
        self.assertGreater(len(matches), 0)
        self.assertEqual(matches[0]["sender_account"], "acc_345678")
        
    def test_fraud_risk_evaluation(self):
        """Test risk evaluator scores suspicious parameters higher than normal ones."""
        # 1. Normal parameters
        normal_tx = {
            "sender_account": "acc_123456",
            "amount": 40.0,
            "lat": 40.7128,  # NY (Home)
            "lon": -74.0060,
            "device_risk": 0.05,
            "location_risk": 0.1,
            "hour": 14,
            "biometric_match": 1
        }
        normal_res = ml_model.evaluate_transaction_risk(normal_tx)
        self.assertEqual(normal_res["decision"], "APPROVED")
        self.assertLess(normal_res["consensus_score"], 0.35)
        
        # 2. Suspicious parameters (large amount, high device risk, failed biometric)
        suspicious_tx = {
            "sender_account": "acc_123456",
            "amount": 2500.0,  # NY typical amount is 80.0
            "lat": 52.5200,    # Berlin (far)
            "lon": 13.4050,
            "device_risk": 0.9,
            "location_risk": 0.8,
            "hour": 3,         # Unusual hour
            "biometric_match": 0
        }
        
        # Simulate last tx 1 hour ago in NY
        last_tx = {"lat": 40.7128, "lon": -74.0060}
        suspicious_tx["time_diff_hours"] = 1.0 # 1 hour to travel to Berlin!
        
        suspicious_res = ml_model.evaluate_transaction_risk(suspicious_tx, last_tx)
        self.assertIn(suspicious_res["decision"], ["CHALLENGE", "DENIED"])
        self.assertGreater(suspicious_res["consensus_score"], 0.5)
        self.assertGreater(len(suspicious_res["explanations"]), 0)

if __name__ == "__main__":
    unittest.main()
