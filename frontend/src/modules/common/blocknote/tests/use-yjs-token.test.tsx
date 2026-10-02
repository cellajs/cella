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
const { useUserStore, yjsTokenKey } = await import('~/modules/user/user-store');

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
  useUserStore.getState().setYjsToken(tokenKey, null);
});

describe('useYjsToken refusals', () => {
  it('must not read a deleted entity as view only: a 404 gives deleted and withdraws the held token', async () => {
    useUserStore.getState().setYjsToken(tokenKey, 'token-v1');
    vi.mocked(getYjsToken).mockRejectedValue(new ApiError({ status: 404 }));

    expect(await renderToken()).toEqual({ token: undefined, refused: false, deleted: true });
    expect(useUserStore.getState().yjsTokens[tokenKey]).toBeUndefined();
    // No retry changes a refusal.
    expect(getYjsToken).toHaveBeenCalledOnce();
  });

  it('a 403 gives refused, view only, and withdraws the held token', async () => {
    useUserStore.getState().setYjsToken(tokenKey, 'token-v1');
    vi.mocked(getYjsToken).mockRejectedValue(new ApiError({ status: 403 }));

    expect(await renderToken()).toEqual({ token: undefined, refused: true, deleted: false });
    expect(useUserStore.getState().yjsTokens[tokenKey]).toBeUndefined();
    expect(getYjsToken).toHaveBeenCalledOnce();
  });

  it('a token the route issues is neither, and lands in the user store (positive control)', async () => {
    vi.mocked(getYjsToken).mockResolvedValue({ token: 'token-v2' } as never);

    expect(await renderToken()).toEqual({ token: 'token-v2', refused: false, deleted: false });
    expect(useUserStore.getState().yjsTokens[tokenKey]).toBe('token-v2');
  });
});
