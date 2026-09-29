import type { EntityActionType, EntityType } from '../../types.ts';
import { createEntityHierarchy, createRoleRegistry } from '../config-builder/entity-hierarchy.ts';
import type { HierarchyOverrides, PolicyCellInput, PolicyMatrix } from '../permissions/index.ts';
import { configurePolicyMatrix } from '../permissions/policy-matrix.ts';

// Deep synthetic hierarchy: 4 channel levels with an `item` product whose rows attach at any
// depth, typed independently of any app config. The path, home-resolution, counter, permission
// and view-derivation suites all run against this one hierarchy, so every subsystem that must
// agree on path semantics is tested against the same shape.
export type DeepChannelType = 'organization' | 'course' | 'courseSection' | 'project';
export type DeepNullableAncestor = 'project' | 'courseSection' | 'course';

export const deepRoles = createRoleRegistry(['admin', 'member', 'staff', 'student', 'owner', 'follower'] as const);

/** Suites asserting per-role behavior key off these. */
export const deepChannelRoles = {
  organization: ['admin', 'member'],
  course: ['staff', 'student'],
  courseSection: ['staff', 'student'],
  project: ['owner', 'follower'],
} as const satisfies Record<DeepChannelType, readonly string[]>;

/** For policy configuration; excludes the auxiliary `task` product. */
export const deepEntityTypes = ['user', 'organization', 'course', 'courseSection', 'project', 'item'] as const;

/** Elevated roles per channel (subtree-wide product grants); `deepHierarchy` declares none. */
export type DeepElevated = { readonly [C in DeepChannelType]?: readonly (typeof deepChannelRoles)[C][number][] };

/**
 * By default every intermediate ancestor of `item` is nullable, so rows attach at any depth.
 * Suites covering nullable boundaries pass a narrower list to keep `course` non-null. `task` is
 * a fixed-depth sibling product for declared-parent fallback assertions.
 */
export const makeDeepHierarchy = (
  itemNullableAncestors: readonly DeepNullableAncestor[] = ['project', 'courseSection', 'course'],
  elevated: DeepElevated = {},
) =>
  createEntityHierarchy(deepRoles)
    .user()
    .organization({ roles: deepChannelRoles.organization, elevated: elevated.organization })
    .channel('course', { parent: 'organization', roles: deepChannelRoles.course, elevated: elevated.course })
    .channel('courseSection', {
      parent: 'course',
      roles: deepChannelRoles.courseSection,
      elevated: elevated.courseSection,
    })
    .channel('project', { parent: 'courseSection', roles: deepChannelRoles.project, elevated: elevated.project })
    .product('item', { parent: 'project', nullableAncestors: itemNullableAncestors })
    .product('task', { parent: 'project' })
    .build();

/** `item` attaches at any depth. */
export const deepHierarchy = makeDeepHierarchy();

/** Passed to the permission engine and the scope compiler. */
export const deepOverrides: HierarchyOverrides = { hierarchy: deepHierarchy };

type DeepCells = Partial<Record<EntityActionType, PolicyCellInput>>;

/** One `item` policy row per channel level and role; `cellsFor` decides its cells (omitted actions deny). */
export const deepItemPolicies = (
  cellsFor: (channelType: DeepChannelType, role: string) => DeepCells,
  overrides: HierarchyOverrides = deepOverrides,
): PolicyMatrix =>
  // The matrix builder is typed by the app's entities and roles; the deep vocabulary is cast to them.
  configurePolicyMatrix(
    deepEntityTypes as unknown as readonly EntityType[],
    ({ entityType, channels }) => {
      if ((entityType as string) !== 'item') return;
      const builders = channels as unknown as Record<DeepChannelType, Record<string, (perms: DeepCells) => void>>;
      for (const [channelType, roles] of Object.entries(deepChannelRoles) as [DeepChannelType, readonly string[]][]) {
        for (const role of roles) builders[channelType][role]?.(cellsFor(channelType, role));
      }
    },
    overrides,
  );

/** One read cell per channel level and role; `readValue` decides each cell. */
export const deepReadPolicies = (
  readValue: (channelType: DeepChannelType, role: string) => PolicyCellInput,
): PolicyMatrix => deepItemPolicies((channelType, role) => ({ read: readValue(channelType, role) }));
