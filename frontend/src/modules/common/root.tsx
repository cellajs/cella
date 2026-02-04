import { HeadContent, Outlet } from '@tanstack/react-router';
import { configure } from 'onedollarstats';
import { Suspense, useEffect } from 'react';
import { appConfig } from 'shared';
import useLazyComponent from '~/hooks/use-lazy-component'; // Adjust the import path accordingly
import { useOnlineManager } from '~/hooks/use-online-manager';
import ReloadPrompt from '~/modules/common/reload-prompt';
import { ToastManager } from '~/modules/common/toaster';
import { TooltipProvider } from '~/modules/ui/tooltip';

function Root() {
  const { isOnline } = useOnlineManager();

  // Lazy load
  const GleapSupport = useLazyComponent(
    () =>
      appConfig.gleapToken && isOnline
        ? import('~/modules/common/gleap')
        : new Promise<{ default: () => null }>((res) => res({ default: () => null })),
    5000,
  ); // 5 seconds delay

  useEffect(() => {
    const trackLocalhostAs = appConfig.mode === 'development' && appConfig.debug ? appConfig.domain : null;
    configure({ trackLocalhostAs });
  }, []);

  return (
    <TooltipProvider disableHoverableContent delayDuration={300} skipDelayDuration={0}>
      <HeadContent />
      <Outlet />
      <ReloadPrompt />
      <ToastManager />
      <Suspense fallback={null}>{GleapSupport ? <GleapSupport /> : null}</Suspense>
    </TooltipProvider>
  );
}

export { Root };
