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
 * The menu sheet of one organization: its name, as a link to its page unless its pages show in the menu below it, then
 * its channel sections. A switcher above already heads it.
 */
export function MenuSheetOrganization({ organization, menu, hasSwitcher }: MenuSheetOrganizationProps) {
  const { t } = useTranslation();
  const { to, params, search } = getChannelRoute(organization);
  // Unseen content homed in the organization itself, which no section row below shows
  const unseenCount = useMenuItemUnseenCount(organization, true);
  const sections = organizationSections(organization, menu);

  const badge = unseenCount > 0 && <CountBadge count={unseenCount} className="ml-auto shrink-0" />;

  return (
    <>
      {!hasSwitcher &&
        (hasTabsInMenu ? (
          <div className="flex items-center gap-2 px-6 pt-3 pb-2">
            <h2 className="truncate font-semibold text-base">{organization.name}</h2>
            {badge}
          </div>
        ) : (
          <div className="px-3 pt-3">
            <Link
              to={to}
              params={params}
              search={search}
              draggable={false}
              className="group/organization-link focus-effect focus-inset flex h-12 items-center gap-3 rounded-md px-3 transition-colors hover:bg-accent"
            >
              <span className="flex min-w-0 grow flex-col gap-0.5">
                <h2 className="truncate font-semibold text-base leading-5">{organization.name}</h2>
                <span className="grid overflow-hidden text-muted-foreground text-xs">
                  <span className="truncate transition [grid-area:1/1] group-hover/organization-link:-translate-y-2 group-hover/organization-link:opacity-0 group-hover/organization-link:delay-300 group-focus-visible/organization-link:-translate-y-2 group-focus-visible/organization-link:opacity-0">
                    {t(organization.membership.role)}
                  </span>
                  <span className="translate-y-2 truncate opacity-0 transition [grid-area:1/1] group-hover/organization-link:translate-y-0 group-hover/organization-link:opacity-100 group-hover/organization-link:delay-300 group-focus-visible/organization-link:translate-y-0 group-focus-visible/organization-link:opacity-100">
                    {t('c:go_to_organization_page')}
                  </span>
                </span>
              </span>
              {badge}
            </Link>
          </div>
        ))}
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
