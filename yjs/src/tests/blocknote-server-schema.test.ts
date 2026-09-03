import { ServerBlockNoteEditor } from '@blocknote/server-util';
import { serverBlockNoteSchema } from 'shared/utils/blocknote-server-schema';
import { describe, expect, it } from 'vitest';

const editor = ServerBlockNoteEditor.create({ schema: serverBlockNoteSchema });

// Server-side HTML conversion is what app summaries use; the default schema throws on custom nodes.
describe('serverBlockNoteSchema HTML conversion', () => {
  it('renders a mention as the data-mention-id span mention derivation reads', async () => {
    const html = await editor.blocksToHTMLLossy([
      {
        id: crypto.randomUUID(),
        type: 'paragraph',
        props: {},
        content: [
          { type: 'mention', props: { id: 'u1', slug: 'flip', name: 'Flip' } },
          { type: 'text', text: ' hello', styles: {} },
        ],
        children: [],
      },
    ]);
    expect(html).toContain('data-mention-id="u1"');
    expect(html).toContain('@ Flip');
    expect(html).toContain('hello');
  });

  it('renders custom inline-content blocks as containers with their text', async () => {
    const html = await editor.blocksToHTMLLossy([
      {
        id: crypto.randomUUID(),
        type: 'notify',
        props: { type: 'warning' },
        content: [{ type: 'text', text: 'Heads up', styles: {} }],
        children: [],
      },
    ]);
    expect(html).toContain('Heads up');
  });
});
