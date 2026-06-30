/**
 * Converts a PEM-formatted RSA Public Key to a WebCrypto CryptoKey object.
 */
function pemToArrayBuffer(pem) {
  // Remove headers, footers, newlines, and carriage returns
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/[\r\n]/g, "")
    .trim();
  
  const binaryString = window.atob(b64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function importRsaPublicKey(pemKey) {
  const der = pemToArrayBuffer(pemKey);
  return await window.crypto.subtle.importKey(
    "spki",
    der,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["encrypt"]
  );
}

/**
 * Encrypts a transaction payload using AES-256-GCM.
 * The AES key is then encrypted with the Server's RSA Public Key.
 * Returns Base64-encoded strings suitable for API transmission.
 */
export async function encryptTransaction(payload, rsaPublicKey) {
  // 1. Serialize payload to Uint8Array
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(payload));

  // 2. Generate ephemeral AES-GCM session key (256-bit)
  const sessionKey = await window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt"]
  );

  // 3. Generate random IV (12 bytes)
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  // 4. Encrypt payload with AES-GCM
  const aesCipherBuffer = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    sessionKey,
    plaintext
  );

  // WebCrypto appends the 16-byte authentication tag to the ciphertext buffer.
  // We slice it to transmit ciphertext and tag separately to the backend.
  const fullBytes = new Uint8Array(aesCipherBuffer);
  const tagLength = 16;
  const ciphertextBytes = fullBytes.slice(0, fullBytes.length - tagLength);
  const tagBytes = fullBytes.slice(fullBytes.length - tagLength);

  // 5. Export AES session key to encrypt it via RSA
  const rawSessionKey = await window.crypto.subtle.exportKey("raw", sessionKey);

  // 6. Encrypt AES session key with Server's RSA-OAEP Public Key
  const rsaEncryptedKeyBuffer = await window.crypto.subtle.encrypt(
    {
      name: "RSA-OAEP",
    },
    rsaPublicKey,
    rawSessionKey
  );

  // Helper to convert ArrayBuffer/Uint8Array to Base64
  const arrayBufferToBase64 = (buffer) => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  // Return base64 strings
  return {
    encrypted_payload: arrayBufferToBase64(ciphertextBytes),
    encrypted_key: arrayBufferToBase64(rsaEncryptedKeyBuffer),
    iv: arrayBufferToBase64(iv),
    tag: arrayBufferToBase64(tagBytes),
    // Export raw key in hex for visual debugging in frontend
    raw_session_key_hex: Array.from(new Uint8Array(rawSessionKey))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  };
}
