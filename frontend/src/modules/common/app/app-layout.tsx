import { ErrorBoundary } from 'react-error-boundary';
import { AppContent } from '~/modules/common/app/app-content';
import AppSheets from '~/modules/common/app/app-sheets';
import { Dialoger } from '~/modules/common/dialoger/provider';
import { DownAlert } from '~/modules/common/down-alert';
import { Dropdowner } from '~/modules/common/dropdowner/provider';
import ErrorNotice from '~/modules/common/error-notice';
import { Sheeter } from '~/modules/common/sheeter/provider';
import SSE from '~/modules/common/sse';
import { SSEProvider } from '~/modules/common/sse/provider';
import { Uploader } from '~/modules/common/uploader/uploader';
import AppNav from '~/modules/navigation/app-nav';
import { SidebarWrapper } from '~/modules/ui/sidebar';

/**
 * Main application layout component.
 * - Wraps the app in error boundaries and SSE provider.
 * - Renders navigation, content area, dialogs, sheets, and other global components.
 * - dialoger, dropdowner and sheeter need to be inside SSE provider to receive SSE events.
 */
const AppLayout = () => {
  return (
    <div id="appLayout" className="max-sm:mb-16 in-[.floating-nav]:mb-0">
      <ErrorBoundary
        fallbackRender={({ error, resetErrorBoundary }) => (
          <ErrorNotice error={error} level="root" resetErrorBoundary={resetErrorBoundary} />
        )}
      >
        <SSEProvider>
          <SidebarWrapper>
            <AppNav />
            <AppContent />
          </SidebarWrapper>
          <SSE />
          <Uploader />
          <Dialoger />
          <AppSheets />
          <Sheeter />
          <DownAlert />
          <Dropdowner />
        </SSEProvider>
      </ErrorBoundary>
    </div>
  );
};

export default AppLayout;
