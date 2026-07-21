import { describe, expect, it, vi } from 'vitest';
import { buildPreparedHandlers, COALESCED, type PreparedVars } from '../prepared-mutation';

type Vars = { id: string; value: number };

function fakeMutation() {
  return {
    mutate: vi.fn((_vars: Vars, _opts?: unknown) => {}),
    mutateAsync: vi.fn(async (vars: Vars, _opts?: unknown) => ({ ok: vars.id })),
  };
}

describe('buildPreparedHandlers', () => {
  it('run: mutate issues the prepared vars', () => {
    const mutation = fakeMutation();
    const { mutate } = buildPreparedHandlers<{ ok: string }, Vars, string>(mutation, (id) => ({
      kind: 'run',
      vars: { id, value: 1 },
    }));

    mutate('a');
    expect(mutation.mutate).toHaveBeenCalledWith({ id: 'a', value: 1 }, undefined);
  });

  it('run: mutateAsync resolves with the mutation result', async () => {
    const mutation = fakeMutation();
    const { mutateAsync } = buildPreparedHandlers<{ ok: string }, Vars, string>(mutation, (id) => ({
      kind: 'run',
      vars: { id, value: 1 },
    }));

    await expect(mutateAsync('a')).resolves.toEqual({ ok: 'a' });
    expect(mutation.mutateAsync).toHaveBeenCalledTimes(1);
  });

  it('coalesced: mutate issues nothing', () => {
    const mutation = fakeMutation();
    const { mutate } = buildPreparedHandlers<{ ok: string }, Vars, string>(mutation, () => ({ kind: 'coalesced' }));

    mutate('a');
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it('coalesced: mutateAsync resolves immediately with COALESCED and never touches the mutation', async () => {
    const mutation = fakeMutation();
    const { mutateAsync } = buildPreparedHandlers<{ ok: string }, Vars, string>(mutation, () => ({
      kind: 'coalesced',
    }));

    // The key property: an awaiting caller (e.g. a dialog) settles without hanging on a queued
    // mutation whose own promise never resolves.
    await expect(mutateAsync('a')).resolves.toBe(COALESCED);
    expect(mutation.mutateAsync).not.toHaveBeenCalled();
  });

  it('noop: mutate issues nothing and mutateAsync resolves with COALESCED', async () => {
    const mutation = fakeMutation();
    const prepare = (): PreparedVars<Vars> => ({ kind: 'noop' });
    const { mutate, mutateAsync } = buildPreparedHandlers<{ ok: string }, Vars, string>(mutation, prepare);

    mutate('a');
    await expect(mutateAsync('a')).resolves.toBe(COALESCED);
    expect(mutation.mutate).not.toHaveBeenCalled();
    expect(mutation.mutateAsync).not.toHaveBeenCalled();
  });
});
