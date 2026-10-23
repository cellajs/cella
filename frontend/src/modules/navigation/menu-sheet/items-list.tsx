import { PlusIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelEntityType } from 'shared';
import type { UserMenuItem } from '~/modules/me/types';
import { sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/sort-and-filter-menu';
import { MenuSheetItem } from '~/modules/navigation/menu-sheet/item';
import type { MenuSectionOptions } from '~/modules/navigation/menu-sheet/section';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

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
  className?: string;
}

export function MenuSheetItemsList({ items, entityType, isArchived, options, className }: MenuSheetItemsListProps) {
  const { t } = useTranslation();
  const detailedMenu = useNavigationStore((state) => state.detailedMenu);

  const createButtonRef = useRef<HTMLButtonElement>(null);

  if (items.length === 0) {
    if (!options?.createAction) return <MenuSheetNoItems entityType={entityType} />;

    return (
      <li className="flex items-center">
        <Button ref={createButtonRef} className="w-full" variant="ghost" onClick={() => options.createAction?.(createButtonRef)}>
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
      {!item.membership.archived && !!item.submenu?.length && detailedMenu && (
        <ul>
          <MenuSheetItemsList entityType={item.submenu[0].entityType} items={item.submenu} isArchived={false} />
        </ul>
      )}
    </li>
  ));
}
