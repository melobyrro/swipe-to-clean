import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function getKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function encryptText(value: string, secret: string): string {
  const iv = randomBytes(12);
  const key = getKey(secret);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptText(value: string | null | undefined, secret: string): string | null {
  if (!value) {
    return null;
  }

  const [ivBase64, tagBase64, payloadBase64] = value.split('.');
  if (!ivBase64 || !tagBase64 || !payloadBase64) {
    throw new Error('Invalid encrypted payload');
  }

  const decipher = createDecipheriv('aes-256-gcm', getKey(secret), Buffer.from(ivBase64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagBase64, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadBase64, 'base64url')),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}
