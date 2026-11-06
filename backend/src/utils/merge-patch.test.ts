import { describe, expect, it } from 'vitest';
import { applyMergePatch, type MergePatch } from '#/utils/merge-patch';

type Json = Record<string, unknown>;

/** The examples of RFC 7396 Appendix A whose target and patch are objects, the only ones an update sends. */
const appendixA: [target: Json, patch: MergePatch<Json>, result: Json][] = [
  [{ a: 'b' }, { a: 'c' }, { a: 'c' }],
  [{ a: 'b' }, { b: 'c' }, { a: 'b', b: 'c' }],
  [{ a: 'b' }, { a: null }, {}],
  [{ a: 'b', b: 'c' }, { a: null }, { b: 'c' }],
  [{ a: ['b'] }, { a: 'c' }, { a: 'c' }],
  [{ a: 'c' }, { a: ['b'] }, { a: ['b'] }],
  [{ a: { b: 'c' } }, { a: { b: 'd', c: null } }, { a: { b: 'd' } }],
  [{ a: [{ b: 'c' }] }, { a: [1] }, { a: [1] }],
  [{ e: null }, { a: 1 }, { e: null, a: 1 }],
  [{}, { a: { bb: { ccc: null } } }, { a: { bb: {} } }],
];

describe('applyMergePatch', () => {
  it.each(appendixA)('patches %j with %j into %j', (target, patch, result) => {
    expect(applyMergePatch(target, patch)).toEqual(result);
  });

  it('leaves the stored value as it was', () => {
    const target = { a: { b: 'c' } };
    applyMergePatch(target, { a: { b: null } });
    expect(target).toEqual({ a: { b: 'c' } });
  });
});
