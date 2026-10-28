import type { ModuleConfig } from 'shared/module-registry';
import type { ChannelModuleConfig, ProductModuleConfig } from '~/lib/entity-modules';
import type { Tool } from '~/lib/placements';
import type { StreamSignalHandler } from '~/query/realtime/signal-handlers';
import type { StreamSignalType } from '~/query/realtime/signal-types';

/** A frontend module's registration: shared metadata plus frontend-only capabilities. */
export interface FrontendModule extends ModuleConfig {
  tools?: Tool[];
  /** The channel entity this module owns: its menu section, list query and members-table defaults. */
  channel?: ChannelModuleConfig;
  /** The product entity this module owns: its members-table icon and defaults. */
  product?: ProductModuleConfig;
  /** Handlers of the stream signals this module follows, by type. */
  signals?: { [T in StreamSignalType]?: StreamSignalHandler };
}

const frontendModules: FrontendModule[] = [];
const listeners: ((module: FrontendModule) => void)[] = [];

/** Registers a module with the {@link onFrontendModuleRegister} listeners. */
export function defineFrontendModule(module: FrontendModule): void {
  frontendModules.push(module);
  for (const listener of listeners) listener(module);
}

/** Subscribe to frontend module registrations; replays modules already registered. */
export function onFrontendModuleRegister(listener: (module: FrontendModule) => void): void {
  listeners.push(listener);
  for (const module of frontendModules) listener(module);
}
