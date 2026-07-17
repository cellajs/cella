import { createHash } from 'node:crypto';

/**
 * Hash a token/secret with SHA-256 into lowercase hex, for storage and lookup.
 * Output must stay stable: hashes are persisted (sessions, tokens) and compared
 * against freshly hashed input on every request.
 */
export const hashToken = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');
