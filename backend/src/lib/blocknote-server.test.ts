import type { Block } from '@blocknote/core';
import { describe, expect, it } from 'vitest';
import { blocksToHtml } from './blocknote-server';

const paragraph = (content: unknown[]) =>
  // Test mock: hand-written blocks for the custom schema, which `Block` (default schema) cannot type.
  ({ id: crypto.randomUUID(), type: 'paragraph', props: {}, content, children: [] }) as unknown as Block;

describe('blocksToHtml', () => {
  it('converts a paragraph that starts with a mention, keeping the id mention derivation reads', async () => {
    const html = await blocksToHtml([
      paragraph([
        { type: 'mention', props: { id: 'u1', slug: 'flip', name: 'Flip' } },
        { type: 'text', text: ' hello', styles: {} },
      ]),
    ]);
    expect(html).toContain('data-mention-id="u1"');
    expect(html).toContain('@ Flip');
    expect(html).toContain('hello');
  });

  it('converts custom blocks the default schema lacks', async () => {
    const html = await blocksToHtml([
      // Test mock: custom block type outside the default `Block` union.
      {
        id: crypto.randomUUID(),
        type: 'notify',
        props: { type: 'warning' },
        content: [{ type: 'text', text: 'Heads up', styles: {} }],
        children: [],
      } as unknown as Block,
    ]);
    expect(html).toContain('Heads up');
  });
});
