import { Outlet, ScrollRestoration } from '@tanstack/react-router';
import { config } from 'config';
import { Suspense, lazy } from 'react';

import { Dialoger } from '~/modules/common/dialoger';
import { ReloadPrompt } from '~/modules/common/reload-prompt';
import { Sheeter } from '~/modules/common/sheeter';
import { Toaster } from '~/modules/ui/sonner';
import { TooltipProvider } from '~/modules/ui/tooltip';
import { SSEProvider } from './sse/provider';
import { DownAlert } from './down-alert';
import { useBuildDocumentTitle } from '~/hooks/use-build-document-title';

// Lazy load Tanstack dev tools in development
const TanStackRouterDevtools =
  config.mode === 'production'
    ? () => null
    : lazy(() =>
        import('@tanstack/router-devtools').then((res) => ({
          default: res.TanStackRouterDevtools,
        })),
      );

// Lazy load gleap chat support
const GleapSupport = config.gleapToken ? lazy(() => import('~/modules/common/gleap')) : () => null;

function Root() {

   // Hook to build document page title based on lowest matching routes
   useBuildDocumentTitle();

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

      <Suspense fallback={null}>
        <GleapSupport />
      </Suspense>
    </SSEProvider>
  );
}

export { Root };
