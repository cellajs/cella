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
  TitleLevel,
} from '~/modules/common/blocknote/types';

// Drop color inline styles so pasted content cannot carry colors that render invisible against the app theme.
const { textColor: _textColor, backgroundColor: _backgroundColor, ...safeStyleSpecs } = defaultStyleSpecs;

/** Read a media block's stored intrinsic dimensions and user-resized width (all default 0 when unset). */
const readImageSize = (props: Record<string, unknown>) => ({
  width: typeof props.width === 'number' ? props.width : 0,
  height: typeof props.height === 'number' ? props.height : 0,
  previewWidth: typeof props.previewWidth === 'number' ? props.previewWidth : 0,
});

/** Reserve the aspect-ratio box so placeholder and loaded image share one box: editor fills its wrapper, static export applies previewWidth. */
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

/** Decorates the image spec without touching config/propSchema, which must stay in lockstep with the Yjs relay schema; stays a vanilla DOM block so the headless read-only editor can render it. */
const withImageBox = (spec: typeof defaultBlockSpecs.image) => {
  type Render = typeof spec.implementation.render;
  type ToExternalHTML = NonNullable<typeof spec.implementation.toExternalHTML>;
  // render/toExternalHTML read a `this` context (blockContentDOMAttributes, propSchema), so keep them methods and forward it.
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

// Block and inline configs are shared with the Yjs relay seeder (blocknote-seed.ts) and must stay in lockstep for Y.Doc round-tripping.
export const customSchema = BlockNoteSchema.create({ styleSpecs: safeStyleSpecs }).extend({
  blockSpecs: {
    audio: withAttachmentRef(defaultBlockSpecs.audio),
    file: withAttachmentRef(defaultBlockSpecs.file),
    image: withImageBox(withAttachmentRef(defaultBlockSpecs.image)),
    video: withAttachmentRef(defaultBlockSpecs.video),
    checklistItem: checklistItemBlock(),
    notify: notifyBlock(),
    codeBlock: createCodeBlockSpec(codeBlockConfig),
  },
  inlineContentSpecs: { mention: MentionSchema },
});

export const customBlockTypeSwitchItems: CustomBlockTypes[] = [
  'heading',
  'paragraph',
  'bulletListItem',
  'numberedListItem',
  'checklistItem',
];

export const getSideMenuItems = (dict: Dictionary) => [...blockTypeSelectItems(dict)];

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

export const getSlashMenuItems = (
  editor: CustomBlockNoteEditor,
  allowedTypes: CustomBlockTypes[],
  headingLevels: NonNullable<CommonBlockNoteProps['headingLevels']>,
  // Forced-title mode: levels at or above the title are reserved for block 0
  titleLevel?: TitleLevel,
): DefaultReactSuggestionItem[] => {
  const baseItems = [
    ...getDefaultReactSlashMenuItems(editor),
    getSlashNotifySlashItem(editor),
    getChecklistSlashItem(editor),
  ];

  const { heading, ...restTypeToKeys } = { ...baseBlockNoteTypeToKeys };
  const filteredHeading = heading.filter((key) => {
    const match = key.match(/(?:_)?(\d)$/);
    const level = match ? Number.parseInt(match[1], 10) : 1;
    if (titleLevel !== undefined && level <= titleLevel) return false;
    return headingLevels.includes(level as (typeof headingLevels)[number]);
  });

  const allowedTypeToKeys = {
    ...restTypeToKeys,
    heading: filteredHeading,
  };

  const filteredTypeToKeys = Object.fromEntries(
    Object.entries(allowedTypeToKeys).filter(([type]) => allowedTypes.includes(type as CustomBlockTypes)),
  );

  const allowedKeys: Set<string> = new Set(Object.values(filteredTypeToKeys).flat());

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
