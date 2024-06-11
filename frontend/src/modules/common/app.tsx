import { ErrorBoundary } from 'react-error-boundary';
import { AppContent } from '~/modules/common/app-content';

import AppNav from '~/modules/common/app-nav';
import SSE from '~/modules/common/sse';
import ElectricProvider from './electric';
import ErrorNotice from './error-notice';
import { SSEProvider } from './sse/provider';

const App = () => {
  return (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => <ErrorNotice error={error} isRootLevel resetErrorBoundary={resetErrorBoundary} />}
    >
      <ElectricProvider>
        <SSEProvider>
          <AppNav />
          <SSE />
          <AppContent />
        </SSEProvider>
      </ElectricProvider>
    </ErrorBoundary>
  );
};

export default App;
