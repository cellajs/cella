import type { KeyObject } from 'node:crypto';
import type { ProductEntityType } from 'shared';
import {
  type YjsTokenPayload as SharedYjsTokenPayload,
  signYjsToken as signToken,
  yjsTokenSigningKey,
} from 'shared/utils/yjs-token';
import { env } from '#/env';

/** Token TTL: 30 minutes */
const TOKEN_TTL_MS = 30 * 60 * 1000;

export interface YjsTokenPayload extends Omit<SharedYjsTokenPayload, 'entityType'> {
  entityType: ProductEntityType;
}

let signingKey: KeyObject | undefined;

/** Ed25519-signed token embedding the channel entity and product entity type the user may edit, so the relay verifies access without a backend call and cannot mint one. */
export function signYjsToken(params: Omit<YjsTokenPayload, 'exp'>): string {
  signingKey ??= yjsTokenSigningKey(env.YJS_TOKEN_PRIVATE_KEY);
  return signToken(params, signingKey, TOKEN_TTL_MS);
}
