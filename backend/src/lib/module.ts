import type { Hono } from 'hono';
import type { Job, Queue, WorkOptions } from 'pg-boss';
import type { ChannelEntityType, ProductEntityType, TrackedEventType } from 'shared';
import { type ModuleConfig, registerModule } from 'shared/module-registry';
import type { DbContext, Env } from '#/core/context';
import type { DbOrTx } from '#/db/db';
import type { MutationHandler } from '#/lib/mutation-bus';
import type { StreamSignalDeclaration } from '#/modules/entities/stream/audiences';
import type { InsertMembershipModel } from '#/modules/memberships/memberships-db';
import type { NotificationKind } from '#/modules/notification/notification-kinds';
import type { OrganizationModel } from '#/modules/organization/organization-db';
import type { TenantModel } from '#/modules/tenants/tenants-db';
import type { UserModel } from '#/modules/user/user-db';
import type { YjsMaterializer } from '#/modules/yjs/yjs-materializers';
import type { EntityModel } from '#/tables';

/**
 * A periodic job: pg-boss cron on a singleton queue named after the job, run by the jobs worker.
 * One run per period whatever the number of API processes, and no two runs overlap while each ends
 * within `expireInSeconds`. Past it the store fails the run and the queue's unique index, which covers
 * only active jobs, lets a second jobs worker (a `singleVM` deploy runs two for its overlap) start the
 * next run beside it; the run's own worker holds until it returns. A throw fails the run (no retry,
 * the next period runs again).
 */
export interface BackendJob {
  /** Queue and schedule name, unique across jobs and queues. */
  name: string;
  /** Five-field cron expression, evaluated in UTC. */
  cron: string;
  run: () => Promise<unknown>;
  /** Seconds a run may stay active before the store fails it, while its handler goes on; defaults to pg-boss's 15 minutes. */
  expireInSeconds?: number;
}

/** A pg-boss job handler: one batch per call (`batchSize` 1 by default), a throw fails every job in it. */
export type BackendQueueHandler = (jobs: Job<Record<string, unknown>>[]) => Promise<unknown>;

/**
 * A queue a module owns. The jobs worker creates it, converges its options at every start, and
 * runs `handler` when one is given; a queue without a handler is worked by another worker service.
 * `partition: true` needs the table owner, so the migrate companion creates such queues (it creates
 * every declared queue); a dead-letter queue named here must be declared as a queue too.
 */
export interface BackendQueue extends Omit<Queue, 'name' | 'notify'> {
  name: string;
  handler?: BackendQueueHandler;
  /** Worker options for `handler` (`batchSize`, `localConcurrency`, polling); `notify` wake-ups are on. */
  work?: Omit<WorkOptions, 'includeMetadata' | 'transactional' | 'perJobResults'>;
}

// biome-ignore lint/suspicious/noExplicitAny: a mounted app carries its own route schema; the entrypoint only needs the Env.
export type BackendRouteApp = Hono<Env, any, any>;

/**
 * One handler app and where the API entrypoint mounts it. Mounts apply in registration order, and of two routes that
 * match one request the first registered answers. Every mount path starts with a literal segment (`assertMountPath`),
 * so a param segment can shadow only a static sibling, such as the `-` wildcard parent of `/tenants/-/organizations`.
 */
export interface BackendRoute {
  /** Mount path, e.g. `/me` or `/tenants/:tenantId/organizations/:organizationId/attachments`. */
  path: string;
  app: BackendRouteApp;
}

/** A subject row as the notification machinery needs it; modules return their own rows widened to this. */
export interface NotificationSubjectRow {
  id: string;
  createdBy: string | null;
  organizationId: string;
  /** Stored body: the fan-out reads mentions from it, and the instant mail quotes it. */
  description?: string | null;
  [key: string]: unknown;
}

/** One would-be inbox row, typed by the notification vocabulary (template kinds plus `appNotificationKinds`). */
export interface NotificationCandidate {
  userId: string;
  kind: NotificationKind;
}

/**
 * Notification source declaration for a product module (`notifications: true` declares nothing). The notification
 * module reads the subject rows from the product table: live rows are the non-deleted, published ones. Titles in the
 * inbox, the digest and the instant mail are the context names: `loadContextNames` when given, else the rows' `name`.
 * Apps typically declare only `resolveRecipients` and `resolveContextId`, with `loadContextNames` when the context is
 * a row of another product.
 *
 * The fan-out runs after commit off the CDC activity stream, so an operation needs no call for it. It reads mentions
 * from the stored `description` of a created row, or of an updated one whose changed fields include it, and notifies
 * the mentioned users of its organization who may read the row and were not told about it before. Deep links need no
 * declaration: emails and push carry the subject's location.
 */
export interface ModuleNotifications<TRow extends NotificationSubjectRow = NotificationSubjectRow> {
  // The row readers are methods, so a declaration typed to its module's own row (`TRow`: the subject row plus the
  // columns the module reads) is assignable where the registry holds the base type.
  /** Recipients beyond mentions (thread participants, assignees, ...) with their notification kind. */
  resolveRecipients?(tx: DbOrTx, row: TRow): Promise<NotificationCandidate[]>;
  /** Grouping/deep-link context id for a row (e.g. the host thread); defaults to the row's own id. */
  resolveContextId?(row: TRow): string | null;
  /** Display names for context ids, read inside a tenant transaction. */
  loadContextNames?: (tx: DbOrTx, ids: string[]) => Promise<Map<string, string>>;
}

/** The channel a membership is being inserted for. */
export type MembershipEntity = EntityModel<ChannelEntityType> & { [key: string]: unknown; tenantId: string };

/**
 * A module's own columns on a membership about to be inserted, resolved inside the caller's transaction before the
 * insert, so the membership is complete from its first commit. May write rows of its own. An item its caller gave
 * `extraFields` skips this; undefined adds nothing.
 */
export type MembershipColumnsResolver = (
  ctx: DbContext,
  item: { userId: string; entity: MembershipEntity },
) => Promise<Partial<InsertMembershipModel> | undefined>;

/** What `createDemo` wrote before the hooks run: the demo account, its tenant and the organization the account administers. */
export interface DemoCreated {
  user: UserModel;
  tenant: TenantModel;
  organization: OrganizationModel;
}

/**
 * Fills a demo with content, inside the create's tenant transaction, after the organization and its admin membership
 * exist: a throw rolls the whole demo back. Product rows go through `ctx.var.db`, which runs as the demo's tenant.
 */
export type DemoCreatedHook = (ctx: DbContext, demo: DemoCreated) => Promise<void>;

/** Shared module metadata plus backend-only capabilities, indexed by subsystems via {@link onBackendModuleRegister}. */
export interface BackendModule extends ModuleConfig {
  /** The product entity this module owns; keys its product-scoped capabilities below. */
  productEntity?: ProductEntityType;
  /** Yjs collab-session materializer for `productEntity`. */
  yjsMaterializer?: YjsMaterializer;
  /** In-request reactions keyed by `<type>.<verb>`; a module may react to any tracked type, several to one event. */
  onMutation?: { [E in TrackedEventType]?: MutationHandler<E> };
  /** Content this module gives a new demo (see {@link DemoCreatedHook}); every module's hook runs, in registration order. */
  onDemoCreated?: DemoCreatedHook;
  /** Columns this module sets on memberships as they are inserted (see {@link MembershipColumnsResolver}). */
  membershipColumns?: MembershipColumnsResolver;
  /** Cron jobs the jobs worker schedules and runs (see {@link BackendJob}). */
  jobs?: BackendJob[];
  /** Queues the jobs worker creates and, given a handler, works (see {@link BackendQueue}). */
  queues?: BackendQueue[];
  /** Notification source for `productEntity`: `true` for the table-derived defaults, or overrides. */
  notifications?: true | ModuleNotifications;
  /** Signals this module sends on the stream. */
  signals?: StreamSignalDeclaration[];
  /** Handler apps the API entrypoint mounts (see {@link BackendRoute}); the composition root is the mount list. */
  routes?: BackendRoute[];
}

const backendModules: BackendModule[] = [];
const listeners: ((module: BackendModule) => void)[] = [];
const backendJobs: BackendJob[] = [];
const backendQueues: BackendQueue[] = [];
const backendRoutes: BackendRoute[] = [];

/** Metadata goes to the shared registry, capabilities to registration listeners. Call once at module-load time. */
export function defineBackendModule(module: BackendModule): void {
  const {
    productEntity: _productEntity,
    yjsMaterializer: _yjsMaterializer,
    onMutation: _onMutation,
    onDemoCreated: _onDemoCreated,
    membershipColumns: _membershipColumns,
    jobs = [],
    queues = [],
    routes = [],
    notifications: _notifications,
    signals: _signals,
    ...metadata
  } = module;
  registerModule(metadata);
  backendModules.push(module);
  backendJobs.push(...jobs);
  backendQueues.push(...queues);
  backendRoutes.push(...routes);
  for (const listener of listeners) listener(module);
}

/** Route mounts from every module definition, in registration order, the order the entrypoint applies them in. */
export const getBackendRoutes = (): readonly BackendRoute[] => backendRoutes;

/** Jobs from every module definition, in registration order. */
export const getBackendJobs = (): readonly BackendJob[] => backendJobs;

/** Queues from every module definition, in registration order. */
export const getBackendQueues = (): readonly BackendQueue[] => backendQueues;

/** Subscribe to backend module registrations; replays modules already registered. */
export function onBackendModuleRegister(listener: (module: BackendModule) => void): void {
  listeners.push(listener);
  for (const module of backendModules) listener(module);
}
