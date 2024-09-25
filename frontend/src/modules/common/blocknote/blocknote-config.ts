import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs } from '@blocknote/core';
import { Mention } from '~/modules/common/blocknote/mention';
import { Notify } from '~/modules/common/blocknote/notify';

export const customSchema = BlockNoteSchema.create({
  blockSpecs: {
    // Adds all default blocks.
    ...defaultBlockSpecs,
    // Adds the Notify block.
    notify: Notify,
  },
  inlineContentSpecs: {
    // Adds all default inline content.
    ...defaultInlineContentSpecs,
    // Adds the mention tag.
    mention: Mention,
  },
});

export type CustomBlockNoteSchema = typeof customSchema.BlockNoteEditor;
