import { Link } from '@tanstack/react-router';
import { ArrowRightIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CountBadge } from '~/modules/common/count-badge';
import { channelTabsInMenu } from '~/modules/common/page/tab-nav';
import type { UserMenu, UserMenuItem } from '~/modules/me/types';
import { MenuSheetChannelTabs } from '~/modules/navigation/menu-sheet/channel-tabs';
import { menuHairlineClass } from '~/modules/navigation/menu-sheet/helpers/menu-columns';
import { organizationSections } from '~/modules/navigation/menu-sheet/helpers/menu-organizations';
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

/** One organization's menu sheet: its name, a link to its page unless its pages show below, then its channel sections. */
export function MenuSheetOrganization({ organization, menu, hasSwitcher }: MenuSheetOrganizationProps) {
  const { t } = useTranslation();
  // Unseen content homed in the organization itself, which no section row below shows
  const unseenCount = useMenuItemUnseenCount(organization, true);
  const sections = organizationSections(organization, menu);

  const badge = unseenCount > 0 && <CountBadge count={unseenCount} className="ml-auto shrink-0" />;

  return (
    <>
      {!hasSwitcher &&
        (hasTabsInMenu ? (
          <div className="flex items-center gap-2 px-6 pt-3 pb-2">
            <h2 className="truncate text-base font-semibold">{organization.name}</h2>
            {badge}
          </div>
        ) : (
          <div className="px-3 py-2">
            <Link
              {...getChannelRoute(organization)}
              draggable={false}
              className="group/organization-link focus-effect focus-inset hover:bg-hover flex h-12 items-center gap-3 rounded-md px-3 transition-colors"
            >
              <span className="flex min-w-0 grow flex-col gap-0.5">
                <h2 className="truncate text-base leading-5 font-semibold">{organization.name}</h2>
                <span className="text-muted-foreground grid overflow-hidden text-xs font-medium">
                  <span className="truncate transition [grid-area:1/1] group-hover/organization-link:-translate-y-2 group-hover/organization-link:opacity-0 group-hover/organization-link:delay-300 group-focus-visible/organization-link:-translate-y-2 group-focus-visible/organization-link:opacity-0">
                    {t(organization.membership.role)}
                  </span>
                  <span className="flex translate-y-2 items-center gap-1 overflow-hidden opacity-0 transition [grid-area:1/1] group-hover/organization-link:translate-y-0 group-hover/organization-link:opacity-100 group-hover/organization-link:delay-300 group-focus-visible/organization-link:translate-y-0 group-focus-visible/organization-link:opacity-100">
                    <span className="truncate">{t('c:go_to_organization_page')}</span>
                    <ArrowRightIcon className="size-3 shrink-0" />
                  </span>
                </span>
              </span>
              {badge}
            </Link>
          </div>
        ))}
      {!hasSwitcher && <div className={menuHairlineClass} />}
      {hasTabsInMenu && <MenuSheetChannelTabs channel={organization} className="px-3 pb-2" />}
      {sections.map((section) => (
        <MenuSheetSection key={section.options.entityType} {...section} isCollapsible={sections.length > 1} organizationId={organization.id} />
      ))}
    </>
  );
}
