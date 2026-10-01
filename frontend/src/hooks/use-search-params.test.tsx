// @vitest-environment jsdom
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useSearchParams } from '~/hooks/use-search-params';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type TableSearch = { q?: string };

const seen = { renders: 0, search: {} as TableSearch, setSearch: (_values: Partial<TableSearch>) => {} };

function Table() {
  const { search, setSearch } = useSearchParams<TableSearch>();
  seen.renders++;
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
  seen.renders = 0;
});

describe('useSearchParams', () => {
  it('ignores overlay keys, so an overlay write does not re-render the table', async () => {
    const router = await mount('/table?q=a');
    const renders = seen.renders;

    await writeSearch(router, { attachmentDialogId: 'one' });
    await writeSearch(router, { attachmentDialogId: 'two' });

    expect(seen.renders).toBe(renders);
    expect(seen.search).toEqual({ q: 'a' });
  });

  it('syncs its own keys when the URL changes elsewhere', async () => {
    const router = await mount('/table?q=a');

    await writeSearch(router, { q: 'c' });

    expect(seen.search).toEqual({ q: 'c' });
  });

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
