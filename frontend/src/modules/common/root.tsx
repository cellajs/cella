import { Outlet, ScrollRestoration, useMatches } from '@tanstack/react-router';
import { config } from 'config';
import { Suspense, lazy, useEffect } from 'react';

import { Dialoger } from '~/modules/common/dialoger';
import { ReloadPrompt } from '~/modules/common/reload-prompt';
import { Sheeter } from '~/modules/common/sheeter';
import { Toaster } from '~/modules/ui/sonner';
import { TooltipProvider } from '~/modules/ui/tooltip';
import { SSEProvider } from './sse/provider';
import { DownAlert } from './down-alert';

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

  return (
    <SSEProvider>
      <TooltipProvider disableHoverableContent delayDuration={300} skipDelayDuration={0}>
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
      <DownAlert />
    </SSEProvider>
  );
}

export { Root };
