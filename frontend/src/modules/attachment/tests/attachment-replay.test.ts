import { describe, expect, it, vi } from 'vitest';

// The generated SDK is mocked so the test can read the request a replayed mutation sends.
const { updateAttachment } = vi.hoisted(() => ({ updateAttachment: vi.fn(async (_req: unknown) => ({ id: 'att-1' })) }));
vi.mock('sdk', () => ({ createAttachments: vi.fn(), updateAttachment, deleteAttachments: vi.fn(), getAttachment: vi.fn(), getAttachments: vi.fn() }));

import { updateAttachmentMutationFn } from '~/modules/attachment/query-mutations';

const ctx = { tenantId: 'ten-1', organizationId: 'org-1' };

describe('a mutation replayed from the offline queue', () => {
  it('reuses the stx persisted in its variables: same mutationId and HLCs, no restamp (D4)', async () => {
    const persistedStx = { mutationId: 'original-mutation-id', sourceId: 'tab-1', fieldTimestamps: { name: '1710500000123:0001:abcde' } };
    await updateAttachmentMutationFn({ ...ctx, id: 'att-1', ops: { name: 'Renamed' }, stx: persistedStx });

    // Idempotency + intent-time LWW: the replayed request is byte-identical to the original.
    expect(updateAttachment.mock.lastCall?.[0]).toMatchObject({ body: { stx: persistedStx } });
  });
});
