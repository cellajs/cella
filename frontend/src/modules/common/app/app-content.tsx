import { Outlet } from '@tanstack/react-router';
import { ErrorBoundary } from 'react-error-boundary';
import { usePageChannelKey } from '~/hooks/use-page-channel-key';
import { Alerter } from '~/modules/common/alerter/alerter';
import { errorNoticeFallback } from '~/modules/common/error-notice';
import { focusTargets } from '~/modules/navigation/focus-bridge';
import { getSkipPageEnter } from '~/utils/nav-transition';

export function AppContent() {
  // The curtain masks the scroll-to-header travel of an entity navigation; a same-base forward nav (org to org) has none
  const channelKey = usePageChannelKey();
  const showCurtain = !!channelKey && !getSkipPageEnter();

  return (
    <ErrorBoundary fallbackRender={errorNoticeFallback('app')}>
      <div
        id="app-content"
        className="relative flex min-h-svh min-w-0 flex-1 flex-col max-sm:not-in-[.floating-nav]:min-h-[calc(100svh-4rem-env(safe-area-inset-bottom,0px))]"
      >
        <main id={focusTargets.content} tabIndex={-1} className="focus-view-scope flex flex-1 flex-col focus:outline-hidden">
          <Alerter mode="app" />
          <Outlet />
        </main>
        {showCurtain && <div key={channelKey} className="page-enter-curtain" aria-hidden />}
      </div>
    </ErrorBoundary>
  );
}
