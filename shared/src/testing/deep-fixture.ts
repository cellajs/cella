import { createEntityHierarchy, createRoleRegistry } from '../config-builder/entity-hierarchy';
import type { PolicyMatrix, HierarchyOverrides, PolicyCellInput } from '../permissions';
import { configurePolicyMatrix } from '../permissions/policy-matrix';
import type { EntityType } from '../../types';

// Deep synthetic hierarchy (projectcampus-shaped): 4 channel levels with an `item` product whose
// rows attach at any depth, typed independently of any fork's app config. Path, home-resolution,
// counter, permission-proving, and view-derivation suites all test against this ONE hierarchy so
// the subsystems that must agree on path semantics are proven against the same shape.
export type DeepChannelType = 'organization' | 'course' | 'courseSection' | 'project';
export type DeepNullableAncestor = 'project' | 'courseSection' | 'course';

export const deepRoles = createRoleRegistry(['admin', 'member', 'staff', 'student', 'owner', 'follower'] as const);

/** Role sets granted per channel level; suites that assert per-role behavior key off these. */
export const deepChannelRoles = {
  organization: ['admin', 'member'],
  course: ['staff', 'student'],
  courseSection: ['staff', 'student'],
  project: ['owner', 'follower'],
} as const satisfies Record<DeepChannelType, readonly string[]>;

/** Entity vocabulary for policy configuration (excludes the auxiliary `task` product). */
export const deepEntityTypes = ['user', 'organization', 'course', 'courseSection', 'project', 'item'] as const;

/**
 * Builds the deep hierarchy. The default marks every intermediate ancestor of `item` nullable
 * (rows attach at any depth, organization included). Suites proving nullable-boundary behavior
 * (missing-ancestor warnings, possible home channels) pass a narrower list to keep `course`
 * non-nullable. `task` is a fixed-depth sibling product for declared-parent fallback assertions.
 */
export const makeDeepHierarchy = (
  itemNullableAncestors: readonly DeepNullableAncestor[] = ['project', 'courseSection', 'course'],
) =>
  createEntityHierarchy(deepRoles)
    .user()
    .channel('organization', { parent: null, roles: deepChannelRoles.organization })
    .channel('course', { parent: 'organization', roles: deepChannelRoles.course })
    .channel('courseSection', { parent: 'course', roles: deepChannelRoles.courseSection })
    .channel('project', { parent: 'courseSection', roles: deepChannelRoles.project })
    .product('item', { parent: 'project', nullableAncestors: itemNullableAncestors })
    .product('task', { parent: 'project' })
    .build();

/** Canonical deep hierarchy: `item` attaches at any depth. */
export const deepHierarchy = makeDeepHierarchy();

/** Hierarchy override seam for the permission engine and scope compiler. */
export const deepOverrides: HierarchyOverrides = { hierarchy: deepHierarchy };

/**
 * `item` read policies over the deep hierarchy, one read cell per channel level and role.
 * `readValue` decides each cell so suites can express grant matrices as a single function.
 */
export const deepReadPolicies = (
  readValue: (channelType: DeepChannelType, role: string) => PolicyCellInput,
): PolicyMatrix =>
  configurePolicyMatrix(
    deepEntityTypes as unknown as readonly EntityType[],
    ({ entityType, channels }) => {
      if ((entityType as string) !== 'item') return;
      const builders = channels as unknown as Record<
        DeepChannelType,
        Record<string, (perms: { read: PolicyCellInput }) => void>
      >;
      for (const [channelType, roles] of Object.entries(deepChannelRoles) as [DeepChannelType, readonly string[]][]) {
        for (const role of roles) builders[channelType][role]?.({ read: readValue(channelType, role) });
      }
    },
    deepOverrides,
  );
