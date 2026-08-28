import type { EntityHierarchy } from '../config-builder/entity-hierarchy.ts';

/**
 * Channel-qualified elevation keys for tests: the given role names at every channel of the
 * hierarchy ("role X is subtree-wide wherever it appears"). App code never uses this; it reads
 * the hierarchy's compiled `elevatedGrants`.
 */
export const elevateAcross = (hierarchy: EntityHierarchy, roles: readonly string[]): ReadonlySet<string> =>
  new Set(hierarchy.channelTypes.flatMap((channelType) => roles.map((role) => `${channelType}:${role}`)));
