import { Outlet, ScrollRestoration } from '@tanstack/react-router';
import { config } from 'config';
import { Suspense, lazy } from 'react';

import { Dialoger } from '~/components/dialoger';
import { ReloadPrompt } from '~/components/reload-prompt';
import { Toaster } from '~/components/ui/sonner';

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
    <>
      <Outlet />
      <ScrollRestoration />
      <Toaster richColors />
      <Dialoger />
      <ReloadPrompt />
      <Suspense fallback={null}>
        <TanStackRouterDevtools />
      </Suspense>
    </>
  );
}

export { Root };
