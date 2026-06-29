/** Minimal block shape needed for heading menu item checks. */
interface HeadingBlock {
  type: string;
  props: Record<string, unknown>;
}

/**
 * Determines if a heading menu item should be selected.
 * @param block - The block being rendered.
 * @param title - The menu item title.
 * @returns True if the menu item should be selected.
 */
export const isHeadingMenuItemActive = (block: HeadingBlock, title: string): boolean => {
  if (block.type !== 'heading') return false;

  const level = block.props.level as number;
  const levelMatch = title.includes(level.toString());
  const isToggleable = !!block.props.isToggleable;
  const toggleKeyword = 'Toggle';

  return levelMatch && (isToggleable ? title.includes(toggleKeyword) : !title.includes(toggleKeyword));
};
