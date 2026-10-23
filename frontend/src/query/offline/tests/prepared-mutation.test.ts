import { describe, expect, it, vi } from 'vitest';
import { buildPreparedHandlers, coalescedResult, type PreparedVars } from '~/query/offline/prepared-mutation';

type Vars = { id: string; value: number };

function fakeMutation() {
  return {
    mutate: vi.fn((_vars: Vars, _opts?: unknown) => {}),
    mutateAsync: vi.fn(async (vars: Vars, _opts?: unknown) => ({ ok: vars.id })),
  };
}

describe('buildPreparedHandlers', () => {
  it('settles an awaiting caller at once with coalescedResult when the intent was coalesced or has nothing to send, and sends nothing', async () => {
    for (const kind of ['coalesced', 'noop'] as const) {
      const mutation = fakeMutation();
      const prepare = (): PreparedVars<Vars> => ({ kind });
      const { mutate, mutateAsync } = buildPreparedHandlers<{ ok: string }, Vars, string>(mutation, prepare);

      mutate('a');
      // An awaiting caller (e.g. a dialog) must not hang on a queued mutation whose own promise never resolves.
      await expect(mutateAsync('a')).resolves.toBe(coalescedResult);
      expect(mutation.mutate).not.toHaveBeenCalled();
      expect(mutation.mutateAsync).not.toHaveBeenCalled();
    }
  });
});
