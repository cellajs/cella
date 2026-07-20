import { describe, expect, it, vi } from 'vitest';

// Mock the generated SDK so we can assert exactly how a *replayed* mutation calls the API.
// `Req` is intentionally loose because the tests inspect opaque request objects the SDK would send.
type Req = { path: Record<string, string | undefined>; body: Record<string, unknown> | Array<Record<string, unknown>> };
const { createAttachments, updateAttachment, deleteAttachments } = vi.hoisted(() => ({
  createAttachments: vi.fn(async (_req: Req) => ({ data: [] })),
  updateAttachment: vi.fn(async (_req: Req) => ({ id: 'att-1' })),
  deleteAttachments: vi.fn(async (_req: Req) => undefined),
}));

vi.mock('sdk', () => ({
  createAttachments,
  updateAttachment,
  deleteAttachments,
  getAttachment: vi.fn(),
  getAttachments: vi.fn(),
}));

import {
  createAttachmentsMutationFn,
  deleteAttachmentsMutationFn,
  updateAttachmentMutationFn,
} from '~/modules/attachment/query-mutations';

const ctx = { tenantId: 'ten-1', organizationId: 'org-1' };

/** Read the last request an SDK spy received (typed loosely for assertion convenience). */
const lastBody = (spy: { mock: { lastCall?: [Req] } }) => spy.mock.lastCall?.[0].body as Record<string, unknown>;
const lastPath = (spy: { mock: { lastCall?: [Req] } }) => spy.mock.lastCall?.[0].path;

describe('attachment offline-replay mutation functions', () => {
  it('update replays from persisted variables: tenant/org in the path, stx in the body', async () => {
    updateAttachment.mockClear();
    await updateAttachmentMutationFn({ ...ctx, id: 'att-1', ops: { name: 'Renamed' } });

    expect(updateAttachment).toHaveBeenCalledTimes(1);
    expect(lastPath(updateAttachment)).toEqual({ tenantId: 'ten-1', organizationId: 'org-1', id: 'att-1' });
    const body = lastBody(updateAttachment);
    expect(body.ops).toEqual({ name: 'Renamed' });
    const stx = body.stx as { mutationId: string; fieldTimestamps: Record<string, string> };
    expect(stx.mutationId).toEqual(expect.any(String));
    // HLC timestamp generated for the changed scalar field, so replay ordering stays correct.
    expect(Object.keys(stx.fieldTimestamps)).toContain('name');
  });

  it('delete replays ids + context derived entirely from persisted variables', async () => {
    deleteAttachments.mockClear();
    const attachments = [{ id: 'a' }, { id: 'b' }] as never;
    await deleteAttachmentsMutationFn({ ...ctx, attachments });

    expect(lastPath(deleteAttachments)).toEqual({ tenantId: 'ten-1', organizationId: 'org-1' });
    const body = lastBody(deleteAttachments);
    expect(body.ids).toEqual(['a', 'b']);
    expect((body.stx as { mutationId: string }).mutationId).toEqual(expect.any(String));
  });

  it('create replays with stx stamped on every item', async () => {
    createAttachments.mockClear();
    const data = [
      { id: 'x', filename: 'x.png' },
      { id: 'y', filename: 'y.png' },
    ] as never;
    await createAttachmentsMutationFn({ ...ctx, data });

    expect(lastPath(createAttachments)).toEqual({ tenantId: 'ten-1', organizationId: 'org-1' });
    const body = createAttachments.mock.lastCall?.[0].body as Array<{ stx: { mutationId: string } }>;
    expect(body).toHaveLength(2);
    for (const item of body) expect(item.stx.mutationId).toEqual(expect.any(String));
  });

  it('replay reuses the stx persisted in variables: same mutationId and HLCs, no restamp (D4)', async () => {
    updateAttachment.mockClear();
    const persistedStx = {
      mutationId: 'original-mutation-id',
      sourceId: 'tab-1',
      fieldTimestamps: { name: '1710500000123:0001:abcde' },
    };
    await updateAttachmentMutationFn({ ...ctx, id: 'att-1', ops: { name: 'Renamed' }, stx: persistedStx });

    // Idempotency + intent-time LWW: the replayed request is byte-identical to the original.
    expect(lastBody(updateAttachment).stx).toEqual(persistedStx);
  });

  it('create replay reuses persisted stx across every item', async () => {
    createAttachments.mockClear();
    const persistedStx = { mutationId: 'create-mid', sourceId: 'tab-1', fieldTimestamps: {} };
    await createAttachmentsMutationFn({ ...ctx, data: [{ id: 'x', filename: 'x.png' }] as never, stx: persistedStx });

    const body = createAttachments.mock.lastCall?.[0].body as Array<{ stx: { mutationId: string } }>;
    expect(body[0].stx).toEqual(persistedStx);
  });

  it('REGRESSION: without injected context the persisted request loses tenant/org', async () => {
    // The exact bug the fix prevents: before the hook injected context, a mutation persisted as
    // `{ id, ops }` replayed through the default function with tenant/org undefined, producing a broken request.
    updateAttachment.mockClear();
    // @ts-expect-error intentionally passing the OLD (incomplete) variable shape.
    await updateAttachmentMutationFn({ id: 'att-1', ops: { name: 'x' } });

    expect(lastPath(updateAttachment)).toEqual({ tenantId: undefined, organizationId: undefined, id: 'att-1' });
  });
});
