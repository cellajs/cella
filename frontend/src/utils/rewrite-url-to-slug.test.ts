// @vitest-environment jsdom
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';
import { rewriteUrlToSlug } from '~/utils/rewrite-url-to-slug';

const slugs: Record<string, string> = { 'org-1': 'acme' };

/** A layout that rewrites its own param from an id, with a page below it, as the organization layout sits above a channel's. */
function createTestRouter(url: string) {
  const rootRoute = createRootRoute({ staticData: { isAuth: false } });
  const layoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/$organizationSlug',
    staticData: { isAuth: false },
    beforeLoad: ({ params }) => rewriteUrlToSlug(params, { organizationSlug: slugs[params.organizationSlug] }),
  });
  const layoutIndexRoute = createRoute({ getParentRoute: () => layoutRoute, path: '/', staticData: { isAuth: false } });
  const pageRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: '/project/$slug',
    staticData: { isAuth: false },
    validateSearch: (search: Record<string, unknown>) => ({ open: search.open as string | undefined }),
  });
  const routeTree = rootRoute.addChildren([layoutRoute.addChildren([layoutIndexRoute, pageRoute])]);
  return createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [url] }) });
}

describe('rewriteUrlToSlug', () => {
  it('rewrites the layout param and keeps the page below it, with its param, search and hash', async () => {
    const router = createTestRouter('/org-1/project/p-1?open=t1#pt');
    await router.load();
    await vi.waitFor(() => expect(router.state.status).toBe('idle'));

    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/acme/project/p-1'));
    expect(router.state.location.search).toEqual({ open: 't1' });
    expect(router.state.location.hash).toBe('pt');
    // Replaced, so back does not return to the id URL.
    expect(router.history.length).toBe(1);
  });
});
