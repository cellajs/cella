import { HeadContent, Outlet } from '@tanstack/react-router';
import { appConfig } from 'config';
import { Suspense } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';

import useLazyComponent from '~/hooks/use-lazy-component'; // Adjust the import path accordingly
import { useOnlineManager } from '~/hooks/use-online-manager';
import { DownAlert } from '~/modules/common/down-alert';
import ReloadPrompt from '~/modules/common/reload-prompt';
import { Toaster } from '~/modules/ui/sonner';
import { TooltipProvider } from '~/modules/ui/tooltip';

function Root() {
  const { isOnline } = useOnlineManager();
  const isMobile = useBreakpoints('max', 'sm');

  const toastPosition = isMobile ? 'top-center' : 'bottom-right';

  // Lazy load
  const GleapSupport = useLazyComponent(
    () =>
      appConfig.gleapToken && isOnline
        ? import('~/modules/common/gleap')
        : new Promise<{ default: () => null }>((res) => res({ default: () => null })),
    5000,
  ); // 5 seconds delay

  return (
    <TooltipProvider disableHoverableContent delayDuration={300} skipDelayDuration={0}>
      <HeadContent />
      <Outlet />
      <ReloadPrompt />
      <Toaster richColors toastOptions={{ className: 'max-sm:mb-16' }} position={toastPosition} />
      <DownAlert />
      <Suspense fallback={null}>{GleapSupport ? <GleapSupport /> : null}</Suspense>
    </TooltipProvider>
  );
}

export { Root };
