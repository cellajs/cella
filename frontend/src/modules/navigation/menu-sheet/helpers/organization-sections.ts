import { appConfig, type ChannelEntityType } from 'shared';
import { getMenuSection } from '~/lib/entity-modules';
import type { UserMenu, UserMenuItem } from '~/modules/me/types';
import type { MenuSectionOptions } from '~/modules/navigation/menu-sheet/section';

/** The menu sections of one organization: its submenu, and the items of every other section that belong to it. */
export function organizationSections(organization: UserMenuItem, menu: UserMenu) {
  const structure: readonly { entityType: ChannelEntityType; subentityType: ChannelEntityType | null }[] = appConfig.menuStructure;
  const menuItems = Object.values(menu).flat();

  return structure.flatMap(({ entityType, subentityType }) => {
    const sectionType = entityType === 'organization' ? subentityType : entityType;
    const options: MenuSectionOptions | undefined = sectionType ? getMenuSection(sectionType) : undefined;
    if (!options) return [];

    const items =
      entityType === 'organization'
        ? (organization.submenu ?? [])
        : menuItems.filter((item) => item.entityType === entityType && item.membership.organizationId === organization.id);
    return [{ options, items }];
  });
}
