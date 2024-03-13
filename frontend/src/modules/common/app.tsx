import { ErrorBoundary } from 'react-error-boundary';
import { AppContent } from '~/modules/common/app-content';

import HolyLoader from 'holy-loader';
import AppNav from './app-nav';
import ErrorNotice from './error-notice';
import { NavSheet } from './nav-sheet';

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
