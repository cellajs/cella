import { describe, expect, it } from 'vitest';
import { descriptionToSeed, stateToBlocksJson } from '#/modules/yjs/helpers/description-update';

/** Blocks → the seed the relay stores → blocks, as materialization reads them. */
const roundTrip = (blocks: unknown[]) =>
  JSON.parse(stateToBlocksJson(descriptionToSeed(JSON.stringify(blocks)))) as {
    type: string;
    props: Record<string, unknown>;
    content: unknown;
    children: { type: string; props: Record<string, unknown> }[];
  }[];

const block = (type: string, props: Record<string, unknown> = {}, content?: unknown, children: unknown[] = []) => ({
  id: crypto.randomUUID(),
  type,
  props,
  ...(content !== undefined ? { content } : {}),
  children,
});

const text = (t: string) => [{ type: 'text', text: t, styles: {} }];

// Guards schema parity: every custom block/inline type the frontend editor supports
// must survive blocks → Y.Doc → blocks through the server schema, headless.
describe('seed and materialize round-trip', () => {
  it('round-trips default blocks (paragraph, heading, table-free basics)', () => {
    const blocks = [
      block('heading', { level: 2 }, text('Title')),
      block('paragraph', {}, text('Hello world')),
      block('bulletListItem', {}, text('Item')),
    ];
    const restored = roundTrip(blocks);
    expect(restored.map((b) => b.type)).toEqual(['heading', 'paragraph', 'bulletListItem']);
    expect(restored[1].content).toMatchObject([{ type: 'text', text: 'Hello world' }]);
  });

  it('round-trips media blocks with the attachmentId reference prop', () => {
    const blocks = [
      block('image', { url: 'att-uuid-1', attachmentId: 'att-uuid-1', name: 'photo.png' }),
      block('file', { url: 'seed/doc.pdf', attachmentId: 'att-uuid-2', name: 'doc.pdf' }),
      // External media without an attachment row keeps the empty default
      block('video', { url: 'https://example.com/clip.mp4', name: 'clip' }),
    ];
    const restored = roundTrip(blocks);

    expect(restored[0].props).toMatchObject({ attachmentId: 'att-uuid-1', url: 'att-uuid-1' });
    expect(restored[1].props).toMatchObject({ attachmentId: 'att-uuid-2' });
    expect(restored[2].props).toMatchObject({ attachmentId: '' });
  });

  it('round-trips checklist items with checked state and nested children', () => {
    const blocks = [
      block('checklistItem', { checkboxId: 'cb-1', checked: true }, text('done'), [
        block('checklistItem', { checkboxId: 'cb-2', checked: false }, text('nested')),
      ]),
    ];
    const restored = roundTrip(blocks);

    expect(restored[0].type).toBe('checklistItem');
    expect(restored[0].props).toMatchObject({ checkboxId: 'cb-1', checked: true });
    expect(restored[0].children[0].type).toBe('checklistItem');
    expect(restored[0].children[0].props).toMatchObject({ checkboxId: 'cb-2', checked: false });
  });

  it('round-trips notify blocks and mention inline content', () => {
    const blocks = [
      block('notify', { type: 'warning' }, text('Heads up')),
      block('paragraph', {}, [
        { type: 'mention', props: { id: 'u1', slug: 'flip', name: 'Flip' }, content: undefined },
        { type: 'text', text: ' hello', styles: {} },
      ]),
    ];
    const restored = roundTrip(blocks);

    expect(restored[0].type).toBe('notify');
    expect(restored[0].props).toMatchObject({ type: 'warning' });
    const inline = restored[1].content as Array<{ type: string; props?: Record<string, unknown> }>;
    expect(inline[0]).toMatchObject({ type: 'mention', props: { id: 'u1', slug: 'flip', name: 'Flip' } });
  });

  it('round-trips code blocks with language', () => {
    const blocks = [block('codeBlock', { language: 'typescript' }, text('const x = 1;'))];
    const restored = roundTrip(blocks);

    expect(restored[0].type).toBe('codeBlock');
    expect(restored[0].props).toMatchObject({ language: 'typescript' });
  });

  it('seeds one empty paragraph for no description, and throws on one that is not a blocks array', () => {
    for (const description of [null, '', '[]']) {
      expect(JSON.parse(stateToBlocksJson(descriptionToSeed(description))).map((b: { type: string }) => b.type)).toEqual(['paragraph']);
    }
    // The relay logs these and seeds the empty document.
    expect(() => descriptionToSeed('not json')).toThrow();
    expect(() => descriptionToSeed('{"not":"an array"}')).toThrow();
  });
});
