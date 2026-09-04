import { appConfig, type ProductEntityType } from 'shared';
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

/** Yjs enabled with no module declaring `yjsMaterializer` means every materialize call is rejected and collaborative content never reaches the entity row. */
export function warnWhenNoYjsMaterializer(): void {
  if (appConfig.services.yjs.enabled && materializers.size === 0) {
    console.warn(
      '[yjs] services.yjs.enabled is true but no backend module declares a yjsMaterializer: collaborative descriptions will not be materialized',
    );
  }
}
