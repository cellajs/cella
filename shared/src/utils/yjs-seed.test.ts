import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { z } from 'zod';
import { yjsFragmentName } from './yjs-protocol.ts';
import { buildYjsSeed } from './yjs-seed.ts';

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
