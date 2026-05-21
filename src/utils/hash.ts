import crypto from 'node:crypto';

/**
 * SHA-256ハッシュの先頭 N 桁を返す
 */
export function sha256Prefix(input: string | Buffer, length = 8): string {
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, length);
}
