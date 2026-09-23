import type { ChannelEntityType, ProductEntityType } from '../../types.ts';

/**
 * Raised by `validateAncestorScope` when a required ancestor channel id is `undefined`. Each tier
 * maps it to its own transport error: the backend to `AppError(400, 'missing_ancestor')`, the yjs
 * relay to a WebSocket close (`4400`).
 */
export class MissingAncestorError extends Error {
  readonly entityType: ChannelEntityType | ProductEntityType;
  readonly missingChannel: ChannelEntityType;
  readonly missingKey: string;

  constructor(
    entityType: ChannelEntityType | ProductEntityType,
    missingChannel: ChannelEntityType,
    missingKey: string,
  ) {
    super(`[Permission] ${entityType} missing required ancestor for ${missingChannel} (${missingKey})`);
    this.name = 'MissingAncestorError';
    this.entityType = entityType;
    this.missingChannel = missingChannel;
    this.missingKey = missingKey;
  }
}
