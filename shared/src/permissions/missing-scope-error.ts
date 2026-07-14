import type { ChannelEntityType, ProductEntityType } from '../../types';

/**
 * Thrown by `validateAncestorScope` when a required ancestor context ID is missing (`undefined`).
 *
 * This is the tier-neutral error the shared permission engine raises. Each tier maps it to its own
 * transport error: the backend translates it to `AppError(400, 'missing_scope')`; the yjs relay maps
 * it to a WebSocket close (`4400`).
 */
export class MissingScopeError extends Error {
  readonly entityType: ChannelEntityType | ProductEntityType;
  readonly missingChannel: ChannelEntityType;
  readonly missingKey: string;

  constructor(entityType: ChannelEntityType | ProductEntityType, missingChannel: ChannelEntityType, missingKey: string) {
    super(`[Permission] ${entityType} missing required ancestor scope for ${missingChannel} (${missingKey})`);
    this.name = 'MissingScopeError';
    this.entityType = entityType;
    this.missingChannel = missingChannel;
    this.missingKey = missingKey;
  }
}
