import { BlockNoteSchema, type DefaultSuggestionItem, type Dictionary } from '@blocknote/core';
import { blockTypeSelectItems, type DefaultReactSuggestionItem, getDefaultReactSlashMenuItems } from '@blocknote/react';
import { MentionSchema } from '~/modules/common/blocknote/custom-elements/mention/mention';
import { getSlashNotifySlashItem, notifyBlock } from '~/modules/common/blocknote/custom-elements/notify';
import { baseBlocknoteTypeToKeys } from '~/modules/common/blocknote/type-to-keys';
import type {
  CommonBlockNoteProps,
  CustomBlockNoteEditor,
  CustomBlockTypes,
  CustomFormatToolBarConfig,
  SlashIndexedItems,
} from '~/modules/common/blocknote/types';

/**
 *  Basic configuration
 */

// Base custom schema
export const customSchema = BlockNoteSchema.create().extend({
  blockSpecs: { notify: notifyBlock() }, // Adds Notify block
  inlineContentSpecs: { mention: MentionSchema }, // Adds Mention tag
});

// Extend Blocknote types to include custom block keys for slash menu
declare module '~/modules/common/blocknote/types' {
  export interface ExtendableBlocknoteTypes {
    SlashKeys: DefaultSuggestionItem['key'] | 'notify';
  }
}

// Blocks to witch can be switched by sidemenu btn or in formatting toolbar
export const customBlockTypeSwitchItems: CustomBlockTypes[] = ['heading', 'paragraph', 'bulletListItem', 'numberedListItem', 'checkListItem'];

/**
 *  Side menu configuration
 */
export const getSideMenuItems = (dict: Dictionary) => [...blockTypeSelectItems(dict)];

/**
 *  Slash menu configuration
 */

// Indexed items (max 9 for quick number-based selection)
export const customSlashIndexedItems: SlashIndexedItems = ['image', 'video', 'file', 'bulletListItem', 'numberedListItem', 'checkListItem', 'notify'];

// Generate the complete Slash menu items list
export const getSlashMenuItems = (
  editor: CustomBlockNoteEditor,
  allowedTypes: CustomBlockTypes[],
  headingLevels: NonNullable<CommonBlockNoteProps['headingLevels']>,
): DefaultReactSuggestionItem[] => {
  const baseItems = [...getDefaultReactSlashMenuItems(editor), getSlashNotifySlashItem(editor)];

  // Filter heading keys based on allowed headingLevels
  const { heading, ...restTypeToKeys } = { ...baseBlocknoteTypeToKeys };
  const filteredHeading = heading.filter((key) => {
    const match = key.match(/(?:_)?(\d)$/);
    const level = match ? Number.parseInt(match[1], 10) : 1;
    return headingLevels.includes(level as (typeof headingLevels)[number]);
  });

  // Build a map of allowed types to keys
  const allowedTypeToKeys = {
    ...restTypeToKeys,
    heading: filteredHeading,
  };

  // Only keep types that are allowed
  const filteredTypeToKeys = Object.fromEntries(
    Object.entries(allowedTypeToKeys).filter(([type]) => allowedTypes.includes(type as CustomBlockTypes)),
  );

  // Flatten the keys to filter baseItems
  const allowedKeys = Object.values(filteredTypeToKeys).flat();

  // Optional: sort by `customSlashIndexedItems`
  const sortOrder = new Map(
    customSlashIndexedItems
      .filter((type) => allowedTypes.includes(type))
      .flatMap((type, index) => filteredTypeToKeys[type].map((key) => [key, index])),
  );

  return baseItems
    .filter((item): item is DefaultSuggestionItem => 'key' in item && allowedKeys.includes(item.key as DefaultSuggestionItem['key']))
    .sort(({ key: first }, { key: second }) => {
      const aIndex = sortOrder.get(first) ?? Number.POSITIVE_INFINITY;
      const bIndex = sortOrder.get(second) ?? Number.POSITIVE_INFINITY;
      return aIndex - bIndex;
    });
};

/**
 *  Formatting toolbar configuration
 */
export const customFormattingToolBarConfig: CustomFormatToolBarConfig = {
  blockTypeSelect: false,
  blockStyleSelect: true,
  blockAlignSelect: false,
  textColorSelect: false,
  blockNestingSelect: false,
  fileCaption: true,
  openPreview: true,
  createLink: true,
};
