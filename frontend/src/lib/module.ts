import { type ModuleConfig, registerModule } from 'shared/module-registry';
import type { ChannelModuleConfig, ProductModuleConfig } from '~/lib/entity-modules';
import type { Tool } from '~/lib/placements';

/** A frontend module's registration: shared metadata plus frontend-only capabilities. */
export interface FrontendModule extends ModuleConfig {
  tools?: Tool[];
  /** The channel entity this module owns: its menu section, list query and members-table defaults. */
  channel?: ChannelModuleConfig;
  /** The product entity this module owns: its members-table icon and defaults. */
  product?: ProductModuleConfig;
}

const frontendModules: FrontendModule[] = [];
const listeners: ((module: FrontendModule) => void)[] = [];

/** Registers a module: metadata to the shared registry, capabilities to {@link onFrontendModuleRegister} listeners. */
export function defineFrontendModule(module: FrontendModule): void {
  const { tools: _tools, channel: _channel, product: _product, ...metadata } = module;
  registerModule(metadata);
  frontendModules.push(module);
  for (const listener of listeners) listener(module);
}

/** Subscribe to frontend module registrations; replays modules already registered. */
export function onFrontendModuleRegister(listener: (module: FrontendModule) => void): void {
  listeners.push(listener);
  for (const module of frontendModules) listener(module);
}
