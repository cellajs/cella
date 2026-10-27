import '~/query/tests/query-client-env';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('shared', () => ({
  appConfig: { productEntityTypes: ['attachment'], clientCacheVersion: 'v1' },
  isProduct: (type: string) => type === 'attachment',
}));

const quarantineFailedSync = vi.fn(async (_record: unknown) => {});
vi.mock('~/query/offline/failed-sync', () => ({ quarantineFailedSync: (record: unknown) => quarantineFailedSync(record) }));

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
}

describe('failedSync quarantine is gated on replay', () => {
  beforeEach(() => {
    queryClient.getMutationCache().clear();
    vi.clearAllMocks();
  });

  it('quarantines a 4xx only from a mutation replayed out of the offline queue: never from a live edit, nor once its replay succeeded', async () => {
    const replayed = buildMutation('m-replay', true);
    const succeeded = buildMutation('m-ok', true);
    const live = buildMutation('m-live', false);
    markReplayingMutations();
    await cacheHandlers.onSuccess(null, succeeded.variables, undefined, succeeded.mutation);

    for (const { mutation, variables } of [replayed, succeeded, live]) await failMutation(mutation, variables);

    expect(quarantineFailedSync).toHaveBeenCalledTimes(1);
    expect(quarantineFailedSync).toHaveBeenCalledWith(
      expect.objectContaining({ mutationId: 'm-replay', mutationKey: ['attachment', 'update'], status: 400 }),
    );
  });
});
