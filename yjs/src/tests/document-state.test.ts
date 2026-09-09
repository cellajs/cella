import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { isEmptyUpdate, isIntegrable, mergeState } from '../sync/document-state';
import { mapUpdate, readMap } from './helpers';

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

describe('isEmptyUpdate', () => {
  it('is true for the empty state of a fresh doc and false for content or deletions', () => {
    expect(isEmptyUpdate(Y.encodeStateAsUpdate(new Y.Doc()))).toBe(true);
    expect(isEmptyUpdate(mapUpdate('k', 1))).toBe(false);
    const doc = new Y.Doc();
    doc.getMap('data').set('k', 1);
    const before = Y.encodeStateVector(doc);
    doc.getMap('data').delete('k');
    expect(isEmptyUpdate(Y.encodeStateAsUpdate(doc, before))).toBe(false);
  });

  it('treats unparseable bytes as non-empty so they still reach the log', () => {
    expect(isEmptyUpdate(new Uint8Array([255, 255, 255]))).toBe(false);
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
