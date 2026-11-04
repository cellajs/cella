import type { EntityActionType, EntityType } from '../../types.ts';
import { createEntityHierarchy, createRoleRegistry } from '../config-builder/entity-hierarchy.ts';
import {
  type AccessMembership,
  configurePermissions,
  type HierarchyOverrides,
  type PermissionsConfigResult,
  type PolicyCallback,
  type PolicyCellInput,
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

/** Elevated roles per channel (subtree-wide product grants); `wideHierarchy` declares none. */
export type WideElevated = { organization?: readonly ('admin' | 'member')[]; workspace?: readonly WideRole[]; project?: readonly WideRole[] };

/**
 * Configuration-independent hierarchy with sibling channels, deep products, and guest roles. A project membership
 * brings along an organization one of the same role where the organization has it, admin included.
 */
export const makeWideHierarchy = (elevated: WideElevated = {}) =>
  createEntityHierarchy(wideRoles)
    .user()
    .organization({ roles: ['admin', 'member'], elevated: elevated.organization })
    .channel('workspace', { parent: 'organization', roles: wideRoles.all, elevated: elevated.workspace })
    .channel('project', {
      parent: 'organization',
      roles: wideRoles.all,
      organizationRoles: { admin: 'admin', member: 'member', guest: 'member' },
      elevated: elevated.project,
    })
    .product('task', { parent: 'project' })
    .product('label', { parent: 'project' })
    .product('attachment', { parent: 'project' })
    .build();

export const wideHierarchy = makeWideHierarchy();

export const wideEntityTypes: readonly WideEntityType[] = ['user', 'organization', 'workspace', 'project', 'task', 'label', 'attachment'];

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

// The permission engine is typed by the app's entities and roles; the helpers below cast the wide vocabulary to those
// types, so the tests that use them stay cast-free.

/** `configurePermissions` over the wide hierarchy. */
export const configureWidePermissions = (callback: WidePolicyCallback): PermissionsConfigResult =>
  configurePermissions(wideEntityTypes as unknown as readonly EntityType[], callback as unknown as PolicyCallback, wideOverrides);

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
export const widePublicGrants = (grants: Partial<Record<WideEntityType, true>>): PublicReadGrants => grants as PublicReadGrants;
