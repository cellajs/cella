import { AppContent } from '~/modules/common/app-content';
import { ErrorBoundary } from 'react-error-boundary';

import HolyLoader from 'holy-loader';
import AppNav from './app-nav';
import ErrorNotice from './error-notice';
import { NavSheet } from './nav-sheet';
import { ErrorType } from 'backend/lib/errors';

const App = () => {
  return (
    <ErrorBoundary fallbackRender={({ error }) => <ErrorNotice error={error} />}>
      <AppNav />
      <NavSheet />
      <AppContent />
      <HolyLoader />
    </ErrorBoundary>
  );
};

export default App;
