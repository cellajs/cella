import { Outlet } from '@tanstack/react-router';
import { ErrorBoundary } from 'react-error-boundary';

import Alerter from '~/modules/common/alerter/alerter';
import ErrorNotice from '~/modules/common/error-notice';

export const AppContent = () => {
  return (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => <ErrorNotice level="app" error={error} resetErrorBoundary={resetErrorBoundary} />}
    >
      <div id="app-content" className="transition-spacing duration-500 ease-in-out">
        <div className="sm:min-h-[100vh] max-sm:min-h-[calc(100vh-4rem)] sm:ml-16 group-[.focus-view]/body:ml-0 xl:group-[.nav-sheet-open.keep-menu-open]/body:pl-80 transition-all duration-300 ease-in-out">
          <main id="app-content-inner" className="flex-1 flex flex-col" aria-label="Main Content">
            <Alerter mode="app" />
            <Outlet />
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
};
