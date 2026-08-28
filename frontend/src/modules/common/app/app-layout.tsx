import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { DownAlert } from '~/modules/common/alerter/down-alert';
import { AppContent } from '~/modules/common/app/app-content';
import { Dialoger } from '~/modules/common/dialoger/provider';
import { Dropdowner } from '~/modules/common/dropdowner/provider';
import { ErrorNotice, type ErrorNoticeError } from '~/modules/common/error-notice';
import { Sheeter } from '~/modules/common/sheeter/provider';
import { Spotlighter } from '~/modules/common/spotlighter/provider';
import { AppNav } from '~/modules/navigation/app-nav';
import { SeenTracker } from '~/modules/seen/seen-tracker';
import { SidebarWrapper } from '~/modules/ui/sidebar';
import { UserSheetHandler } from '~/modules/user/user-sheet-handler';
import { AppStream } from '~/query/realtime/app-stream';
import { TabCoordinator } from '~/query/realtime/tab-coordinator';
import { lazyNamed } from '~/utils/lazy-named';

// Renders null until an upload is queued.
// Both render null until something opens them, so each loads with that interaction.
const AttachmentDialogHandler = lazyNamed(
  () => import('~/modules/attachment/dialog/attachment-dialog-handler'),
  'AttachmentDialogHandler',
);
const Uploader = lazyNamed(() => import('~/modules/common/uploader/uploader'), 'Uploader');

function AppLayout() {
  return (
    <div id="appLayout" className="in-[.floating-nav]:mb-0 max-sm:mb-[calc(4rem+env(safe-area-inset-bottom,0px))]">
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
        <Suspense fallback={null}>
          <Uploader />
        </Suspense>
        <Dialoger />
        <UserSheetHandler />
        <Suspense fallback={null}>
          <AttachmentDialogHandler />
        </Suspense>
        <Sheeter />
        <Spotlighter />
        <DownAlert />
        <Dropdowner />
      </ErrorBoundary>
    </div>
  );
}

export { AppLayout };
