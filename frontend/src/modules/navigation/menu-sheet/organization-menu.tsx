import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { CountBadge } from '~/modules/common/count-badge';
import { channelTabsInMenu } from '~/modules/common/page/tab-nav';
import type { UserMenu, UserMenuItem } from '~/modules/me/types';
import { MenuSheetChannelTabs } from '~/modules/navigation/menu-sheet/channel-tabs';
import { organizationSections } from '~/modules/navigation/menu-sheet/helpers/organization-sections';
import { useMenuItemUnseenCount } from '~/modules/navigation/menu-sheet/helpers/use-menu-item-unseen-count';
import { MenuSheetSection } from '~/modules/navigation/menu-sheet/section';
import { getChannelRoute } from '~/utils/channel-route';

const hasTabsInMenu = channelTabsInMenu('organization');

interface MenuSheetOrganizationProps {
  organization: UserMenuItem;
  menu: UserMenu;
  /** The organization switcher above already names it. */
  hasSwitcher: boolean;
}

/**
 * The menu sheet of one organization: its name, then its pages when they show in the menu or else a link to manage it on
 * its page, then its channel sections.
 */
export function MenuSheetOrganization({ organization, menu, hasSwitcher }: MenuSheetOrganizationProps) {
  const { t } = useTranslation();
  const { to, params, search } = getChannelRoute(organization);
  // Unseen content homed in the organization itself, which no section row below shows
  const unseenCount = useMenuItemUnseenCount(organization, true);
  const sections = organizationSections(organization, menu);

  return (
    <>
      <div className="flex items-center gap-2 px-6 pt-3 pb-2 empty:hidden">
        {(!hasSwitcher || !hasTabsInMenu) && (
          <div className="flex min-w-0 grow flex-col items-start gap-0.5">
            {!hasSwitcher && <h2 className="max-w-full truncate font-medium text-sm">{organization.name}</h2>}
            {!hasTabsInMenu && (
              <Link
                to={to}
                params={params}
                search={search}
                draggable={false}
                className="link-decoration focus-effect rounded-sm text-muted-foreground text-xs hover:text-foreground"
              >
                {t('c:manage')}
              </Link>
            )}
          </div>
        )}
        {unseenCount > 0 && <CountBadge count={unseenCount} className="ml-auto shrink-0" />}
      </div>
      {hasTabsInMenu && <MenuSheetChannelTabs channel={organization} className="px-3 pb-2" />}
      {sections.map(({ options, items }) => (
        <MenuSheetSection
          key={options.entityType}
          options={options}
          items={items}
          isCollapsible={sections.length > 1}
          organizationId={organization.id}
        />
      ))}
    </>
  );
}
