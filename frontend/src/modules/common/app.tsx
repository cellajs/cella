import { ErrorBoundary } from 'react-error-boundary';
import { AppContent } from '~/modules/common/app-content';

import { Suspense, lazy } from 'react';
import ErrorNotice from './error-notice';

// Lazy load gleap chat support
const AppNav = lazy(() => import('~/modules/common/app-nav'));

const App = () => {
  return (
    <ErrorBoundary fallbackRender={({ error }) => <ErrorNotice error={error} />}>
      <Suspense>
        <AppNav />
      </Suspense>
      <AppContent />
    </ErrorBoundary>
  );
};

export default App;
