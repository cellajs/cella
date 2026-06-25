import type { ContextEntityType, ProductEntityType } from '../../types';

/**
 * Thrown by `validateAncestorScope` when a required ancestor context ID is missing (`undefined`).
 *
 * This is the tier-neutral error the shared permission engine raises. Each tier maps it to its own
 * transport error: the backend translates it to `AppError(400, 'missing_scope')`; the yjs relay maps
 * it to a WebSocket close (`4400`).
 */
export class MissingScopeError extends Error {
  readonly entityType: ContextEntityType | ProductEntityType;
  readonly missingContext: ContextEntityType;
  readonly missingKey: string;

  constructor(entityType: ContextEntityType | ProductEntityType, missingContext: ContextEntityType, missingKey: string) {
    super(`[Permission] ${entityType} missing required ancestor scope for ${missingContext} (${missingKey})`);
    this.name = 'MissingScopeError';
    this.entityType = entityType;
    this.missingContext = missingContext;
    this.missingKey = missingKey;
  }
}
