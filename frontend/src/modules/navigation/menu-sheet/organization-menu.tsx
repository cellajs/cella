import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { appConfig, type ChannelEntityType } from 'shared';
import { getMenuSection } from '~/lib/entity-modules';
import type { UserMenu, UserMenuItem } from '~/modules/me/types';
import { type MenuSectionOptions, MenuSheetSection } from '~/modules/navigation/menu-sheet/section';
import { getChannelRoute } from '~/utils/channel-route';

/** The menu sections of one organization: its submenu, and the items of every other section that belong to it. */
function organizationSections(organization: UserMenuItem, menu: UserMenu) {
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

interface MenuSheetOrganizationProps {
  organization: UserMenuItem;
  menu: UserMenu;
}

/** The menu sheet of one organization: its name as the header, a link to manage it on its page, then its channel sections. */
export function MenuSheetOrganization({ organization, menu }: MenuSheetOrganizationProps) {
  const { t } = useTranslation();
  const { to, params, search } = getChannelRoute(organization);

  return (
    <>
      <div className="flex flex-col items-start gap-0.5 px-6 pt-3 pb-2">
        <h2 className="max-w-full truncate font-medium text-sm">{organization.name}</h2>
        <Link
          to={to}
          params={params}
          search={search}
          draggable={false}
          className="link-decoration focus-effect rounded-sm text-muted-foreground text-xs hover:text-foreground"
        >
          {t('c:manage')}
        </Link>
      </div>
      {organizationSections(organization, menu).map(({ options, items }) => (
        <MenuSheetSection key={options.entityType} options={options} items={items} />
      ))}
    </>
  );
}
