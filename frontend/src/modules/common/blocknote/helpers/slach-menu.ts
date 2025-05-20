import type { DefaultReactSuggestionItem } from '@blocknote/react';
import { customSlashIndexedItems, customSlashNotIndexedItems, menusTitleToAllowedType } from '~/modules/common/blocknote/blocknote-config';
import type { BasicBlockTypes, CellaCustomBlockTypes, MenusItemsTitle } from '~/modules/common/blocknote/types';

export const getSortedSlashMenuItems = (items: DefaultReactSuggestionItem[], allowedBlockTypes: (CellaCustomBlockTypes | BasicBlockTypes)[]) => {
  const indexedItems: readonly string[] = customSlashIndexedItems;
  const notIndexedItems: readonly string[] = customSlashNotIndexedItems;

  // Apply the filter to customSlashIndexedItems and customSlashNotIndexedItems
  const slashMenuIndexed = indexedItems.filter((i) => isAllowedSlashMenu(i, allowedBlockTypes));
  const slashMenuNotIndexed = notIndexedItems.filter((i) => isAllowedSlashMenu(i, allowedBlockTypes));
  const sortList = [...slashMenuIndexed, ...slashMenuNotIndexed];
  const sortOrder = new Map(sortList.map((title, index) => [title, index]));

  const filteredAndSortedItems = items
    .filter(({ title }) => sortList.includes(title))
    .sort((a, b) => {
      const indexA = sortOrder.get(a.title);
      const indexB = sortOrder.get(b.title);
      return (indexA ?? Number.MAX_SAFE_INTEGER) - (indexB ?? Number.MAX_SAFE_INTEGER);
    });

  // Sort and filter items based on the pre-defined order.
  return {
    items: filteredAndSortedItems,
    indexedItemCount: slashMenuIndexed.length,
    originalItemCount: filteredAndSortedItems.length,
  };
};

// Filter function to check if the MenusItemsTitle has an allowed type
const isAllowedSlashMenu = (item: string, allowedTypes: (CellaCustomBlockTypes | BasicBlockTypes)[]) => {
  const allowedBlockTypes: readonly string[] = allowedTypes;
  const allowedType = menusTitleToAllowedType[item as MenusItemsTitle];
  return allowedType && allowedBlockTypes.includes(allowedType);
};
