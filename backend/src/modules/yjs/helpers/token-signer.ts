import type { ProductEntityType } from 'shared';
import { type YjsTokenPayload as SharedYjsTokenPayload, signYjsToken as signToken } from 'shared/utils/yjs-token';
import { env } from '#/env';

/** Token TTL: 30 minutes */
const TOKEN_TTL_MS = 30 * 60 * 1000;

export interface YjsTokenPayload extends Omit<SharedYjsTokenPayload, 'entityType'> {
  entityType: ProductEntityType;
}

/**
 * Sign a context-scoped Yjs auth token.
 * Uses the shared HMAC-SHA256 signing scheme the Yjs relay verifies. The token
 * embeds the channel entity and product entity type the user may edit, so the
 * relay can verify access locally without calling back to the backend.
 */
export function signYjsToken(params: Omit<YjsTokenPayload, 'exp'>): string {
  return signToken(params, env.YJS_SECRET, TOKEN_TTL_MS);
}
