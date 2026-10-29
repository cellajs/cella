import type { Attachment } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callHook, goOffline, goOnline, mutationsOf, queryClient, resetMutationHooks } from '~/query/tests/mutation-hooks-kit';

type Req = { path: Record<string, string | undefined>; body: Record<string, unknown> | Array<Record<string, unknown>> };
const { createAttachments, updateAttachment } = vi.hoisted(() => ({
  createAttachments: vi.fn(async (_req: Req): Promise<{ data: unknown[]; rejectedIds: string[] }> => ({ data: [], rejectedIds: [] })),
  updateAttachment: vi.fn(async (_req: Req): Promise<unknown> => ({})),
}));

vi.mock('sdk', async (importOriginal) => ({ ...(await importOriginal<typeof import('sdk')>()), createAttachments, updateAttachment }));
vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: { info: vi.fn(), error: vi.fn() } }));

const { attachmentQueryKeys, useAttachmentCreateMutation, useAttachmentUpdateMutation } = await import('~/modules/attachment/query');

const ctx = { tenantId: 'ten-1', organizationId: 'org-1' };
// The rows here carry no channel id, so they splice into the organization's home list.
const homeKey = attachmentQueryKeys.list.home(ctx.organizationId);

/** A stored attachment of the organization; only the fields the mutation callbacks read. */
const attachment = (id: string, overrides: Partial<Attachment> = {}) =>
  ({ id, entityType: 'attachment', name: id, filename: `${id}.png`, ...ctx, ...overrides }) as Attachment;

const homeList = () => queryClient.getQueryData<{ items: Attachment[] }>(homeKey)?.items ?? [];
const detail = (id: string) => queryClient.getQueryData<Attachment>(attachmentQueryKeys.detail.byId(id));

afterEach(resetMutationHooks);

describe('attachment mutation hooks', () => {
  it('puts the stored row over the copy an edit left in the detail cache while its create was queued', async () => {
    queryClient.setQueryData(homeKey, { items: [], total: 0 });
    goOffline(createAttachments);
    // The first create runs and parks; the second waits behind it in the scope, unsent, so an edit may fold into it.
    for (const id of ['att-0', 'att-1'])
      callHook(() => useAttachmentCreateMutation(ctx.tenantId, ctx.organizationId)).mutate([attachment(id)] as never);
    await vi.waitFor(() => expect(mutationsOf('attachment', 'create').filter(({ state }) => state.isPaused)).toHaveLength(2));

    // The edit folds into the queued create and writes the detail from the optimistic row.
    callHook(() => useAttachmentUpdateMutation(ctx.tenantId, ctx.organizationId)).mutate({ id: 'att-1', ops: { name: 'Renamed' } });
    expect(mutationsOf('attachment', 'update')).toHaveLength(0);
    expect(detail('att-1')).toMatchObject({ name: 'Renamed', _optimistic: true });

    createAttachments.mockImplementation(async ({ body }) => ({
      data: (body as Attachment[]).map(({ id, name }) => attachment(id, { name, keywords: 'stored' })),
      rejectedIds: [],
    }));
    await goOnline();
    await vi.waitFor(() => expect(mutationsOf('attachment', 'create').every(({ state }) => state.status === 'success')).toBe(true));

    expect(homeList()).toContainEqual(attachment('att-1', { name: 'Renamed', keywords: 'stored' }));
    expect(detail('att-1')).toEqual(attachment('att-1', { name: 'Renamed', keywords: 'stored' }));
  });
});
