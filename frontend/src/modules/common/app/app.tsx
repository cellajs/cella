import { ErrorBoundary } from 'react-error-boundary';
import { AppContent } from '~/modules/common/app-content';

import { Suspense, lazy } from 'react';
import ErrorNotice from '../error-notice';
import { SSEProvider } from '../sse/provider';
import ElectricProvider from './electric-provider';

// Lazy load App navigation
const AppNav = lazy(() => import('~/modules/common/app-nav'));
const SSE = lazy(() => import('~/modules/common/sse'));

const App = () => {
  return (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => <ErrorNotice error={error} isRootLevel resetErrorBoundary={resetErrorBoundary} />}
    >
      <SSEProvider>
        <Suspense>
          <AppNav />
          <SSE />
        </Suspense>
        <ElectricProvider>
          <AppContent />
        </ElectricProvider>
      </SSEProvider>
    </ErrorBoundary>
  );
};

export default App;
