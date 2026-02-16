import { Outlet } from '@tanstack/react-router';
import { ErrorBoundary } from 'react-error-boundary';
import { Alerter } from '~/modules/common/alerter';
import { Dialoger } from '~/modules/common/dialoger/provider';
import { DownAlert } from '~/modules/common/down-alert';
import { ErrorNotice, type ErrorNoticeError } from '~/modules/common/error-notice';
import { Sheeter } from '~/modules/common/sheeter/provider';
import { PublicStream } from '~/query/realtime/public-stream';

/**
 * This is the layout for all public routes, for users without authentication. Marketing, auth pages and more.
 */
export function PublicLayout() {
  return (
    <div id="publicLayout" className="max-sm:mb-16 in-[.floating-nav]:mb-0">
      <ErrorBoundary
        fallbackRender={({ error, resetErrorBoundary }) => (
          <ErrorNotice error={error as ErrorNoticeError} boundary="root" resetErrorBoundary={resetErrorBoundary} />
        )}
      >
        <Alerter mode="public" />
        <Dialoger />
        <Sheeter />
        <PublicStream />

        <DownAlert />
        <Outlet />
      </ErrorBoundary>
    </div>
  );
}
