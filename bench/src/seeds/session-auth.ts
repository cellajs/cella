import { createHash } from 'node:crypto';

/** Deterministic session token per user index. */
export function sessionToken(index: number): string {
  return `xbench-session-token-${String(index).padStart(12, '0')}`;
}

/** SHA-256 hex lowercase, matching backend's hashToken (node:crypto). */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
