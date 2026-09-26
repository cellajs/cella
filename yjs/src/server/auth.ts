import {
  type VerifyYjsTokenResult,
  verifyYjsToken,
  type YjsTokenPayload,
  yjsTokenVerifyKey,
} from 'shared/utils/yjs-token';
import { env } from '../env';

export type { YjsTokenPayload };

/** The reason lets the caller log by severity: `expired` is routine on a long-lived editor socket, while `bad_signature` and `malformed` point at a mismatched key pair or tampering. */
export type VerifyTokenResult = VerifyYjsTokenResult;

const verifyKey = yjsTokenVerifyKey(env.YJS_TOKEN_PUBLIC_KEY);

/** Verify and decode a Yjs token the backend signed (shared scheme in shared/utils/yjs-token.ts), with its public key only. */
export function verifyToken(token: string): VerifyTokenResult {
  return verifyYjsToken(token, verifyKey);
}
