import type { ContextEntityType } from 'config';
import { useNavigationStore } from '~/store/navigation';

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
