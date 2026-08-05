import { type VerifyYjsTokenResult, verifyYjsToken, type YjsTokenPayload } from 'shared/utils/yjs-token';
import { env } from '../env';

export type { YjsTokenPayload };

/**
 * Discriminated verification outcome. The reason lets the caller log by severity:
 * `expired` is routine and self-healing (the 30-minute token lapses on a long-lived
 * editor socket; the client reconnects with a fresh one), while `bad_signature` and
 * `malformed` are genuine anomalies (secret drift, truncation, or tampering).
 */
export type VerifyTokenResult = VerifyYjsTokenResult;

/** Verify and decode a Yjs HMAC token signed by the backend (shared scheme in shared/utils/yjs-token.ts). */
export function verifyToken(token: string): VerifyTokenResult {
  return verifyYjsToken(token, env.YJS_SECRET);
}
