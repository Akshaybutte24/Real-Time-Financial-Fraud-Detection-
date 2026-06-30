import os
import base64
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.hmac import HMAC

KEYS_DIR = os.path.join(os.path.dirname(__file__), "keys")
os.makedirs(KEYS_DIR, exist_ok=True)

RSA_PRIVATE_KEY_PATH = os.path.join(KEYS_DIR, "rsa_private.pem")
RSA_PUBLIC_KEY_PATH = os.path.join(KEYS_DIR, "rsa_public.pem")
DB_MASTER_KEY_PATH = os.path.join(KEYS_DIR, "db_master.key")
DB_HMAC_KEY_PATH = os.path.join(KEYS_DIR, "db_hmac.key")

# 1. Initialize keys
def initialize_keys():
    # RSA Keypair
    if not os.path.exists(RSA_PRIVATE_KEY_PATH) or not os.path.exists(RSA_PUBLIC_KEY_PATH):
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048
        )
        # Save private key
        with open(RSA_PRIVATE_KEY_PATH, "wb") as f:
            f.write(
                private_key.private_bytes(
                    encoding=serialization.Encoding.PEM,
                    format=serialization.PrivateFormat.PKCS8,
                    encryption_algorithm=serialization.NoEncryption()
                )
            )
        # Save public key
        public_key = private_key.public_key()
        with open(RSA_PUBLIC_KEY_PATH, "wb") as f:
            f.write(
                public_key.public_bytes(
                    encoding=serialization.Encoding.PEM,
                    format=serialization.PublicFormat.SubjectPublicKeyInfo
                )
            )
    
    # DB Master Key (for column encryption)
    if not os.path.exists(DB_MASTER_KEY_PATH):
        db_key = AESGCM.generate_key(bit_length=256)
        with open(DB_MASTER_KEY_PATH, "wb") as f:
            f.write(db_key)
            
    # DB HMAC Key (for blind index)
    if not os.path.exists(DB_HMAC_KEY_PATH):
        hmac_key = os.urandom(32)
        with open(DB_HMAC_KEY_PATH, "wb") as f:
            f.write(hmac_key)

# Ensure keys exist on import
initialize_keys()

def get_rsa_public_key_pem() -> str:
    with open(RSA_PUBLIC_KEY_PATH, "r") as f:
        return f.read()

def get_rsa_private_key():
    with open(RSA_PRIVATE_KEY_PATH, "rb") as f:
        return serialization.load_pem_private_key(f.read(), password=None)

def get_db_master_key() -> bytes:
    with open(DB_MASTER_KEY_PATH, "rb") as f:
        return f.read()

def get_db_hmac_key() -> bytes:
    with open(DB_HMAC_KEY_PATH, "rb") as f:
        return f.read()

# 2. Hybrid Decryption (Client E2E payload)
def decrypt_client_payload(encrypted_payload_b64: str, encrypted_key_b64: str, iv_b64: str, tag_b64: str = None) -> str:
    """
    Decrypts client payload encrypted via WebCrypto RSA-OAEP + AES-GCM.
    """
    private_key = get_rsa_private_key()
    
    # Decrypt AES session key using RSA-OAEP with SHA-256
    encrypted_key = base64.b64decode(encrypted_key_b64)
    session_key = private_key.decrypt(
        encrypted_key,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None
        )
    )
    
    # Decode inputs
    iv = base64.b64decode(iv_b64)
    ciphertext = base64.b64decode(encrypted_payload_b64)
    
    # Decrypt with AES-GCM
    # If tag is separate, cryptography's AESGCM.decrypt expects ciphertext + tag combined
    if tag_b64:
        tag = base64.b64decode(tag_b64)
        full_ciphertext = ciphertext + tag
    else:
        full_ciphertext = ciphertext
        
    aesgcm = AESGCM(session_key)
    decrypted_bytes = aesgcm.decrypt(iv, full_ciphertext, None)
    return decrypted_bytes.decode("utf-8")

# 3. Database Envelope Encryption (AES-256-GCM)
def encrypt_db_field(plaintext: str) -> str:
    if not plaintext:
        return ""
    master_key = get_db_master_key()
    aesgcm = AESGCM(master_key)
    iv = os.urandom(12)
    ciphertext_with_tag = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)
    # Combine iv + ciphertext_with_tag
    combined = iv + ciphertext_with_tag
    return base64.b64encode(combined).decode("utf-8")

def decrypt_db_field(ciphertext_b64: str) -> str:
    if not ciphertext_b64:
        return ""
    master_key = get_db_master_key()
    aesgcm = AESGCM(master_key)
    combined = base64.b64decode(ciphertext_b64)
    
    # First 12 bytes are IV
    iv = combined[:12]
    ciphertext_with_tag = combined[12:]
    
    decrypted_bytes = aesgcm.decrypt(iv, ciphertext_with_tag, None)
    return decrypted_bytes.decode("utf-8")

# 4. Blind Indexing (HMAC-SHA256)
def generate_blind_index(plaintext: str) -> str:
    if not plaintext:
        return ""
    # Standardize whitespace and casing for reliable matching
    normalized = str(plaintext).strip().lower()
    hmac_key = get_db_hmac_key()
    h = HMAC(hmac_key, hashes.SHA256())
    h.update(normalized.encode("utf-8"))
    return base64.b64encode(h.finalize()).decode("utf-8")
