import { Outlet, ScrollRestoration } from '@tanstack/react-router';
import { config } from 'config';
import { Suspense, lazy } from 'react';

import { Dialoger } from '~/modules/common/dialoger';
import ReloadPrompt from '~/modules/common/reload-prompt';
import { Sheeter } from '~/modules/common/sheeter';
import { Toaster } from '~/modules/ui/sonner';
import { TooltipProvider } from '~/modules/ui/tooltip';
import { DownAlert } from './down-alert';
import { DebugWidget } from './debug-widget';
import useLazyComponent from '~/hooks/use-lazy-component'; // Adjust the import path accordingly

// Lazy load Tanstack dev tools in development
const TanStackRouterDevtools =
  config.mode === 'development'
    ? lazy(() =>
        import('@tanstack/router-devtools').then((res) => ({
          default: res.TanStackRouterDevtools,
        })),
      )
    : () => null;

function Root() {

  // Lazy load gleap chat support
  const GleapSupport = config.gleapToken ? useLazyComponent(() => import('~/modules/common/gleap'), 5000) : () => null; // 5 seconds delay



  return (
    <TooltipProvider disableHoverableContent delayDuration={300} skipDelayDuration={0}>
      <ScrollRestoration />
      <Outlet />
      <Dialoger />
      <Sheeter />
      <DebugWidget />
      <ReloadPrompt />

      <Toaster richColors />

      <Suspense fallback={null}>
        <div id={'TanStackRouterDevTools'} className="overflow-hidden">
          <TanStackRouterDevtools toggleButtonProps={{ style: { display: 'none' } }} />
        </div>
      </Suspense>
      <DownAlert />

      <Suspense fallback={null}>{GleapSupport ? <GleapSupport /> : null}</Suspense>
    </TooltipProvider>
  );
}

export { Root };
