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

  const createButtonRef = useRef(null);

  const renderNoItems = () =>
    options?.createAction ? (
      <li className="flex items-center">
        <Button ref={createButtonRef} className="w-full" variant="ghost" onClick={() => options.createAction?.(createButtonRef)}>
          <PlusIcon className="size-3.5" />
          <span className="text-sm">
            {t('c:create_your_first')} {t(entityType).toLowerCase()}
          </span>
        </Button>
      </li>
    ) : (
      <li className="py-2 text-center text-muted-foreground text-sm">{t('c:no_resource_yet', { resource: t(entityType).toLowerCase() })}</li>
    );

  const renderItems = () => {
    const filteredItems = sortAndFilterMenu(items, isArchived);
    return (
      <>
        {filteredItems.map((item) => (
          <li className={item.submenu?.length && detailedMenu ? 'submenu-section relative my-1' : 'my-1'} key={item.id}>
            <MenuSheetItem item={item} className={className} icon={options?.icon} />
            {!item.membership.archived && !!item.submenu?.length && detailedMenu && (
              <ul>
                <MenuSheetItemsList entityType={item.submenu[0].entityType} items={item.submenu} isArchived={false} />
              </ul>
            )}
          </li>
        ))}
      </>
    );
  };

  return items.length === 0 ? renderNoItems() : renderItems();
}
