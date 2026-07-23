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
  type SubjectForPermission,
} from '../permissions';

// Wide entity/role vocabulary typed independently of any fork's app config so the tests that
// use these names compile in every fork (a fork whose real config lacks `project` still builds).
export type WideChannelType = 'organization' | 'workspace' | 'project';
export type WideProductType = 'task' | 'label' | 'attachment';
export type WideEntityType = 'user' | WideChannelType | WideProductType;
export type WideRole = 'admin' | 'member' | 'guest';

export const wideRoles = createRoleRegistry(['admin', 'member', 'guest'] as const);

/** Fork-independent hierarchy with sibling contexts, deep products, and guest roles. */
export const wideHierarchy = createEntityHierarchy(wideRoles)
  .user()
  .channel('organization', { parent: null, roles: ['admin', 'member'] })
  .channel('workspace', { parent: 'organization', roles: wideRoles.all })
  .channel('project', { parent: 'organization', roles: wideRoles.all })
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

/** Wide hierarchy override; actions retain their hierarchy-independent app defaults. */
export const wideTopology: PermissionTopology = { hierarchy: wideHierarchy };

type WidePerms = Partial<Record<EntityActionType, PermissionValue>>;
type WideChannelBuilder = Record<WideRole, (perms: WidePerms) => void>;

/** Wide-typed callback config surfaced to `configureWidePermissions`. */
export interface WideAccessPolicyConfiguration {
  subject: { name: WideEntityType };
  contexts: Record<WideChannelType, WideChannelBuilder>;
  publicRead: () => void;
}

export type WideAccessPolicyCallback = (config: WideAccessPolicyConfiguration) => void;

/** Configure permissions with the wide vocabulary while containing app-config casts here. */
export const configureWidePermissions = (callback: WideAccessPolicyCallback): PermissionsConfigResult =>
  configurePermissions(
    wideEntityTypes as unknown as readonly EntityType[],
    callback as unknown as AccessPolicyCallback,
    wideTopology,
  );

/** Build a membership over a wide context. */
export const wideMembership = (
  channelType: WideChannelType,
  channelId: string,
  role: WideRole,
): PermissionMembership => ({ channelType, channelId, role }) as unknown as PermissionMembership;

/** Build a subject over a wide entity. */
export const wideSubject = (input: {
  entityType: WideEntityType;
  id?: string;
  createdBy?: string | null;
  channelIds: Partial<Record<WideChannelType, string | null>>;
  row?: Record<string, unknown>;
}): SubjectForPermission => ({ ...input }) as unknown as SubjectForPermission;

/** Wrap a wide-keyed public-read grant map for the engine's `publicGrants` option. */
export const widePublicGrants = (grants: Partial<Record<WideEntityType, true>>): PublicReadGrants =>
  grants as PublicReadGrants;

/** `computeCan`'s result keyed by the wide vocabulary, so tests read `.task` etc. cast-free. */
export type WideCanMap = Partial<Record<WideEntityType, Record<EntityActionType, ActionPermissionState>>>;

/** Drive `computeCan` over the wide hierarchy while containing app-config casts here. */
export const computeWideCan = (
  channelType: WideChannelType,
  membership: PermissionMembership | undefined | null,
  policies: AccessPolicies,
): WideCanMap =>
  computeCan(
    channelType as unknown as Parameters<typeof computeCan>[0],
    membership as unknown as Parameters<typeof computeCan>[1],
    policies,
    wideTopology,
  ) as unknown as WideCanMap;
