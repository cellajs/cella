import { Outlet } from '@tanstack/react-router';
import { ErrorBoundary } from 'react-error-boundary';
import { usePageChannelKey } from '~/hooks/use-page-channel-key';
import { Alerter } from '~/modules/common/alerter/alerter';
import { ErrorNotice, type ErrorNoticeError } from '~/modules/common/error-notice';
import { FocusTarget } from '~/modules/navigation/focus-bridge';
import { getSkipPageEnter } from '~/utils/nav-transition';

export function AppContent() {
  // The curtain holds the background over the content area to mask scroll-to-header travel on
  // entity navigation. Same-base forward nav (org to org) has no scroll delta and skips it.
  const channelKey = usePageChannelKey();
  const showCurtain = !!channelKey && !getSkipPageEnter();

  return (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => (
        <ErrorNotice boundary="app" error={error as ErrorNoticeError} resetErrorBoundary={resetErrorBoundary} />
      )}
    >
      <div
        id="app-content"
        className="relative flex min-h-svh min-w-0 flex-1 flex-col max-sm:min-h-[calc(100svh-4rem-env(safe-area-inset-bottom,0px))]"
      >
        <main id="app-content-inner" className="flex flex-1 flex-col focus:outline-none" aria-label="Main Content">
          <FocusTarget target="content" />
          <Alerter mode="app" />
          <Outlet />
        </main>
        {showCurtain && <div key={channelKey} className="page-enter-curtain" aria-hidden />}
      </div>
    </ErrorBoundary>
  );
}
