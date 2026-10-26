import { useMatchRoute } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';
import { type RefObject, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelEntityType } from 'shared';
import { channelTabsInMenu } from '~/modules/common/page/tab-nav';
import type { UserMenuItem } from '~/modules/me/types';
import { MenuSheetChannelTabs } from '~/modules/navigation/menu-sheet/channel-tabs';
import { sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/sort-and-filter-menu';
import { MenuSheetItem } from '~/modules/navigation/menu-sheet/item';
import type { MenuSectionOptions } from '~/modules/navigation/menu-sheet/section';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { Button } from '~/modules/ui/button';
import { getChannelRoute } from '~/utils/channel-route';
import { cn } from '~/utils/cn';

/** A channel's page tabs under its menu row while its pages are open. */
function OpenChannelTabs({ channel }: { channel: UserMenuItem }) {
  const matchRoute = useMatchRoute();
  const { to, params } = getChannelRoute(channel);
  if (!matchRoute({ to, params, fuzzy: true })) return null;

  return <MenuSheetChannelTabs channel={channel} className="py-1 pl-12" />;
}

/** The row a section shows while it has no items. */
export function MenuSheetNoItems({ entityType }: { entityType: ChannelEntityType }) {
  const { t } = useTranslation();

  return <li className="py-2 text-center text-muted-foreground text-sm">{t('c:no_resource_yet', { resource: t(entityType).toLowerCase() })}</li>;
}

interface MenuSheetItemsListProps {
  items: UserMenuItem[];
  entityType: ChannelEntityType;
  isArchived: boolean;
  options?: MenuSectionOptions;
  /** The section's create handler, offered as a first-item button while the list is empty. */
  onCreate?: (ref: RefObject<HTMLButtonElement | null>) => void;
  className?: string;
}

export function MenuSheetItemsList({ items, entityType, isArchived, options, onCreate, className }: MenuSheetItemsListProps) {
  const { t } = useTranslation();
  const detailedMenu = useNavigationStore((state) => state.detailedMenu);

  const createButtonRef = useRef<HTMLButtonElement>(null);

  if (items.length === 0) {
    if (!onCreate) return <MenuSheetNoItems entityType={entityType} />;

    return (
      <li className="flex items-center">
        <Button ref={createButtonRef} className="w-full" variant="ghost" onClick={() => onCreate(createButtonRef)}>
          <PlusIcon className="size-3.5" />
          <span className="text-sm">
            {t('c:create_your_first')} {t(entityType).toLowerCase()}
          </span>
        </Button>
      </li>
    );
  }

  return sortAndFilterMenu(items, isArchived).map((item) => (
    <li className={cn('my-1', !!item.submenu?.length && detailedMenu && 'submenu-section relative')} key={item.id}>
      <MenuSheetItem item={item} className={className} icon={options?.icon} />
      {channelTabsInMenu(item.entityType) && <OpenChannelTabs channel={item} />}
      {!item.membership.archived && !!item.submenu?.length && detailedMenu && (
        <ul>
          <MenuSheetItemsList entityType={item.submenu[0].entityType} items={item.submenu} isArchived={false} />
        </ul>
      )}
    </li>
  ));
}
