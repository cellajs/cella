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
import { DropDowner } from './dropdowner';

function Root() {
  // Lazy load
  const GleapSupport = config.gleapToken ? useLazyComponent(() => import('~/modules/common/gleap'), 5000) : () => null; // 5 seconds delay

  return (
    <TooltipProvider disableHoverableContent delayDuration={300} skipDelayDuration={0}>
      <ScrollRestoration />
      <Outlet />
      <Dialoger />
      <Sheeter />
      <ReloadPrompt />

      <Toaster richColors toastOptions={{ className: 'max-sm:mb-16' }} />
      <DownAlert />
      <DropDowner />
      <Suspense fallback={null}>{GleapSupport ? <GleapSupport /> : null}</Suspense>
    </TooltipProvider>
  );
}

export { Root };
