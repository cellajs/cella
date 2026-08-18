import type { EntityActionType, EntityType } from '../../types.ts';
import { createEntityHierarchy, createRoleRegistry } from '../config-builder/entity-hierarchy.ts';
import {
  type AccessMembership,
  type CanState,
  computeCan,
  configurePermissions,
  type HierarchyOverrides,
  type PermissionsConfigResult,
  type PolicyCallback,
  type PolicyCellInput,
  type PolicyMatrix,
  type PublicReadGrants,
  type SubjectForPermission,
} from '../permissions/index.ts';

// Wide entity/role vocabulary typed independently of any app config so the tests that
// use these names compile in every app (an app whose real config lacks `project` still builds).
export type WideChannelType = 'organization' | 'workspace' | 'project';
export type WideProductType = 'task' | 'label' | 'attachment';
export type WideEntityType = 'user' | WideChannelType | WideProductType;
export type WideRole = 'admin' | 'member' | 'guest';

export const wideRoles = createRoleRegistry(['admin', 'member', 'guest'] as const);

/** Configuration-independent hierarchy with sibling channels, deep products, and guest roles. */
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

/** Actions keep their hierarchy-independent app defaults. */
export const wideOverrides: HierarchyOverrides = { hierarchy: wideHierarchy };

type WidePerms = Partial<Record<EntityActionType, PolicyCellInput>>;
type WideChannelBuilder = Record<WideRole, (perms: WidePerms) => void>;

/** Passed to `configureWidePermissions`. */
export interface WidePolicyConfiguration {
  entityType: WideEntityType;
  channels: Record<WideChannelType, WideChannelBuilder>;
  publicRead: () => void;
}

export type WidePolicyCallback = (config: WidePolicyConfiguration) => void;

/** Keeps the app-config casts in this file. */
export const configureWidePermissions = (callback: WidePolicyCallback): PermissionsConfigResult =>
  configurePermissions(
    wideEntityTypes as unknown as readonly EntityType[],
    callback as unknown as PolicyCallback,
    wideOverrides,
  );

export const wideMembership = (channelType: WideChannelType, channelId: string, role: WideRole): AccessMembership =>
  ({ channelType, channelId, role }) as unknown as AccessMembership;

export const wideSubject = (input: {
  entityType: WideEntityType;
  id?: string;
  createdBy?: string | null;
  channelIds: Partial<Record<WideChannelType, string | null>>;
  row?: Record<string, unknown>;
}): SubjectForPermission => ({ ...input }) as unknown as SubjectForPermission;

/** For the engine's `publicGrants` option. */
export const widePublicGrants = (grants: Partial<Record<WideEntityType, true>>): PublicReadGrants =>
  grants as PublicReadGrants;

/** Keyed by the wide vocabulary, so tests read `.task` cast-free. */
export type WideCanMap = Partial<Record<WideEntityType, Record<EntityActionType, CanState>>>;

export const computeWideCan = (
  channelType: WideChannelType,
  membership: AccessMembership | undefined | null,
  policies: PolicyMatrix,
): WideCanMap =>
  computeCan(
    channelType as unknown as Parameters<typeof computeCan>[0],
    membership as unknown as Parameters<typeof computeCan>[1],
    policies,
    wideOverrides,
  ) as unknown as WideCanMap;
