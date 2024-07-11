import { Outlet, ScrollRestoration } from '@tanstack/react-router';
import { config } from 'config';
import { Suspense } from 'react';

import useLazyComponent from '~/hooks/use-lazy-component'; // Adjust the import path accordingly
import ReloadPrompt from '~/modules/common/reload-prompt';
import { Toaster } from '~/modules/ui/sonner';
import { TooltipProvider } from '~/modules/ui/tooltip';
import { DownAlert } from './down-alert';
import { Dialoger } from '~/modules/common/dialoger';
import { Sheeter } from '~/modules/common/sheeter';

function Root() {
  // Lazy load
  const GleapSupport = config.gleapToken ? useLazyComponent(() => import('~/modules/common/gleap'), 5000) : () => null; // 5 seconds delay

  return (
    <TooltipProvider disableHoverableContent delayDuration={300} skipDelayDuration={0}>
      <ScrollRestoration />
      <Outlet />
      <ReloadPrompt />
      <Dialoger />
      <Sheeter />
      <Toaster richColors toastOptions={{ className: 'max-sm:mb-16' }} />
      <DownAlert />

      <Suspense fallback={null}>{GleapSupport ? <GleapSupport /> : null}</Suspense>
    </TooltipProvider>
  );
}

export { Root };
