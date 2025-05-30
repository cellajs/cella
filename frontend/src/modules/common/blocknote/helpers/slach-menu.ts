import type { DefaultReactSuggestionItem } from '@blocknote/react';
import { customSlashIndexedItems, customSlashNotIndexedItems } from '~/modules/common/blocknote/blocknote-config';
import type { CustomBlockTypes, SlashItemKeys } from '~/modules/common/blocknote/types';

export const getSortedSlashMenuItems = (items: (DefaultReactSuggestionItem & { key: SlashItemKeys })[], allowedBlockTypes: CustomBlockTypes[]) => {
  // Apply the filter to customSlashIndexedItems and customSlashNotIndexedItems
  const slashMenuIndexed = customSlashIndexedItems.filter((i) => isAllowedSlashMenu(i, allowedBlockTypes));
  const slashMenuNotIndexed = customSlashNotIndexedItems.filter((i) => isAllowedSlashMenu(i, allowedBlockTypes));
  const sortList = [...slashMenuIndexed, ...slashMenuNotIndexed];
  const sortOrder = new Map(sortList.map((title, index) => [title, index]));

  // TODO handle key allowed type diff
  const filteredAndSortedItems = items
    .filter((item) => item.key && sortList.includes(item.key))
    .sort((a, b) => {
      const indexA = sortOrder.get(a.key);
      const indexB = sortOrder.get(b.key);
      return (indexA ?? Number.MAX_SAFE_INTEGER) - (indexB ?? Number.MAX_SAFE_INTEGER);
    }) as DefaultReactSuggestionItem[];

  // Sort and filter items based on the pre-defined order.
  return {
    items: filteredAndSortedItems,
    indexedItemCount: slashMenuIndexed.length,
    originalItemCount: filteredAndSortedItems.length,
  };
};

// Filter function to check if the MenusItemsTitle has an allowed type
const isAllowedSlashMenu = (item: SlashItemKeys, allowedTypes: CustomBlockTypes[]) => {
  const allowedBlockTypes: readonly string[] = allowedTypes;
  return item && allowedBlockTypes.includes(item);
};
