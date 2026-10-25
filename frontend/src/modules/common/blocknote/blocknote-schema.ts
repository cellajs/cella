import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs, defaultStyleSpecs } from '@blocknote/core';
import type { DefaultSuggestionItem } from '@blocknote/core/extensions';
import { type BlockTypeSelectItem, blockTypeSelectItems, type DefaultReactSuggestionItem, getDefaultReactSlashMenuItems } from '@blocknote/react';
import i18n from 'i18next';
import { codeBlockConfig, withAttachmentRef } from 'shared/utils/blocknote-schema-configs';
import {
  getBlockPendingUpload,
  type PendingUpload,
  pendingUploadMessage,
  subscribePendingUploads,
} from '~/modules/attachment/helpers/pending-uploads';
import {
  checklistItemBlock,
  getChecklistSlashItem,
  getChecklistTypeItem,
} from '~/modules/common/blocknote/custom-elements/checklist/checklist-item-block';
import { mentionInlineContent } from '~/modules/common/blocknote/custom-elements/mention/mention-inline-content';
import { getNotifySlashItem, notifyBlock } from '~/modules/common/blocknote/custom-elements/notify/notify-block';
import { baseBlockNoteTypeToKeys } from '~/modules/common/blocknote/type-to-keys';
import type { CommonBlockNoteProps, CustomBlock, CustomBlockNoteEditor, CustomBlockTypes, SlashIndexedItems } from '~/modules/common/blocknote/types';

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

/** Decorates the image render only: propSchema stays in lockstep with the Yjs relay schema, and plain DOM lets the headless editor render it. */
const withImageBox = (spec: typeof defaultBlockSpecs.image) => {
  type Render = NonNullable<typeof spec.implementation.render>;
  type ToExternalHTML = NonNullable<typeof spec.implementation.toExternalHTML>;
  // render/toExternalHTML read a `this` context (blockContentDOMAttributes, propSchema), so keep them methods and forward it.
  const baseRender = spec.implementation.render as (...args: Parameters<Render>) => ReturnType<Render>;
  const baseToExternalHTML = spec.implementation.toExternalHTML as ((...args: Parameters<ToExternalHTML>) => ReturnType<ToExternalHTML>) | undefined;

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

const svgNamespace = 'http://www.w3.org/2000/svg';
const cloudOffPaths = [
  'M10.94 5.274A7 7 0 0 1 15.71 10h1.79a4.5 4.5 0 0 1 4.222 6.057',
  'M18.796 18.81A4.5 4.5 0 0 1 17.5 19H9A7 7 0 0 1 5.79 5.78',
  'm2 2 20 20',
];

/** Lucide's cloud-off icon as plain DOM, since media blocks render outside React. */
const cloudOffIcon = () => {
  const svg = document.createElementNS(svgNamespace, 'svg');
  // A size class, because `.bn-shadcn svg:not([class*="size-"])` reverts the size of any other icon.
  const attributes = {
    class: 'size-5 shrink-0',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.5',
    'stroke-linecap': 'round',
    'aria-hidden': 'true',
  };
  for (const [name, value] of Object.entries(attributes)) svg.setAttribute(name, value);
  for (const d of cloudOffPaths) {
    const path = document.createElementNS(svgNamespace, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
};

const pendingUploadPlaceholder = (pending: PendingUpload, props: Record<string, unknown>) => {
  const { key, params } = pendingUploadMessage(pending);
  const placeholder = document.createElement('div');
  placeholder.className = 'bn-pending-upload';
  placeholder.title = i18n.t('c:appears_once_uploaded');
  const label = document.createElement('span');
  label.textContent = i18n.t(key, params);
  placeholder.append(cloudOffIcon(), label);

  const { width, height, previewWidth } = readImageSize(props);
  if (width && height) placeholder.style.aspectRatio = `${width} / ${height}`;
  placeholder.style.width = previewWidth ? `${previewWidth}px` : '100%';
  return placeholder;
};

type MediaRenderResult = { dom: HTMLElement; destroy?: () => void };
type MediaRender = (
  this: unknown,
  block: { props: Record<string, unknown> },
  editor: { resolveFileUrl?: (url: string) => Promise<string> },
) => MediaRenderResult;

/**
 * Shows a placeholder for a media block whose file is still only on its uploader's device, and the file once it arrives.
 * The static render's resolved pass knows the block is pending before rendering; the editor finds out from its own
 * resolution. Render-only, like `withImageBox`, so the Yjs relay schema stays in lockstep.
 */
const withPendingUpload = <S extends { implementation: { render?: unknown } }>(spec: S): S => {
  const baseRender = spec.implementation.render as MediaRender;

  const render: MediaRender = function (this: unknown, block, editor) {
    const result = baseRender.call(this, block, editor);
    const known = getBlockPendingUpload(block.props);
    const url = typeof block.props.url === 'string' ? block.props.url : '';
    if (!editor.resolveFileUrl || !url) {
      if (known) result.dom.replaceChildren(pendingUploadPlaceholder(known, block.props));
      return result;
    }

    const resolveFileUrl = editor.resolveFileUrl;
    const media = Array.from(result.dom.childNodes);
    let unsubscribe: (() => void) | undefined;

    const showFile = () =>
      resolveFileUrl(url)
        .then((src) => {
          if (!src || getBlockPendingUpload(block.props)) return;
          unsubscribe?.();
          result.dom.replaceChildren(...media);
          const element = result.dom.querySelector<HTMLImageElement | HTMLMediaElement>('img, video, audio');
          if (element) element.src = src;
        })
        .catch(() => {});

    void resolveFileUrl(url)
      .then(() => {
        const pending = getBlockPendingUpload(block.props);
        if (!pending) return;
        result.dom.replaceChildren(pendingUploadPlaceholder(pending, block.props));
        unsubscribe ??= subscribePendingUploads(showFile);
      })
      .catch(() => {});

    return {
      ...result,
      destroy: () => {
        unsubscribe?.();
        result.destroy?.();
      },
    };
  };

  return { ...spec, implementation: { ...spec.implementation, render } } as S;
};

/** The `supportedLanguages` key a language id names by key or alias, matched as BlockNote matches a typed fence. */
const supportedLanguage = (language: string) => {
  const id = language.trim().toLowerCase();
  const entry = Object.entries(codeBlockConfig.supportedLanguages).find(([key, { aliases }]) => key === id || aliases.includes(id));
  return entry?.[0] ?? codeBlockConfig.defaultLanguage;
};

/**
 * A VS Code paste or a typed fence stores any language id, and a pasted Markdown or HTML fence stores its alias (`ts`). Outside the
 * `supportedLanguages` keys, BlockNote's language select throws and its highlighter logs an error on every update, so that block
 * renders and highlights as the language its alias names, else the default language, and keeps its stored prop.
 */
const withLanguageFallback = (spec: ReturnType<typeof createCodeBlockSpec>) => {
  type Render = NonNullable<typeof spec.implementation.render>;
  const baseRender = spec.implementation.render as (...args: Parameters<Render>) => ReturnType<Render>;
  const highlight: NonNullable<typeof spec.implementation.meta>['highlight'] = (block) => supportedLanguage(block.props.language);

  return {
    ...spec,
    implementation: {
      ...spec.implementation,
      meta: { ...spec.implementation.meta, highlight },
      render(this: unknown, block: Parameters<Render>[0], editor: Parameters<Render>[1]) {
        return baseRender.call(this, { ...block, props: { ...block.props, language: supportedLanguage(block.props.language) } }, editor);
      },
    },
  };
};

/** Block and inline configs are shared with the Yjs relay seeder (blocknote-seed.ts): they stay in lockstep for Y.Doc round-tripping. */
export const customSchema = BlockNoteSchema.create({ styleSpecs: safeStyleSpecs }).extend({
  blockSpecs: {
    audio: withPendingUpload(withAttachmentRef(defaultBlockSpecs.audio)),
    file: withPendingUpload(withAttachmentRef(defaultBlockSpecs.file)),
    image: withPendingUpload(withImageBox(withAttachmentRef(defaultBlockSpecs.image))),
    video: withPendingUpload(withAttachmentRef(defaultBlockSpecs.video)),
    checklistItem: checklistItemBlock(),
    notify: notifyBlock(),
    codeBlock: withLanguageFallback(createCodeBlockSpec(codeBlockConfig)),
  },
  inlineContentSpecs: { mention: mentionInlineContent },
});

const blockTypeSwitchTypes: CustomBlockTypes[] = ['heading', 'paragraph', 'bulletListItem', 'numberedListItem', 'checklistItem'];

/** The block types a block can switch to: the allowed switch types, with plain headings at `headingLevels` only. */
export const getBlockTypeItems = (
  editor: CustomBlockNoteEditor,
  allowedTypes: CustomBlockTypes[],
  headingLevels: NonNullable<CommonBlockNoteProps['headingLevels']>,
): BlockTypeSelectItem[] => {
  const switchTypes: readonly string[] = blockTypeSwitchTypes.filter((type) => allowedTypes.includes(type));
  return [...blockTypeSelectItems(editor), getChecklistTypeItem()].filter(
    ({ type, props }) =>
      switchTypes.includes(type) && (type !== 'heading' || (!props?.isToggleable && headingLevels.some((level) => level === props?.level))),
  );
};

/** Whether an item names the block's current type: its type, and each prop the item sets. */
export const isCurrentBlockType = (item: BlockTypeSelectItem, block: CustomBlock) => {
  const blockProps: Record<string, unknown> = block.props;
  return item.type === block.type && Object.entries(item.props ?? {}).every(([name, value]) => blockProps[name] === value);
};

/** The slash items a digit key picks, in order. */
export const customSlashIndexedItems: SlashIndexedItems = ['image', 'video', 'file', 'bulletListItem', 'numberedListItem', 'checklistItem', 'notify'];

export const getSlashMenuItems = (
  editor: CustomBlockNoteEditor,
  allowedTypes: CustomBlockTypes[],
  headingLevels: NonNullable<CommonBlockNoteProps['headingLevels']>,
): DefaultReactSuggestionItem[] => {
  const baseItems = [...getDefaultReactSlashMenuItems(editor), getNotifySlashItem(editor), getChecklistSlashItem(editor)];

  const { heading, ...restTypeToKeys } = baseBlockNoteTypeToKeys;
  const filteredHeading = heading.filter((key) => {
    const match = key.match(/(?:_)?(\d)$/);
    const level = match ? Number.parseInt(match[1], 10) : 1;
    return headingLevels.some((headingLevel) => headingLevel === level);
  });

  const allowedTypeToKeys = { ...restTypeToKeys, heading: filteredHeading };

  const filteredTypeToKeys = Object.fromEntries(allowedTypes.map((type) => [type, allowedTypeToKeys[type]]));

  const allowedKeys: Set<string> = new Set(Object.values(filteredTypeToKeys).flat());

  const sortOrder = new Map<string, number>(
    customSlashIndexedItems
      .filter((type) => allowedTypes.includes(type))
      .flatMap((type, index) => filteredTypeToKeys[type].map((key) => [key, index] as const)),
  );

  return baseItems
    .filter((item): item is DefaultSuggestionItem => 'key' in item && typeof item.key === 'string' && allowedKeys.has(item.key))
    .sort(({ key: first }, { key: second }) => {
      const firstIndex = sortOrder.get(first) ?? Number.POSITIVE_INFINITY;
      const secondIndex = sortOrder.get(second) ?? Number.POSITIVE_INFINITY;
      return firstIndex - secondIndex;
    });
};
