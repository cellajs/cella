import { Outlet, ScrollRestoration } from '@tanstack/react-router';
import { config } from 'config';
import { Suspense, lazy } from 'react';

import { useSetDocumentTitle } from '~/hooks/use-set-document-title';
import { Dialoger } from '~/modules/common/dialoger';
import { Sheeter } from '~/modules/common/sheeter';
import { Toaster } from '~/modules/ui/sonner';
import { TooltipProvider } from '~/modules/ui/tooltip';
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

// Lazy load reload prompt for PWA
const ReloadPrompt = config.has.pwa ? lazy(() => import('~/modules/common/reload-prompt')) : () => null;

// Lazy load gleap chat support
const GleapSupport = config.gleapToken ? lazy(() => import('~/modules/common/gleap')) : () => null;

function Root() {
  // Hook to set document page title based on lowest matching routes
  useSetDocumentTitle();

  return (
    <TooltipProvider disableHoverableContent delayDuration={300} skipDelayDuration={0}>
      <ScrollRestoration />
      <Outlet />
      <Toaster richColors />
      <Dialoger />
      <Sheeter />
      {config.has.pwa && (
        <Suspense fallback={null}>
          <ReloadPrompt />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <TanStackRouterDevtools />
      </Suspense>
      <DownAlert />

      <Suspense fallback={null}>
        <GleapSupport />
      </Suspense>
    </TooltipProvider>
  );
}

export { Root };
