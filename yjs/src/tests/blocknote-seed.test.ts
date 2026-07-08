import { describe, expect, it } from 'vitest';
import { descriptionToYUpdate, yUpdateToBlocks } from '../lib/blocknote-seed';

const block = (type: string, props: Record<string, unknown> = {}, content?: unknown, children: unknown[] = []) => ({
  id: crypto.randomUUID(),
  type,
  props,
  ...(content !== undefined ? { content } : {}),
  children,
});

const text = (t: string) => [{ type: 'text', text: t, styles: {} }];

// Guards schema parity: every custom block/inline type the frontend editor supports
// must survive blocks → Y.Doc → blocks through the server schema.
describe('descriptionToYUpdate / yUpdateToBlocks round-trip', () => {
  it('round-trips default blocks (paragraph, heading, table-free basics)', () => {
    const blocks = [
      block('heading', { level: 2 }, text('Title')),
      block('paragraph', {}, text('Hello world')),
      block('bulletListItem', {}, text('Item')),
    ];
    const update = descriptionToYUpdate(JSON.stringify(blocks));
    expect(update).not.toBeNull();

    const restored = yUpdateToBlocks(update!);
    expect(restored.map((b) => b.type)).toEqual(['heading', 'paragraph', 'bulletListItem']);
    expect(restored[1].content).toMatchObject([{ type: 'text', text: 'Hello world' }]);
  });

  it('round-trips checklist items with checked state and nested children', () => {
    const blocks = [
      block('checklistItem', { checkboxId: 'cb-1', checked: true }, text('done'), [
        block('checklistItem', { checkboxId: 'cb-2', checked: false }, text('nested')),
      ]),
    ];
    const restored = yUpdateToBlocks(descriptionToYUpdate(JSON.stringify(blocks))!);

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
    const restored = yUpdateToBlocks(descriptionToYUpdate(JSON.stringify(blocks))!);

    expect(restored[0].type).toBe('notify');
    expect(restored[0].props).toMatchObject({ type: 'warning' });
    const inline = restored[1].content as Array<{ type: string; props?: Record<string, unknown> }>;
    expect(inline[0]).toMatchObject({ type: 'mention', props: { id: 'u1', slug: 'flip', name: 'Flip' } });
  });

  it('round-trips code blocks with language', () => {
    const blocks = [block('codeBlock', { language: 'typescript' }, text('const x = 1;'))];
    const restored = yUpdateToBlocks(descriptionToYUpdate(JSON.stringify(blocks))!);

    expect(restored[0].type).toBe('codeBlock');
    expect(restored[0].props).toMatchObject({ language: 'typescript' });
  });

  it('returns null for empty, invalid, or blank descriptions', () => {
    expect(descriptionToYUpdate(null)).toBeNull();
    expect(descriptionToYUpdate('')).toBeNull();
    expect(descriptionToYUpdate('[]')).toBeNull();
    expect(descriptionToYUpdate('not json')).toBeNull();
    expect(descriptionToYUpdate('{"not":"an array"}')).toBeNull();
  });
});
