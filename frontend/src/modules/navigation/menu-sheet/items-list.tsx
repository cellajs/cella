import { useMatchRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ChannelEntityType } from 'shared';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { channelTabsInMenu } from '~/modules/common/page/tab-nav';
import type { UserMenuItem } from '~/modules/me/types';
import { MenuSheetChannelTabs } from '~/modules/navigation/menu-sheet/channel-tabs';
import { isSubmenuShown } from '~/modules/navigation/menu-sheet/helpers/is-submenu-shown';
import { sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/sort-and-filter-menu';
import { MenuSheetItem } from '~/modules/navigation/menu-sheet/item';
import type { MenuSectionOptions } from '~/modules/navigation/menu-sheet/section';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { getChannelRoute } from '~/utils/channel-route';
import { cn } from '~/utils/cn';

/** A channel's page tabs under its menu row while its pages are open. */
function OpenChannelTabs({ channel }: { channel: UserMenuItem }) {
  const matchRoute = useMatchRoute();
  const { to, params } = getChannelRoute(channel);
  if (!matchRoute({ to, params, fuzzy: true })) return null;

  return <MenuSheetChannelTabs channel={channel} className="py-1 pl-12" />;
}

/** The placeholder a section shows while it has no items. */
export function MenuSheetNoItems({ entityType }: { entityType: ChannelEntityType }) {
  const { t } = useTranslation();

  return (
    <li>
      <ContentPlaceholder size="sm" title="c:no_resource_yet" titleOptions={{ resource: t(entityType, { count: 0 }).toLowerCase() }} />
    </li>
  );
}

interface MenuSheetItemsListProps {
  items: UserMenuItem[];
  entityType: ChannelEntityType;
  isArchived: boolean;
  options?: MenuSectionOptions;
  /** It lists a row's submenu, so its rows render as sub-rows. */
  isSubmenu?: boolean;
}

export function MenuSheetItemsList({ items, entityType, isArchived, options, isSubmenu = false }: MenuSheetItemsListProps) {
  const detailedMenu = useNavigationStore((state) => state.detailedMenu);

  if (items.length === 0) return <MenuSheetNoItems entityType={entityType} />;

  return sortAndFilterMenu(items, isArchived).map((item) => {
    const hasSubmenu = isSubmenuShown(item, detailedMenu);
    return (
      <li className={cn(hasSubmenu && 'submenu-section relative')} key={item.id}>
        <MenuSheetItem item={item} isSubitem={isSubmenu} icon={options?.icon} />
        {channelTabsInMenu(item.entityType) && <OpenChannelTabs channel={item} />}
        {hasSubmenu && (
          <ul>
            <MenuSheetItemsList entityType={item.submenu[0].entityType} items={item.submenu} isArchived={false} isSubmenu />
          </ul>
        )}
      </li>
    );
  });
}
