import { ErrorBoundary } from 'react-error-boundary';
import { AppContent } from '~/modules/common/app-content';

import { Suspense, lazy } from 'react';
import ErrorNotice from './error-notice';

// Lazy load App navigation
const AppNav = lazy(() => import('~/modules/common/app-nav'));
const SSE = lazy(() => import('~/modules/common/sse'));

const App = () => {
  return (
    <ErrorBoundary fallbackRender={({ error, resetErrorBoundary }) => <ErrorNotice error={error} resetErrorBoundary={resetErrorBoundary} />}>
      <Suspense>
        <AppNav />
        <SSE />
      </Suspense>
      <AppContent />
    </ErrorBoundary>
  );
};

export default App;
