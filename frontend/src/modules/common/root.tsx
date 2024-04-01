import { Outlet, ScrollRestoration, useMatches } from '@tanstack/react-router';
import { config } from 'config';
import { Suspense, lazy, useEffect } from 'react';

import { Dialoger } from '~/modules/common/dialoger';
import { ReloadPrompt } from '~/modules/common/reload-prompt';
import { Sheeter } from '~/modules/common/sheeter';
import { Toaster } from '~/modules/ui/sonner';
import { TooltipProvider } from '~/modules/ui/tooltip';
import { useNavigationStore } from '~/store/navigation';

// Lazy load Tanstack dev tools in development
const TanStackRouterDevtools =
  config.mode === 'production'
    ? () => null
    : lazy(() =>
        import('@tanstack/router-devtools').then((res) => ({
          default: res.TanStackRouterDevtools,
        })),
      );

function Root() {
  const matches = useMatches();

  useEffect(() => {
    // Set document title based on lowest matching route with a title
    const breadcrumbPromises = [...matches]
      .reverse()
      .map((match, index) => {
        if (!('getTitle' in match.routeContext)) {
          if (index === 0 && import.meta.env.DEV) {
            console.warn('no getTitle', match.pathname, match);
          }
          return undefined;
        }
        const { routeContext } = match;
        return routeContext.getTitle();
      })
      .filter(Boolean);
    void Promise.all(breadcrumbPromises).then((titles) => {
      document.title = titles.join(' · ');
      return titles;
    });
  }, [matches]);

  useEffect(() => {
    // First, we need to create an instance of EventSource and pass the data stream URL as a
    // parameter in its constructor
    const es = new EventSource(`${config.backendUrl}/sse`, {
      withCredentials: true,
    });
    // Whenever the connection is established between the server and the client we'll get notified
    es.onopen = () => console.log('>>> Connection opened!');
    // Made a mistake, or something bad happened on the server? We get notified here
    es.onerror = (e) => console.log('ERROR!', e);

    es.addEventListener('new_membership', (e) => {
      try {
        const organization = JSON.parse(e.data);
        useNavigationStore.setState((state) => {
          state.menu.organizations.active = [...state.menu.organizations.active, organization];
        });
      } catch (error) {
        console.error('Error parsing new_membership event', error);
      }
    });
    // Whenever we're done with the data stream we must close the connection
    return () => es.close();
  }, []);

  return (
    <TooltipProvider disableHoverableContent delayDuration={500} skipDelayDuration={0}>
      <ScrollRestoration />
      <Outlet />
      <Toaster richColors />
      <Dialoger />
      <Sheeter />
      <ReloadPrompt />
      <Suspense fallback={null}>
        <TanStackRouterDevtools />
      </Suspense>
    </TooltipProvider>
  );
}

export { Root };
