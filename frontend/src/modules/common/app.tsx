import { ErrorBoundary } from 'react-error-boundary';
import { AppContent } from '~/modules/common/app-content';

import AppNav from '~/modules/common/app-nav';
import SSE from '~/modules/common/sse';
import ElectricProvider from './electric';
import ErrorNotice from './error-notice';
import { SSEProvider } from './sse/provider';

import { Dialoger } from '~/modules/common/dialoger';
import { Sheeter } from '~/modules/common/sheeter';
import { DropDowner } from '~/modules/common/dropdowner';
const App = () => {
  return (
    <div id="app-root">
      <ErrorBoundary
        fallbackRender={({ error, resetErrorBoundary }) => <ErrorNotice error={error} isRootLevel resetErrorBoundary={resetErrorBoundary} />}
      >
        <ElectricProvider>
          <SSEProvider>
            <AppNav />
            <SSE />
            <AppContent />
            <Dialoger />
            <Sheeter />
            <DropDowner />
          </SSEProvider>
        </ElectricProvider>
      </ErrorBoundary>
    </div>
  );
};

export default App;
