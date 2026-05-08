import crypto from 'crypto';

export function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars.charAt(randomBytes[i] % chars.length);
  }
  return result;
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function hashKey(key: string | Buffer, salt: string): string {
  return crypto
    .createHmac('sha256', salt)
    .update(key)
    .digest('hex');
}
