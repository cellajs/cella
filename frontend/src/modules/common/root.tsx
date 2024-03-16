import { Outlet, ScrollRestoration } from '@tanstack/react-router';
import { config } from 'config';
import { Suspense, lazy } from 'react';

import { Dialoger } from '~/modules/common/dialoger';
import { ReloadPrompt } from '~/modules/common/reload-prompt';
import { Sheeter } from '~/modules/common/sheeter';
import { Toaster } from '~/modules/ui/sonner';
import { TooltipProvider } from '~/modules/ui/tooltip';

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
  return (
    <TooltipProvider disableHoverableContent delayDuration={500} skipDelayDuration={0}>
      <Outlet />
      <ScrollRestoration />
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
