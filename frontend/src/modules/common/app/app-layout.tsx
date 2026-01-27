import { ErrorBoundary } from 'react-error-boundary';
import { AppContent } from '~/modules/common/app/app-content';
import AppSheets from '~/modules/common/app/app-sheets';
import { Dialoger } from '~/modules/common/dialoger/provider';
import { DownAlert } from '~/modules/common/down-alert';
import { Dropdowner } from '~/modules/common/dropdowner/provider';
import ErrorNotice, { type ErrorNoticeError } from '~/modules/common/error-notice';
import { Sheeter } from '~/modules/common/sheeter/provider';
import { Uploader } from '~/modules/common/uploader/uploader';
import AppNav from '~/modules/navigation/app-nav';
import { SidebarWrapper } from '~/modules/ui/sidebar';
import { AppStream } from '~/query/realtime';

/**
 * Main application layout component.
 * - Wraps the app in error boundaries.
 * - Renders navigation, content area, dialogs, sheets, and other global components.
 * - Uses AppStream for real-time membership/organization updates via CDC events.
 */
function AppLayout() {
  return (
    <div id="appLayout" className="max-sm:mb-16 in-[.floating-nav]:mb-0">
      <ErrorBoundary
        fallbackRender={({ error, resetErrorBoundary }) => (
          <ErrorNotice error={error as ErrorNoticeError} level="root" resetErrorBoundary={resetErrorBoundary} />
        )}
      >
        <SidebarWrapper>
          <AppNav />
          <AppContent />
        </SidebarWrapper>
        <AppStream />
        <Uploader />
        <Dialoger />
        <AppSheets />
        <Sheeter />
        <DownAlert />
        <Dropdowner />
      </ErrorBoundary>
    </div>
  );
}

export default AppLayout;
