import { BlockNoteSchema, createCodeBlockSpec, defaultStyleSpecs } from '@blocknote/core';
import { type CustomBlockType, codeBlockConfig } from 'shared/utils/blocknote-schema-configs';
import { checklistItemBlock } from '~/modules/common/blocknote/custom-elements/checklist/checklist-item-block';
import { mediaBlocks } from '~/modules/common/blocknote/custom-elements/media/media-blocks';
import { mentionInlineContent } from '~/modules/common/blocknote/custom-elements/mention/mention-inline-content';
import { notifyBlock } from '~/modules/common/blocknote/custom-elements/notify/notify-block';

// Drop color inline styles so pasted content cannot carry colors that render invisible against the app theme.
const { textColor: _textColor, backgroundColor: _backgroundColor, ...safeStyleSpecs } = defaultStyleSpecs;

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

/** The custom block types are those of the Yjs relay's schema (`CustomBlockType`), built from the same shared configs for Y.Doc round-tripping. */
export const customSchema = BlockNoteSchema.create({ styleSpecs: safeStyleSpecs }).extend({
  blockSpecs: {
    audio: mediaBlocks.audio(),
    file: mediaBlocks.file(),
    image: mediaBlocks.image(),
    video: mediaBlocks.video(),
    checklistItem: checklistItemBlock(),
    notify: notifyBlock(),
    codeBlock: withLanguageFallback(createCodeBlockSpec(codeBlockConfig)),
  } satisfies Record<CustomBlockType, unknown>,
  inlineContentSpecs: { mention: mentionInlineContent },
});
