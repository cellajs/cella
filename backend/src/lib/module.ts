import type { ProductEntityType, TrackedEventType } from 'shared';
import { type ModuleConfig, registerModule } from 'shared/module-registry';
import type { MutationHandler } from '#/lib/mutation-bus';
import type { YjsMaterializer } from '#/modules/yjs/yjs-materializers';

/** A periodic in-process job. `start` schedules it and returns the stop handle called on shutdown. */
export interface BackendJob {
  name: string;
  start: () => () => void;
}

/** Shared module metadata plus backend-only capabilities, indexed by subsystems via {@link onBackendModuleRegister}. */
export interface BackendModule extends ModuleConfig {
  /** The product entity this module owns; keys its product-scoped capabilities below. */
  productEntity?: ProductEntityType;
  /** Yjs collab-session materializer for `productEntity` (indexed by yjs-materializers). */
  yjsMaterializer?: YjsMaterializer;
  /** In-request reactions keyed by `<type>.<verb>`; a module may react to any tracked type, several to one event. */
  onMutation?: Partial<Record<TrackedEventType, MutationHandler>>;
  /** Scheduled jobs; the API entrypoint starts them on the migration-owning instance only, so exactly one process runs each. */
  jobs?: BackendJob[];
}

const backendModules: BackendModule[] = [];
const listeners: ((module: BackendModule) => void)[] = [];
const backendJobs: BackendJob[] = [];

/** Metadata goes to the shared registry, capabilities to registration listeners. Call once at module-load time. */
export function defineBackendModule(module: BackendModule): void {
  const {
    productEntity: _productEntity,
    yjsMaterializer: _yjsMaterializer,
    onMutation: _onMutation,
    jobs = [],
    ...metadata
  } = module;
  registerModule(metadata);
  backendModules.push(module);
  backendJobs.push(...jobs);
  for (const listener of listeners) listener(module);
}

/** Registers a job that belongs to no module (core infrastructure such as DB maintenance). */
export function registerBackendJob(job: BackendJob): void {
  backendJobs.push(job);
}

/** Jobs from every module definition and direct registration, in registration order. */
export function getBackendJobs(): readonly BackendJob[] {
  return backendJobs;
}

/** Subscribe to backend module registrations; replays modules already registered. */
export function onBackendModuleRegister(listener: (module: BackendModule) => void): void {
  listeners.push(listener);
  for (const module of backendModules) listener(module);
}
