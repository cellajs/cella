/** Minimal block shape needed for heading menu item checks. */
interface HeadingBlock {
  type: string;
  props: Record<string, unknown>;
}

export const isHeadingMenuItemActive = (block: HeadingBlock, title: string): boolean => {
  if (block.type !== 'heading') return false;

  const level = block.props.level as number;
  const levelMatch = title.includes(level.toString());
  const isToggleable = !!block.props.isToggleable;
  const toggleKeyword = 'Toggle';

  return levelMatch && (isToggleable ? title.includes(toggleKeyword) : !title.includes(toggleKeyword));
};
