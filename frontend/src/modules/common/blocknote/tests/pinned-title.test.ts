// @vitest-environment jsdom
import { BlockNoteEditor } from '@blocknote/core';
import type { ComputeDropPositionContext } from '@blocknote/core/extensions';
import { afterEach, describe, expect, it } from 'vitest';
import { customSchema } from '~/modules/common/blocknote/blocknote-schema';
import { pinnedTitleDropPosition, pinnedTitleExtension } from '~/modules/common/blocknote/custom-elements/pinned-title/pinned-title-extension';

/**
 * Every editor is unmounted after its test. A mounted view holds a 20 ms ProseMirror flush timer, and one that
 * fires after jsdom is torn down throws `document is not defined`, which fails the run though every test passed.
 */
const mounted: Pick<BlockNoteEditor, 'unmount'>[] = [];
afterEach(() => {
  for (const editor of mounted.splice(0)) editor.unmount();
});

const createEditor = () => {
  const editor = BlockNoteEditor.create({
    schema: customSchema,
    extensions: [pinnedTitleExtension()],
    initialContent: [
      { id: 'title', type: 'heading', props: { level: 1 }, content: 'Title' },
      { id: 'one', type: 'paragraph', content: 'One' },
      { id: 'two', type: 'paragraph', content: 'Two' },
    ],
  });
  editor.mount(document.createElement('div'));
  mounted.push(editor);
  return editor;
};

const order = (editor: ReturnType<typeof createEditor>) => editor.document.map((block) => block.id);

describe('pinnedTitleExtension', () => {
  it('refuses moving the title down', () => {
    const editor = createEditor();
    editor.setTextCursorPosition('title');
    editor.moveBlocksDown();
    expect(order(editor)).toEqual(['title', 'one', 'two']);
  });

  it('refuses moving a block up above the title', () => {
    const editor = createEditor();
    editor.setTextCursorPosition('one');
    editor.moveBlocksUp();
    expect(order(editor)).toEqual(['title', 'one', 'two']);
  });

  it('refuses inserting a block above the title', () => {
    const editor = createEditor();
    editor.insertBlocks([{ id: 'new', type: 'paragraph', content: 'New' }], 'title', 'before');
    expect(order(editor)).toEqual(['title', 'one', 'two']);
  });

  it('allows moves and inserts below the title', () => {
    const editor = createEditor();
    editor.setTextCursorPosition('two');
    editor.moveBlocksUp();
    editor.insertBlocks([{ id: 'new', type: 'paragraph', content: 'New' }], 'title', 'after');
    expect(order(editor)).toEqual(['title', 'new', 'two', 'one']);
  });

  it('allows deleting or replacing the title, so the document can still be cleared', () => {
    const editor = createEditor();
    editor.removeBlocks(['title']);
    expect(order(editor)).toEqual(['one', 'two']);

    const replaced = createEditor();
    replaced.replaceBlocks(replaced.document, [{ id: 'pasted', type: 'paragraph', content: 'Pasted' }]);
    expect(order(replaced)).toEqual(['pasted']);
  });

  it('allows editing the title text', () => {
    const editor = createEditor();
    editor.updateBlock('title', { content: 'Renamed' });
    expect(editor.document[0].content).toMatchObject([{ text: 'Renamed' }]);
  });

  it('applies remote Yjs steps even when they displace the title', () => {
    const editor = createEditor();
    const view = editor.prosemirrorView;
    const titleNode = view.state.doc.firstChild?.firstChild;
    if (!titleNode) throw new Error('no title block');
    const tr = view.state.tr.delete(1, 1 + titleNode.nodeSize);
    tr.insert(tr.doc.firstChild?.content.size ?? 0, titleNode);
    view.dispatch(tr.setMeta('y-sync$', { isChangeOrigin: true }));
    expect(order(editor)).toEqual(['one', 'two', 'title']);
  });
});

describe('pinnedTitleDropPosition', () => {
  const at = (pos: number, orientation: 'block-horizontal' | 'inline') =>
    pinnedTitleDropPosition({ defaultPosition: { pos, orientation } } as ComputeDropPositionContext);

  it('hides the drop cursor above the title', () => {
    expect(at(1, 'block-horizontal')).toBeNull();
  });

  it('keeps block drops below the title and inline drops into it', () => {
    expect(at(12, 'block-horizontal')).toEqual({ pos: 12, orientation: 'block-horizontal' });
    expect(at(1, 'inline')).toEqual({ pos: 1, orientation: 'inline' });
  });
});
