import { Outlet } from '@tanstack/react-router';
import { ErrorBoundary } from 'react-error-boundary';
import { usePageEntityKey } from '~/hooks/use-page-entity-key';
import { Alerter } from '~/modules/common/alerter/alerter';
import { ErrorNotice, type ErrorNoticeError } from '~/modules/common/error-notice';
import { FocusTarget } from '~/modules/navigation/focus-bridge';
import { getSkipPageEnter } from '~/utils/nav-transition';

/**
 * Main content area for the app layout, includes error boundary and alerter.
 */
export const AppContent = () => {
  // Per-context-entity navigation mask: a curtain over the content area that briefly holds the
  // background, then reveals — hiding the scroll-to-header travel. Re-triggers when the entity key
  // changes; skipped on same-base forward navigation (e.g. org -> org), where there's no scroll delta.
  const entityKey = usePageEntityKey();
  const showCurtain = !!entityKey && !getSkipPageEnter();

  return (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => (
        <ErrorNotice boundary="app" error={error as ErrorNoticeError} resetErrorBoundary={resetErrorBoundary} />
      )}
    >
      <div
        id="app-content"
        className="relative flex min-h-svh min-w-0 flex-1 flex-col max-sm:min-h-[calc(100svh-4rem)]"
      >
        <main id="app-content-inner" className="flex flex-1 flex-col focus:outline-none" aria-label="Main Content">
          <FocusTarget target="content" />
          <Alerter mode="app" />
          <Outlet />
        </main>
        {showCurtain && <div key={entityKey} className="page-enter-curtain" aria-hidden />}
      </div>
    </ErrorBoundary>
  );
};
