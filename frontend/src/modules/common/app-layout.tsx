import { ErrorBoundary } from 'react-error-boundary';
import { AppContent } from '~/modules/common/app-content';

import { Dialoger } from '~/modules/common/dialoger';
import { DropDowner } from '~/modules/common/dropdowner';
import ErrorNotice from '~/modules/common/error-notice';
import { SetBody } from '~/modules/common/set-body';
import { Sheeter } from '~/modules/common/sheeter';
import SSE from '~/modules/common/sse';
import { SSEProvider } from '~/modules/common/sse/provider';
import AppNav from '~/modules/navigation';

const AppLayout = () => {
  return (
    <div id="app-layout">
      <ErrorBoundary
        fallbackRender={({ error, resetErrorBoundary }) => <ErrorNotice error={error} isRootLevel resetErrorBoundary={resetErrorBoundary} />}
      >
        <SSEProvider>
          <AppNav />
          <SetBody />
          <SSE />
          <AppContent />
          <Dialoger />
          <Sheeter />
          <DropDowner />
        </SSEProvider>
      </ErrorBoundary>
    </div>
  );
};

export default AppLayout;