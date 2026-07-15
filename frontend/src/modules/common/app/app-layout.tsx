import { ErrorBoundary } from 'react-error-boundary';
import { AttachmentDialogHandler } from '~/modules/attachment/dialog/handler';
import { DownAlert } from '~/modules/common/alerter/down-alert';
import { AppContent } from '~/modules/common/app/app-content';
import { Dialoger } from '~/modules/common/dialoger/provider';
import { Dropdowner } from '~/modules/common/dropdowner/provider';
import { ErrorNotice, type ErrorNoticeError } from '~/modules/common/error-notice';
import { Sheeter } from '~/modules/common/sheeter/provider';
import { Uploader } from '~/modules/common/uploader/uploader';
import { AppNav } from '~/modules/navigation/app-nav';
import { SeenTracker } from '~/modules/seen/seen-tracker';
import { SidebarWrapper } from '~/modules/ui/sidebar';
import { UserSheetHandler } from '~/modules/user/user-sheet-handler';
import { AppStream } from '~/query/realtime/app-stream';
import { TabCoordinator } from '~/query/realtime/tab-coordinator';

function AppLayout() {
  return (
    <div id="appLayout" className="in-[.floating-nav]:mb-0 max-sm:mb-16">
      <ErrorBoundary
        fallbackRender={({ error, resetErrorBoundary }) => (
          <ErrorNotice error={error as ErrorNoticeError} boundary="root" resetErrorBoundary={resetErrorBoundary} />
        )}
      >
        <SidebarWrapper>
          <AppNav />
          <AppContent />
        </SidebarWrapper>
        <TabCoordinator />
        <AppStream />
        <SeenTracker />
        <Uploader />
        <Dialoger />
        <UserSheetHandler />
        <AttachmentDialogHandler />
        <Sheeter />
        <DownAlert />
        <Dropdowner />
      </ErrorBoundary>
    </div>
  );
}

export { AppLayout };
