import { Outlet } from '@tanstack/react-router';
import { ErrorBoundary } from 'react-error-boundary';
import { Dialoger } from '~/modules/common/dialoger';
import { DropDowner } from '~/modules/common/dropdowner';
import { Sheeter } from '~/modules/common/sheeter';
import Alerter from './alerter/alerter';
import ErrorNotice from './error-notice';

// Also in public routes, some components need to be initialized.
function PublicLayout() {
  return (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => <ErrorNotice error={error} level="root" resetErrorBoundary={resetErrorBoundary} />}
    >
      <Alerter mode="public" />
      <Dialoger />
      <Sheeter />
      <DropDowner />
      <Outlet />
    </ErrorBoundary>
  );
}

export { PublicLayout };
