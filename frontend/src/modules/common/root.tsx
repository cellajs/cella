import { HeadContent, Outlet } from '@tanstack/react-router';
import { configure } from 'onedollarstats';
import { Suspense, useEffect } from 'react';
import { appConfig } from 'shared';
import { useLazyComponent } from '~/hooks/use-lazy-component';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { TooltipProvider } from '~/modules/ui/tooltip';
import { lazyNamed } from '~/utils/lazy-named';

const Devtools = __DEV_TOOLS__ ? lazyNamed(() => import('~/modules/common/devtools/devtools'), 'Devtools') : () => null;

const loadChatSupport = () => import('~/modules/common/gleap-support');

function NoChatSupport() {
  return null;
}

export function Root() {
  const isOnline = useOnlineManager();

  const GleapSupport = useLazyComponent(
    () => (appConfig.has.chatSupport && isOnline ? loadChatSupport() : Promise.resolve({ GleapSupport: NoChatSupport })),
    'GleapSupport',
    5000,
  );

  useEffect(() => {
    configure({ trackLocalhostAs: null });
  }, []);

  // `timeout` keeps the tooltip delay group alive that long after one closes: the first waits, its neighbours are instant
  return (
    <TooltipProvider delay={300} timeout={400}>
      <HeadContent />
      <Outlet />
      <Suspense fallback={null}>{GleapSupport ? <GleapSupport /> : null}</Suspense>
      <Suspense fallback={null}>
        <Devtools />
      </Suspense>
    </TooltipProvider>
  );
}
