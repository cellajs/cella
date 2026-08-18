import { type VerifyYjsTokenResult, verifyYjsToken, type YjsTokenPayload } from 'shared/utils/yjs-token';
import { env } from '../env';

export type { YjsTokenPayload };

/** The reason lets the caller log by severity: `expired` is routine on a long-lived editor socket, while `bad_signature` and `malformed` point at secret drift or tampering. */
export type VerifyTokenResult = VerifyYjsTokenResult;

/** Verify and decode a Yjs HMAC token signed by the backend (shared scheme in shared/utils/yjs-token.ts). */
export function verifyToken(token: string): VerifyTokenResult {
  return verifyYjsToken(token, env.YJS_SECRET);
}
