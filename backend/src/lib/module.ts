import type { ProductEntityType, TrackedEventType } from 'shared';
import { type ModuleConfig, registerModule } from 'shared/module-registry';
import type { MutationHandler } from '#/lib/mutation-bus';
import type { YjsMaterializer } from '#/modules/yjs/yjs-materializers';

/**
 * A backend module's registration: shared metadata plus backend-only capabilities. Subsystems
 * build their own index from these via {@link onBackendModuleRegister}, so a module declares its
 * capabilities in one place and each subsystem projects the ones it owns.
 */
export interface BackendModule extends ModuleConfig {
  /** The product entity this module owns; keys its product-scoped capabilities below. */
  productEntity?: ProductEntityType;
  /** Yjs collab-session materializer for `productEntity` (indexed by yjs-materializers). */
  yjsMaterializer?: YjsMaterializer;
  /**
   * Synchronous, in-request reactions to entity/resource mutations, keyed by `<type>.<verb>`
   * (indexed by the mutation bus). A module may react to any tracked type, including ones it does
   * not own; multiple modules may react to the same event.
   */
  onMutation?: Partial<Record<TrackedEventType, MutationHandler>>;
}

const backendModules: BackendModule[] = [];
const listeners: ((module: BackendModule) => void)[] = [];

/**
 * Register a backend module. Metadata flows to the shared module registry; capabilities flow to
 * backend projections listening via {@link onBackendModuleRegister}. Call once at module-load time
 * in the module's `*-module.ts`.
 */
export function defineBackendModule(module: BackendModule): void {
  const {
    productEntity: _productEntity,
    yjsMaterializer: _yjsMaterializer,
    onMutation: _onMutation,
    ...metadata
  } = module;
  registerModule(metadata);
  backendModules.push(module);
  for (const listener of listeners) listener(module);
}

/** Subscribe to backend module registrations; replays modules already registered. */
export function onBackendModuleRegister(listener: (module: BackendModule) => void): void {
  listeners.push(listener);
  for (const module of backendModules) listener(module);
}
