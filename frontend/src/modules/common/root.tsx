import { Outlet, ScrollRestoration } from '@tanstack/react-router';
import { config } from 'config';
import { Suspense } from 'react';

import useLazyComponent from '~/hooks/use-lazy-component'; // Adjust the import path accordingly
import { Dialoger } from '~/modules/common/dialoger';
import ReloadPrompt from '~/modules/common/reload-prompt';
import { Sheeter } from '~/modules/common/sheeter';
import { Toaster } from '~/modules/ui/sonner';
import { TooltipProvider } from '~/modules/ui/tooltip';
import { DownAlert } from './down-alert';

function Root() {
  // Lazy load
  const GleapSupport = config.gleapToken ? useLazyComponent(() => import('~/modules/common/gleap'), 5000) : () => null; // 5 seconds delay
  const DebugToolbars = config.mode === 'development' ? useLazyComponent(() => import('~/modules/common/debug-toolbars'), 1000) : () => null;

  return (
    <TooltipProvider disableHoverableContent delayDuration={300} skipDelayDuration={0}>
      <ScrollRestoration />
      <Outlet />
      <Dialoger />
      <Sheeter />
      <ReloadPrompt />

      <Toaster richColors />

      <Suspense fallback={null}>{DebugToolbars ? <DebugToolbars /> : null}</Suspense>
      <DownAlert />

      <Suspense fallback={null}>{GleapSupport ? <GleapSupport /> : null}</Suspense>
    </TooltipProvider>
  );
}

export { Root };
