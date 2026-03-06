import { HeadContent, Outlet } from '@tanstack/react-router';
import { configure } from 'onedollarstats';
import { Suspense, useEffect } from 'react';
import { appConfig } from 'shared';
import { useLazyComponent } from '~/hooks/use-lazy-component';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { ReloadPrompt } from '~/modules/common/reload-prompt';
import { ToasterProvider } from '~/modules/common/toaster/toaster-provider';
import { TooltipProvider } from '~/modules/ui/tooltip';

export function Root() {
  const { isOnline } = useOnlineManager();

  // Lazy load
  const GleapSupport = useLazyComponent(
    () =>
      appConfig.gleapToken && isOnline
        ? import('~/modules/common/gleap-support')
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
      <ToasterProvider />
      <Suspense fallback={null}>{GleapSupport ? <GleapSupport /> : null}</Suspense>
    </TooltipProvider>
  );
}
