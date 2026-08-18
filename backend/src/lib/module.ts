import type { ProductEntityType, TrackedEventType } from 'shared';
import { type ModuleConfig, registerModule } from 'shared/module-registry';
import type { MutationHandler } from '#/lib/mutation-bus';
import type { YjsMaterializer } from '#/modules/yjs/yjs-materializers';

/** Shared module metadata plus backend-only capabilities, indexed by subsystems via {@link onBackendModuleRegister}. */
export interface BackendModule extends ModuleConfig {
  /** The product entity this module owns; keys its product-scoped capabilities below. */
  productEntity?: ProductEntityType;
  /** Yjs collab-session materializer for `productEntity` (indexed by yjs-materializers). */
  yjsMaterializer?: YjsMaterializer;
  /** In-request reactions keyed by `<type>.<verb>`; a module may react to any tracked type, several to one event. */
  onMutation?: Partial<Record<TrackedEventType, MutationHandler>>;
}

const backendModules: BackendModule[] = [];
const listeners: ((module: BackendModule) => void)[] = [];

/** Metadata goes to the shared registry, capabilities to registration listeners. Call once at module-load time. */
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
