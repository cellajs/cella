import type { Decorator } from '@storybook/react-vite';
import { QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, type RegisteredRouter, RouterProvider } from '@tanstack/react-router';
import { createContext, type ReactNode, useContext, useState } from 'react';
import { queryClient } from '~/query/query-client';
import { setRouter } from '~/routes/-router-instance';

/** `parameters.app` of a story rendered through {@link withApp}. */
export interface AppStoryParameters {
  /** Initial URL of the in-memory router, search params included. Defaults to `/`. */
  url?: string;
  /** Query cache entries written before the story renders. */
  queryData?: [QueryKey, unknown][];
}

const StoryContext = createContext<ReactNode>(null);

// The route renders whatever story the decorator currently passes, so args changes re-render without a new router.
const rootRoute = createRootRoute({ staticData: { isAuth: false }, component: () => useContext(StoryContext) });

function AppHarness({ url, queryData, children }: Required<AppStoryParameters> & { children: ReactNode }) {
  const [router] = useState(() => {
    queryClient.clear();
    for (const [key, data] of queryData) queryClient.setQueryData(key, data);

    const created = createRouter({ routeTree: rootRoute, history: createMemoryHistory({ initialEntries: [url] }) });
    // Overlay providers and query helpers reach the router through getRouter(), outside React.
    setRouter(created as unknown as RegisteredRouter);
    return created;
  });

  return (
    <QueryClientProvider client={queryClient}>
      <StoryContext.Provider value={children}>
        <RouterProvider router={router} />
      </StoryContext.Provider>
    </QueryClientProvider>
  );
}

/**
 * Renders a story inside an in-memory router and the app query client, for components that read the URL,
 * run queries, or open overlays through the dialoger, sheeter or dropdowner. Opt in per story file with
 * `decorators: [withApp]` and configure through `parameters.app` ({@link AppStoryParameters}). Components
 * that read one route's search params with a strict `from` need `strict: false` to render here.
 */
export const withApp: Decorator = (Story, { parameters }) => {
  const { url = '/', queryData = [] } = (parameters.app ?? {}) as AppStoryParameters;
  return (
    <AppHarness url={url} queryData={queryData}>
      <Story />
    </AppHarness>
  );
};
