import { ErrorBoundary } from '@appsignal/react';

import { appSignal } from '~/lib/appsignal';
import { AppContent } from '~/modules/common/app-content';

import HolyLoader from 'holy-loader';
import AppNav from './app-nav';
import ErrorPage from './error';
import { NavSheet } from './nav-sheet';

const App = () => {
  return (
    <ErrorBoundary instance={appSignal} fallback={(error: Error) => <ErrorPage error={error} />}>
      <AppNav />
      <NavSheet />
      <AppContent />
      <HolyLoader />
    </ErrorBoundary>
  );
};

export default App;
