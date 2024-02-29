import { Outlet, ScrollRestoration } from '@tanstack/react-router';
import { config } from 'config';
import { Suspense, lazy } from 'react';

import { Dialoger } from '~/modules/common/dialoger';
import { ReloadPrompt } from '~/modules/common/reload-prompt';
import { Sheeter } from '~/modules/common/sheeter';
import { Toaster } from '~/modules/ui/sonner';

// Lazy load Tanstack dev tools in development
const TanStackRouterDevtools =
  config.mode === 'production'
    ? () => null
    : lazy(() =>
        import('@tanstack/router-devtools').then((res) => ({
          default: res.TanStackRouterDevtools,
        })),
      );

// Lazy load chat support
 const GleapSupport = config.has.chatSupport ? lazy(() => import('~/modules/common/gleap')) : () => null;

function Root() {
  return (
    <>
      <Outlet />
      <ScrollRestoration />
      <Toaster richColors />
      <Dialoger />
      <Sheeter />
      <ReloadPrompt />
      <Suspense fallback={null}>
        <GleapSupport />
        <TanStackRouterDevtools />
      </Suspense>
    </>
  );
}

export { Root };