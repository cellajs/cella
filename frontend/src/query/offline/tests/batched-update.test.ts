import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '~/lib/api';
import { type QueuedUpdateItem, sendQueuedUpdates } from '~/query/offline/batched-update';
import type { UpdateVariables } from '~/query/offline/mutation-variables';

type Ops = { name: string };
type Row = { id: string; name: string };

const update = (id: string, name: string): UpdateVariables<Ops> => ({
  tenantId: 'ten-1',
  organizationId: 'org-1',
  id,
  ops: { name },
  stx: { mutationId: `m-${name}`, sourceId: 'tab-1', fieldTimestamps: { name: '1710500000123:0000:abcde' } },
});

// Pins what the sender rests on in query-core: a scope keeps the updates queued behind a running one pending in the
// order they were issued, shows them to its `mutationFn`, and runs each next in that order.
describe('sendQueuedUpdates', () => {
  it('sends the updates queued behind one as a batch, in scope order, and settles each with its own row', async () => {
    const client = new QueryClient();
    let releaseFirst = () => {};
    const single = vi.fn(async ({ id, ops }: UpdateVariables<Ops>): Promise<Row> => {
      await new Promise<void>((resolve) => (releaseFirst = resolve));
      return { id, name: ops.name };
    });
    const refused = new Set(['row-e']);
    // Answers the rows out of request order: each update must still settle with its own.
    const many = vi.fn(async ({ items }: { items: QueuedUpdateItem[] }) => ({
      results: items
        .filter(({ id }) => !refused.has(id))
        .map(({ id, ops }) => ({ id, name: String(ops.name) }))
        .reverse(),
      rejectedIds: items.filter(({ id }) => refused.has(id)).map(({ id }) => id),
    }));

    const settled: { name: string; data?: Row; status?: number }[] = [];
    const issue = (variables: UpdateVariables<Ops>) =>
      new MutationObserver(client, {
        mutationKey: ['thing', 'update'],
        scope: { id: 'thing' },
        mutationFn: (vars: UpdateVariables<Ops>, context) => sendQueuedUpdates(vars, context, { single, many, batchable: () => true }),
        onSettled: (data, error) =>
          settled.push({ name: variables.ops.name, ...(data && { data }), ...(error instanceof ApiError && { status: error.status }) }),
      })
        .mutate(variables)
        .catch(() => {});

    // The rest wait behind the first while it is under way, and a second edit of row b starts a run of its own.
    const first = issue(update('row-a', 'A'));
    await vi.waitFor(() => expect(single).toHaveBeenCalledOnce());
    const rest = [update('row-b', 'B'), update('row-c', 'C'), update('row-b', 'D'), update('row-e', 'E')].map(issue);
    releaseFirst();
    await Promise.all([first, ...rest]);

    expect(many.mock.calls.map(([{ items }]) => items.map(({ id, ops }) => `${id}:${ops.name}`))).toEqual([
      ['row-b:B', 'row-c:C'],
      ['row-b:D', 'row-e:E'],
    ]);
    expect(settled).toEqual([
      { name: 'A', data: { id: 'row-a', name: 'A' } },
      { name: 'B', data: { id: 'row-b', name: 'B' } },
      { name: 'C', data: { id: 'row-c', name: 'C' } },
      { name: 'D', data: { id: 'row-b', name: 'D' } },
      { name: 'E', status: 403 },
    ]);
  });
});
