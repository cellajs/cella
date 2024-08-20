import { ErrorBoundary } from 'react-error-boundary';
import { AppContent } from '~/modules/common/app-content';

import AppNav from '~/modules/common/app-nav';
import { Dialoger } from '~/modules/common/dialoger';
import { DropDowner } from '~/modules/common/dropdowner';
import { Sheeter } from '~/modules/common/sheeter';
import SSE from '~/modules/common/sse';
import ErrorNotice from './error-notice';
import { SSEProvider } from './sse/provider';

const App = () => {
  return (
    <div id="app-root">
      <ErrorBoundary
        fallbackRender={({ error, resetErrorBoundary }) => <ErrorNotice error={error} isRootLevel resetErrorBoundary={resetErrorBoundary} />}
      >
        <SSEProvider>
          <AppNav />
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

export default App;
