import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Constant-time equality for a presented secret against the expected one. Both sides are hashed with
 * SHA-256 first, so the comparison always runs over two 32-byte digests and its timing reveals
 * neither a matching prefix nor the expected secret's length.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a, 'utf8').digest();
  const right = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(left, right);
}
