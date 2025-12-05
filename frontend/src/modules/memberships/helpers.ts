import type { ContextEntityType } from 'config';
import { useNavigationStore } from '~/store/navigation';

/**
 * Resolve the parent entity type(s) for a given entity ID or slug and target type.
 * ie. if a project ID is given, return the parent organization type.
 */
export const resolveParentEntityType = (idOrSlug: string, targetType: ContextEntityType): readonly ContextEntityType[] => {
  const { menu } = useNavigationStore.getState();

  for (const entries of Object.values(menu)) {
    if (!entries?.length) continue;

    // Direct match in top-level items
    const directMatch = entries.find(({ id, slug, entityType }) => (id === idOrSlug || slug === idOrSlug) && entityType === targetType);
    if (directMatch) return [directMatch.entityType];

    // Match in submenu
    const parentWithSubMatch = entries.find((item) =>
      item.submenu?.some(({ id, slug, entityType }) => (id === idOrSlug || slug === idOrSlug) && entityType === targetType),
    );
    if (parentWithSubMatch) return [parentWithSubMatch.entityType];
  }

  return [targetType];
};
