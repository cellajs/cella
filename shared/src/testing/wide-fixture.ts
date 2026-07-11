/**
 * Wide synthetic permission fixture — the canonical "rich hierarchy" that upstream-owned engine
 * tests run against, instead of a given fork's real `shared/config`.
 *
 * The template (cella) ships a deliberately minimal hierarchy (organization → attachment), which
 * structurally cannot exercise the engine's deeper features: nested + sibling contexts, a guest
 * role, multi-level ancestor resolution, all three public-read modes. This fixture provides one
 * hierarchy that does, so a single set of tests covers them in every fork.
 *
 * It mirrors raak's real hierarchy (documented as the reference example in cella's
 * `hierarchy-config.ts`). It MUST stay a superset of every feature the hierarchy builder supports;
 * variable-depth / nullable-ancestor coverage lives separately in
 * `config-builder/tests/resolve-row-context.test.ts`.
 *
 * The engine reads this via the `topology` seam (`PermissionTopology`) — no module mocks. All the
 * casts needed to name entities the app config doesn't know about are contained here, so the test
 * files that consume the kit stay cast-free and byte-identical across forks.
 */
import { createEntityHierarchy, createRoleRegistry } from '../config-builder/entity-hierarchy';
import type { EntityActionType, EntityType } from '../../types';
import {
  type AccessPolicies,
  type AccessPolicyCallback,
  type ActionPermissionState,
  computeCan,
  configurePermissions,
  type PermissionMembership,
  type PermissionsConfigResult,
  type PermissionTopology,
  type PermissionValue,
  type PublicReadGrants,
  type PublicReadMode,
  type SubjectForPermission,
} from '../permissions';

// Wide entity/role vocabulary — typed independently of any fork's app config so the tests that
// use these names compile in every fork (a fork whose real config lacks `project` still builds).
export type WideContextType = 'organization' | 'workspace' | 'project';
export type WideProductType = 'task' | 'label' | 'attachment';
export type WideEntityType = 'user' | WideContextType | WideProductType;
export type WideRole = 'admin' | 'member' | 'guest';

export const wideRoles = createRoleRegistry(['admin', 'member', 'guest'] as const);

/**
 * The wide hierarchy. Two sibling nested contexts (workspace, project) under organization, three
 * products under project, guest role on the nested contexts only.
 */
export const wideHierarchy = createEntityHierarchy(wideRoles)
  .user()
  .context('organization', { parent: null, roles: ['admin', 'member'] })
  .context('workspace', { parent: 'organization', roles: wideRoles.all })
  .context('project', { parent: 'organization', roles: wideRoles.all })
  .product('task', { parent: 'project' })
  .product('label', { parent: 'project' })
  .product('attachment', { parent: 'project' })
  .build();

export const wideEntityTypes: readonly WideEntityType[] = [
  'user',
  'organization',
  'workspace',
  'project',
  'task',
  'label',
  'attachment',
];

/**
 * Topology bag the engine reads. `entityActions`/`entityIdColumnKeys` are omitted so they default
 * to the app config — they are hierarchy-independent (the CRUD action set is identical across forks).
 */
export const wideTopology: PermissionTopology = { hierarchy: wideHierarchy };

type WidePerms = Partial<Record<EntityActionType, PermissionValue>>;
type WideContextBuilder = Record<WideRole, (perms: WidePerms) => void>;

/** Callback config surfaced to `configureWidePermissions` — wide-typed mirror of the engine's. */
export interface WideAccessPolicyConfiguration {
  subject: { name: WideEntityType };
  contexts: Record<WideContextType, WideContextBuilder>;
  publicRead: (mode: PublicReadMode) => void;
}

export type WideAccessPolicyCallback = (config: WideAccessPolicyConfiguration) => void;

/**
 * Configure permissions over the wide hierarchy. Same semantics as `configurePermissions`, but the
 * callback is typed with the wide vocabulary (so `contexts.project.guest(...)` / `case 'project'`
 * type-check regardless of the fork's real config). The app-config↔wide cast is contained here.
 */
export const configureWidePermissions = (callback: WideAccessPolicyCallback): PermissionsConfigResult =>
  configurePermissions(
    wideEntityTypes as unknown as readonly EntityType[],
    callback as unknown as AccessPolicyCallback,
    wideTopology,
    // Test fixtures are deliberately partial; completeness is the app config's contract
    { validateCompleteness: false },
  );

/** Build a membership over a wide context. */
export const wideMembership = (
  contextType: WideContextType,
  contextId: string,
  role: WideRole,
): PermissionMembership => ({ contextType, contextId, role }) as unknown as PermissionMembership;

/** Build a subject over a wide entity. */
export const wideSubject = (input: {
  entityType: WideEntityType;
  id?: string;
  createdBy?: string | null;
  contextIds: Partial<Record<WideContextType, string | null>>;
  row?: Record<string, unknown>;
  parentRow?: Record<string, unknown>;
}): SubjectForPermission => ({ ...input }) as unknown as SubjectForPermission;

/** Wrap a wide-keyed public-read grant map for the engine's `publicGrants` option. */
export const widePublicGrants = (grants: Partial<Record<WideEntityType, PublicReadMode>>): PublicReadGrants =>
  grants as PublicReadGrants;

/** `computeCan`'s result keyed by the wide vocabulary, so tests read `.task` etc. cast-free. */
export type WideCanMap = Partial<Record<WideEntityType, Record<EntityActionType, ActionPermissionState>>>;

/**
 * Drive `computeCan` over the wide hierarchy. `computeCan` is typed against the app's real
 * entities (its `contextType` param and result map), so this wrapper contains the wide↔app casts,
 * keeping the tests cast-free.
 */
export const computeWideCan = (
  contextType: WideContextType,
  membership: PermissionMembership | undefined | null,
  policies: AccessPolicies,
): WideCanMap =>
  computeCan(
    contextType as unknown as Parameters<typeof computeCan>[0],
    membership as unknown as Parameters<typeof computeCan>[1],
    policies,
    wideTopology,
  ) as unknown as WideCanMap;
