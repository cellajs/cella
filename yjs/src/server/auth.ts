import { type VerifyYjsTokenResult, verifyYjsToken, yjsTokenVerifyKey } from 'shared/utils/yjs-token';
import { env } from '../env';

const verifyKey = yjsTokenVerifyKey(env.YJS_TOKEN_PUBLIC_KEY);

/** Verify and decode a Yjs token the backend signed (shared scheme in shared/utils/yjs-token.ts), with its public key only. */
export function verifyToken(token: string): VerifyYjsTokenResult {
  return verifyYjsToken(token, verifyKey);
}
