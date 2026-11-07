import { Outlet, useParams } from '@tanstack/react-router';
import { ErrorBoundary } from 'react-error-boundary';
import { appConfig } from 'shared';
import { Alerter } from '~/modules/common/alerter/alerter';
import { errorNoticeFallback } from '~/modules/common/error-notice';
import { focusTargets } from '~/modules/navigation/focus-bridge';
import { channelRouteConfig } from '~/routes-config';
import { getSkipPageEnter } from '~/utils/nav-transition';

/** Composite key for the route's deepest channel, undefined outside channels. Stable across tab changes. */
const usePageChannelKey = (): string | undefined => {
  const params = useParams({ strict: false }) as Record<string, string | undefined>;

  const parts = appConfig.channelEntityTypes
    .map((type) => params[channelRouteConfig[type]?.paramName ?? ''])
    .filter((value): value is string => !!value);

  return parts.length ? parts.join('/') : undefined;
};

export function AppContent() {
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
