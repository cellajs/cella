import { type ModuleConfig, registerModule } from 'shared/module-registry';
import type { Tool } from '~/lib/placements';

/**
 * A frontend module's registration: shared metadata plus frontend-only capabilities. Subsystems
 * build their own index from these via {@link onFrontendModuleRegister}, so a module declares its
 * capabilities in one place and each subsystem projects the ones it owns.
 */
export interface FrontendModule extends ModuleConfig {
  /** UI tools this module places into named slots (indexed by `~/lib/placements`). */
  tools?: Tool[];
}

const frontendModules: FrontendModule[] = [];
const listeners: ((module: FrontendModule) => void)[] = [];

/**
 * Register a frontend module. Metadata flows to the shared module registry; capabilities flow to
 * frontend projections listening via {@link onFrontendModuleRegister}. Call once at module-load
 * time in the module's `*-module.ts`, which the composition root `~/modules.ts` glob-imports.
 */
export function defineFrontendModule(module: FrontendModule): void {
  const { tools: _tools, ...metadata } = module;
  registerModule(metadata);
  frontendModules.push(module);
  for (const listener of listeners) listener(module);
}

/** Subscribe to frontend module registrations; replays modules already registered. */
export function onFrontendModuleRegister(listener: (module: FrontendModule) => void): void {
  listeners.push(listener);
  for (const module of frontendModules) listener(module);
}
