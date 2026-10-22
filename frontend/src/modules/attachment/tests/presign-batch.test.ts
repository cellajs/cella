import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getPresignedUrls = vi.fn();
vi.mock('sdk/sdk.gen', () => ({ getPresignedUrls: (...args: unknown[]) => getPresignedUrls(...args) }));
vi.mock('~/query/local-user-storage', () => ({ subscribeOwnerChange: () => () => {} }));
vi.mock('@tanstack/react-query', () => ({ onlineManager: { isOnline: () => true } }));

const { getPresignedUrlBatched, PresignRejectedError, resetPresignBatch } = await import('~/modules/attachment/presign-batch');

/** Echo-sign every requested pair, as the server's happy path does. */
function signAllRequested() {
  getPresignedUrls.mockImplementation(async ({ body }: { body: { items: { attachmentId: string; variant: string }[] } }) => ({
    data: body.items.map((item) => ({ ...item, url: `https://signed.example/${item.attachmentId}/${item.variant}` })),
    rejectedIds: [],
  }));
}

const request = (id: string) => getPresignedUrlBatched(id, 'original', 'tenant-1', 'org-1');

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  signAllRequested();
});

afterEach(() => {
  resetPresignBatch();
  vi.useRealTimers();
});

describe('presign coalescer', () => {
  it('rejects server-rejected ids with PresignRejectedError and resolves the rest', async () => {
    getPresignedUrls.mockResolvedValue({
      data: [{ attachmentId: 'att-1', variant: 'original', url: 'https://signed.example/att-1/original' }],
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

    expect(getPresignedUrls).toHaveBeenCalledTimes(2);
    expect(getPresignedUrls.mock.calls[0][0].body.items).toHaveLength(50);
    expect(getPresignedUrls.mock.calls[1][0].body.items).toHaveLength(10);
    await Promise.all(promises);
  });
});
