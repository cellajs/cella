import type { ProductEntityType } from 'shared';
import { type YjsTokenPayload as SharedYjsTokenPayload, signYjsToken as signToken } from 'shared/utils/yjs-token';
import { env } from '#/env';

/** Token TTL: 30 minutes */
const TOKEN_TTL_MS = 30 * 60 * 1000;

export interface YjsTokenPayload extends Omit<SharedYjsTokenPayload, 'entityType'> {
  entityType: ProductEntityType;
}

/** HMAC-SHA256 token embedding the channel entity and product entity type the user may edit, so the relay verifies access without a backend call. */
export function signYjsToken(params: Omit<YjsTokenPayload, 'exp'>): string {
  return signToken(params, env.YJS_SECRET, TOKEN_TTL_MS);
}
