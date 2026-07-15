import { Outlet } from '@tanstack/react-router';
import { ErrorBoundary } from 'react-error-boundary';
import { Alerter } from '~/modules/common/alerter/alerter';
import { DownAlert } from '~/modules/common/alerter/down-alert';
import { Dialoger } from '~/modules/common/dialoger/provider';
import { Dropdowner } from '~/modules/common/dropdowner/provider';
import { ErrorNotice, type ErrorNoticeError } from '~/modules/common/error-notice';
import { Sheeter } from '~/modules/common/sheeter/provider';

/**
 * Layout for all public (unauthenticated) routes. The public SSE stream is mounted by `PublicContentLayout`
 * (a sublayout) only on routes that render synced public entities, so auth/error/marketing routes don't open one.
 */
export function PublicLayout() {
  return (
    <div id="publicLayout">
      <ErrorBoundary
        fallbackRender={({ error, resetErrorBoundary }) => (
          <ErrorNotice error={error as ErrorNoticeError} boundary="root" resetErrorBoundary={resetErrorBoundary} />
        )}
      >
        <Alerter mode="public" />
        <Dialoger />
        <Dropdowner />
        <Sheeter />

        <DownAlert />
        <Outlet />
      </ErrorBoundary>
    </div>
  );
}
