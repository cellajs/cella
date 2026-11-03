import '~/query/tests/query-client-env';
import type { ProductEntityType } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';

const { queryClient } = await import('~/query/query-client');
const { mergeServerResponse } = await import('../update-success-utils');
const { registerDescriptionColumns } = await import('~/modules/common/blocknote/yjs-owned-fields');

// The server derives `keywords` from a task's description.
registerDescriptionColumns('task' as ProductEntityType, ['keywords']);

describe('mergeServerResponse', () => {
  const stx = { mutationId: 'mut-1', sourceId: 'src-1', fieldTimestamps: { description: '100:0001:aaaaa' } };
  const serverStx = { mutationId: 'mut-1', sourceId: 'src-1', fieldTimestamps: { description: '200:0001:aaaaa' } };
  const cached = {
    id: 'e1',
    entityType: 'task',
    name: 'Typed meanwhile',
    status: 'open',
    description: 'old',
    keywords: 'old',
    labels: ['mine'],
    stx,
    updatedAt: '2026-01-01',
    updatedBy: 'u1',
  };
  const serverEntity = {
    id: 'e1',
    entityType: 'task',
    name: 'Server name',
    status: 'done elsewhere',
    description: 'new',
    keywords: 'new words',
    labels: ['server'],
    stx: serverStx,
    updatedAt: '2026-01-02',
    updatedBy: 'u2',
  };
  const merge = (server = serverEntity) =>
    mergeServerResponse({
      queryClient,
      cached,
      serverEntity: server,
      mutatedKeys: ['description', 'labels'],
      derivedKeys: { name: ['slug'] },
      skipKeys: ['labels'],
    });

  afterEach(() => queryClient.getMutationCache().clear());

  it('takes every field of the stored row once no other edit of the row is queued, but the skipped keys and a description the server did not write', () => {
    // `labels` is skipped, as raak's task skips the stubbed relations of its lite response.
    expect(merge()).toEqual({ ...serverEntity, labels: ['mine'] });

    // A response that carries the cached copy's description stamp did not write it: a collaborative patch survives.
    expect(merge({ ...serverEntity, description: 'lagging', stx })).toMatchObject({ status: 'done elsewhere', description: 'old' });
  });

  it('takes from the response only what this mutation changed, the columns the server derived from it and the stamps while another edit of the row is queued, so its optimistic value survives', () => {
    queryClient.getMutationCache().build(
      queryClient,
      { mutationKey: ['task', 'update'] },
      {
        context: undefined,
        data: undefined,
        error: null,
        failureCount: 0,
        failureReason: null,
        isPaused: true,
        status: 'pending',
        variables: { id: 'e1', ops: { name: 'Typed meanwhile' } },
        submittedAt: Date.now(),
      },
    );

    expect(merge()).toEqual({ ...cached, description: 'new', keywords: 'new words', stx: serverStx, updatedAt: '2026-01-02', updatedBy: 'u2' });
  });
});
