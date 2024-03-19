import { ErrorBoundary } from 'react-error-boundary';
import { AppContent } from '~/modules/common/app-content';

import HolyLoader from 'holy-loader';
import ErrorNotice from './error-notice';
import { Suspense, lazy } from 'react';

// Lazy load gleap chat support
const AppNav = lazy(() => import('~/modules/common/app-nav'));


const App = () => {
  return (
    <ErrorBoundary fallbackRender={({ error }) => <ErrorNotice error={error} />}>
      <Suspense>
        <AppNav />
      </Suspense>
      <AppContent />
      <HolyLoader />
    </ErrorBoundary>
  );
};

export default App;
