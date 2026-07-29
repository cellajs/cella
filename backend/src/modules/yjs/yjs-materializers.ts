import type { ProductEntityType } from 'shared';
import type { AuthContext } from '#/core/context';
import { onBackendModuleRegister } from '#/lib/module';
import type { StxBase } from '#/schemas';

/**
 * Persists a Yjs collab session's description to an entity's durable record. It is a reference to
 * the entity's standard update op; the relay (materialize-description) invokes it with the
 * server-origin envelope, so a module names which op, not the Yjs envelope contract (sourceId, stx shape,
 * serverOrigin).
 */
export type YjsMaterializer = (
  ctx: AuthContext,
  id: string,
  input: { ops: { description: string }; stx: StxBase },
  opts: { serverOrigin: true },
) => Promise<unknown>;

const materializers = new Map<ProductEntityType, YjsMaterializer>();

onBackendModuleRegister((module) => {
  if (module.productEntity && module.yjsMaterializer) materializers.set(module.productEntity, module.yjsMaterializer);
});

export function getYjsMaterializer(entityType: ProductEntityType): YjsMaterializer | undefined {
  return materializers.get(entityType);
}
