import { describe, expect, it } from 'vitest';
import { type SelectGenerationsOptions, selectGenerations } from './select-generations';
import type { ServiceRollout } from './stack/control-store';

const genIdFor = (sha: string) => `gen-${sha}`;
const base: SelectGenerationsOptions = { exclusive: false, genIdFor };

const entry = (over: Partial<ServiceRollout>): ServiceRollout => ({ seq: 1, ...over });

describe('selectGenerations', () => {
  it('deploys as an active + pending overlap for lb services', () => {
    const out = selectGenerations(entry({ active: { id: 'gen-old', sha: 'old', seq: 1 }, pendingSha: 'new' }), base);
    expect(out).toEqual([
      { id: 'gen-old', sha: 'old', preexisting: true },
      { id: 'gen-new', sha: 'new' },
    ]);
  });

  it('collapses an exclusive service to the pending generation during a deploy', () => {
    const out = selectGenerations(entry({ active: { id: 'gen-old', sha: 'old', seq: 1 }, pendingSha: 'new' }), { ...base, exclusive: true });
    expect(out).toEqual([{ id: 'gen-new', sha: 'new' }]);
  });

  it('keeps only the active generation between deploys', () => {
    const out = selectGenerations(entry({ active: { id: 'gen-new', sha: 'new', seq: 2 } }), base);
    expect(out).toEqual([{ id: 'gen-new', sha: 'new', preexisting: true }]);
  });

  it('falls back to a latest generation on first provision', () => {
    expect(selectGenerations(undefined, base)).toEqual([{ id: 'gen-latest', sha: 'latest' }]);
  });

  it("builds a stack's first generation from the release a deploy rolls out, which the rollout then finds in place", () => {
    const first = selectGenerations(undefined, { ...base, firstSha: 'abc123' });
    expect(first).toEqual([{ id: 'gen-abc123', sha: 'abc123' }]);
    expect(selectGenerations(entry({ pendingSha: 'abc123' }), { ...base, firstSha: 'abc123' })).toEqual(first);
  });

  it('equal active and pending ids collapse to one VM', () => {
    const out = selectGenerations(entry({ active: { id: 'gen-new', sha: 'new', seq: 2 }, pendingSha: 'new' }), base);
    expect(out).toEqual([{ id: 'gen-new', sha: 'new', preexisting: true }]);
  });
});
