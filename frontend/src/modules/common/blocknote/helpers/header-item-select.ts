import type { CustomBlock } from '~/modules/common/blocknote/types';

/**
 * Determines if a heading menu item should be selected.
 * @param block - The block being rendered.
 * @param title - The menu item title.
 * @returns True if the menu item should be selected.
 */
export const isHeadingMenuItemActive = (block: CustomBlock, title: string): boolean => {
  if (block.type !== 'heading') return false;

  const levelMatch = title.includes(block.props.level.toString());
  const isToggleable = !!block.props.isToggleable;
  const toggleKeyword = 'Toggle';

  return levelMatch && (isToggleable ? title.includes(toggleKeyword) : !title.includes(toggleKeyword));
};
