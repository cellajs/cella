import '~/query/tests/query-client-env';
import { onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Attachment } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Req = { path: Record<string, string | undefined>; body: Record<string, unknown> | Array<Record<string, unknown>> };
const { createAttachments, updateAttachment } = vi.hoisted(() => ({
  createAttachments: vi.fn(async (_req: Req): Promise<{ data: unknown[]; rejectedIds: string[] }> => ({ data: [], rejectedIds: [] })),
  updateAttachment: vi.fn(async (_req: Req): Promise<unknown> => ({})),
}));

vi.mock('sdk', async (importOriginal) => ({ ...(await importOriginal<typeof import('sdk')>()), createAttachments, updateAttachment }));
vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: { info: vi.fn(), error: vi.fn() } }));

const { queryClient } = await import('~/query/query-client');
const { attachmentQueryKeys, attachmentsCanonicalOptions, useAttachmentCreateMutation, useAttachmentUpdateMutation } = await import(
  '~/modules/attachment/query'
);

const ctx = { tenantId: 'ten-1', organizationId: 'org-1' };
const homeKey = attachmentsCanonicalOptions(ctx).queryKey;

/** A stored attachment of the organization; only the fields the mutation callbacks read. */
const attachment = (id: string, overrides: Partial<Attachment> = {}) =>
  ({ id, entityType: 'attachment', name: id, filename: `${id}.png`, ...ctx, ...overrides }) as Attachment;

const homeList = () => queryClient.getQueryData<{ items: Attachment[] }>(homeKey)?.items ?? [];
const detail = (id: string) => queryClient.getQueryData<Attachment>(attachmentQueryKeys.detail.byId(id));
const mutationsOf = (operation: 'create' | 'update') => queryClient.getMutationCache().findAll({ mutationKey: ['attachment', operation] });

/** Runs a hook in one server render under the app's query client; the mutate functions it returns work after the render. */
function callHook<T>(useHook: () => T): T {
  const captured: { result?: T } = {};
  const Probe = () => {
    captured.result = useHook();
    return null;
  };
  renderToStaticMarkup(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)));
  return captured.result as T;
}

// The retry that leads to the pause waits for this delay first.
queryClient.setDefaultOptions({ mutations: { ...queryClient.getDefaultOptions().mutations, retryDelay: 0 } });

afterEach(() => {
  queryClient.clear();
  onlineManager.setOnline(true);
  vi.resetAllMocks();
});

describe('attachment mutation hooks', () => {
  it('puts the stored row over the copy an edit left in the detail cache while its create was queued', async () => {
    queryClient.setQueryData(homeKey, { items: [], total: 0 });
    // The request fails as a browser fetch does without a network, which parks the create in the offline queue.
    onlineManager.setOnline(false);
    createAttachments.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    callHook(() => useAttachmentCreateMutation(ctx.tenantId, ctx.organizationId)).mutate([attachment('att-1')] as never);
    await vi.waitFor(() => expect(mutationsOf('create').filter(({ state }) => state.isPaused)).toHaveLength(1));

    // The edit folds into the queued create and writes the detail from the optimistic row.
    callHook(() => useAttachmentUpdateMutation(ctx.tenantId, ctx.organizationId)).mutate({ id: 'att-1', ops: { name: 'Renamed' } });
    expect(mutationsOf('update')).toHaveLength(0);
    expect(detail('att-1')).toMatchObject({ name: 'Renamed', _optimistic: true });

    createAttachments.mockImplementation(async () => ({ data: [attachment('att-1', { name: 'Renamed', keywords: 'stored' })], rejectedIds: [] }));
    onlineManager.setOnline(true);
    await queryClient.resumePausedMutations();
    await vi.waitFor(() => expect(mutationsOf('create')[0].state.status).toBe('success'));

    expect(homeList()).toEqual([attachment('att-1', { name: 'Renamed', keywords: 'stored' })]);
    expect(detail('att-1')).toEqual(attachment('att-1', { name: 'Renamed', keywords: 'stored' }));
  });
});
