import { Outlet } from '@tanstack/react-router';
import { ErrorBoundary } from 'react-error-boundary';
import { Alerter } from '~/modules/common/alerter/alerter';
import { ErrorNotice, type ErrorNoticeError } from '~/modules/common/error-notice';
import { FocusTarget } from '~/modules/navigation/focus-bridge';

/**
 * Main content area for the app layout, includes error boundary and alerter.
 */
export const AppContent = () => {
  return (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => (
        <ErrorNotice boundary="app" error={error as ErrorNoticeError} resetErrorBoundary={resetErrorBoundary} />
      )}
    >
      <div id="app-content" className="flex min-h-svh min-w-0 flex-1 flex-col max-sm:min-h-[calc(100svh-4rem)]">
        <main id="app-content-inner" className="flex flex-1 flex-col focus:outline-none" aria-label="Main Content">
          <FocusTarget target="content" />
          <Alerter mode="app" />
          <Outlet />
        </main>
      </div>
    </ErrorBoundary>
  );
};
