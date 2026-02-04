import { Outlet } from '@tanstack/react-router';
import { ErrorBoundary } from 'react-error-boundary';
import Alerter from '~/modules/common/alerter';
import { Dialoger } from '~/modules/common/dialoger/provider';
import { DownAlert } from '~/modules/common/down-alert';
import ErrorNotice, { type ErrorNoticeError } from '~/modules/common/error-notice';
import { Sheeter } from '~/modules/common/sheeter/provider';
import PublicStream from '~/query/realtime/public-stream';

// Also in public routes, some components need to be initialized.
function PublicLayout() {
  return (
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
  );
}

export { PublicLayout };
