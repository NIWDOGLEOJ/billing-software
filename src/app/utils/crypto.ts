/**
 * Password utilities using the Web Crypto API (PBKDF2 + SHA-256).
 * Runs entirely in-browser with zero external dependencies.
 *
 * Stored format: "<saltHex>:<hashHex>"
 * - 16-byte random salt, unique per password
 * - 100,000 PBKDF2 iterations (NIST recommended minimum)
 * - 256-bit derived key
 */

const ITERATIONS = 100_000;
const KEY_LEN_BITS = 256;
const SALT_BYTES = 16;

function hexEncode(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexDecode(hex: string): Uint8Array {
  const matches = hex.match(/.{2}/g);
  if (!matches) throw new Error('Invalid hex string');
  return new Uint8Array(matches.map(h => parseInt(h, 16)));
}

async function getKeyMaterial(password: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
}

async function deriveBits(keyMaterial: CryptoKey, salt: Uint8Array): Promise<ArrayBuffer> {
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    KEY_LEN_BITS,
  );
}

/** Hash a plain-text password. Returns "<saltHex>:<hashHex>". */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const keyMaterial = await getKeyMaterial(password);
  const hash = await deriveBits(keyMaterial, salt);
  return `${hexEncode(salt.buffer)}:${hexEncode(hash)}`;
}

/** Verify a plain-text password against a stored hash string. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  // Legacy plain-text passwords don't contain ':' — always fail to force re-hash.
  if (!stored.includes(':')) return false;

  const [saltHex, hashHex] = stored.split(':');
  const salt = hexDecode(saltHex);
  const keyMaterial = await getKeyMaterial(password);
  const hash = await deriveBits(keyMaterial, salt);
  return hexEncode(hash) === hashHex;
}

/** Returns true if the stored value is already a PBKDF2 hash (not plain text). */
export function isHashed(stored: string): boolean {
  // Format: 32-char salt hex + ':' + 64-char hash hex = exactly 97 chars
  return /^[0-9a-f]{32}:[0-9a-f]{64}$/.test(stored);
}
