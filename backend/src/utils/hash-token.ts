import { createHash } from 'node:crypto';

/** SHA-256 lowercase hex. The output must stay stable: these hashes are persisted for sessions and tokens. */
export const hashToken = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');
