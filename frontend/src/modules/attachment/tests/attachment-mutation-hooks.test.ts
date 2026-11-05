import type { Attachment } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requiredAttachmentHome } from '~/modules/attachment/tests/attachment-home';
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
// The rows carry the channel ids the app requires, so they splice into the home list of the deepest: the organization's in the template.
const home = requiredAttachmentHome(ctx.organizationId);
const homeKey = attachmentQueryKeys.list.home(ctx.organizationId, home.homeChannelId);

/** A stored attachment of the organization; the fields the mutation callbacks read and those a create body requires, since the body is parsed before it is sent. */
const attachment = (id: string, overrides: Partial<Attachment> = {}) =>
  ({
    id,
    entityType: 'attachment',
    name: id,
    filename: `${id}.png`,
    contentType: 'image/png',
    size: 1024,
    keys: { original: `${id}.png` },
    ...ctx,
    ...home.columns,
    ...overrides,
  }) as Attachment;
const [att0, att1] = ['01970000-0000-7000-8000-000000000000', '01970000-0000-7000-8000-000000000001'];

const homeList = () => queryClient.getQueryData<{ items: Attachment[] }>(homeKey)?.items ?? [];
const detail = (id: string) => queryClient.getQueryData<Attachment>(attachmentQueryKeys.detail.byId(id));

afterEach(resetMutationHooks);

describe('attachment mutation hooks', () => {
  it('puts the stored row over the copy an edit left in the detail cache while its create was queued', async () => {
    queryClient.setQueryData(homeKey, { items: [], total: 0 });
    goOffline(createAttachments);
    // The first create runs and parks; the second waits behind it in the scope, unsent, so an edit may fold into it.
    for (const id of [att0, att1]) callHook(() => useAttachmentCreateMutation(ctx.tenantId, ctx.organizationId)).mutate([attachment(id)] as never);
    await vi.waitFor(() => expect(mutationsOf('attachment', 'create').filter(({ state }) => state.isPaused)).toHaveLength(2));

    // The edit folds into the queued create and writes the detail from the optimistic row.
    callHook(() => useAttachmentUpdateMutation(ctx.tenantId, ctx.organizationId)).mutate({ id: att1, ops: { name: 'Renamed' } });
    expect(mutationsOf('attachment', 'update')).toHaveLength(0);
    expect(detail(att1)).toMatchObject({ name: 'Renamed', _optimistic: true });

    createAttachments.mockImplementation(async ({ body }) => ({
      data: (body as Attachment[]).map(({ id, name }) => attachment(id, { name, keywords: 'stored' })),
      rejectedIds: [],
    }));
    await goOnline();
    await vi.waitFor(() => expect(mutationsOf('attachment', 'create').every(({ state }) => state.status === 'success')).toBe(true));

    expect(homeList()).toContainEqual(attachment(att1, { name: 'Renamed', keywords: 'stored' }));
    expect(detail(att1)).toEqual(attachment(att1, { name: 'Renamed', keywords: 'stored' }));
  });
});
