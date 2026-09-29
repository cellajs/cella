import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { mapUpdate, readMap } from './helpers';

// Yjs merges nearly any update that decodes; a test marks a payload whose merge throws to reach the one-at-a-time path.
const unmergeable = new Set<Uint8Array>();
vi.mock('yjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('yjs')>();
  return {
    ...actual,
    mergeUpdates: (parts: Uint8Array[]) => {
      if (parts.some((part) => unmergeable.has(part))) throw new Error('does not merge');
      return actual.mergeUpdates(parts);
    },
  };
});

const { classifyUpdate, isIntegrable, mergeLog, mergeState } = await import('../sync/document-state');

const row = (id: number, payload: Uint8Array) => ({ id, payload, userId: `user-${id}` });

describe('mergeState', () => {
  it('returns null with nothing to merge and the single part unchanged', () => {
    expect(mergeState(null, [])).toBeNull();
    expect(mergeState(new Uint8Array(), [])).toBeNull();
    const only = mapUpdate('a', 1);
    expect(mergeState(null, [only])).toBe(only);
    expect(mergeState(only, [])).toBe(only);
  });

  it('merges base and log payloads, treating an empty base as absent', () => {
    const base = mapUpdate('base', true);
    const merged = mergeState(base, [mapUpdate('x', 1), mapUpdate('y', 2)])!;
    expect(readMap(merged)).toEqual({ base: true, x: 1, y: 2 });
    expect(readMap(mergeState(new Uint8Array(), [mapUpdate('x', 1)])!)).toEqual({ x: 1 });
  });

  it('keeps dependent updates from one client integrable when merged after the seed', () => {
    const doc = new Y.Doc();
    const text = doc.getText('t');
    const seedLike = mapUpdate('seed', true);
    const updates: Uint8Array[] = [];
    doc.on('update', (u: Uint8Array) => updates.push(u));
    text.insert(0, 'c');
    text.insert(0, 'b');
    text.insert(0, 'a');
    const merged = mergeState(seedLike, updates)!;
    const verify = new Y.Doc();
    Y.applyUpdate(verify, merged);
    expect(verify.getText('t').toString()).toBe('abc');
    expect(isIntegrable(merged)).toBe(true);
  });
});

describe('classifyUpdate', () => {
  it('is empty for the empty state of a fresh doc, an update for content or deletions', () => {
    expect(classifyUpdate(Y.encodeStateAsUpdate(new Y.Doc()))).toBe('empty');
    expect(classifyUpdate(mapUpdate('k', 1))).toBe('update');
    const doc = new Y.Doc();
    doc.getMap('data').set('k', 1);
    const before = Y.encodeStateVector(doc);
    doc.getMap('data').delete('k');
    expect(classifyUpdate(Y.encodeStateAsUpdate(doc, before))).toBe('update');
  });

  it('calls bytes Yjs cannot decode malformed, so they never reach the log', () => {
    expect(classifyUpdate(new Uint8Array([255, 255, 255]))).toBe('malformed');
    expect(classifyUpdate(new Uint8Array([1, 2, 3]))).toBe('malformed');
  });
});

describe('mergeLog', () => {
  it('must not let a row Yjs cannot decode block the rows around it', () => {
    const bad = row(2, new Uint8Array([1, 2, 3]));
    const { state, rejected } = mergeLog(mapUpdate('base', true), [
      row(1, mapUpdate('a', 1)),
      bad,
      row(3, mapUpdate('b', 2)),
    ]);
    expect(rejected).toEqual([bad]);
    expect(readMap(state!)).toEqual({ base: true, a: 1, b: 2 });
  });

  it('must not return a lone undecodable row as the document', () => {
    const bad = row(1, new Uint8Array([1, 2, 3]));
    expect(mergeLog(null, [bad])).toEqual({ state: null, rejected: [bad] });
  });

  it('must not let a row that decodes but will not merge block the rows around it', () => {
    const poison = row(2, mapUpdate('poison', true));
    unmergeable.add(poison.payload);
    try {
      const { state, rejected } = mergeLog(mapUpdate('base', true), [
        row(1, mapUpdate('a', 1)),
        poison,
        row(3, mapUpdate('b', 2)),
      ]);
      expect(rejected).toEqual([poison]);
      expect(readMap(state!)).toEqual({ base: true, a: 1, b: 2 });
    } finally {
      unmergeable.delete(poison.payload);
    }
  });

  it('merges every row in one call when all merge (positive control)', () => {
    const { state, rejected } = mergeLog(null, [row(1, mapUpdate('a', 1)), row(2, mapUpdate('b', 2))]);
    expect(rejected).toEqual([]);
    expect(readMap(state!)).toEqual({ a: 1, b: 2 });
  });
});

describe('isIntegrable', () => {
  it('is false when a later update is stored without the one it depends on', () => {
    const doc = new Y.Doc();
    const updates: Uint8Array[] = [];
    doc.on('update', (u: Uint8Array) => updates.push(u));
    doc.getText('t').insert(0, 'a');
    doc.getText('t').insert(1, 'b');
    expect(isIntegrable(updates[1])).toBe(false);
    expect(isIntegrable(Y.mergeUpdates(updates))).toBe(true);
  });
});
