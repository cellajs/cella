// @vitest-environment jsdom
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useSearchParams } from '~/hooks/use-search-params';
import { defineFrontendModule } from '~/lib/module';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The overlay keys come from the products' registered deep-link params, as the attachment module declares its own.
defineFrontendModule({
  name: 'attachments',
  owner: 'cella',
  scope: ['frontend'],
  description: 'test',
  product: { entityType: 'attachment', deepLinkParam: 'attachmentDialogId' },
});

type TableSearch = { q?: string };

const seen = { search: {} as TableSearch, setSearch: (_values: Partial<TableSearch>) => {} };

function Table() {
  const { search, setSearch } = useSearchParams<TableSearch>();
  seen.search = search;
  seen.setSearch = setSearch;
  return null;
}

const createTestRouter = (url: string) => {
  const rootRoute = createRootRoute({ staticData: { isAuth: false }, component: Outlet });
  const tableRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/table',
    staticData: { isAuth: false },
    validateSearch: (search: Record<string, unknown>) => ({
      q: search.q as string | undefined,
      attachmentDialogId: search.attachmentDialogId as string | undefined,
    }),
    component: Table,
  });
  return createRouter({ routeTree: rootRoute.addChildren([tableRoute]), history: createMemoryHistory({ initialEntries: [url] }) });
};

let root: Root | null = null;

const mount = async (url: string) => {
  const router = createTestRouter(url);
  root = createRoot(document.createElement('div'));
  await act(async () => {
    root?.render(<RouterProvider router={router} />);
    await router.load();
  });
  return router;
};

type TestRouter = ReturnType<typeof createTestRouter>;

const resolved = (router: TestRouter) =>
  new Promise<void>((resolve) => {
    const off = router.subscribe('onResolved', () => {
      off();
      resolve();
    });
  });

const writeSearch = async (router: TestRouter, values: Record<string, string | undefined>) => {
  await act(() => router.navigate({ to: '.', replace: true, search: (prev: Record<string, unknown>) => ({ ...prev, ...values }) }));
};

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

describe('useSearchParams', () => {
  it('keeps the live overlay value when setSearch writes', async () => {
    const router = await mount('/table?q=a&attachmentDialogId=one');
    expect(seen.search).toEqual({ q: 'a' });

    await writeSearch(router, { attachmentDialogId: undefined });
    await act(async () => {
      const done = resolved(router);
      seen.setSearch({ q: 'b' });
      await done;
    });

    expect(router.state.location.search).toEqual({ q: 'b' });
    expect(seen.search).toEqual({ q: 'b' });
  });
});
