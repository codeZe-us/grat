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

export function compareSecure(actual: string, expected: string): boolean {
  try {
    const actualBuf = Buffer.from(actual);
    const expectedBuf = Buffer.from(expected);

    if (actualBuf.length !== expectedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(actualBuf, expectedBuf);
  } catch (e) {
    return false;
  }
}
