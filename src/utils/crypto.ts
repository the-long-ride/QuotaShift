/**
 * AES-256-GCM encryption/decryption utilities using Web Crypto API.
 * Uses PBKDF2 for key derivation from a user-defined passphrase.
 * Zero external dependencies — all crypto is native WebView2.
 */

const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16; // 128 bits
const IV_LENGTH = 12;   // 96 bits (recommended for AES-GCM)

/**
 * Derive an AES-256-GCM key from a passphrase + salt using PBKDF2.
 */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Convert a Uint8Array to a base64 string.
 */
function toBase64(buf: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < buf.length; i++) {
    binary += String.fromCharCode(buf[i]);
  }
  return btoa(binary);
}

/**
 * Convert a base64 string to a Uint8Array.
 */
function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buf[i] = binary.charCodeAt(i);
  }
  return buf;
}

export interface EncryptedBundle {
  salt: string;   // base64
  iv: string;     // base64
  data: string;   // base64 ciphertext
}

/**
 * Encrypt a plaintext string with a passphrase.
 * Returns an EncryptedBundle with base64-encoded salt, iv, and ciphertext.
 */
export async function encrypt(plaintext: string, passphrase: string): Promise<EncryptedBundle> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(passphrase, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext)
  );

  return {
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(ciphertext)),
  };
}

/**
 * Decrypt an EncryptedBundle back to plaintext using a passphrase.
 * Throws if the passphrase is wrong or data is tampered with.
 */
export async function decrypt(bundle: EncryptedBundle, passphrase: string): Promise<string> {
  const salt = fromBase64(bundle.salt);
  const iv = fromBase64(bundle.iv);
  const ciphertext = fromBase64(bundle.data);
  const key = await deriveKey(passphrase, salt);

  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plainBuffer);
}

/**
 * Create a SHA-256 hash of a passphrase for verification purposes.
 * This hash is stored (not the passphrase) to verify on subsequent launches.
 */
export async function hashPassphrase(passphrase: string): Promise<string> {
  const enc = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", enc.encode(passphrase));
  return toBase64(new Uint8Array(hashBuffer));
}

/**
 * Encrypt a single value string for storage.
 * Uses a compact format: salt:iv:ciphertext (all base64, colon-separated).
 */
export async function encryptValue(value: string, passphrase: string): Promise<string> {
  const bundle = await encrypt(value, passphrase);
  return `${bundle.salt}:${bundle.iv}:${bundle.data}`;
}

/**
 * Decrypt a single stored value string.
 * Expects the compact format: salt:iv:ciphertext.
 */
export async function decryptValue(encrypted: string, passphrase: string): Promise<string> {
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted value format");
  }
  return decrypt({ salt: parts[0], iv: parts[1], data: parts[2] }, passphrase);
}
