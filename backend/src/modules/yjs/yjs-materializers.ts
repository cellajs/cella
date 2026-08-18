import type { ProductEntityType } from 'shared';
import type { AuthContext } from '#/core/context';
import { onBackendModuleRegister } from '#/lib/module';
import type { StxBase } from '#/schemas';

/** Reference to the entity's standard update op; the relay invokes it with the server-origin envelope. */
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
