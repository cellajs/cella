import { BlockNoteEditor } from '@blocknote/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { customSchema } from '~/modules/common/blocknote/blocknote-config';
import { checkedExtension } from '~/modules/common/blocknote/custom-elements/checklist/checklist-extension';
import { handleChecklistItemEnter } from '~/modules/common/blocknote/custom-elements/checklist/checklist-item-block';

const makeEditor = () =>
  BlockNoteEditor.create({ schema: customSchema, _headless: true, extensions: [checkedExtension()] });

describe('handleChecklistItemEnter', () => {
  // The handler defers caret placement with setTimeout; fake timers keep that deferred DOM-only work
  // (irrelevant to these document-structure assertions) from running against a torn-down headless editor.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('splits a non-empty checklist item into two items with distinct checkboxIds', () => {
    const editor = makeEditor();
    editor.replaceBlocks(editor.document, [
      { type: 'checklistItem', props: { checkboxId: 'first' }, content: 'hello' },
    ]);
    editor.setTextCursorPosition(editor.document[0], 'end');

    const handled = handleChecklistItemEnter(editor);

    expect(handled).toBe(true);
    const blocks = editor.document;
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('checklistItem');
    expect(blocks[1].type).toBe('checklistItem');
    expect(JSON.stringify(blocks[0].content)).toContain('hello');
    expect(JSON.stringify(blocks[1].content)).toBe('[]');
    // The new item must not reuse the original checkboxId.
    const ids = blocks.map((b) => (b.props as { checkboxId?: string }).checkboxId);
    expect(ids[1]).toBeTruthy();
    expect(ids[1]).not.toBe(ids[0]);
  });

  it('converts an empty checklist item into a paragraph', () => {
    const editor = makeEditor();
    editor.replaceBlocks(editor.document, [{ type: 'checklistItem', props: { checkboxId: 'x' } }]);
    editor.setTextCursorPosition(editor.document[0], 'start');

    const handled = handleChecklistItemEnter(editor);

    expect(handled).toBe(true);
    expect(editor.document).toHaveLength(1);
    expect(editor.document[0].type).toBe('paragraph');
  });

  it('ignores Enter when the cursor is not in a checklist item', () => {
    const editor = makeEditor();
    editor.replaceBlocks(editor.document, [{ type: 'paragraph', content: 'plain' }]);
    editor.setTextCursorPosition(editor.document[0], 'end');

    expect(handleChecklistItemEnter(editor)).toBe(false);
  });
});
