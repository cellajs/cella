import { appConfig, ContextEntityType, type MenuSection } from 'config';
import { UserMenuItem } from '~/modules/me/types';

/**
 * Builds the initial menu state based on the provided menu structure.
 *
 * @param structure - The menu structure configuration defining entity types
 * @returns An object with entity types as keys and empty arrays as values
 */
function buildInitialMenu<const T extends readonly { entityType: ContextEntityType }[]>(
  structure: T,
): { [K in T[number]['entityType']]: UserMenuItem[] } {
  return structure.reduce((acc, { entityType }) => {
    (acc as any)[entityType] = [];
    return acc;
  }, {} as any);
}

// Base menu
const baseMenu = buildInitialMenu(appConfig.menuStructure);

/**
 * Builds a user menu from a mapping of context entity types to their corresponding items.
 *
 * @param byType - A map of entity types to their menu items
 * @param menuStructure - The menu structure configuration
 * @param opts - Optional configuration for building detailed menu with submenus
 * @returns The constructed user menu with items grouped by entity type
 */
export function buildMenuFromByType(byType: Map<ContextEntityType, UserMenuItem[]>, menuStructure: MenuSection[], opts?: { detailedMenu?: boolean }) {
  const detailedMenu = !!opts?.detailedMenu;

  const menu = { ...baseMenu };

  for (const section of menuStructure) {
    const items = byType.get(section.entityType) ?? [];

    // Always add submenu: [] for consistent shape
    if (!detailedMenu || !section.subentityType) {
      menu[section.entityType] = items.map((e) => ({ ...e, submenu: [] }));
      continue;
    }

    const subitems = byType.get(section.subentityType) ?? [];
    const parentIdField = appConfig.entityIdFields[section.entityType];

    const subsByParent = new Map<string, UserMenuItem[]>();
    for (const s of subitems) {
      const pid = s?.membership?.[parentIdField];
      if (!pid) continue;
      (subsByParent.get(pid) ?? subsByParent.set(pid, []).get(pid)!).push(s);
    }

    menu[section.entityType] = items.map((e) => ({
      ...e,
      submenu: subsByParent.get(e.id) ?? [],
    }));
  }

  return menu;
}
