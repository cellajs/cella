import { appConfig, type ChannelEntityType, type MenuSection } from 'shared';
import type { UserMenuItem } from '~/modules/me/types';

function buildInitialMenu<const T extends readonly { entityType: ChannelEntityType }[]>(
  structure: T,
): { [K in T[number]['entityType']]: UserMenuItem[] } {
  type Key = T[number]['entityType'];
  const acc = {} as { [K in Key]: UserMenuItem[] };
  for (const { entityType } of structure) acc[entityType as Key] = [];
  return acc;
}

const baseMenu = buildInitialMenu(appConfig.menuStructure);

export function buildMenu(byType: Map<MenuSection['entityType'] | MenuSection['subentityType'], UserMenuItem[]>, menuStructure: MenuSection[]) {
  const menu = { ...baseMenu };

  // A channel type nested under a parent may have a section of its own too, for the memberships filed under no parent
  const parentIdFieldOf = new Map<string, (typeof appConfig.entityIdColumnKeys)[MenuSection['entityType']]>();
  for (const section of menuStructure) {
    if (section.subentityType) parentIdFieldOf.set(section.subentityType, appConfig.entityIdColumnKeys[section.entityType]);
  }

  for (const section of menuStructure) {
    const items = byType.get(section.entityType) ?? [];

    // Sub-items are always attached, so unseen badge aggregation has its data for a hidden row too, which shows none.
    if (!section.subentityType) {
      const parentIdField = parentIdFieldOf.get(section.entityType);
      const unfiled = parentIdField ? items.filter((item) => !item.membership[parentIdField]) : items;
      menu[section.entityType] = unfiled.map((item) => ({ ...item, submenu: [] }));
      continue;
    }

    const subitems = byType.get(section.subentityType) ?? [];
    const parentIdField = appConfig.entityIdColumnKeys[section.entityType];

    const subitemsByParent = new Map<string, UserMenuItem[]>();
    for (const subitem of subitems) {
      const parentId = subitem?.membership?.[parentIdField];
      if (!parentId) continue;
      const siblings = subitemsByParent.get(parentId);
      if (siblings) siblings.push(subitem);
      else subitemsByParent.set(parentId, [subitem]);
    }

    menu[section.entityType] = items.map((item) => ({ ...item, submenu: subitemsByParent.get(item.id) ?? [] }));
  }

  return menu;
}
