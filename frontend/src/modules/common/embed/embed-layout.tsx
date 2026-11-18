import { Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { DownAlert } from '~/modules/common/alerter/down-alert';
import { ParkedNoticesOnBoot } from '~/modules/common/blocknote/parked-notices-on-boot';
import { Dialoger } from '~/modules/common/dialoger/provider';
import { Dropdowner } from '~/modules/common/dropdowner/provider';
import { errorNoticeFallback } from '~/modules/common/error-notice';
import { Sheeter } from '~/modules/common/sheeter/provider';
import { SeenTracker } from '~/modules/seen/seen-tracker';
import { useUserStore } from '~/modules/user/user-store';
import { StreamSync } from '~/query/realtime/stream-sync';
import { TabCoordinator } from '~/query/realtime/tab-coordinator';
import { lazyNamed } from '~/utils/lazy-named';

// Both render null until something opens them, so each loads with that interaction.
const AttachmentDialogHandler = lazyNamed(() => import('~/modules/attachment/dialog/attachment-dialog-handler'), 'AttachmentDialogHandler');
const Uploader = lazyNamed(() => import('~/modules/common/uploader/uploader'), 'Uploader');

/**
 * The layout of the pages an LTI platform shows in its frame: the stream, the overlay hosts and uploads a signed-in page
 * needs, without the app's navigation, account menu and user sheet, whose links lead out of the frame.
 */
export function EmbedLayout() {
  // A session that ends leaves the page blank until its load: every page below reads the user.
  const signedIn = useUserStore((state) => state.user !== null);
  if (!signedIn) return null;

  return (
    <ErrorBoundary fallbackRender={errorNoticeFallback('root')}>
      <main className="flex min-h-svh flex-col">
        <ErrorBoundary fallbackRender={errorNoticeFallback('app')}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <TabCoordinator />
      <ParkedNoticesOnBoot />
      <StreamSync />
      <SeenTracker />
      <Suspense fallback={null}>
        <Uploader />
      </Suspense>
      <Dialoger />
      <Suspense fallback={null}>
        <AttachmentDialogHandler />
      </Suspense>
      <Sheeter />
      <DownAlert />
      <Dropdowner />
    </ErrorBoundary>
  );
}
