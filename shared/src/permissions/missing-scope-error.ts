import type { ChannelEntityType, ProductEntityType } from '../../types.ts';

/**
 * Raised by `validateAncestorScope` when a required ancestor channel id is `undefined`. Each tier
 * maps it to its own transport error: the backend to `AppError(400, 'missing_scope')`, the yjs
 * relay to a WebSocket close (`4400`).
 */
export class MissingScopeError extends Error {
  readonly entityType: ChannelEntityType | ProductEntityType;
  readonly missingChannel: ChannelEntityType;
  readonly missingKey: string;

  constructor(
    entityType: ChannelEntityType | ProductEntityType,
    missingChannel: ChannelEntityType,
    missingKey: string,
  ) {
    super(`[Permission] ${entityType} missing required ancestor scope for ${missingChannel} (${missingKey})`);
    this.name = 'MissingScopeError';
    this.entityType = entityType;
    this.missingChannel = missingChannel;
    this.missingKey = missingKey;
  }
}
