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

/** Builds a user menu from a map of channel entity types to their items; `opts` enables detailed submenus. */
export function buildMenu(
  byType: Map<MenuSection['entityType'] | MenuSection['subentityType'], UserMenuItem[]>,
  menuStructure: MenuSection[],
) {
  const menu = { ...baseMenu };

  for (const section of menuStructure) {
    const items = byType.get(section.entityType) ?? [];

    // Sub-items are always attached, so unseen badge aggregation has its data whatever detailedMenu renders.
    if (!section.subentityType) {
      menu[section.entityType] = items.map((e) => ({ ...e, submenu: [] }));
      continue;
    }

    const subitems = byType.get(section.subentityType) ?? [];
    const parentIdField = appConfig.entityIdColumnKeys[section.entityType];

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
