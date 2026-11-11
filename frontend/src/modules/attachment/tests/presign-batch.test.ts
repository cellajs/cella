import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const presignAttachmentUrls = vi.fn();
const presignPublicAttachmentUrls = vi.fn();
const viewer = vi.hoisted(() => ({ signedIn: true }));
vi.mock('sdk/sdk.gen', () => ({
  presignAttachmentUrls: (...args: unknown[]) => presignAttachmentUrls(...args),
  presignPublicAttachmentUrls: (...args: unknown[]) => presignPublicAttachmentUrls(...args),
}));
vi.mock('~/modules/user/user-store', () => ({ useUserStore: { getState: () => ({ user: viewer.signedIn ? { id: 'user-1' } : null }) } }));
vi.mock('@tanstack/react-query', () => ({ onlineManager: { isOnline: () => true } }));

const { getPresignedUrlBatched, PresignRejectedError, resetPresignBatch } = await import('~/modules/attachment/presign-batch');

/** Echo-sign every requested pair, as the server's happy path does. */
function signAllRequested() {
  presignAttachmentUrls.mockImplementation(async ({ body }: { body: { items: { attachmentId: string; variant: string }[] } }) => ({
    results: body.items.map((item) => ({ ...item, url: `https://signed.example/${item.attachmentId}/${item.variant}` })),
    rejectedIds: [],
  }));
}

const request = (id: string) => getPresignedUrlBatched(id, 'original', 'tenant-1', 'org-1');

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  viewer.signedIn = true;
  signAllRequested();
});

afterEach(() => {
  resetPresignBatch();
  vi.useRealTimers();
});

describe('presign coalescer', () => {
  it('signs through the public route while signed out', async () => {
    viewer.signedIn = false;
    presignPublicAttachmentUrls.mockResolvedValue({
      results: [{ attachmentId: 'att-1', variant: 'original', url: 'https://signed.example/public/att-1' }],
      rejectedIds: [],
    });

    const pending = request('att-1');
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toBe('https://signed.example/public/att-1');
    expect(presignPublicAttachmentUrls).toHaveBeenCalledWith({ path: { tenantId: 'tenant-1', organizationId: 'org-1' }, body: expect.anything() });
    expect(presignAttachmentUrls).not.toHaveBeenCalled();
  });

  it('rejects server-rejected ids with PresignRejectedError and resolves the rest', async () => {
    presignAttachmentUrls.mockResolvedValue({
      results: [{ attachmentId: 'att-1', variant: 'original', url: 'https://signed.example/att-1/original' }],
      rejectedIds: ['att-denied'],
    });

    const ok = request('att-1');
    // Attach the rejection handler before the flush fires so the rejection is never unhandled.
    const denied = expect(request('att-denied')).rejects.toBeInstanceOf(PresignRejectedError);
    await vi.advanceTimersByTimeAsync(20);

    await expect(ok).resolves.toBe('https://signed.example/att-1/original');
    await denied;
  });

  it('chunks one flush to the 50-item server cap', async () => {
    const promises = Array.from({ length: 60 }, (_, i) => request(`att-${i}`));
    await vi.advanceTimersByTimeAsync(20);

    expect(presignAttachmentUrls).toHaveBeenCalledTimes(2);
    expect(presignAttachmentUrls.mock.calls[0][0].body.items).toHaveLength(50);
    expect(presignAttachmentUrls.mock.calls[1][0].body.items).toHaveLength(10);
    await Promise.all(promises);
  });
});
