import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { descriptionToSeed, descriptionToUpdate, stateToBlocksJson, YJS_FRAGMENT_NAME } from './description-update';

const paragraph = (id: string, text: string) => ({
  id,
  type: 'paragraph',
  props: { backgroundColor: 'default', textColor: 'default', textAlignment: 'left' },
  content: text ? [{ type: 'text', text, styles: {} }] : [],
  children: [],
});

const description = (...blocks: object[]) => JSON.stringify(blocks);

/** The text of each top-level block a state holds. */
const texts = (state: Uint8Array) =>
  (JSON.parse(stateToBlocksJson(state)) as { content: { text?: string }[] }[]).map((block) => block.content.map((part) => part.text ?? '').join(''));

/** Top-level children of the editor's fragment: one block group for one document, two when two histories merged. */
const blockGroups = (state: Uint8Array) => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return doc.getXmlFragment(YJS_FRAGMENT_NAME).length;
};

const merge = (...updates: (Uint8Array | null)[]) => Y.mergeUpdates(updates.filter((update) => update !== null));

describe('descriptionToSeed', () => {
  it('seeds one empty paragraph in one block group for no description', () => {
    for (const none of [null, '', '[]']) {
      const seed = descriptionToSeed(none);
      expect(blockGroups(seed)).toBe(1);
      expect(JSON.parse(stateToBlocksJson(seed))).toMatchObject([{ type: 'paragraph', content: [] }]);
    }
  });

  it('round-trips blocks of the server schema, a mention and a checklist item included', () => {
    const blocks = [
      paragraph('p1', 'Hello'),
      {
        id: 'p2',
        type: 'paragraph',
        props: {},
        content: [{ type: 'mention', props: { id: 'user-1', name: 'Ada' } }],
        children: [],
      },
      { id: 'c1', type: 'checklistItem', props: { checked: true }, content: [{ type: 'text', text: 'Done', styles: {} }], children: [] },
    ];
    const restored = JSON.parse(stateToBlocksJson(descriptionToSeed(JSON.stringify(blocks))));
    expect(restored.map((block: { id: string; type: string }) => [block.id, block.type])).toEqual([
      ['p1', 'paragraph'],
      ['p2', 'paragraph'],
      ['c1', 'checklistItem'],
    ]);
    expect(restored[1].content[0]).toMatchObject({ type: 'mention', props: { id: 'user-1', name: 'Ada' } });
    expect(restored[2].props.checked).toBe(true);
  });

  it('must not seed a description the server schema cannot hold: it throws', () => {
    expect(() => descriptionToSeed(description({ id: 'x', type: 'no-such-block', props: {}, content: [], children: [] }))).toThrow();
    expect(() => descriptionToSeed('{"not":"an array"}')).toThrow();
    expect(() => descriptionToSeed('not json')).toThrow();
  });

  it('must not let two first writers on an empty seed create two block groups (D4)', () => {
    const seed = descriptionToSeed(null);
    const outside = descriptionToUpdate(seed, description(paragraph('a', 'from the outside write')));
    const client = descriptionToUpdate(seed, description(paragraph('b', 'typed by a client')));
    expect(blockGroups(merge(seed, outside, client))).toBe(1);
  });
});

describe('descriptionToUpdate', () => {
  const blocks = Array.from({ length: 20 }, (_, i) => paragraph(`b${i}`, `Paragraph ${i} `.repeat(8)));
  const base = descriptionToSeed(description(...blocks));

  it('diffs a changed block into a small update, and the merge reads back as the written description', () => {
    const written = blocks.map((block, i) => (i === 10 ? paragraph(block.id, 'Rewritten by the outside write') : block));
    const update = descriptionToUpdate(base, description(...written));
    expect(update).not.toBeNull();
    expect(update!.length).toBeLessThan(base.length / 10);
    expect(texts(merge(base, update))).toEqual(written.map((block) => block.content[0].text));
  });

  it('must not log an update for the description the document already holds', () => {
    expect(descriptionToUpdate(base, description(...blocks))).toBeNull();
    expect(descriptionToUpdate(descriptionToSeed(null), null)).toBeNull();
    expect(descriptionToUpdate(descriptionToSeed(null), '[]')).toBeNull();
  });

  it('must not drop an edit made concurrently in a block the write leaves as it is', () => {
    const two = [paragraph('one', 'Status: draft'), paragraph('two', 'Could you have a look?')];
    const seed = descriptionToSeed(description(...two));
    // A client types into the second block; the outside write, diffed against the same state, rewrites the first.
    const typed = descriptionToUpdate(seed, description(two[0], paragraph('two', 'Could you have a look? Again')));
    const written = descriptionToUpdate(seed, description(paragraph('one', 'Status: done'), two[1]));
    expect(texts(merge(seed, typed, written))).toEqual(['Status: done', 'Could you have a look? Again']);
    expect(texts(merge(seed, written, typed))).toEqual(['Status: done', 'Could you have a look? Again']);
  });

  it('builds the whole document from no state', () => {
    const update = descriptionToUpdate(null, description(paragraph('a', 'Fresh')));
    expect(texts(update!)).toEqual(['Fresh']);
    expect(blockGroups(update!)).toBe(1);
  });

  it('must not convert a description the server schema cannot hold: it throws (D9)', () => {
    expect(() => descriptionToUpdate(base, description({ id: 'x', type: 'no-such-block', props: {}, content: [], children: [] }))).toThrow();
    expect(() => descriptionToUpdate(base, '{"not":"an array"}')).toThrow();
    expect(() => descriptionToUpdate(base, 'not json')).toThrow();
  });
});

describe('stateToBlocksJson', () => {
  it('throws on a state Yjs cannot read', () => {
    expect(() => stateToBlocksJson(new Uint8Array([255, 255, 255]))).toThrow();
  });
});
