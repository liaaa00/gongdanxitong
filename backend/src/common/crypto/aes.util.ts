import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function resolveKey(): Buffer {
  const raw =
    process.env.AI_SECRET_KEY
    ?? process.env.JWT_SECRET
    ?? 'ticket-system-ai-settings-local-fallback-key';
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return createHash('sha256').update(raw, 'utf8').digest();
}

export function encryptSecret(plaintext: string): string {
  const key = resolveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(payload: string): string {
  const key = resolveKey();
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format');
  }
  const [ivHex, tagHex, dataHex] = parts;
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

export function maskSecret(plaintext: string): string {
  if (!plaintext) return '';
  if (plaintext.length <= 8) return '****';
  return `${plaintext.slice(0, 4)}****${plaintext.slice(-4)}`;
}
