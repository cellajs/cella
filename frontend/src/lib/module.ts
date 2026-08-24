import type { ProductEntityType } from 'shared';
import { type ModuleConfig, registerModule } from 'shared/module-registry';
import type { Tool } from '~/lib/placements';

/** A frontend module's registration: shared metadata plus frontend-only capabilities. */
export interface FrontendModule extends ModuleConfig {
  tools?: Tool[];
  /**
   * Product entity the module edits through CollaborativeBlockNote. Declare it on the module whose
   * backend counterpart registers a `yjsMaterializer`; the organization layout prefetches a Yjs
   * token per declared type.
   */
  collaborativeProduct?: ProductEntityType;
}

const frontendModules: FrontendModule[] = [];
const listeners: ((module: FrontendModule) => void)[] = [];

/** Registers a module: metadata to the shared registry, capabilities to {@link onFrontendModuleRegister} listeners. */
export function defineFrontendModule(module: FrontendModule): void {
  const { tools: _tools, collaborativeProduct: _collaborativeProduct, ...metadata } = module;
  registerModule(metadata);
  frontendModules.push(module);
  for (const listener of listeners) listener(module);
}

/** Subscribe to frontend module registrations; replays modules already registered. */
export function onFrontendModuleRegister(listener: (module: FrontendModule) => void): void {
  listeners.push(listener);
  for (const module of frontendModules) listener(module);
}
