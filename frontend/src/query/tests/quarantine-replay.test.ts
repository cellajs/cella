import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('shared', () => ({
  appConfig: { productEntityTypes: ['attachment'], clientCacheVersion: 'v1' },
}));
vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
vi.stubGlobal('navigator', { onLine: true });

const quarantineFailedSync = vi.fn(async (_record: unknown) => {});
vi.mock('~/query/offline/failed-sync', () => ({
  quarantineFailedSync: (record: unknown) => quarantineFailedSync(record),
}));
vi.mock('~/query/on-error', () => ({ onError: vi.fn() }));
vi.mock('~/query/on-success', () => ({ onSuccess: vi.fn() }));

const { markReplayingMutations, queryClient } = await import('~/query/query-client');

const badRequest = Object.assign(new Error('bad request'), { status: 400 });

/** The cache-level handlers, called directly with the shape TanStack passes them. */
const cacheHandlers = queryClient.getMutationCache().config as {
  onError: (error: unknown, variables: unknown, onMutateResult: unknown, mutation: unknown) => unknown;
  onSuccess: (data: unknown, variables: unknown, onMutateResult: unknown, mutation: unknown) => unknown;
};

/** A mutation in the cache with the given variables, paused when restored from the persisted cache. */
function buildMutation(mutationId: string, paused: boolean) {
  const variables = { id: 'att-1', stx: { mutationId } };
  const mutation = queryClient.getMutationCache().build(
    queryClient,
    { mutationKey: ['attachment', 'update'], mutationFn: async () => null },
    {
      context: undefined,
      data: undefined,
      error: null,
      failureCount: 0,
      failureReason: null,
      isPaused: paused,
      status: 'pending',
      variables,
      submittedAt: Date.now(),
    },
  );
  return { mutation, variables };
}

async function failMutation(mutation: ReturnType<typeof buildMutation>['mutation'], variables: unknown) {
  await cacheHandlers.onError(badRequest, variables, undefined, mutation);
  // The quarantine import is lazy, so let it settle.
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('failedSync quarantine is gated on replay', () => {
  beforeEach(() => {
    queryClient.getMutationCache().clear();
    vi.clearAllMocks();
  });

  it('quarantines a restored (paused) mutation that fails replay with a 4xx', async () => {
    const { mutation, variables } = buildMutation('m-replay', true);
    markReplayingMutations();

    await failMutation(mutation, variables);

    expect(quarantineFailedSync).toHaveBeenCalledTimes(1);
    expect(quarantineFailedSync).toHaveBeenCalledWith(
      expect.objectContaining({ mutationId: 'm-replay', entityType: 'attachment', status: 400 }),
    );
  });

  it('leaves a live (never paused) mutation to the error toast', async () => {
    const { mutation, variables } = buildMutation('m-live', false);
    markReplayingMutations();

    await failMutation(mutation, variables);

    expect(quarantineFailedSync).not.toHaveBeenCalled();
  });

  it('forgets a replayed mutation once it succeeds, so a later live failure is not quarantined', async () => {
    const { mutation, variables } = buildMutation('m-ok', true);
    markReplayingMutations();
    await cacheHandlers.onSuccess(null, variables, undefined, mutation);

    await failMutation(mutation, variables);

    expect(quarantineFailedSync).not.toHaveBeenCalled();
  });
});
