import { ErrorBoundary } from 'react-error-boundary';
import { AppContent } from '~/modules/common/app-content';

import AppSheets from '~/modules/common/app-sheets';
import { Dialoger } from '~/modules/common/dialoger/provider';
import { Dropdowner } from '~/modules/common/dropdowner/provider';
import ErrorNotice from '~/modules/common/error-notice';
import { Sheeter } from '~/modules/common/sheeter/provider';
import SSE from '~/modules/common/sse';
import { SSEProvider } from '~/modules/common/sse/provider';
import { Uploader } from '~/modules/common/uploader/uploader';
import AppNav from '~/modules/navigation/app-nav';
import { AppNavState } from '~/modules/navigation/app-nav-state';

// Dialoger, dropdowner and sheeter are put here so they fall inside SSE provider.
const AppLayout = () => {
  return (
    <div id="app-layout" className="max-sm:mb-16 [.floating-nav_&]:mb-0">
      <ErrorBoundary
        fallbackRender={({ error, resetErrorBoundary }) => <ErrorNotice error={error} level="root" resetErrorBoundary={resetErrorBoundary} />}
      >
        <SSEProvider>
          <AppNav />
          <AppNavState />
          <SSE />
          <AppContent />
          <Uploader />
          <Dialoger />
          <AppSheets />
          <Sheeter />
          <Dropdowner />
        </SSEProvider>
      </ErrorBoundary>
    </div>
  );
};

export default AppLayout;
