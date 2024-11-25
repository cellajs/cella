import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ComplexOptionElement } from '~/modules/common/nav-sheet/sheet-menu-options/complex-item';
import { useNavigationStore } from '~/store/navigation';
import type { UserMenuItem } from '~/types/common';

export const SheetMenuItemsOptions = ({ data, shownOption }: { data: UserMenuItem[]; shownOption: 'archived' | 'unarchive' }) => {
  const { t } = useTranslation();
  const { hideSubmenu } = useNavigationStore();
  const [submenuVisibility, setSubmenuVisibility] = useState<Record<string, boolean>>({});
  const entityType = data[0].entity;

  if (data.length === 0) {
    return <li className="py-2 text-muted-foreground text-sm text-light text-center">{t('common:no_resource_yet', { resource: entityType })}</li>;
  }

  const filteredItems = data
    .filter((i) => (shownOption === 'archived' ? i.membership.archived : !i.membership.archived))
    .sort((a, b) => a.membership.order - b.membership.order);

  const toggleSubmenuVisibility = (itemId: string) => {
    setSubmenuVisibility((prevState) => ({
      ...prevState,
      [itemId]: !prevState[itemId],
    }));
  };

  return filteredItems.map((item) => (
    <ComplexOptionElement
      key={item.id}
      item={item}
      shownOption={shownOption}
      hideSubmenu={hideSubmenu}
      isSubmenuArchivedVisible={submenuVisibility[item.id]}
      toggleSubmenuVisibility={toggleSubmenuVisibility}
    />
  ));
};
