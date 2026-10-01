import { Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { appConfig } from 'shared';
import { Alerter } from '~/modules/common/alerter/alerter';
import { DownAlert } from '~/modules/common/alerter/down-alert';
import { Dialoger } from '~/modules/common/dialoger/provider';
import { Dropdowner } from '~/modules/common/dropdowner/provider';
import { ErrorNotice, type ErrorNoticeError } from '~/modules/common/error-notice';
import { Sheeter } from '~/modules/common/sheeter/provider';
import { lazyNamed } from '~/utils/lazy-named';

// Development only: staging and tunnel keep the devtools but don't show public visitors a 🐞
const DebugDropdown =
  __DEV_TOOLS__ && appConfig.mode === 'development' ? lazyNamed(() => import('~/modules/common/debug-dropdown'), 'DebugDropdown') : () => null;

/**
 * Layout for all public (unauthenticated) routes. The public SSE stream is mounted by `PublicContentLayout`
 * (a sublayout) only on routes that render synced public entities, so auth/error/marketing routes don't open one.
 */
export function PublicLayout() {
  return (
    <div id="publicLayout">
      <ErrorBoundary
        fallbackRender={({ error, resetErrorBoundary }) => (
          <ErrorNotice error={error as ErrorNoticeError} boundary="root" resetErrorBoundary={resetErrorBoundary} />
        )}
      >
        <Alerter mode="public" />
        <Dialoger />
        <Dropdowner />
        <Sheeter />

        <DownAlert />
        <Outlet />
      </ErrorBoundary>

      {/* Bottom-left, above the docs sidebar but under the dev sign-in banner; below md it clears the docs floating nav */}
      <Suspense fallback={null}>
        <DebugDropdown className="fixed bottom-[calc(1rem+var(--bottom-inset,0px))] left-4 z-35 size-8 rounded-full bg-secondary/70 opacity-60 hover:opacity-100 max-md:bottom-[calc(5rem+var(--bottom-inset,0px))]" />
      </Suspense>
    </div>
  );
}
