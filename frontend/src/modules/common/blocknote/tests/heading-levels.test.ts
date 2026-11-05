// @vitest-environment jsdom
import { BlockNoteEditor } from '@blocknote/core';
import { afterEach, describe, expect, it } from 'vitest';
import { customSchema } from '~/modules/common/blocknote/blocknote-schema';
import { headingLevelsExtension } from '~/modules/common/blocknote/custom-elements/heading-levels/heading-levels-extension';

// jsdom has no ClipboardEvent, which ProseMirror's pasteHTML creates
if (!('ClipboardEvent' in globalThis)) Object.assign(globalThis, { ClipboardEvent: class extends Event {} });

const mounted: { unmount: () => void }[] = [];

const mount = () => {
  const editor = BlockNoteEditor.create({
    schema: customSchema,
    initialContent: [
      { id: 'legacy', type: 'heading', props: { level: 1 }, content: 'Legacy' },
      { id: 'text', type: 'paragraph', content: 'Text' },
      { id: 'empty', type: 'paragraph' },
    ],
    extensions: [headingLevelsExtension({ levels: [2, 3] })],
  });
  const element = document.createElement('div');
  document.body.appendChild(element);
  editor.mount(element);
  mounted.push(editor);
  return editor;
};

const text = (block: { content?: unknown }) => (Array.isArray(block.content) ? block.content.map((part) => part.text).join('') : '');

const headings = (editor: ReturnType<typeof mount>) =>
  editor.document.filter((block) => block.type === 'heading').map((block) => [text(block), block.props.level]);

describe('heading levels', () => {
  afterEach(() => {
    for (const editor of mounted.splice(0)) editor.unmount();
    document.body.replaceChildren();
  });

  it('moves a pasted heading to the nearest allowed level', () => {
    const editor = mount();
    editor.setTextCursorPosition('empty', 'end');
    editor.pasteHTML('<h1>Big</h1><h5>Small</h5>');

    expect(headings(editor)).toEqual([
      ['Legacy', 1],
      ['Big', 2],
      ['Small', 3],
    ]);
  });

  it('moves a block turned into an h1, as the # shortcut and Mod-Alt-1 do', () => {
    const editor = mount();
    editor.updateBlock('text', { type: 'heading', props: { level: 1 } });
    expect(editor.getBlock('text')?.props).toMatchObject({ level: 2 });
  });

  it('leaves a heading already outside the levels as it is while its text is edited', () => {
    const editor = mount();
    editor.setTextCursorPosition('legacy', 'end');
    editor.insertInlineContent('!');
    expect(text(editor.getBlock('legacy') ?? {})).toBe('Legacy!');
    expect(editor.getBlock('legacy')?.props).toMatchObject({ level: 1 });
  });

  it('leaves a remote Yjs change as it is', () => {
    const editor = mount();
    editor.transact((tr) => {
      tr.setMeta('y-sync$', { isChangeOrigin: true });
      editor.updateBlock('text', { type: 'heading', props: { level: 1 } });
    });
    expect(headings(editor)).toEqual([
      ['Legacy', 1],
      ['Text', 1],
    ]);
  });
});
