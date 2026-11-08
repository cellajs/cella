import type { EntityActionType } from '../../types.ts';
import { type HierarchyOverrides, resolveHierarchy } from './engine/resolve-hierarchy.ts';
import type { SubjectForPermission } from './engine/types.ts';

/**
 * Whether a write is refused because the channel it acts in is archived. `archivedIds` holds the organization's archived
 * channel ids. The container is the channel row itself for a write to a channel, which its own delete passes; for a
 * product or a create it is the subject's deepest non-null ancestor, and the organization is never archived.
 */
export const archiveVeto = (
  action: EntityActionType,
  subject: SubjectForPermission,
  archivedIds: ReadonlySet<string>,
  overrides?: HierarchyOverrides,
): boolean => {
  if (action === 'read') return false;
  const { hierarchy } = resolveHierarchy(overrides);
  if (hierarchy.isChannel(subject.entityType) && action !== 'create') return action !== 'delete' && subject.row?.archived === true;

  for (const ancestor of hierarchy.getOrderedAncestors(subject.entityType)) {
    if (ancestor === 'organization') return false;
    const id = subject.channelIds[ancestor];
    if (id) return archivedIds.has(id);
  }
  return false;
};
