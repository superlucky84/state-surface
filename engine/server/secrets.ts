/**
 * Keys derived from the root secret (IC-09): HKDF-SHA256 with one `info` label per use, so
 * the deferred-slot token key (AES-GCM) and the flash cookie key (HMAC, stage 5) are never
 * the same key. `SURFACE_SECRET_PREVIOUS` is accepted for decryption and verification only.
 * Web Crypto only: every adapter runs it.
 */

const encoder = new TextEncoder();
const SALT = encoder.encode('state-surface');
export const MIN_SECRET_BYTES = 32;

export function assertSecret(secret: string, name = 'SURFACE_SECRET') {
  if (encoder.encode(secret).byteLength < MIN_SECRET_BYTES)
    throw new Error(`${name} must be at least ${MIN_SECRET_BYTES} bytes`);
}

const roots = new Map<string, Promise<CryptoKey>>();
function root(secret: string) {
  let key = roots.get(secret);
  if (!key) {
    assertSecret(secret);
    key = crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey']);
    roots.set(secret, key);
  }
  return key;
}

const derived = new Map<string, Promise<CryptoKey>>();
function derive(secret: string, use: 'defer' | 'flash') {
  const id = `${use}\u0000${secret}`;
  let key = derived.get(id);
  if (!key) {
    key = root(secret).then(base =>
      crypto.subtle.deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: SALT,
          info: encoder.encode(`state-surface/${use}/v1`),
        },
        base,
        use === 'defer'
          ? { name: 'AES-GCM', length: 256 }
          : { name: 'HMAC', hash: 'SHA-256', length: 256 },
        false,
        use === 'defer' ? ['encrypt', 'decrypt'] : ['sign', 'verify']
      )
    );
    derived.set(id, key);
    key.catch(() => derived.delete(id));
  }
  return key;
}

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(text: string) {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('Invalid token encoding');
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export interface SecretSource {
  current: string;
  previous?: string;
  /** The build secret: prerendered pages sealed their deferred slots at build time (DC-24). */
  built?: string;
}

/** Encrypt a JSON value into a URL-safe token (AES-GCM, random 96-bit IV). */
export async function seal(secrets: SecretSource, value: unknown): Promise<string> {
  const key = await derive(secrets.current, 'defer');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(value)))
  );
  const token = new Uint8Array(iv.length + data.length);
  token.set(iv);
  token.set(data, iv.length);
  return toBase64Url(token);
}

/** Decrypt with the current secret, the previous one, then the build secret. Throws otherwise. */
export async function unseal(secrets: SecretSource, token: string): Promise<unknown> {
  const bytes = fromBase64Url(token);
  if (bytes.length < 13) throw new Error('Invalid token');
  for (const secret of new Set([secrets.current, secrets.previous, secrets.built])) {
    if (!secret) continue;
    try {
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: bytes.slice(0, 12) },
        await derive(secret, 'defer'),
        bytes.slice(12)
      );
      return JSON.parse(new TextDecoder().decode(plain));
    } catch {
      /* try the next key */
    }
  }
  throw new Error('Invalid token');
}

/** HMAC key for flash cookies (DC-22, used by stage 5). */
export function flashKey(secret: string) {
  return derive(secret, 'flash');
}
