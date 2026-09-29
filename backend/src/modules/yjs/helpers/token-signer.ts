import type { KeyObject } from 'node:crypto';
import type { ProductEntityType } from 'shared';
import {
  type YjsTokenPayload as SharedYjsTokenPayload,
  signYjsToken as signToken,
  yjsTokenSigningKey,
} from 'shared/utils/yjs-token';
import { modeSecret } from '#/env';

/** Token TTL: 5 minutes. The relay closes a socket when its token expires, so revoked access reaches open sockets within it. */
const TOKEN_TTL_MS = 5 * 60 * 1000;

export interface YjsTokenPayload extends Omit<SharedYjsTokenPayload, 'entityType'> {
  entityType: ProductEntityType;
}

let signingKey: KeyObject | undefined;

/** Ed25519-signed token naming the entity the user may edit and its scope, so the relay verifies access without a backend call and cannot mint one. */
export function signYjsToken(params: Omit<YjsTokenPayload, 'exp'>): string {
  signingKey ??= yjsTokenSigningKey(modeSecret('YJS_TOKEN_PRIVATE_KEY'));
  return signToken(params, signingKey, TOKEN_TTL_MS);
}
