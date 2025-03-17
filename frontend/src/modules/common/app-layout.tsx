import { ErrorBoundary } from 'react-error-boundary';
import { AppContent } from '~/modules/common/app-content';

import AppSheets from '~/modules/common/app-sheets';
import { Dialoger } from '~/modules/common/dialoger/provider';
import { Dropdowner } from '~/modules/common/dropdowner';
import ErrorNotice from '~/modules/common/error-notice';
import { Sheeter } from '~/modules/common/sheeter/provider';
import SSE from '~/modules/common/sse';
import { SSEProvider } from '~/modules/common/sse/provider';
import AppNav from '~/modules/navigation/app-nav';
import { AppNavState } from '~/modules/navigation/app-nav-state';

// Dialoger, dropdowner and sheeter are put here so they fall inside SSE provider.
const AppLayout = () => {
  return (
    <div id="app-layout" className="[.floating-nav_&]:h-auto">
      <ErrorBoundary
        fallbackRender={({ error, resetErrorBoundary }) => <ErrorNotice error={error} level="root" resetErrorBoundary={resetErrorBoundary} />}
      >
        <SSEProvider>
          <AppNav />
          <AppNavState />
          <SSE />
          <AppContent />
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
