// @vitest-environment jsdom
import { BlockNoteEditor } from '@blocknote/core';
import { afterEach, describe, expect, it } from 'vitest';
import { customSchema } from '~/modules/common/blocknote/blocknote-schema';
import { checkedExtension } from '~/modules/common/blocknote/custom-elements/checklist/checklist-extension';

const mounted: { unmount: () => void }[] = [];

/** Mounts an editor holding one paragraph with the cursor at its end; input rules and keymaps need a view. */
const mountWithParagraph = (content: string) => {
  const editor = BlockNoteEditor.create({ schema: customSchema, extensions: [checkedExtension()] });
  mounted.push(editor);
  editor.mount(document.createElement('div'));
  editor.replaceBlocks(editor.document, [{ type: 'paragraph', content }]);
  editor.setTextCursorPosition(editor.document[0], 'end');
  return editor;
};

/** Types a space after `before`, the way a keystroke reaches the input rules. */
const typeSpaceAfter = (before: string) => {
  const editor = mountWithParagraph(before);
  const view = editor.prosemirrorView;
  const { from, to } = view.state.selection;
  const insert = () => view.state.tr.insertText(' ', from, to);
  view.someProp('handleTextInput', (handle) => handle(view, from, to, ' ', insert));
  return editor.document[0];
};

afterEach(() => {
  for (const editor of mounted.splice(0)) editor.unmount();
});

describe('checklist input rules', () => {
  it('turns "[ ] " into an unchecked checklist item', () => {
    const block = typeSpaceAfter('[ ]');
    expect(block.type).toBe('checklistItem');
    expect(block.props).toMatchObject({ checked: false });
    expect((block.props as { checkboxId?: string }).checkboxId).toBeTruthy();
  });

  it.each(['[x]', '[X]'])('turns "%s " into a checked checklist item', (before) => {
    const block = typeSpaceAfter(before);
    expect(block.type).toBe('checklistItem');
    expect(block.props).toMatchObject({ checked: true });
  });

  it('converts the current block with Mod-Shift-9', () => {
    const editor = mountWithParagraph('todo');
    const view = editor.prosemirrorView;
    // jsdom reports a non-Mac platform, so Mod resolves to Ctrl.
    const event = new KeyboardEvent('keydown', { key: '9', ctrlKey: true, shiftKey: true });
    view.someProp('handleKeyDown', (handle) => handle(view, event));

    expect(editor.document[0].type).toBe('checklistItem');
    expect(JSON.stringify(editor.document[0].content)).toContain('todo');
  });
});
