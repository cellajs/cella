import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getPresignedUrls = vi.fn();
vi.mock('sdk/sdk.gen', () => ({
  getPresignedUrls: (...args: unknown[]) => getPresignedUrls(...args),
}));

vi.mock('~/query/app-storage', () => ({
  subscribeOwnerChange: () => () => {},
}));

const isOnline = vi.fn(() => true);
vi.mock('@tanstack/react-query', () => ({
  onlineManager: { isOnline: () => isOnline() },
}));

const { getPresignedUrlBatched, PresignRejectedError, resetPresignBatch } = await import('../presign-batch');

/** Echo-sign every requested pair, mirroring the server's happy path. */
function signAllRequested() {
  getPresignedUrls.mockImplementation(
    async ({ body }: { body: { items: { attachmentId: string; variant: string }[] } }) => ({
      data: body.items.map((item) => ({ ...item, url: `https://signed.example/${item.attachmentId}/${item.variant}` })),
      rejectedIds: [],
    }),
  );
}

const request = (id: string, variant: 'original' | 'thumbnail' | 'converted' = 'original') =>
  getPresignedUrlBatched(id, variant, 'tenant-1', 'org-1');

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  isOnline.mockReturnValue(true);
  signAllRequested();
});

afterEach(() => {
  resetPresignBatch();
  vi.useRealTimers();
});

describe('presign coalescer', () => {
  it('coalesces concurrent requests into one batch call', async () => {
    const promises = [request('att-1'), request('att-2', 'thumbnail'), request('att-3')];
    await vi.advanceTimersByTimeAsync(20);

    expect(getPresignedUrls).toHaveBeenCalledTimes(1);
    expect(getPresignedUrls).toHaveBeenCalledWith({
      path: { tenantId: 'tenant-1', organizationId: 'org-1' },
      body: {
        items: [
          { attachmentId: 'att-1', variant: 'original' },
          { attachmentId: 'att-2', variant: 'thumbnail' },
          { attachmentId: 'att-3', variant: 'original' },
        ],
      },
    });
    await expect(Promise.all(promises)).resolves.toEqual([
      'https://signed.example/att-1/original',
      'https://signed.example/att-2/thumbnail',
      'https://signed.example/att-3/original',
    ]);
  });

  it('shares one in-flight request for identical pairs', async () => {
    const [a, b] = [request('att-1'), request('att-1')];
    await vi.advanceTimersByTimeAsync(20);

    expect(getPresignedUrls).toHaveBeenCalledTimes(1);
    expect(getPresignedUrls.mock.calls[0][0].body.items).toHaveLength(1);
    await expect(a).resolves.toBe('https://signed.example/att-1/original');
    await expect(b).resolves.toBe('https://signed.example/att-1/original');
  });

  it('serves repeats from the memo within the TTL, refetches after expiry', async () => {
    const first = request('att-1');
    await vi.advanceTimersByTimeAsync(20);
    await first;

    await expect(request('att-1')).resolves.toBe('https://signed.example/att-1/original');
    expect(getPresignedUrls).toHaveBeenCalledTimes(1);

    // Past the 1h memo TTL the pair is requested again.
    await vi.advanceTimersByTimeAsync(61 * 60 * 1000);
    const again = request('att-1');
    await vi.advanceTimersByTimeAsync(20);
    await again;
    expect(getPresignedUrls).toHaveBeenCalledTimes(2);
  });

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

  it('rejects all pending requests on transport failure and allows retrying', async () => {
    getPresignedUrls.mockRejectedValueOnce(new Error('network down'));

    const failed = expect(request('att-1')).rejects.toThrow('network down');
    await vi.advanceTimersByTimeAsync(20);
    await failed;

    // Failure is not memoized: the next attempt goes out again.
    signAllRequested();
    const retried = request('att-1');
    await vi.advanceTimersByTimeAsync(20);
    await expect(retried).resolves.toBe('https://signed.example/att-1/original');
    expect(getPresignedUrls).toHaveBeenCalledTimes(2);
  });

  it('fails fast when offline without calling the SDK', async () => {
    isOnline.mockReturnValue(false);
    await expect(request('att-1')).rejects.toThrow('Offline');
    await vi.advanceTimersByTimeAsync(20);
    expect(getPresignedUrls).not.toHaveBeenCalled();
  });

  it('chunks one flush to the 50-item server cap', async () => {
    const promises = Array.from({ length: 60 }, (_, i) => request(`att-${i}`));
    await vi.advanceTimersByTimeAsync(20);

    expect(getPresignedUrls).toHaveBeenCalledTimes(2);
    expect(getPresignedUrls.mock.calls[0][0].body.items).toHaveLength(50);
    expect(getPresignedUrls.mock.calls[1][0].body.items).toHaveLength(10);
    await Promise.all(promises);
  });

  it('splits a flush per tenant/org scope', async () => {
    const a = getPresignedUrlBatched('att-1', 'original', 'tenant-1', 'org-1');
    const b = getPresignedUrlBatched('att-2', 'original', 'tenant-1', 'org-2');
    await vi.advanceTimersByTimeAsync(20);

    expect(getPresignedUrls).toHaveBeenCalledTimes(2);
    const paths = getPresignedUrls.mock.calls.map((call) => call[0].path);
    expect(paths).toContainEqual({ tenantId: 'tenant-1', organizationId: 'org-1' });
    expect(paths).toContainEqual({ tenantId: 'tenant-1', organizationId: 'org-2' });
    await Promise.all([a, b]);
  });
});
