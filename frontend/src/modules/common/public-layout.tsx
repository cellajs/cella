import { Outlet } from '@tanstack/react-router';
import { ErrorBoundary } from 'react-error-boundary';
import Alerter from '~/modules/common/alerter/alerter';
import { Dialoger } from '~/modules/common/dialoger';
import { DropDowner } from '~/modules/common/dropdowner';
import ErrorNotice from '~/modules/common/error-notice';
import { Sheeter } from '~/modules/common/sheeter';

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
