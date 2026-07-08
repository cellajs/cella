import type { ProductEntityType } from 'shared';
import type { AuthContext } from '#/core/context';

export interface YjsMaterializeInput {
  entityId: string;
  /** Serialized BlockNote blocks (already sanitized by the materialize operation). */
  description: string;
}

/**
 * Persists a Yjs collab session's description for one entity type — typically a thin
 * wrapper around the entity's standard update operation with `ops: { description }`
 * and a server-origin stx (empty `fieldTimestamps` → the pipeline stamps a server HLC).
 */
export type YjsMaterializer = (ctx: AuthContext, input: YjsMaterializeInput) => Promise<void>;

const materializers = new Map<ProductEntityType, YjsMaterializer>();

/** Register the materializer for an entity type. Call at module load time (e.g. in the entity's module file). */
export function registerYjsMaterializer(entityType: ProductEntityType, materializer: YjsMaterializer): void {
  materializers.set(entityType, materializer);
}

export function getYjsMaterializer(entityType: ProductEntityType): YjsMaterializer | undefined {
  return materializers.get(entityType);
}
