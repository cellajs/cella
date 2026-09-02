import type { Hono } from 'hono';
import type { ProductEntityType, TrackedEventType } from 'shared';
import { type ModuleConfig, registerModule } from 'shared/module-registry';
import type { Env } from '#/core/context';
import type { DbOrTx } from '#/db/db';
import type { MutationHandler } from '#/lib/mutation-bus';
import type { YjsMaterializer } from '#/modules/yjs/yjs-materializers';

/** A periodic in-process job. `start` schedules it and returns the stop handle called on shutdown. */
export interface BackendJob {
  name: string;
  start: () => () => void;
}

// biome-ignore lint/suspicious/noExplicitAny: a mounted app carries its own route schema; the entrypoint only needs the Env.
export type BackendRouteApp = Hono<Env, any, any>;

/**
 * Mount phases, applied in this order by the API entrypoint: static paths, then apps mounted at
 * `/` with absolute `/:tenantId/...` routes, then `/:tenantId/:organizationId/...` mounts. Param
 * segments therefore never shadow a static path. Within a phase, mounts follow registration order.
 */
export type BackendRoutePhase = 'static' | 'absolute' | 'tenant';

/** One handler app and where the API entrypoint mounts it. */
export interface BackendRoute {
  /** Mount path, e.g. `/me` or `/:tenantId/:organizationId/attachments`. */
  path: string;
  app: BackendRouteApp;
  /** Defaults to `static`. */
  phase?: BackendRoutePhase;
}

/** A subject row as the notification machinery needs it; modules return their own rows widened to this. */
export interface NotificationSubjectRow {
  id: string;
  createdBy: string | null;
  organizationId: string;
  /** Stored body; mention derivation reads it on mentionable modules. */
  description?: string | null;
  /** Server-derived mentioned user ids; the fan-out trusts this column, never client input. */
  mentions?: string[] | null;
  [key: string]: unknown;
}

/** One would-be inbox row; `type` must be one of the notification module's `notificationTypes`. */
export interface NotificationCandidate {
  userId: string;
  type: string;
}

/**
 * Per-module notification source declaration, indexed by the notification module. Declaring it
 * turns the module's product writes into inbox rows: mentions generically (when `mentionable`),
 * app-specific recipients via `resolveRecipients`. Requires `productEntity`.
 */
export interface ModuleNotifications {
  /** Enables server-side mention derivation and mention fan-out; the module's rows must carry `description` and a `mentions` column. */
  mentionable?: boolean;
  /** Batch-load audience-bearing subject rows for the given ids; drop drafts and deleted rows here. */
  loadRows: (tx: DbOrTx, ids: string[]) => Promise<NotificationSubjectRow[]>;
  /** Persist the server-derived mention set for one row (required with `mentionable`). */
  writeMentions?: (tx: DbOrTx, id: string, mentions: string[]) => Promise<void>;
  /** Recipients beyond mentions (thread participants, assignees, ...) with their notification type. */
  resolveRecipients?: (tx: DbOrTx, row: NotificationSubjectRow) => Promise<NotificationCandidate[]>;
  /** Grouping/deep-link context id for a row (e.g. the host thread); defaults to the row's own id. */
  resolveContextId?: (row: NotificationSubjectRow) => string | null;
  /** Title and body for instant emails; read inside a tenant transaction. */
  loadPreview?: (tx: DbOrTx, subjectId: string) => Promise<{ title: string; body: string } | null>;
  /** Display names for context ids in digest lines; read inside a tenant transaction. */
  loadContextNames?: (tx: DbOrTx, ids: string[]) => Promise<Map<string, string>>;
  /** Absolute deep link for one notification's email; defaults to the app root. A tenant-scoped permalink needs the tenant and channel ids the pending row carries. */
  resolveEmailLink?: (notification: {
    subjectId: string;
    contextId: string | null;
    tenantId: string;
    channelId: string;
    entityType: string;
  }) => string;
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
  /** Notification source declaration for `productEntity` (indexed by the notification module). */
  notifications?: ModuleNotifications;
  /** Handler apps the API entrypoint mounts (see {@link BackendRoutePhase}); the composition root is the mount list. */
  routes?: BackendRoute[];
}

const backendModules: BackendModule[] = [];
const listeners: ((module: BackendModule) => void)[] = [];
const backendJobs: BackendJob[] = [];
const backendRoutes: BackendRoute[] = [];

/** Metadata goes to the shared registry, capabilities to registration listeners. Call once at module-load time. */
export function defineBackendModule(module: BackendModule): void {
  const {
    productEntity: _productEntity,
    yjsMaterializer: _yjsMaterializer,
    onMutation: _onMutation,
    jobs = [],
    routes = [],
    notifications: _notifications,
    ...metadata
  } = module;
  registerModule(metadata);
  backendModules.push(module);
  backendJobs.push(...jobs);
  backendRoutes.push(...routes);
  for (const listener of listeners) listener(module);
}

/** Route mounts from every module definition, in registration order; the entrypoint applies them per phase. */
export function getBackendRoutes(): readonly BackendRoute[] {
  return backendRoutes;
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
