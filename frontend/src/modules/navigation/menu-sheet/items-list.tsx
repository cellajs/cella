import { useMatchRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ChannelEntityType } from 'shared';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { channelTabsInMenu } from '~/modules/common/page/tab-nav';
import type { UserMenuItem } from '~/modules/me/types';
import { MenuSheetArchivedGroup } from '~/modules/navigation/menu-sheet/archived-group';
import { MenuSheetChannelTabs } from '~/modules/navigation/menu-sheet/channel-tabs';
import { isSubmenuShown } from '~/modules/navigation/menu-sheet/helpers/is-submenu-shown';
import { sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/sort-and-filter-menu';
import { menuUnseenChannelIds } from '~/modules/navigation/menu-sheet/helpers/use-menu-item-unseen-count';
import { useSubmenuArchivedOpen } from '~/modules/navigation/menu-sheet/helpers/use-submenu-archived-open';
import { MenuSheetItem } from '~/modules/navigation/menu-sheet/item';
import type { MenuSectionOptions } from '~/modules/navigation/menu-sheet/section';
import { getChannelRoute } from '~/utils/channel-route';

/** A channel's page tabs under its menu row while its pages are open. */
function OpenChannelTabs({ channel }: { channel: UserMenuItem }) {
  const matchRoute = useMatchRoute();
  const { to, params } = getChannelRoute(channel);
  if (!matchRoute({ to, params, fuzzy: true })) return null;

  return <MenuSheetChannelTabs channel={channel} className="py-1 pl-12" />;
}

/** The archived sub-rows of a row behind a toggle, for a row that has any. Their unseen count stays on the toggle. */
function ArchivedSubmenu({ submenu, itemId, isResting }: { submenu: UserMenuItem[]; itemId: string; isResting: boolean }) {
  const [isOpen, setIsOpen] = useSubmenuArchivedOpen(itemId);
  const archivedItems = submenu.filter((sub) => sub.membership.archived);
  if (!archivedItems.length) return null;

  return (
    <MenuSheetArchivedGroup
      isSubmenu
      isOpen={isOpen}
      onToggle={() => setIsOpen(!isOpen)}
      archivedCount={archivedItems.length}
      archivedChannelIds={archivedItems.flatMap((sub) => menuUnseenChannelIds(sub, false))}
    >
      <MenuSheetItemsList entityType={submenu[0].entityType} items={submenu} isArchived isSubmenu isResting={isResting} />
    </MenuSheetArchivedGroup>
  );
}

/** The placeholder a section shows while it has no items. */
export function MenuSheetNoItems({ entityType }: { entityType: ChannelEntityType }) {
  const { t } = useTranslation();

  return (
    <li>
      <ContentPlaceholder size="sm" title="c:no_resource_yet" titleOptions={{ resource: t(entityType, { count: 0 }) }} />
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
  /** The page of another row of the parent's list is open, so its sub-rows rest grey. */
  isResting?: boolean;
}

export function MenuSheetItemsList({ items, entityType, isArchived, options, isSubmenu = false, isResting = false }: MenuSheetItemsListProps) {
  const matchRoute = useMatchRoute();
  if (items.length === 0) return <MenuSheetNoItems entityType={entityType} />;

  // Searched in all rows, archived too, as the active and archived lists render apart
  const openItem = isSubmenu
    ? undefined
    : items.find((item) => {
        const { to, params } = getChannelRoute(item);
        return matchRoute({ to, params, fuzzy: true, includeSearch: false });
      });

  return sortAndFilterMenu(items, isArchived).map((item) => {
    const hasSubmenu = isSubmenuShown(item);
    const isSubmenuResting = !!openItem && openItem.id !== item.id;
    return (
      <li key={item.id}>
        <MenuSheetItem item={item} isSubitem={isSubmenu} isResting={isResting} icon={options?.icon} />
        {channelTabsInMenu(item.entityType) && <OpenChannelTabs channel={item} />}
        {hasSubmenu && (
          <>
            <ul>
              <MenuSheetItemsList
                entityType={item.submenu[0].entityType}
                items={item.submenu}
                isArchived={false}
                isSubmenu
                isResting={isSubmenuResting}
              />
            </ul>
            <ArchivedSubmenu submenu={item.submenu} itemId={item.id} isResting={isSubmenuResting} />
          </>
        )}
      </li>
    );
  });
}
