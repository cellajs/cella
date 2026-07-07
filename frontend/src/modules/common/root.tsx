import { HeadContent, Outlet } from '@tanstack/react-router';
import { configure } from 'onedollarstats';
import { Suspense, useEffect } from 'react';
import { appConfig } from 'shared';
import { useLazyComponent } from '~/hooks/use-lazy-component';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { ReloadPrompt } from '~/modules/common/reload-prompt';
import { ToasterProvider } from '~/modules/common/toaster/toaster-provider';
import { TooltipProvider } from '~/modules/ui/tooltip';

function NoChatSupport() {
  return null;
}

export function Root() {
  const isOnline = useOnlineManager();

  // Lazy load
  const GleapSupport = useLazyComponent(
    () =>
      appConfig.has.chatSupport && isOnline
        ? import('~/modules/common/gleap-support')
        : Promise.resolve({ GleapSupport: NoChatSupport }),
    'GleapSupport',
    5000,
  ); // 5 seconds delay

  useEffect(() => {
    configure({ trackLocalhostAs: null });
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
