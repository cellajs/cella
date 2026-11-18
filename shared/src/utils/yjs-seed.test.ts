import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { z } from 'zod';
import { yjsFragmentName } from './yjs-protocol.ts';
import { buildYjsSeed, descriptionOf, mergeBlocks, rebaseSeedEdits } from './yjs-seed.ts';

const task = { entityType: 'attachment', entityId: '01a1d1af-fc16-7b55-a2ea-9ce5ed130841' } as const;
const otherTask = { ...task, entityId: '01a1d1af-fc16-7b55-a2ea-9ce5ed130842' };

const paragraph = (id: string, text: string) => ({ id, type: 'paragraph', props: {}, content: [{ type: 'text', text, styles: {} }], children: [] });
const description = (...texts: string[]) => JSON.stringify(texts.map((text, i) => paragraph(`b${i}`, text)));

const docOf = (...updates: Uint8Array[]) => {
  const doc = new Y.Doc();
  for (const update of updates) Y.applyUpdate(doc, update);
  return doc;
};
const clientsOf = (state: Uint8Array) => [...Y.decodeStateVector(Y.encodeStateVectorFromUpdate(state)).keys()];

describe('buildYjsSeed', () => {
  it('builds the same bytes and generation for the same entity and description, as the server and an offline client must', () => {
    const a = buildYjsSeed(task, description('Hello', 'World'));
    const b = buildYjsSeed(task, description('Hello', 'World'));
    expect(Buffer.from(a.state).equals(Buffer.from(b.state))).toBe(true);
    expect(a.generation).toBe(b.generation);
  });

  it('names a seed with a UUID the generation column and its schemas take', () => {
    expect(z.uuid().safeParse(buildYjsSeed(task, description('Hello')).generation).success).toBe(true);
    expect(z.uuid().safeParse(buildYjsSeed(task, null).generation).success).toBe(true);
  });

  it('must not give two entities or two descriptions one generation, nor one Yjs client id', () => {
    const seed = buildYjsSeed(task, description('Hello'));
    const otherEntity = buildYjsSeed(otherTask, description('Hello'));
    const otherText = buildYjsSeed(task, description('Hello!'));
    expect(new Set([seed.generation, otherEntity.generation, otherText.generation]).size).toBe(3);
    // A shared client id with other content would make Yjs take one history's items for the other's.
    expect(new Set([...clientsOf(seed.state), ...clientsOf(otherEntity.state), ...clientsOf(otherText.state)]).size).toBe(3);
  });

  it('writes the seed under one client id other than 0, and no editor ever edits under it', () => {
    const [clientId, ...rest] = clientsOf(buildYjsSeed(task, description('Hello')).state);
    expect(rest).toEqual([]);
    expect(clientId).not.toBe(0);
  });

  it('seeds no description, an empty one and [] alike, as one empty paragraph', () => {
    const generations = [null, '', '[]'].map((none) => buildYjsSeed(task, none).generation);
    expect(new Set(generations).size).toBe(1);
    expect(docOf(buildYjsSeed(task, null).state).getXmlFragment(yjsFragmentName).length).toBe(1);
  });

  it('merges two seeds of one generation as one history: one block group, and edits on either side both kept', () => {
    const server = docOf(buildYjsSeed(task, description('Server text', 'Second')).state);
    const client = docOf(buildYjsSeed(task, description('Server text', 'Second')).state);
    const textOf = (doc: Y.Doc, block: number) => {
      const group = doc.getXmlFragment(yjsFragmentName).get(0) as Y.XmlElement;
      const container = group.get(block) as Y.XmlElement;
      return (container.get(0) as Y.XmlElement).get(0) as Y.XmlText;
    };
    textOf(server, 0).insert(0, 'S: ');
    textOf(client, 1).insert(0, 'C: ');
    Y.applyUpdate(server, Y.encodeStateAsUpdate(client));
    Y.applyUpdate(client, Y.encodeStateAsUpdate(server));

    expect(server.getXmlFragment(yjsFragmentName).length).toBe(1);
    expect(textOf(server, 0).toString()).toBe('S: Server text');
    expect(textOf(server, 1).toString()).toBe('C: Second');
    expect(Buffer.from(Y.encodeStateVector(server)).equals(Buffer.from(Y.encodeStateVector(client)))).toBe(true);
  });

  it('must not seed a description the server schema cannot hold: it throws, as the relay refuses it', () => {
    expect(() => buildYjsSeed(task, JSON.stringify([{ id: 'x', type: 'no-such-block', props: {}, content: [], children: [] }]))).toThrow();
    expect(() => buildYjsSeed(task, '{"not":"an array"}')).toThrow();
    expect(() => buildYjsSeed(task, 'not json')).toThrow();
  });
});

describe('mergeBlocks', () => {
  const block = (id: string, text = id) => ({ id, text });
  const ids = (blocks: { id: string; text: string }[] | null) => blocks?.map(({ id, text }) => (text === id ? id : `${id}:${text}`)) ?? null;
  const a = block('a');
  const b = block('b');
  const c = block('c');

  it.each([
    ['local unchanged: the server stays', [a, b], [a, b], [a, block('b', 'B')], ['a', 'b:B']],
    ['server unchanged: local wins whole, a reorder included', [a, b, c], [c, a, block('b', 'B')], [a, b, c], ['c', 'a', 'b:B']],
    ['each side changed another block', [a, b], [block('a', 'A'), b], [a, block('b', 'B')], ['a:A', 'b:B']],
    ['both changed one block alike', [a, b], [block('a', 'A'), b], [block('a', 'A'), block('b', 'B')], ['a:A', 'b:B']],
    ['both changed one block otherwise: conflict', [a, b], [block('a', 'A'), b], [block('a', 'X'), b], null],
    ['local removed a block the server left', [a, b, c], [a, c], [a, b, block('c', 'C')], ['a', 'c:C']],
    ['local removed a block the server changed: conflict', [a, b], [a], [a, block('b', 'B')], null],
    ['local changed a block the server removed: conflict', [a, b], [a, block('b', 'B')], [a], null],
    ['local added a block: after its nearest kept neighbour', [a, b], [a, block('n'), b], [block('z'), a, block('b', 'B')], ['z', 'a', 'n', 'b:B']],
    ['local added a first block: at the start', [a, b], [block('n'), a, b], [a, block('b', 'B')], ['n', 'a', 'b:B']],
    ['local reordered while the server changed: conflict', [a, b], [b, a], [a, block('b', 'B')], null],
  ])('%s', (_case, base, local, server, expected) => {
    expect(ids(mergeBlocks(base, local, server))).toEqual(expected);
  });
});

describe('rebaseSeedEdits', () => {
  const textsOf = (doc: Y.Doc) =>
    (JSON.parse(descriptionOf(doc)) as { content: { text: string }[] }[]).map((block) => block.content.map(({ text }) => text).join(''));

  /** A device seeds offline from the text it cached, edits a block, and the server document is another generation. */
  const offlineEdit = (cached: string, edit: (doc: Y.Doc) => void) => {
    const local = docOf(buildYjsSeed(task, cached).state);
    edit(local);
    return local;
  };
  const appendTo = (index: number, text: string) => (doc: Y.Doc) => {
    const group = doc.getXmlFragment(yjsFragmentName).get(0) as Y.XmlElement;
    const paragraphElement = (group.get(index) as Y.XmlElement).get(0) as Y.XmlElement;
    const yText = paragraphElement.get(0) as Y.XmlText;
    yText.insert(yText.length, text);
  };

  it('saves an offline edit when the server document was seeded from an older text, as every edited task is', () => {
    // The server seeded 'Original' and was edited to 'Edited' since; the device cached 'Edited' and seeded that.
    const server = docOf(buildYjsSeed(task, description('Original', 'Second')).state);
    server.transact(() => {
      const group = server.getXmlFragment(yjsFragmentName).get(0) as Y.XmlElement;
      const yText = ((group.get(0) as Y.XmlElement).get(0) as Y.XmlElement).get(0) as Y.XmlText;
      yText.delete(0, yText.length);
      yText.insert(0, 'Edited');
    });
    const cached = descriptionOf(server);
    const local = offlineEdit(cached, appendTo(1, ' offline'));

    expect(buildYjsSeed(task, cached).generation).not.toBe(buildYjsSeed(task, description('Original', 'Second')).generation);
    expect(rebaseSeedEdits(cached, local, server)).toBe(true);
    expect(textsOf(server)).toEqual(['Edited', 'Second offline']);
  });

  it('keeps a colleague edit to another block made while the device was offline', () => {
    const cached = description('First', 'Second');
    const server = docOf(buildYjsSeed(otherTask, cached).state);
    appendTo(0, ' colleague')(server);
    const local = offlineEdit(cached, appendTo(1, ' offline'));

    expect(rebaseSeedEdits(cached, local, server)).toBe(true);
    expect(textsOf(server)).toEqual(['First colleague', 'Second offline']);
  });

  it('must not write over a block the server changed too: it refuses and leaves the server document as it was', () => {
    const cached = description('First', 'Second');
    const server = docOf(buildYjsSeed(otherTask, cached).state);
    appendTo(1, ' colleague')(server);
    const before = Y.encodeStateVector(server);
    const local = offlineEdit(cached, appendTo(1, ' offline'));

    expect(rebaseSeedEdits(cached, local, server)).toBe(false);
    expect(Buffer.from(Y.encodeStateVector(server)).equals(Buffer.from(before))).toBe(true);
  });
});
