import type { ContextEntity } from 'config';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { UserMenuItem } from '~/modules/me/types';
import { MenuSheetItem } from '~/modules/navigation/menu-sheet/item';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';

interface MenuSheetItemsProps {
  data: UserMenuItem[];
  type: ContextEntity;
  shownOption: 'archived' | 'unarchive';
  createAction?: () => void;
  className?: string;
}

export const MenuSheetItems = ({ data, type, shownOption, createAction, className }: MenuSheetItemsProps) => {
  const { t } = useTranslation();
  const hideSubmenu = useNavigationStore((state) => state.hideSubmenu);

  const renderNoItems = () =>
    createAction ? (
      <div className="flex items-center">
        <Button className="w-full" variant="ghost" onClick={createAction}>
          <Plus size={14} />
          <span className="ml-1 text-sm text-light">
            {t('common:create_your_first')} {t(type).toLowerCase()}
          </span>
        </Button>
      </div>
    ) : (
      <li className="py-2 text-muted-foreground text-sm text-light text-center">
        {t('common:no_resource_yet', { resource: t(type).toLowerCase() })}
      </li>
    );

  const renderItems = () => {
    const filteredItems = data
      .filter((item) => (shownOption === 'archived' ? item.membership.archived : !item.membership.archived))
      .sort((a, b) => a.membership.order - b.membership.order);
    return (
      <>
        {filteredItems.map((item) => (
          <li className={item.submenu?.length && !hideSubmenu ? 'relative submenu-section my-1' : 'my-1'} key={item.id}>
            <MenuSheetItem item={item} className={className} />
            {/* Submenu below */}
            {!item.membership.archived && !!item.submenu?.length && !hideSubmenu && (
              <ul>
                <MenuSheetItems type={item.submenu[0].entity} data={item.submenu} shownOption="unarchive" />
              </ul>
            )}
          </li>
        ))}
      </>
    );
  };

  return data.length === 0 ? renderNoItems() : renderItems();
};
