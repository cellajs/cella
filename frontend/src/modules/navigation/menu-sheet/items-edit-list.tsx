import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UserMenuItem } from '~/modules/me/types';
import { MenuItemEditWrapper } from '~/modules/navigation/menu-sheet/item-edit-wrapper';
import type { MenuSectionOptions } from '~/modules/navigation/menu-sheet/section';
import { useNavigationStore } from '~/store/navigation';

export const MenuSheetItemsEdit = ({ data, isArchived, options }: { data: UserMenuItem[]; options?: MenuSectionOptions; isArchived: boolean }) => {
  const { t } = useTranslation();
  const { hideSubmenu } = useNavigationStore();
  const [submenuVisibility, setSubmenuVisibility] = useState<Record<string, boolean>>({});
  const entityType = data[0].entityType;

  if (data.length === 0) {
    return <li className="py-2 text-muted-foreground text-sm text-light text-center">{t('common:no_resource_yet', { resource: entityType })}</li>;
  }

  const filteredItems = data
    .filter((i) => (isArchived ? i.membership.archived : !i.membership.archived))
    .sort((a, b) => a.membership.order - b.membership.order);

  const toggleSubmenuVisibility = (itemId: string) => {
    setSubmenuVisibility((prevState) => ({
      ...prevState,
      [itemId]: !prevState[itemId],
    }));
  };

  return filteredItems.map((item) => (
    <MenuItemEditWrapper
      key={item.id}
      unarchiveItems={filteredItems}
      item={item}
      options={options}
      isArchived={isArchived}
      hideSubmenu={hideSubmenu}
      isSubmenuArchivedVisible={submenuVisibility[item.id]}
      toggleSubmenuVisibility={toggleSubmenuVisibility}
    />
  ));
};
