import type { ContextEntityType } from 'config';
import { Plus } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserMenuItem } from '~/modules/me/types';
import { MenuSheetItem } from '~/modules/navigation/menu-sheet/item';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import type { MenuSectionOptions } from './section';

interface MenuSheetItemsProps {
  data: UserMenuItem[];
  type: ContextEntityType;
  isArchived: boolean;
  options?: MenuSectionOptions;
  className?: string;
}

export const MenuSheetItems = ({ data, type, isArchived, options, className }: MenuSheetItemsProps) => {
  const { t } = useTranslation();
  const hideSubmenu = useNavigationStore((state) => state.hideSubmenu);

  const buttonRef = useRef(null);

  const renderNoItems = () =>
    options?.createAction ? (
      <div className="flex items-center">
        <Button ref={buttonRef} className="w-full" variant="ghost" onClick={() => options.createAction?.(buttonRef)}>
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
      .filter((item) => (isArchived ? item.membership.archived : !item.membership.archived))
      .sort((a, b) => a.membership.order - b.membership.order);
    return (
      <>
        {filteredItems.map((item) => (
          <li className={item.submenu?.length && !hideSubmenu ? 'relative submenu-section my-1' : 'my-1'} key={item.id}>
            <MenuSheetItem item={item} className={className} icon={options?.icon} />
            {/* Submenu below */}
            {!item.membership.archived && !!item.submenu?.length && !hideSubmenu && (
              <ul>
                <MenuSheetItems type={item.submenu[0].entityType} data={item.submenu} isArchived={false} />
              </ul>
            )}
          </li>
        ))}
      </>
    );
  };

  return data.length === 0 ? renderNoItems() : renderItems();
};
