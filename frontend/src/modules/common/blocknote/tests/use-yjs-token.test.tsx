// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { getYjsToken } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '~/lib/api';

vi.mock('sdk', () => ({ getYjsToken: vi.fn() }));
vi.mock('~/env', () => ({ isDebugMode: false }));

const { useYjsToken } = await import('~/modules/common/blocknote/hooks/use-yjs-token');
const { userStore, yjsTokenKey } = await import('~/modules/user/user-store');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tokenKey = yjsTokenKey('attachment', 'attachment-1');
let root: Root | undefined;

/** Renders the hook for one attachment once the token route answered, and returns its result. */
async function renderToken() {
  let latest: ReturnType<typeof useYjsToken> | undefined;
  const Harness = () => {
    latest = useYjsToken({ entityType: 'attachment', entityId: 'attachment-1', tenantId: 'tenant-1', organizationId: 'org-1', enabled: true });
    return null;
  };
  const client = new QueryClient();
  root = createRoot(document.createElement('div'));
  await act(async () =>
    root?.render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    ),
  );
  // The mount started the fetch. Once it settled, react-query notifies its observers on a 0 ms timer.
  await act(async () => {
    await vi.waitFor(() => expect(client.isFetching()).toBe(0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return latest;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.mocked(getYjsToken).mockReset();
  userStore.getState().setYjsToken(tokenKey, null);
});

describe('useYjsToken refusals', () => {
  it('must not keep a token the route refuses, nor read a deleted entity as view only: a 404 gives deleted, a 403 view only, each withdrawing the held token without a retry', async () => {
    const answers = [
      [404, { token: undefined, denied: false, deleted: true }],
      [403, { token: undefined, denied: true, deleted: false }],
    ] as const;
    for (const [status, expected] of answers) {
      userStore.getState().setYjsToken(tokenKey, 'token-v1');
      vi.mocked(getYjsToken).mockReset();
      vi.mocked(getYjsToken).mockRejectedValue(new ApiError({ status }));

      expect(await renderToken()).toEqual(expected);
      expect(userStore.getState().yjsTokens[tokenKey]).toBeUndefined();
      // No retry changes a refusal.
      expect(getYjsToken).toHaveBeenCalledOnce();
      await act(async () => root?.unmount());
      root = undefined;
    }
  });
});
