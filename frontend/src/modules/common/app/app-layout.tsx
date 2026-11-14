import { Outlet, useParams } from '@tanstack/react-router';
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { appConfig } from 'shared';
import { Alerter } from '~/modules/common/alerter/alerter';
import { DownAlert } from '~/modules/common/alerter/down-alert';
import { ParkedNoticesOnBoot } from '~/modules/common/blocknote/parked-notices-on-boot';
import { Dialoger } from '~/modules/common/dialoger/provider';
import { Dropdowner } from '~/modules/common/dropdowner/provider';
import { errorNoticeFallback } from '~/modules/common/error-notice';
import { Sheeter } from '~/modules/common/sheeter/provider';
import { Spotlighter } from '~/modules/common/spotlighter/provider';
import { AppNav } from '~/modules/navigation/app-nav';
import { BackToStart, focusTargets, SkipLink } from '~/modules/navigation/focus-bridge';
import { SeenTracker } from '~/modules/seen/seen-tracker';
import { SidebarWrapper } from '~/modules/ui/sidebar';
import { UserSheetHandler } from '~/modules/user/user-sheet-handler';
import { StreamSync } from '~/query/realtime/stream-sync';
import { TabCoordinator } from '~/query/realtime/tab-coordinator';
import { channelRouteConfig } from '~/routes-config';
import { lazyNamed } from '~/utils/lazy-named';
import { getSkipPageEnter } from '~/utils/nav-transition';

// Both render null until something opens them, so each loads with that interaction.
const AttachmentDialogHandler = lazyNamed(() => import('~/modules/attachment/dialog/attachment-dialog-handler'), 'AttachmentDialogHandler');
const Uploader = lazyNamed(() => import('~/modules/common/uploader/uploader'), 'Uploader');

/** Composite key for the route's deepest channel, undefined outside channels. Stable across tab changes. */
const usePageChannelKey = (): string | undefined => {
  const params = useParams({ strict: false }) as Record<string, string | undefined>;

  const parts = appConfig.channelEntityTypes
    .map((type) => params[channelRouteConfig[type]?.paramName ?? ''])
    .filter((value): value is string => !!value);

  return parts.length ? parts.join('/') : undefined;
};

function AppContent() {
  // The curtain masks the scroll-to-header travel of an entity navigation; a same-base forward nav (org to org) has none
  const channelKey = usePageChannelKey();
  const showCurtain = !!channelKey && !getSkipPageEnter();

  return (
    <ErrorBoundary fallbackRender={errorNoticeFallback('app')}>
      <div
        id="app-content"
        className="relative flex min-h-svh min-w-0 flex-1 flex-col max-sm:not-in-[.floating-nav]:min-h-[calc(100svh-4rem-env(safe-area-inset-bottom,0px))]"
      >
        <main id={focusTargets.content} tabIndex={-1} className="focus-view-scope flex flex-1 flex-col focus:outline-hidden">
          <Alerter mode="app" />
          <Outlet />
        </main>
        {showCurtain && <div key={channelKey} className="page-enter-curtain" aria-hidden />}
      </div>
    </ErrorBoundary>
  );
}

export function AppLayout() {
  return (
    <div className="max-sm:not-in-[.floating-nav]:mb-[calc(4rem+env(safe-area-inset-bottom,0px))]">
      {/* Without a nav bar the menu sheet is the navigation, and its own bridges lead to the content */}
      {appConfig.navigation.navBar && <SkipLink />}
      <ErrorBoundary fallbackRender={errorNoticeFallback('root')}>
        <SidebarWrapper>
          <AppNav />
          <AppContent />
        </SidebarWrapper>
        <TabCoordinator />
        <ParkedNoticesOnBoot />
        <StreamSync />
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
      {appConfig.navigation.navBar && <BackToStart />}
    </div>
  );
}
