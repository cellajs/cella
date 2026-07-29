import { codeBlockOptions } from '@blocknote/code-block';
import {
  BlockNoteSchema,
  createCodeBlockSpec,
  type Dictionary,
  defaultBlockSpecs,
  defaultStyleSpecs,
} from '@blocknote/core';
import type { DefaultSuggestionItem } from '@blocknote/core/extensions';
import { blockTypeSelectItems, type DefaultReactSuggestionItem, getDefaultReactSlashMenuItems } from '@blocknote/react';
import { codeBlockConfig, withAttachmentRef } from 'shared/utils/blocknote-schema-configs';
import {
  checklistItemBlock,
  getChecklistSlashItem,
} from '~/modules/common/blocknote/custom-elements/checklist/checklist-item-block';
import { MentionSchema } from '~/modules/common/blocknote/custom-elements/mention/mention';
import { getSlashNotifySlashItem, notifyBlock } from '~/modules/common/blocknote/custom-elements/notify/notify-block';
import { baseBlockNoteTypeToKeys } from '~/modules/common/blocknote/type-to-keys';
import type {
  CommonBlockNoteProps,
  CustomBlockNoteEditor,
  CustomBlockTypes,
  CustomFormatToolBarConfig,
  SlashIndexedItems,
} from '~/modules/common/blocknote/types';

/**
 *  Basic Configuration
 */

// Drop the color inline styles so pasted content cannot carry hardcoded text/background
// colors that render invisible against the app theme. The toolbar already hides the color
// picker (textColorSelect: false), so only bold/italic/underline/strike/code stay reachable.
const { textColor: _textColor, backgroundColor: _backgroundColor, ...safeStyleSpecs } = defaultStyleSpecs;

/** Read a media block's stored intrinsic dimensions and user-resized width (all default 0 when unset). */
const readImageSize = (props: Record<string, unknown>) => ({
  width: typeof props.width === 'number' ? props.width : 0,
  height: typeof props.height === 'number' ? props.height : 0,
  previewWidth: typeof props.previewWidth === 'number' ? props.previewWidth : 0,
});

/**
 * Reserve the aspect-ratio box on the rendered img so the placeholder (styles.css) and the loaded
 * image are the same box: no reflow, no broken-image flash. The two display modes match the wrapper
 * width: fully-responsive (no resize) fills the container, static-responsive (previewWidth) keeps that
 * width and only shrinks to fit. In the editor the img fills its wrapper (width:100%); the static
 * read-only export has no wrapper, so a resized image applies its previewWidth directly. Unknown
 * dimensions leave the default output intact.
 */
const applyImageBox = (dom: HTMLElement | DocumentFragment, props: Record<string, unknown>, isStatic: boolean) => {
  const { width, height, previewWidth } = readImageSize(props);
  if (!width || !height) return;
  const img = dom instanceof HTMLImageElement ? dom : dom.querySelector('img');
  if (!img) return;
  img.style.aspectRatio = `${width} / ${height}`;
  img.style.width = isStatic && previewWidth ? `${previewWidth}px` : '100%';
  img.style.maxWidth = '100%';
  img.style.height = 'auto';
};

/**
 * Decorate BlockNote's default image spec to reserve the aspect-ratio box in both the live-editor
 * render and the static read-only export. The node spec (config/propSchema) is untouched, so it stays
 * in lockstep with the Yjs relay's server schema, and the vanilla (DOM) block renders in the core
 * headless editor used for read-only content, which a React block cannot.
 */
const withImageBox = (spec: typeof defaultBlockSpecs.image) => {
  type Render = typeof spec.implementation.render;
  type ToExternalHTML = NonNullable<typeof spec.implementation.toExternalHTML>;
  // BlockNote types render/toExternalHTML with a `this` context the underlying implementation reads
  // (blockContentDOMAttributes, propSchema); keep them methods and forward `this`.
  const baseRender = spec.implementation.render as (...args: Parameters<Render>) => ReturnType<Render>;
  const baseToExternalHTML = spec.implementation.toExternalHTML as
    | ((...args: Parameters<ToExternalHTML>) => ReturnType<ToExternalHTML>)
    | undefined;

  return {
    ...spec,
    implementation: {
      ...spec.implementation,
      render(this: unknown, ...args: Parameters<Render>) {
        const result = baseRender.apply(this, args);
        applyImageBox(result.dom, args[0].props, false);
        return result;
      },
      ...(baseToExternalHTML && {
        toExternalHTML(this: unknown, ...args: Parameters<ToExternalHTML>) {
          const result = baseToExternalHTML.apply(this, args);
          if (result) applyImageBox(result.dom, args[0].props, true);
          return result;
        },
      }),
    },
  };
};

// Base custom schema: block/inline configs are shared with the Yjs relay's
// server-side seeder (shared/blocknote-schema-configs); only renders live here.
/** Defines the BlockNote schema used by the editor. */
export const customSchema = BlockNoteSchema.create({ styleSpecs: safeStyleSpecs }).extend({
  blockSpecs: {
    // Media blocks gain the attachment entity reference; keep in lockstep with the
    // Yjs relay's server schema (blocknote-seed.ts) for Y.Doc round-tripping.
    audio: withAttachmentRef(defaultBlockSpecs.audio),
    file: withAttachmentRef(defaultBlockSpecs.file),
    // Decorate the vanilla image block to reserve the aspect-ratio box (placeholder + no reflow) in
    // both the editor and the read-only render, without changing the node spec.
    image: withImageBox(withAttachmentRef(defaultBlockSpecs.image)),
    video: withAttachmentRef(defaultBlockSpecs.video),
    checklistItem: checklistItemBlock(),
    notify: notifyBlock(), // Adds Notify block
    codeBlock: createCodeBlockSpec({
      ...codeBlockConfig,
      createHighlighter: codeBlockOptions.createHighlighter,
    }),
  },
  inlineContentSpecs: { mention: MentionSchema },
});

// Blocks to which can be switched by sidemenu btn or in formatting toolbar
/** Lists the custom block types available from the formatting toolbar. */
export const customBlockTypeSwitchItems: CustomBlockTypes[] = [
  'heading',
  'paragraph',
  'bulletListItem',
  'numberedListItem',
  'checklistItem',
];

/**
 *  Side Menu Configuration
 */
export const getSideMenuItems = (dict: Dictionary) => [...blockTypeSelectItems(dict)];

/**
 *  Slash Menu Configuration
 */

// Indexed items (max 9 for quick number-based selection)
export const customSlashIndexedItems: SlashIndexedItems = [
  'image',
  'video',
  'file',
  'bulletListItem',
  'numberedListItem',
  'checklistItem',
  'notify',
];

// Generate the complete Slash menu items list
/** Returns the slash menu items. */
export const getSlashMenuItems = (
  editor: CustomBlockNoteEditor,
  allowedTypes: CustomBlockTypes[],
  headingLevels: NonNullable<CommonBlockNoteProps['headingLevels']>,
): DefaultReactSuggestionItem[] => {
  const baseItems = [
    ...getDefaultReactSlashMenuItems(editor),
    getSlashNotifySlashItem(editor),
    getChecklistSlashItem(editor),
  ];

  // Filter heading keys based on allowed headingLevels
  const { heading, ...restTypeToKeys } = { ...baseBlockNoteTypeToKeys };
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
  const allowedKeys: Set<string> = new Set(Object.values(filteredTypeToKeys).flat());

  // Optional: sort by `customSlashIndexedItems`
  const sortOrder = new Map<string, number>(
    customSlashIndexedItems
      .filter((type) => allowedTypes.includes(type))
      .flatMap((type, index) => filteredTypeToKeys[type].map((key) => [key, index] as const)),
  );

  return baseItems
    .filter((item): item is DefaultSuggestionItem => 'key' in item && allowedKeys.has(item.key as string))
    .sort(({ key: first }, { key: second }) => {
      const aIndex = sortOrder.get(first) ?? Number.POSITIVE_INFINITY;
      const bIndex = sortOrder.get(second) ?? Number.POSITIVE_INFINITY;
      return aIndex - bIndex;
    });
};

/**
 *  Formatting toolbar Configuration
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
